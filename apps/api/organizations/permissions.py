from rest_framework import permissions

from organizations.services import PermissionService

from .models import OrganizationMembership


def is_org_admin(user, organization):
    if not user or not user.is_authenticated or not organization:
        return False
    if PermissionService.has_permission(
        user, "org.manage_settings", getattr(organization, "id", organization)
    ):
        return True
    return OrganizationMembership.objects.filter(
        user=user,
        organization=organization,
        role__in=(OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN),
        is_deleted=False,
    ).exists()


class CanManageOrganization(permissions.BasePermission):
    message = (
        "Only the organization owner, an organization admin, or staff can modify this organization."
    )

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        return bool(user.is_superuser or obj.owner_id == user.pk or is_org_admin(user, obj))
