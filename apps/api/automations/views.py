import json
import logging
import secrets
import uuid

from django.conf import settings
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from automations.catalog import AUTOMATION_EVENT_CATALOG, RECIPIENT_CHOICES
from automations.models import AutomationRule
from automations.serializers import AutomationRuleSerializer
from automations.services import TelegramBotService
from organizations.models import Organization, OrganizationMembership
from organizations.services import PermissionService

logger = logging.getLogger(__name__)


class DisconnectTelegramView(APIView):
    """Allows a user to disconnect their Telegram account from the platform."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        from accounts.models import WorkStyleProfile

        wsp = WorkStyleProfile.objects.filter(user=request.user).first()
        if not wsp or not wsp.telegram_chat_id:
            return Response(
                {"error": "Telegram is not connected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wsp.telegram_chat_id = None
        wsp.notify_via_telegram = False
        wsp.telegram_connect_token = None
        wsp.save(
            update_fields=["telegram_chat_id", "notify_via_telegram", "telegram_connect_token"]
        )

        logger.info(f"User {request.user.username} disconnected Telegram.")
        return Response({"status": "disconnected"})


class GenerateTelegramMagicLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        token = str(uuid.uuid4().hex)

        # Save token in database instead of cache, handling soft deletes
        from accounts.models import WorkStyleProfile

        wsp = WorkStyleProfile.all_objects.filter(user=request.user).first()

        if wsp and not wsp.is_deleted and getattr(wsp, "telegram_chat_id", None):
            return Response({"error": "This account is already connected to Telegram."}, status=400)

        if not wsp:
            wsp = WorkStyleProfile(user=request.user)
        elif wsp.is_deleted:
            wsp.is_deleted = False
            wsp.telegram_chat_id = None
            wsp.notify_via_telegram = False

        wsp.telegram_connect_token = token
        wsp.save()

        bot_username = getattr(settings, "TELEGRAM_BOT_USERNAME", "MadaarBot")
        link = f"https://t.me/{bot_username}?start={token}"
        return Response({"url": link})


@method_decorator(csrf_exempt, name="dispatch")
class TelegramWebhookView(View):
    """
    Receives all incoming updates from Telegram Bot API.
    Handles both regular messages and inline keyboard callback queries.
    """

    def post(self, request, *args, **kwargs):
        expected_secret = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
        received_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not expected_secret:
            logger.error(
                "Telegram webhook rejected because TELEGRAM_WEBHOOK_SECRET is not configured."
            )
            return JsonResponse({"error": "Webhook is not configured."}, status=503)
        if not secrets.compare_digest(received_secret, expected_secret):
            logger.warning("Telegram Webhook unauthorized access attempt.")
            return JsonResponse({"error": "Unauthorized"}, status=403)

        try:
            data = json.loads(request.body)

            # Handle callback_query (inline button presses)
            callback_query = data.get("callback_query")
            if callback_query:
                chat_id = str(callback_query["message"]["chat"]["id"])
                message_id = callback_query["message"]["message_id"]
                callback_data = callback_query.get("data", "")
                callback_query_id = callback_query["id"]
                tg_user = callback_query.get("from", {})
                tg_language_code = tg_user.get("language_code", "en")

                TelegramBotService.handle_callback(
                    chat_id=chat_id,
                    message_id=message_id,
                    callback_data=callback_data,
                    callback_query_id=callback_query_id,
                    tg_language_code=tg_language_code,
                )
                return JsonResponse({"status": "ok"})

            # Handle regular messages
            message = data.get("message", {})
            if not message:
                return JsonResponse({"status": "ignored"})

            chat = message.get("chat", {})
            text = message.get("text", "")
            chat_id = str(chat.get("id", ""))
            tg_user = message.get("from", {})
            tg_language_code = tg_user.get("language_code", "en")

            if not chat_id:
                return JsonResponse({"status": "ignored"})

            TelegramBotService.handle_message(chat_id, text, tg_language_code=tg_language_code)
            return JsonResponse({"status": "ok"})

        except Exception as e:
            logger.error(f"Telegram webhook error: {e}", exc_info=True)
            return JsonResponse({"status": "error"}, status=200)


class AutomationRuleViewSet(viewsets.ModelViewSet):
    """
    CRUD API for Automation Rules.
    """

    serializer_class = AutomationRuleSerializer
    permission_classes = [IsAuthenticated]

    def _can_manage_organization(self, organization):
        """Check if the current user has automation.manage or org.manage_settings permission.
        Falls back gracefully for superusers and staff.
        """
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return True
        return PermissionService.has_permission(
            user=user,
            permission_code="automation.manage",
            organization_id=str(organization.id),
        ) or PermissionService.has_permission(
            user=user,
            permission_code="org.manage_settings",
            organization_id=str(organization.id),
        )

    def _get_organization_from_request(self):
        org_id = self.request.query_params.get("organization") or self.request.data.get(
            "organization"
        )
        if not org_id:
            return None
        try:
            organization = Organization.objects.get(pk=org_id)
        except Organization.DoesNotExist:
            return None
        if not self._can_manage_organization(organization):
            raise PermissionDenied(
                "You do not have permission to manage this organization's automations."
            )
        return organization

    def get_queryset(self):
        organization = self._get_organization_from_request()
        if organization:
            return AutomationRule.objects.filter(organization=organization).order_by("event_type")
        if self.request.user.is_staff or self.request.user.is_superuser:
            return AutomationRule.objects.all().order_by("event_type")
        # Return rules for all orgs where the user has automation.manage or org.manage_settings permission
        manageable_org_ids = [
            m.organization_id
            for m in OrganizationMembership.objects.filter(user=self.request.user, is_deleted=False)
            .select_related("organization")
            .prefetch_related("dynamic_roles__permissions")
            if (
                PermissionService.has_permission(
                    user=self.request.user,
                    permission_code="automation.manage",
                    organization_id=str(m.organization_id),
                )
                or PermissionService.has_permission(
                    user=self.request.user,
                    permission_code="org.manage_settings",
                    organization_id=str(m.organization_id),
                )
            )
        ]
        return (
            AutomationRule.objects.filter(organization_id__in=manageable_org_ids)
            .distinct()
            .order_by("event_type")
        )

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organization")
        if organization is None:
            raise PermissionDenied("Automation rules must belong to an organization.")
        if not self._can_manage_organization(organization):
            raise PermissionDenied(
                "You do not have permission to manage this organization's automations."
            )
        serializer.save()

    def perform_update(self, serializer):
        organization = serializer.instance.organization
        if organization is None or not self._can_manage_organization(organization):
            raise PermissionDenied(
                "You do not have permission to manage this organization's automations."
            )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.organization is None or not self._can_manage_organization(
            instance.organization
        ):
            raise PermissionDenied(
                "You do not have permission to manage this organization's automations."
            )
        instance.delete()


class AutomationCatalogView(APIView):
    """Expose the backend's event contract plus a project's effective settings."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        org_id = request.query_params.get("organization")
        if not org_id:
            return Response(
                {"detail": "The organization query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organization = Organization.objects.get(pk=org_id)
        except Organization.DoesNotExist:
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        can_manage = (
            request.user.is_staff
            or request.user.is_superuser
            or PermissionService.has_permission(
                user=request.user,
                permission_code="automation.manage",
                organization_id=str(organization.id),
            )
            or PermissionService.has_permission(
                user=request.user,
                permission_code="org.manage_settings",
                organization_id=str(organization.id),
            )
        )
        if not can_manage:
            raise PermissionDenied(
                "You do not have permission to manage this organization's automations."
            )

        rules = {
            rule.event_type: AutomationRuleSerializer(rule).data
            for rule in AutomationRule.objects.filter(organization=organization)
        }
        events = [
            {
                **event,
                "default_recipients": list(event["default_recipients"]),
                "allowed_recipients": list(event["allowed_recipients"]),
                "rule": rules.get(event["code"]),
            }
            for event in AUTOMATION_EVENT_CATALOG
        ]
        return Response(
            {
                "events": events,
                "recipient_choices": [
                    {"code": code, "label": str(label)} for code, label in RECIPIENT_CHOICES
                ],
            }
        )
