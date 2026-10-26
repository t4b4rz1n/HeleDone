from rest_framework import permissions

from organizations.models import Role
from organizations.services import PermissionService


class CanManageRoles(permissions.BasePermission):
    """
    Permission class guarding Role management endpoints (/panel/roles/).
    - Read actions (list, retrieve, permissions): require 'role.view', 'org.manage_roles', 'org.manage_settings', or 'org.manage_members'.
    - Mutation actions (create, update, delete): require 'org.manage_roles' or 'org.manage_settings'.
    """

    def _extract_org_id(self, request, view=None, obj=None):
        if obj and hasattr(obj, "organization_id") and obj.organization_id:
            return obj.organization_id

        # 1. Check body payload
        if hasattr(request, "data") and isinstance(request.data, dict):
            org_id = request.data.get("organization_id") or request.data.get("organization")
            if org_id:
                return org_id

        # 2. Check query params
        if hasattr(request, "query_params"):
            org_id = request.query_params.get("organization_id") or request.query_params.get(
                "organization"
            )
            if org_id:
                return org_id

        # 3. Check custom header
        header_org = request.headers.get("X-Organization-Id")
        if header_org:
            return header_org

        # 4. Fallback to user's first active membership
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

        if view.action in {"retrieve", "update", "partial_update", "destroy"}:
            role = Role.objects.filter(pk=view.kwargs.get("pk"), is_deleted=False).first()
            if not role:
                return False
            org_id = role.organization_id
            if role.is_protected and request.method not in permissions.SAFE_METHODS:
                return False
        else:
            org_id = self._extract_org_id(request, view)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return (
                PermissionService.has_permission(user, "role.view", org_id)
                or PermissionService.has_permission(user, "org.manage_roles", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
                or PermissionService.has_permission(user, "org.manage_members", org_id)
            )

        return PermissionService.has_permission(
            user, "org.manage_roles", org_id
        ) or PermissionService.has_permission(user, "org.manage_settings", org_id)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser:
            return True

        org_id = getattr(obj, "organization_id", None) or self._extract_org_id(request, view, obj)
        if not org_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return (
                PermissionService.has_permission(user, "role.view", org_id)
                or PermissionService.has_permission(user, "org.manage_roles", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
                or PermissionService.has_permission(user, "org.manage_members", org_id)
            )

        return PermissionService.has_permission(
            user, "org.manage_roles", org_id
        ) or PermissionService.has_permission(user, "org.manage_settings", org_id)
