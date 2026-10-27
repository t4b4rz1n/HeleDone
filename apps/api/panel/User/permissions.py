from rest_framework import permissions

from organizations.services import PermissionService


class CanManageUsers(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        org_id = request.data.get("organization_id") if isinstance(request.data, dict) else None
        org_id = org_id or request.query_params.get("organization_id")
        mem = (
            request.user.org_memberships.filter(organization_id=org_id, is_deleted=False).first()
            if org_id
            else request.user.org_memberships.filter(is_deleted=False).first()
        )
        if not mem or not mem.organization_id:
            return False

        org_id = mem.organization_id

        # Action specific checks
        if view.action in ["list", "retrieve"]:
            return PermissionService.has_permission(
                request.user, "user.view", org_id
            ) or PermissionService.has_permission(request.user, "org.manage_members", org_id)
        else:
            return PermissionService.has_permission(request.user, "org.manage_members", org_id)

    def has_object_permission(self, request, view, obj):
        actor = request.user
        if obj.is_superuser and obj.pk != actor.pk:
            return False
        if actor.is_superuser:
            return True
        if obj.is_superuser or obj.is_staff:
            return False
        actor_orgs = set(
            actor.org_memberships.filter(is_deleted=False).values_list("organization_id", flat=True)
        )
        target_orgs = set(
            obj.org_memberships.filter(is_deleted=False).values_list("organization_id", flat=True)
        )
        if not target_orgs or not target_orgs.issubset(actor_orgs):
            return False
        permission = (
            "user.view" if request.method in permissions.SAFE_METHODS else "org.manage_members"
        )
        return all(
            PermissionService.has_permission(actor, permission, org_id) for org_id in target_orgs
        )
