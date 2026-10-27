from uuid import UUID

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter

from common.utils.mixins import FieldFilterOverviewMixin
from organizations.models import OrganizationMembership, Team, TeamMembership
from organizations.services import PermissionService

from .serializers import TeamMembershipSerializer, TeamSerializer


class CanManageTeams(permissions.BasePermission):
    """
    Permission class guarding Team & Squad endpoints:
    - Read: requires 'user.view', 'org.manage_members', or 'org.manage_settings'.
    - Write: requires 'org.manage_members' or 'org.manage_settings'.
    """

    def _extract_org_id(self, request, obj=None):
        if obj and hasattr(obj, "organization_id"):
            return obj.organization_id
        if hasattr(request, "data") and isinstance(request.data, dict):
            org_id = request.data.get("organization_id") or request.data.get("organization")
            if org_id:
                return org_id
        if hasattr(request, "query_params"):
            org_id = request.query_params.get("organization_id") or request.query_params.get(
                "organization"
            )
            if org_id:
                return org_id
        if request.user and request.user.is_authenticated:
            mem = request.user.org_memberships.filter(is_deleted=False).first()
            if mem:
                return mem.organization_id
        return None

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        org_id = self._extract_org_id(request)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return (
                PermissionService.has_permission(user, "user.view", org_id)
                or PermissionService.has_permission(user, "org.manage_members", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
            )

        return PermissionService.has_permission(
            user, "org.manage_members", org_id
        ) or PermissionService.has_permission(user, "org.manage_settings", org_id)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        org_id = getattr(obj, "organization_id", None) or self._extract_org_id(request, obj)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return (
                PermissionService.has_permission(user, "user.view", org_id)
                or PermissionService.has_permission(user, "org.manage_members", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
            )

        return PermissionService.has_permission(
            user, "org.manage_members", org_id
        ) or PermissionService.has_permission(user, "org.manage_settings", org_id)


class StaffTeamViewSet(FieldFilterOverviewMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, CanManageTeams]
    serializer_class = TeamSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        user = self.request.user
        queryset = Team.objects.filter(parent_team__isnull=True).select_related("organization")

        is_active = self.request.query_params.get("is_active")
        if is_active == "true":
            queryset = queryset.filter(is_deleted=False)
        elif is_active == "false":
            queryset = queryset.filter(is_deleted=True)
        # If not specified (e.g. "All Teams"), we don't filter by is_deleted to show all.

        if not (user.is_superuser):
            org_ids = user.org_memberships.filter(is_deleted=False).values_list(
                "organization_id", flat=True
            )
            queryset = queryset.filter(organization_id__in=org_ids)

        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            try:
                UUID(organization_id)
            except (ValueError, AttributeError, TypeError):
                pass
            else:
                queryset = queryset.filter(organization_id=organization_id)

        return queryset.order_by("-created_at")


class StaffTeamMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, CanManageTeams]
    serializer_class = TeamMembershipSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    search_fields = ["user__email", "user__first_name", "user__last_name"]

    def get_queryset(self):
        user = self.request.user
        qs = TeamMembership.objects.filter(is_deleted=False).select_related("user")
        if not (user.is_superuser):
            org_ids = user.org_memberships.filter(is_deleted=False).values_list(
                "organization_id", flat=True
            )
            qs = qs.filter(team__organization_id__in=org_ids)

        team_id = self.request.query_params.get("team_id")
        if team_id:
            qs = qs.filter(team_id=team_id)

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        team_id = self.request.data.get("team")
        team = (
            Team.objects.filter(id=team_id, is_deleted=False).select_related("organization").first()
        )
        if not team:
            raise ValidationError({"team": "Team not found."})
        user_id = self.request.data.get("user_id") or self.request.data.get("user")
        if not OrganizationMembership.objects.filter(
            user_id=user_id, organization=team.organization, is_deleted=False
        ).exists():
            raise ValidationError({"user_id": "User is not an active member of this organization."})
        instance, _ = TeamMembership.objects.update_or_create(
            user_id=user_id,
            team=team,
            defaults={"is_deleted": False},
        )
        serializer.instance = instance

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])
