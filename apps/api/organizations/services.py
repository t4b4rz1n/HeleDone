from typing import Union

from django.contrib.auth import get_user_model

from organizations.constants import (
    COMPATIBILITY_ROLE_PERMISSIONS_MAP,
    DEFAULT_ORG_PERMISSIONS,
    TEAM_LEAD_PERMISSIONS,
)
from organizations.models import OrganizationMembership

User = get_user_model()


class PermissionService:
    _role_permissions_generation = 0

    @classmethod
    def role_permissions_changed(cls):
        cls._role_permissions_generation += 1

    @classmethod
    def get_user_permissions(cls, user: User, organization_id: Union[int, str]) -> set[str]:
        """
        Returns all active permission codes for a user in a given organization,
        including default member permissions and role-based permissions.
        """
        if not user or not user.is_authenticated or not organization_id:
            return set()

        if user.is_superuser:
            from organizations.models import Permission

            return set(Permission.objects.filter(is_deleted=False).values_list("code", flat=True))

        cache_key = str(organization_id)
        if not hasattr(user, "_cached_user_org_perms"):
            user._cached_user_org_perms = {}

        if (
            cache_key in user._cached_user_org_perms
            and getattr(user, "_cached_user_org_perms_generation", None)
            == cls._role_permissions_generation
        ):
            return user._cached_user_org_perms[cache_key]

        try:
            membership = OrganizationMembership.objects.prefetch_related(
                "dynamic_roles__permissions"
            ).get(user=user, organization_id=organization_id, is_deleted=False)
        except OrganizationMembership.DoesNotExist:
            user._cached_user_org_perms[cache_key] = set()
            return set()

        user_perms = set()

        dynamic_roles = [
            r for r in membership.dynamic_roles.all()
            if not getattr(r, "is_deleted", False) and r.organization_id == membership.organization_id
        ]

        if dynamic_roles:
            # 1. Dynamic Roles (Strictly in-memory evaluation of assigned role permissions)
            for role in dynamic_roles:
                for perm in role.permissions.all():
                    if not getattr(perm, "is_deleted", False):
                        user_perms.add(perm.code)
        else:
            static_role = membership.role
            if static_role and static_role in COMPATIBILITY_ROLE_PERMISSIONS_MAP:
                user_perms.update(COMPATIBILITY_ROLE_PERMISSIONS_MAP[static_role])
            else:
                user_perms.update(DEFAULT_ORG_PERMISSIONS)

        # 3. Dynamic Team Leader Permissions
        from .models import Team

        if Team.objects.filter(
            leader=user, organization_id=organization_id, is_deleted=False
        ).exists():
            user_perms.update(TEAM_LEAD_PERMISSIONS)

        user._cached_user_org_perms[cache_key] = user_perms
        user._cached_user_org_perms_generation = cls._role_permissions_generation
        return user_perms

    @classmethod
    def clear_users_with_role(cls, role, organization_id=None):
        for membership in role.memberships.select_related("user"):
            cls.clear_user_cache(membership.user, organization_id or role.organization_id)

    @classmethod
    def has_permission(
        cls, user: User, permission_code: str, organization_id: Union[int, str]
    ) -> bool:
        """
        Check if a user has a specific permission within an organization.
        Uses in-memory evaluated role permissions and cached request-scoped storage.
        """
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser:
            return True

        if not organization_id:
            return False

        user_perms = cls.get_user_permissions(user, organization_id)
        return permission_code in user_perms

    @classmethod
    def clear_user_cache(cls, user: User, organization_id: Union[int, str] = None):
        """Invalidate the cached permissions dictionary on the user instance."""
        if not user:
            return
        if not hasattr(user, "_cached_user_org_perms"):
            return
        if organization_id is not None:
            user._cached_user_org_perms.pop(str(organization_id), None)
        else:
            user._cached_user_org_perms.clear()


class AuditService:
    @staticmethod
    def log_action(organization, actor, action, target_user=None, details=None, ip_address=None):
        from .models import OrganizationAuditLog

        return OrganizationAuditLog.objects.create(
            organization=organization,
            actor=actor,
            action=action,
            target_user=target_user,
            details=details or {},
            ip_address=ip_address,
        )
