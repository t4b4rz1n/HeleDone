from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from common.throttling import MentionRateThrottle
from common.utils.mixins import FieldFilterOverviewMixin
from organizations.services import PermissionService
from panel.Ticketing.models import Message, Ticket, TicketType

from .filters import MessageFilter, StaffTicketFilter
from .serializers import (
    MessageCreateSerializer,
    MessageSerializer,
    StaffTicketUpdateSerializer,
    TicketDetailSerializer,
    TicketListSerializer,
    TicketTypeSerializer,
)


class CanManageTickets(permissions.BasePermission):
    """
    Allows staff/superusers and users who have 'org.manage_members' or
    'org.manage_settings' in ANY of their organizations to manage support tickets.

    The Ticket model is global (no organization FK), so we check if the user
    has a managerial role in at least one organization.
    """

    message = "You do not have permission to manage support tickets."

    def _is_manager_in_any_org(self, user):
        memberships = user.org_memberships.filter(is_deleted=False).values_list(
            "organization_id", flat=True
        )
        for org_id in memberships:
            if PermissionService.has_permission(
                user, "org.manage_members", org_id
            ) or PermissionService.has_permission(user, "org.manage_settings", org_id):
                return True
        return False

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return self._is_manager_in_any_org(user)


class CanManageTicketTypes(permissions.BasePermission):
    """
    Allows staff/superusers and users with 'org.manage_settings' to manage
    ticket type definitions (create/edit/delete ticket categories).
    """

    message = "You do not have permission to manage ticket types."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        if request.method in permissions.SAFE_METHODS:
            # Read: any org manager can view ticket types
            memberships = user.org_memberships.filter(is_deleted=False).values_list(
                "organization_id", flat=True
            )
            for org_id in memberships:
                if PermissionService.has_permission(
                    user, "org.manage_members", org_id
                ) or PermissionService.has_permission(user, "org.manage_settings", org_id):
                    return True
            return False

        # Write: only org.manage_settings
        memberships = user.org_memberships.filter(is_deleted=False).values_list(
            "organization_id", flat=True
        )
        for org_id in memberships:
            if PermissionService.has_permission(user, "org.manage_settings", org_id):
                return True
        return False


class StaffTicketViewSet(FieldFilterOverviewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageTickets]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = StaffTicketFilter
    search_fields = ["title", "messages__text", "user__username", "user__email", "id"]
    lookup_field = "id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Ticket.objects.all().select_related("ticket_type", "user")

    def get_serializer_class(self):
        if self.action == "list":
            return TicketListSerializer
        if self.action in ["update", "partial_update"]:
            return StaffTicketUpdateSerializer
        return TicketDetailSerializer


class StaffTicketTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageTicketTypes]
    queryset = TicketType.objects.all()
    serializer_class = TicketTypeSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]


class StaffMessageListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, CanManageTickets]
    throttle_classes = [AnonRateThrottle, UserRateThrottle, MentionRateThrottle]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = MessageFilter
    search_fields = ["text"]

    def get_ticket(self):
        ticket_id = self.kwargs.get("id")
        ticket = get_object_or_404(Ticket, id=ticket_id)
        return ticket

    def get_queryset(self):
        ticket = self.get_ticket()
        return (
            Message.objects.filter(ticket=ticket)
            .select_related("sender")
            .prefetch_related("attachments")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return MessageCreateSerializer
        return MessageSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if getattr(self, "swagger_fake_view", False):
            return context

        context["ticket"] = self.get_ticket()
        context["request"] = self.request
        return context

    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        ticket = self.get_ticket()
        queryset = self.get_queryset()

        queryset.filter(sender=ticket.user, seen=False).update(seen=True)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StaffMessageRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, CanManageTickets]
    serializer_class = MessageSerializer
    lookup_field = "id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Message.objects.all()

    def perform_update(self, serializer):
        message = serializer.instance
        if message.ticket.status == Ticket.Status.CLOSED:
            raise PermissionDenied("You cannot edit messages in a closed ticket.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.ticket.status == Ticket.Status.CLOSED:
            raise PermissionDenied("You cannot delete messages in a closed ticket.")
        instance.delete()
