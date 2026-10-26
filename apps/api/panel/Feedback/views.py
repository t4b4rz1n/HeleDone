from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from common.utils.mixins import FieldFilterOverviewMixin
from organizations.services import PermissionService

from .models import Feedback
from .serializers import StaffFeedbackSerializer


class CanViewFeedback(permissions.BasePermission):
    """
    Allows staff/superusers and users with 'org.manage_settings' or
    'org.manage_members' permission to view and manage feedback entries.

    Read-only: org.manage_members or org.manage_settings
    Delete:    org.manage_settings only
    """

    message = "You do not have permission to access feedback entries."

    def _get_org_id(self, request, obj=None):
        if obj and hasattr(obj, "organization_id") and obj.organization_id:
            return obj.organization_id
        mem = request.user.org_memberships.filter(is_deleted=False).first()
        return mem.organization_id if mem else None

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        org_id = self._get_org_id(request)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return PermissionService.has_permission(
                user, "org.manage_members", org_id
            ) or PermissionService.has_permission(user, "org.manage_settings", org_id)

        # DELETE requires stronger permission
        return PermissionService.has_permission(user, "org.manage_settings", org_id)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        org_id = self._get_org_id(request, obj)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return PermissionService.has_permission(
                user, "org.manage_members", org_id
            ) or PermissionService.has_permission(user, "org.manage_settings", org_id)

        return PermissionService.has_permission(user, "org.manage_settings", org_id)


class StaffFeedbackViewSet(FieldFilterOverviewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanViewFeedback]
    serializer_class = StaffFeedbackSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ["subject", "text", "user__username", "user__email"]
    ordering_fields = ["created_at"]
    lookup_field = "id"
    http_method_names = ["get", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = Feedback.objects.all().select_related("user")

        if user.is_superuser:
            return qs

        # Non-staff: filter to feedback from users in the same organizations
        org_ids = user.org_memberships.filter(is_deleted=False).values_list(
            "organization_id", flat=True
        )
        return qs.filter(user__org_memberships__organization_id__in=org_ids).distinct()
