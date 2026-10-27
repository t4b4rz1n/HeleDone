"""
projects/permissions.py
-----------------------
Custom DRF permission classes for the projects application.

Access matrix
~~~~~~~~~~~~~
+----------------------------+-------------------------------------------------+
| Action                     | Allowed for                                     |
+============================+=================================================+
| Project list / detail      | Any authenticated user in the same org (+ staff)|
| Project create             | Org admin / owner of the *target* org (+ staff) |
| Project update / delete    | Project owner, org admin/owner (+ staff)        |
| ProjectMember write        | Project owner, org admin/owner (+ staff)        |
| Milestone write            | Project members + project owner + org admin     |
| Activity feed (read-only)  | Project members, org members (+ staff)          |
+----------------------------+-------------------------------------------------+
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import permissions

from organizations.services import PermissionService

# ---------------------------------------------------------------------------
# Helpers (private)
# ---------------------------------------------------------------------------




def _is_org_admin(user, organization) -> bool:
    """Check whether *user* can manage the organization (admin/owner via dynamic permissions)."""
    if not organization:
        return False
    from organizations.permissions import is_org_admin

    return is_org_admin(user, organization)


def _is_project_member(user, project) -> bool:
    return project.members.filter(user=user, is_deleted=False).exists()


def _is_project_owner(user, project) -> bool:
    return project.owner_id == user.pk


# ---------------------------------------------------------------------------
# Base helper — cached per-request project lookup
# ---------------------------------------------------------------------------


class _ProjectFromKwargsMixin(permissions.BasePermission):
    """Extracts the parent ``Project`` from the view's URL kwargs.

    For nested viewsets the ``project_pk`` kwarg holds the UUID of the
    parent project.  For the top-level ``ProjectViewSet`` the kwarg is
    just ``pk``.  This mixin normalises access via ``_get_project(view)``.

    The result is cached on the view instance so multiple permission
    classes sharing the same request only hit the database once.
    """

    @staticmethod
    def _get_project(view):
        # Return cached project if already fetched during this request
        if hasattr(view, "_perm_project_cache"):
            return view._perm_project_cache

        pk = view.kwargs.get("project_pk") or view.kwargs.get("pk")
        if not pk:
            view._perm_project_cache = None
            return None
        try:
            from projects.models import Project

            project = Project.objects.get(pk=pk, is_deleted=False)
        except Project.DoesNotExist:
            project = None

        view._perm_project_cache = project
        return project


# ---------------------------------------------------------------------------
# Project-level permissions
# ---------------------------------------------------------------------------


class IsProjectOwnerOrOrgAdmin(permissions.BasePermission):
    """Object-level: allow writes only for project owner, org admin, or staff."""

    message = _("You do not have permission to modify this project.")

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        if user.is_superuser:
            return True
        if _is_project_owner(user, obj):
            return True
        if _is_org_admin(user, obj.organization):
            return True
        return False


class CanCreateProject(permissions.BasePermission):
    """View-level: only org admins/owners of the *target* org (or staff) may create projects.

    On POST the request body must contain ``organization_id``.  This
    permission verifies that the requesting user holds an admin/owner
    role in *that specific* organisation — not just any organisation.
    """

    message = _("Only organisation admins or staff can create projects.")

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        # Extract the target organisation from the request payload
        org_id = request.data.get("organization_id")
        if org_id:
            return (
                PermissionService.has_permission(user, "project.create", org_id)
                or PermissionService.has_permission(user, "project.manage", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
            )

        return False


# ---------------------------------------------------------------------------
# Member-level permissions
# ---------------------------------------------------------------------------


class CanManageProjectMember(_ProjectFromKwargsMixin):
    """View-level: project owner, org admin, or staff can manage members."""

    message = _("You do not have permission to manage project members.")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        project = self._get_project(view)
        if project is None or project.is_deleted:
            return False
        if user.is_superuser or _is_project_owner(user, project) or _is_org_admin(user, project.organization):
            return True
        if request.method in permissions.SAFE_METHODS:
            return _is_project_member(user, project)
        return False


# ---------------------------------------------------------------------------
# Milestone-level permissions
# ---------------------------------------------------------------------------


class CanManageMilestone(_ProjectFromKwargsMixin):
    """View-level: project members (+ owner, org admin, staff) can manage milestones."""

    message = _("You must be a project member to manage milestones.")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        project = self._get_project(view)
        if project is None or project.is_deleted:
            return False
        if user.is_superuser or _is_project_owner(user, project) or _is_org_admin(user, project.organization):
            return True
        if _is_project_member(user, project):
            return True
        return False


# ---------------------------------------------------------------------------
# Activity (read-only) permission
# ---------------------------------------------------------------------------


class CanViewProjectActivity(_ProjectFromKwargsMixin):
    """Activity feed is visible to org members, project members, or staff."""

    message = _("You do not have permission to view this project's activity.")

    def has_permission(self, request, view):
        if request.method not in permissions.SAFE_METHODS:
            return False  # activity is always read-only
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        project = self._get_project(view)
        if project is None:
            return False
        if _is_project_owner(user, project):
            return True
        if PermissionService.has_permission(user, "project.view", project.organization_id):
            return True
        if _is_project_member(user, project):
            return True
        return False


class CanManageProjectFile(_ProjectFromKwargsMixin):
    """View-level: project members (+ owner, org admin, staff) can manage project files."""

    message = _("You must be a project member to manage project files.")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        project = self._get_project(view)
        if project is None:
            return False
        if _is_project_owner(user, project):
            return True
        if _is_org_admin(user, project.organization):
            return True
        if _is_project_member(user, project):
            return True
        if PermissionService.has_permission(user, "project.view", project.organization_id):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        # For deletion or modification, uploader, project owner, or org admin is allowed
        project = obj.project
        if (
            obj.uploaded_by_id == user.id
            or _is_project_owner(user, project)
            or _is_org_admin(user, project.organization)
        ):
            return True
        return False
