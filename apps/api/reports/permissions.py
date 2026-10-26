"""
reports/permissions.py
----------------------
Role-based permission classes for the reporting & analytics endpoints.

Access matrix
~~~~~~~~~~~~~
+----------------------------+-----------------------------------------------------+
| Dashboard level            | Allowed roles                                       |
+============================+=====================================================+
| Employee Dashboard         | Any authenticated member of an organisation         |
| Manager Dashboard          | owner, admin, team_lead (org) OR lead (team)        |
| Manager Members            | Same as Manager Dashboard                           |
| Executive Dashboard        | owner, admin only                                   |
+----------------------------+-----------------------------------------------------+

Design notes
~~~~~~~~~~~~
* All dashboard endpoints are **read-only** (GET).  Non-safe methods are
  always denied.
* Organisation membership is resolved from the ``org_id`` query-parameter
  (executive) or derived from ``team_id`` (manager).
* Staff / superuser always has full access.
"""

# ---------------------------------------------------------------------------
# Helpers (private)
# ---------------------------------------------------------------------------
import uuid

from django.utils.translation import gettext_lazy as _
from rest_framework import permissions
from rest_framework.exceptions import ParseError

from organizations.models import OrganizationMembership
from organizations.services import PermissionService


def _validate_uuid_param(param_value, param_name):
    """Validate that param_value is a valid UUID, otherwise raise 400 Bad Request."""
    if param_value:
        try:
            uuid.UUID(str(param_value))
        except ValueError:
            raise ParseError(detail=f"{param_name} must be a valid UUID") from None


def _get_user_org_roles(user):
    """Return a queryset of the user's non-deleted organisation memberships."""
    return OrganizationMembership.objects.filter(
        user=user,
        is_deleted=False,
    )


def _is_org_member(user, org_id) -> bool:
    """Check whether *user* belongs to the given organisation."""
    return _get_user_org_roles(user).filter(organization_id=org_id).exists()


def _get_org_role(user, org_id) -> str | None:
    """Return the user's role in the given organisation, or ``None``."""
    membership = _get_user_org_roles(user).filter(organization_id=org_id).first()
    return membership.role if membership else None


def _is_org_admin_or_owner(user, org_id) -> bool:
    """Check whether *user* has management access for the given organisation."""
    if not user or not org_id:
        return False
    return (
        PermissionService.has_permission(user, "org.manage_settings", org_id)
        or PermissionService.has_permission(user, "finance.view_reports", org_id)
        or PermissionService.has_permission(user, "report.view", org_id)
    )


def _is_team_lead(user, team_id) -> bool:
    """Check whether *user* is lead of the given team."""
    from organizations.models import Team

    return Team.objects.filter(
        id=team_id,
        leader=user,
        is_deleted=False,
    ).exists()


def _get_managed_team_ids(user):
    """Return IDs of all teams where *user* is a lead."""
    from organizations.models import Team

    return list(
        Team.objects.filter(
            leader=user,
            is_deleted=False,
        ).values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# Employee-level permission
# ---------------------------------------------------------------------------


class IsEmployeeOrAbove(permissions.BasePermission):
    """Any authenticated member of at least one organisation may access
    the employee dashboard.

    The employee dashboard is personal — it shows only the requesting
    user's own data — so no organisation/team filtering is required at
    the permission level.
    """

    message = _("You must be a member of an organisation to access dashboards.")

    def has_permission(self, request, view):
        if request.method not in permissions.SAFE_METHODS:
            return False

        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        return _get_user_org_roles(user).exists()


# ---------------------------------------------------------------------------
# Manager-level permission
# ---------------------------------------------------------------------------


class IsManagerOrAbove(permissions.BasePermission):
    """Managers (team_lead, admin, owner, or users with report permissions) may access team-level dashboards."""

    message = _("You must be a team lead or organisation admin to access this dashboard.")

    def has_permission(self, request, view):
        if request.method not in permissions.SAFE_METHODS:
            return False

        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        team_id = request.query_params.get("team_id")
        _validate_uuid_param(team_id, "team_id")

        if team_id:
            from organizations.models import Team

            try:
                team = Team.objects.get(pk=team_id, is_deleted=False)
            except Team.DoesNotExist:
                return False

            org_id = team.organization_id

            # Org admin/owner or user with executive report.view / org.manage_settings permission can view all teams
            if _is_org_admin_or_owner(user, org_id):
                return True
            if (
                PermissionService.has_permission(user, "report.view", org_id)
                or PermissionService.has_permission(user, "report.view_team_lead", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
            ):
                return True

            # Team lead must lead this specific team
            return _is_team_lead(user, team_id)

        # No team_id provided — allow if user leads at least one team OR has manage permission
        managed_teams = _get_managed_team_ids(user)
        if managed_teams:
            return True

        # Also allow org admins/owners or users with project.manage / report.view
        memberships = _get_user_org_roles(user)
        for m in memberships:
            if (
                PermissionService.has_permission(user, "project.manage", m.organization_id)
                or PermissionService.has_permission(user, "report.view", m.organization_id)
                or PermissionService.has_permission(
                    user, "report.view_team_lead", m.organization_id
                )
                or PermissionService.has_permission(user, "org.manage_settings", m.organization_id)
            ):
                return True

        return False


# ---------------------------------------------------------------------------
# Executive-level permission
# ---------------------------------------------------------------------------


class IsExecutive(permissions.BasePermission):
    """Only organisation owners, admins, and users with executive report permissions may access the executive dashboard."""

    message = _("Only organisation owners and admins can access the executive dashboard.")

    def has_permission(self, request, view):
        if request.method not in permissions.SAFE_METHODS:
            return False

        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        org_id = request.query_params.get("org_id")
        _validate_uuid_param(org_id, "org_id")

        if org_id:
            return (
                PermissionService.has_permission(user, "org.manage_settings", org_id)
                or PermissionService.has_permission(user, "finance.view_reports", org_id)
                or PermissionService.has_permission(user, "report.view", org_id)
            )

        # No org_id — allow if user has manage_settings / finance.view_reports / report.view anywhere
        memberships = _get_user_org_roles(user)
        for m in memberships:
            if (
                PermissionService.has_permission(user, "org.manage_settings", m.organization_id)
                or PermissionService.has_permission(user, "finance.view_reports", m.organization_id)
                or PermissionService.has_permission(user, "report.view", m.organization_id)
            ):
                return True

        return False
