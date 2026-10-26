from rest_framework import permissions

from organizations.services import PermissionService


class BaseAttendancePermission(permissions.BasePermission):
    def get_user_org_role(self, request, organization_id=None):
        # Kept for compatibility but we should prefer PermissionService directly
        user = request.user
        if not user or not user.is_authenticated:
            return None
        if user.is_staff or user.is_superuser:
            return "owner"

        if not hasattr(request, "_user_org_roles_cache"):
            request._user_org_roles_cache = {}

        cache_key = str(organization_id) if organization_id else "default"
        if cache_key in request._user_org_roles_cache:
            return request._user_org_roles_cache[cache_key]

        qs = user.org_memberships.filter(is_deleted=False)
        if organization_id:
            qs = qs.filter(organization_id=organization_id)

        membership = qs.first()
        if not membership:
            from organizations.models import Organization

            if (
                organization_id
                and Organization.objects.filter(
                    id=organization_id, owner=user, is_deleted=False
                ).exists()
            ):
                role = "owner"
            else:
                role = None
        else:
            role = (membership.role or "member").lower()
        request._user_org_roles_cache[cache_key] = role
        return role

    def extract_organization_id(self, request, view, obj=None):
        if obj and hasattr(obj, "organization_id"):
            return obj.organization_id
        if hasattr(request, "data") and request.data.get("organization"):
            return request.data.get("organization")
        if hasattr(request, "query_params"):
            if request.query_params.get("organization"):
                return request.query_params.get("organization")
            project_id = request.query_params.get("project")
            if project_id:
                from projects.models import Project

                project = Project.objects.filter(id=project_id).first()
                if project:
                    return project.organization_id
        return None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return True


class IsAttendanceOwnerOrAdmin(BaseAttendancePermission):
    """Attendance: only the record owner or those with 'attendance.view_all' can access."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or request.user.is_superuser:
            return True
        if obj.user == request.user:
            return True
        return PermissionService.has_permission(
            request.user, "attendance.view_all", obj.organization_id
        )


class IsTimeLogOwnerOrAdmin(BaseAttendancePermission):
    """Time logs are visible to their owner or users with attendance.view_all."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or request.user.is_superuser:
            return True

        # Check org from project or task
        org_id = None
        if obj.project:
            org_id = obj.project.organization_id
        elif obj.task and obj.task.project:
            org_id = obj.task.project.organization_id

        if obj.user == request.user:
            return True
        return PermissionService.has_permission(request.user, "attendance.view_all", org_id)


class IsTimeOffRequestPermission(BaseAttendancePermission):
    """Time-off: only the requester or someone with 'leave.approve' can view/modify; approve/reject requires 'leave.approve'."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or request.user.is_superuser:
            return True

        is_owner = obj.user == request.user
        has_approve_perm = PermissionService.has_permission(
            request.user, "leave.approve", obj.organization_id
        )

        if view.action in ["approve", "reject"]:
            return has_approve_perm

        if view.action == "cancel":
            return is_owner and obj.status == "pending"

        return is_owner or has_approve_perm


class IsHolidayPermission(BaseAttendancePermission):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if request.user.is_staff or request.user.is_superuser:
            return True

        org_id = self.extract_organization_id(request, view)
        if not org_id:
            return False

        return PermissionService.has_permission(request.user, "org.manage_settings", org_id)


class IsTimesheetPermission(BaseAttendancePermission):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        if view.action in ["team", "project"]:
            # All org members can view team/project timesheets
            org_id = self.extract_organization_id(request, view)
            role = self.get_user_org_role(request, org_id)
            return role is not None or request.user.is_staff

        # personal timesheets (daily/weekly/monthly)
        return True
