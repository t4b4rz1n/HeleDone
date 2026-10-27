from django.utils.translation import gettext_lazy as _
from rest_framework import permissions


def get_user_org_role(request, organization_id=None):
    user = request.user
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "owner"

    if not hasattr(request, "_user_org_roles_cache"):
        request._user_org_roles_cache = {}

    cache_key = str(organization_id) if organization_id else "default"
    if cache_key in request._user_org_roles_cache:
        return request._user_org_roles_cache[cache_key]

    if not organization_id:
        request._user_org_roles_cache[cache_key] = None
        return None

    membership = user.org_memberships.filter(
        organization_id=organization_id, is_deleted=False
    ).first()
    role = (membership.role or "member").lower() if membership else None
    request._user_org_roles_cache[cache_key] = role
    return role


def extract_organization_id(obj_or_request):
    """Extracts organization_id from object or request context."""
    if hasattr(obj_or_request, "organization_id") and obj_or_request.organization_id:
        return obj_or_request.organization_id
    if hasattr(obj_or_request, "organization") and obj_or_request.organization:
        return getattr(obj_or_request.organization, "id", None)
    if hasattr(obj_or_request, "project") and obj_or_request.project:
        return getattr(obj_or_request.project, "organization_id", None)
    if hasattr(obj_or_request, "board") and obj_or_request.board:
        project = getattr(obj_or_request.board, "project", None)
        return getattr(project, "organization_id", None) if project else None
    if hasattr(obj_or_request, "task") and obj_or_request.task:
        project = getattr(obj_or_request.task, "project", None)
        return getattr(project, "organization_id", None) if project else None

    if hasattr(obj_or_request, "method") and obj_or_request.method in [
        "POST",
        "PUT",
        "PATCH",
    ]:
        try:
            data = getattr(obj_or_request, "data", {})
            if isinstance(data, dict):
                board_id = data.get("board") or data.get("board_id")
                if board_id:
                    from tasks.models import Board

                    board = Board.objects.filter(id=board_id).select_related("project").first()
                    if board and board.project:
                        return board.project.organization_id

                proj_id = data.get("project") or data.get("project_id")
                if proj_id:
                    from projects.models import Project

                    return (
                        Project.objects.filter(id=proj_id)
                        .values_list("organization_id", flat=True)
                        .first()
                    )

                task_id = data.get("task") or data.get("task_id")
                if task_id:
                    from tasks.models import Task

                    org_id = (
                        Task.objects.filter(id=task_id)
                        .values_list("project__organization_id", flat=True)
                        .first()
                    )
                    if org_id:
                        return org_id

                org_id = data.get("organization") or data.get("organization_id")
                if org_id:
                    return org_id
        except Exception:
            pass

    if hasattr(obj_or_request, "query_params"):
        raw_org_id = obj_or_request.query_params.get(
            "organization"
        ) or obj_or_request.query_params.get("organization_id")
        if raw_org_id and str(raw_org_id).strip():
            return str(raw_org_id).strip()

        raw_board_id = obj_or_request.query_params.get("board") or obj_or_request.query_params.get(
            "board_id"
        )
        if raw_board_id and str(raw_board_id).strip():
            from tasks.models import Board

            board = Board.objects.filter(id=raw_board_id).select_related("project").first()
            if board and board.project:
                return board.project.organization_id

        raw_proj_id = obj_or_request.query_params.get("project") or obj_or_request.query_params.get(
            "project_id"
        )
        if raw_proj_id and str(raw_proj_id).strip():
            from projects.models import Project

            return (
                Project.objects.filter(id=raw_proj_id)
                .values_list("organization_id", flat=True)
                .first()
            )

    user = getattr(obj_or_request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        mem = user.org_memberships.filter(is_deleted=False).first()
        if mem:
            return mem.organization_id

    return None


def extract_project_id(obj_or_request):
    """Extracts project_id from object or request context."""
    if hasattr(obj_or_request, "project_id") and obj_or_request.project_id:
        return obj_or_request.project_id
    if hasattr(obj_or_request, "project") and obj_or_request.project:
        return getattr(obj_or_request.project, "id", None)
    if hasattr(obj_or_request, "board") and obj_or_request.board:
        return getattr(obj_or_request.board, "project_id", None)
    if hasattr(obj_or_request, "task") and obj_or_request.task:
        return getattr(obj_or_request.task, "project_id", None)

    if hasattr(obj_or_request, "query_params"):
        p_id = obj_or_request.query_params.get("project") or obj_or_request.query_params.get(
            "project_id"
        )
        if p_id and str(p_id).strip():
            return str(p_id).strip()

    if hasattr(obj_or_request, "method") and obj_or_request.method in [
        "POST",
        "PUT",
        "PATCH",
    ]:
        try:
            data = getattr(obj_or_request, "data", {})
            if isinstance(data, dict):
                proj_id = data.get("project") or data.get("project_id")
                if proj_id:
                    return proj_id

                task_id = data.get("task") or data.get("task_id")
                if task_id:
                    from tasks.models import Task

                    task = (
                        Task.objects.filter(id=task_id).values_list("project_id", flat=True).first()
                    )
                    if task:
                        return task
        except Exception:
            pass

    return None


def is_user_project_member(request, project_id):
    """Checks if the user is an active member of the given project or has administrative authority."""
    user = request.user
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not project_id:
        return False

    from organizations.services import PermissionService
    from projects.models import Project, ProjectMember

    project = (
        Project.objects.filter(id=project_id, is_deleted=False)
        .values("organization_id", "owner_id")
        .first()
    )
    if project:
        if project.get("owner_id") == user.id:
            return True
        org_id = project.get("organization_id")
        if org_id and (
            PermissionService.has_permission(user, "project.manage", org_id)
            or PermissionService.has_permission(user, "task.manage_all", org_id)
            or PermissionService.has_permission(user, "org.manage_settings", org_id)
        ):
            return True

    if not hasattr(request, "_user_project_memberships_cache"):
        p_ids = set(
            ProjectMember.objects.filter(user=user, is_active=True, is_deleted=False).values_list(
                "project_id", flat=True
            )
        )
        request._user_project_memberships_cache = {str(pid) for pid in p_ids}

    return str(project_id) in request._user_project_memberships_cache


class BaseMadaarPermission(permissions.BasePermission):
    """Base permission enforcing auth, org isolation, staff bypass, and role caching."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        # Allow detail routes/actions to pass through to check_object_permission
        # where the model instance's project and organization can be inspected
        if (
            getattr(view, "detail", False)
            or getattr(view, "action", None)
            in ["retrieve", "update", "partial_update", "destroy", "move"]
            or (hasattr(view, "kwargs") and "pk" in view.kwargs)
        ):
            return True

        org_id = extract_organization_id(request)
        role = get_user_org_role(request, org_id)

        if org_id is not None and role is None:
            return False

        return self.check_permission(request, view)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        org_id = extract_organization_id(obj)
        role = get_user_org_role(request, org_id)

        if org_id is not None and role is None:
            return False

        return self.check_object_permission(request, view, obj)

    def check_permission(self, request, view):
        return True

    def check_object_permission(self, request, view, obj):
        return True


class IsBoardPermission(BaseMadaarPermission):
    """Board access: Read for users with board.view; Modify for users with board.manage, project.manage, task.manage_all, org.manage_settings, or Creator."""

    def check_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(request)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "board.view", org_id
            ) or PermissionService.has_permission(request.user, "task.view", org_id)

        org_id = extract_organization_id(request)
        if org_id:
            from organizations.services import PermissionService

            if (
                PermissionService.has_permission(request.user, "board.manage", org_id)
                or PermissionService.has_permission(request.user, "project.manage", org_id)
                or PermissionService.has_permission(request.user, "task.manage_all", org_id)
                or PermissionService.has_permission(request.user, "org.manage_settings", org_id)
            ):
                return True
        return False

    def check_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(obj)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "board.view", org_id
            ) or PermissionService.has_permission(request.user, "task.view", org_id)

        if hasattr(obj, "created_by") and obj.created_by == request.user:
            return True

        org_id = extract_organization_id(obj)
        if org_id:
            from organizations.services import PermissionService

            if (
                PermissionService.has_permission(request.user, "board.manage", org_id)
                or PermissionService.has_permission(request.user, "project.manage", org_id)
                or PermissionService.has_permission(request.user, "task.manage_all", org_id)
                or PermissionService.has_permission(request.user, "org.manage_settings", org_id)
            ):
                return True
        return False


class IsTaskStatusPermission(BaseMadaarPermission):
    """Kanban status access: Read for users with board.view or task.view; Modify for board.manage, project.manage, task.manage_all, or Board Creator."""

    def check_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(request)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "board.view", org_id
            ) or PermissionService.has_permission(request.user, "task.view", org_id)

        org_id = extract_organization_id(request)
        if org_id:
            from organizations.services import PermissionService

            if (
                PermissionService.has_permission(request.user, "org.manage_settings", org_id)
                or PermissionService.has_permission(request.user, "project.manage", org_id)
                or PermissionService.has_permission(request.user, "task.manage_all", org_id)
                or PermissionService.has_permission(request.user, "board.manage", org_id)
            ):
                return True
        return False

    def check_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(obj)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "board.view", org_id
            ) or PermissionService.has_permission(request.user, "task.view", org_id)

        if hasattr(obj, "board") and obj.board and obj.board.created_by == request.user:
            return True

        org_id = extract_organization_id(obj)
        if org_id:
            from organizations.services import PermissionService

            if (
                PermissionService.has_permission(request.user, "org.manage_settings", org_id)
                or PermissionService.has_permission(request.user, "project.manage", org_id)
                or PermissionService.has_permission(request.user, "task.manage_all", org_id)
                or PermissionService.has_permission(request.user, "board.manage", org_id)
            ):
                return True
        return False


class IsTaskPermission(BaseMadaarPermission):
    """Task access: Read for org members with task.view; Modify for Assignee, Reporter, Creator, or users with task.manage_all / task.review."""

    def check_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(request)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "task.view", org_id
            ) or PermissionService.has_permission(request.user, "task.manage_all", org_id)

        org_id = extract_organization_id(request)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "task.manage_all", org_id):
                return True
            if PermissionService.has_permission(request.user, "task.create", org_id):
                project_id = extract_project_id(request)
                if project_id and is_user_project_member(request, project_id):
                    return True

        return False

    def check_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            org_id = extract_organization_id(obj)
            if not org_id:
                return True
            from organizations.services import PermissionService

            return PermissionService.has_permission(
                request.user, "task.view", org_id
            ) or PermissionService.has_permission(request.user, "task.manage_all", org_id)

        org_id = extract_organization_id(obj)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "task.manage_all", org_id):
                return True
            if getattr(view, "action", None) == "mark_done" and PermissionService.has_permission(
                request.user, "task.review", org_id
            ):
                return True

        if request.method == "DELETE":
            return hasattr(obj, "reporter") and obj.reporter == request.user

        if hasattr(obj, "assignees") and obj.assignees.filter(id=request.user.id).exists():
            return True
        if hasattr(obj, "reporter") and obj.reporter == request.user:
            return True
        if hasattr(obj, "created_by") and obj.created_by == request.user:
            return True

        return False


class IsTaskChecklistPermission(BaseMadaarPermission):
    """Checklist access: Toggle/Modify for Admin, Owner, Lead, Assignee, Reporter, or Creator."""

    def check_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        org_id = extract_organization_id(request)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(
                request.user, "task.manage_all", org_id
            ) or PermissionService.has_permission(request.user, "task.create", org_id):
                return True
        return False

    def check_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        org_id = extract_organization_id(obj)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "task.manage_all", org_id):
                return True

        if hasattr(obj, "created_by") and obj.created_by == request.user:
            return True

        if hasattr(obj, "task") and obj.task:
            if (
                obj.task.assignees.filter(id=request.user.id).exists()
                or obj.task.reporter == request.user
            ):
                return True

            project_id = extract_project_id(obj)
            if project_id and is_user_project_member(request, project_id):
                # Allow active project members to toggle/modify checklist items
                return True

        return False


class IsTaskCommentPermission(BaseMadaarPermission):
    """Task comment access: Create for project members; Edit/Delete for Author, Admin, or Owner."""

    def check_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        org_id = extract_organization_id(request)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "task.manage_all", org_id):
                return True

        project_id = extract_project_id(request)
        if project_id and is_user_project_member(request, project_id):
            return True

        return False

    def check_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        if hasattr(obj, "author") and obj.author == request.user:
            return True
        if hasattr(obj, "user") and obj.user == request.user:
            return True

        org_id = extract_organization_id(obj)
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "task.manage_all", org_id):
                return True

        return False


class IsAsyncStandupPermission(permissions.BasePermission):
    """Project-based daily standups."""

    message = _("You do not have permission to perform this action on standups.")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if user.is_superuser:
            return True

        if getattr(view, "action", None) in ("update", "partial_update", "destroy"):
            return True

        data = getattr(request, "data", {})
        project_id = None
        if isinstance(data, dict):
            project_id = data.get("project") or data.get("project_id")
        if not project_id:
            return False

        if is_user_project_member(request, project_id):
            return True

        from projects.models import Project

        org_id = (
            Project.objects.filter(id=project_id).values_list("organization_id", flat=True).first()
        )
        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "org.manage_settings", org_id):
                return True
        return False

    def has_object_permission(self, request, view, obj):
        user = request.user

        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if getattr(obj, "user_id", None) == user.id:
            return True

        project = getattr(obj, "project", None)
        org_id = getattr(project, "organization_id", None)

        if org_id:
            from organizations.services import PermissionService

            if PermissionService.has_permission(request.user, "org.manage_settings", org_id):
                return True
        return False


# Legacy aliases for backward compatibility
IsTaskAssigneeOrReporterOrReadOnly = IsTaskPermission
IsBoardOwnerOrReadOnly = IsBoardPermission
