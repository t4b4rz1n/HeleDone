import datetime

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Milestone

from .permissions import IsEmployeeOrAbove, IsExecutive, IsManagerOrAbove
from .serializers import (
    CfdSerializer,
    CycleLeadTimeSerializer,
    EmployeeDashboardSerializer,
    ExecutiveDashboardSerializer,
    ManagerDashboardSerializer,
    MemberDetailSerializer,
    MilestoneBurndownSerializer,
)
from .services import (
    CumulativeFlowService,
    CycleLeadTimeService,
    EmployeeDashboardService,
    ExecutiveDashboardService,
    ManagerDashboardService,
    MilestoneBurndownService,
)


class EmployeeDashboardView(APIView):
    """Personal dashboard for the authenticated employee.

    Returns today's tasks, overdue tasks, weekly time summary,
    active projects, attendance status, and upcoming milestones.
    """

    permission_classes = [IsAuthenticated, IsEmployeeOrAbove]

    @extend_schema(
        summary="Employee Personal Dashboard",
        description="Returns the authenticated user's personal dashboard data.",
        parameters=[
            OpenApiParameter(
                "tz",
                OpenApiTypes.STR,
                description="User timezone (e.g. Asia/Tehran). Defaults to UTC.",
                required=False,
            ),
        ],
        responses={200: EmployeeDashboardSerializer},
        tags=["reports"],
    )
    def get(self, request):
        tz_name = request.query_params.get("tz", "UTC")
        data = EmployeeDashboardService.get_dashboard(request.user, tz_name)
        serializer = EmployeeDashboardSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ManagerDashboardView(APIView):
    """Team-level dashboard for managers and team leads.

    Shows task statistics, work hours, member attendance,
    project summaries, and overdue items for the specified team.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    @extend_schema(
        summary="Manager Team Dashboard",
        description=(
            "Returns team-level analytics for the specified team.\n\n"
            "**Scope rules (no team_id provided):**\n"
            "- **Owner / Admin**: sees aggregated data for *all* members of every "
            "organisation they administer. Pass team_id to narrow to a specific team.\n"
            "- **Team Lead (non-admin)**: sees only the members of teams they explicitly "
            "lead. Data is empty if they lead no teams.\n\n"
            "Always pass team_id explicitly when querying a specific team."
        ),
        parameters=[
            OpenApiParameter(
                "team_id",
                OpenApiTypes.UUID,
                description="ID of the team to view. Required for team_leads.",
                required=False,
            ),
            OpenApiParameter(
                "tz",
                OpenApiTypes.STR,
                description="User timezone (e.g. Asia/Tehran). Defaults to UTC.",
                required=False,
            ),
        ],
        responses={200: ManagerDashboardSerializer},
        tags=["reports"],
    )
    def get(self, request):
        team_id = request.query_params.get("team_id")
        tz_name = request.query_params.get("tz", "UTC")
        data = ManagerDashboardService.get_dashboard(request.user, team_id=team_id, tz_name=tz_name)
        serializer = ManagerDashboardSerializer(data, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ManagerMembersView(APIView):
    """Detailed per-member view for managers.

    Shows each team member's task counts, completion rate,
    overdue tasks, and weekly work hours.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    @extend_schema(
        summary="Manager Team Members Detail",
        description=("Returns detailed per-member analytics for the specified team."),
        parameters=[
            OpenApiParameter(
                "team_id",
                OpenApiTypes.UUID,
                description="ID of the team to view.",
                required=False,
            ),
            OpenApiParameter(
                "tz",
                OpenApiTypes.STR,
                description="User timezone (e.g. Asia/Tehran). Defaults to UTC.",
                required=False,
            ),
        ],
        responses={200: MemberDetailSerializer(many=True)},
        tags=["reports"],
    )
    def get(self, request):
        team_id = request.query_params.get("team_id")
        tz_name = request.query_params.get("tz", "UTC")
        data = ManagerDashboardService.get_members_detail(
            request.user, team_id=team_id, tz_name=tz_name
        )
        serializer = MemberDetailSerializer(data, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ExecutiveDashboardView(APIView):
    """Organisation-wide dashboard for owners and admins.

    Shows company overview, resource utilization, project health,
    and financial summaries across the entire organisation.
    """

    permission_classes = [IsAuthenticated, IsExecutive]

    @extend_schema(
        summary="Executive Organisation Dashboard",
        description=(
            "Returns organisation-wide analytics for owners and admins.\n\n"
            "**org_id parameter:**\n"
            "- If provided, returns data for that specific organisation "
            "(user must be owner or admin of it).\n"
            "- If omitted, the oldest membership where the user is owner/admin is used "
            "(deterministic: order by created_at). **For users in multiple organisations, "
            "always pass org_id explicitly to avoid ambiguity.**\n\n"
            "**Week definition:** the reporting week starts on **Saturday** "
            "(Iranian calendar) and ends on Friday.\n\n"
            "**Stub fields:** `points`, `badges`, and `goals` are reserved for future "
            "modules (Gamification Phase 2 and OKR Phase 3) and currently return `null`."
        ),
        parameters=[
            OpenApiParameter(
                "org_id",
                OpenApiTypes.UUID,
                description="ID of the organisation to view.",
                required=False,
            ),
            OpenApiParameter(
                "tz",
                OpenApiTypes.STR,
                description="User timezone (e.g. Asia/Tehran). Defaults to UTC.",
                required=False,
            ),
        ],
        responses={200: ExecutiveDashboardSerializer},
        tags=["reports"],
    )
    def get(self, request):
        org_id = request.query_params.get("org_id")
        tz_name = request.query_params.get("tz", "UTC")

        data = ExecutiveDashboardService.get_dashboard(request.user, org_id=org_id, tz_name=tz_name)
        serializer = ExecutiveDashboardSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Analytics: Cumulative Flow Diagram
# ---------------------------------------------------------------------------


class CumulativeFlowView(APIView):
    """
    Cumulative Flow Diagram (CFD) for a project.

    Access
    ~~~~~~
    * **Employee**: only if they are an active member of the project.
    * **Manager / Admin / Owner**: any project in their organisation.

    The CFD shows how many tasks were in each status column every day.
    Status columns are dynamic — any board status (even deleted ones) appears
    in the historic data via snapshot fields.
    """

    permission_classes = [IsAuthenticated, IsEmployeeOrAbove]

    @extend_schema(
        summary="Cumulative Flow Diagram",
        description=(
            "Returns day-by-day task counts per status for the given project. "
            "Useful for identifying bottlenecks (e.g. a growing 'Review' band)."
        ),
        parameters=[
            OpenApiParameter(
                "board_id",
                OpenApiTypes.UUID,
                required=False,
                description="Narrow to a single board.",
            ),
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                required=False,
                description="ISO date (default: 30 days ago).",
            ),
            OpenApiParameter(
                "end_date",
                OpenApiTypes.DATE,
                required=False,
                description="ISO date (default: today).",
            ),
            OpenApiParameter(
                "tz", OpenApiTypes.STR, required=False, description="IANA timezone (default: UTC)."
            ),
        ],
        responses={200: CfdSerializer},
        tags=["reports"],
    )
    def get(self, request, project_id):
        self._check_project_access(request.user, project_id)

        board_id = request.query_params.get("board_id")
        tz_name = request.query_params.get("tz", "UTC")
        start_date = self._parse_date(request.query_params.get("start_date"))
        end_date = self._parse_date(request.query_params.get("end_date"))

        data = CumulativeFlowService.get_cfd(
            project_id=str(project_id),
            board_id=str(board_id) if board_id else None,
            start_date=start_date,
            end_date=end_date,
            tz_name=tz_name,
        )
        serializer = CfdSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _check_project_access(self, user, project_id):
        if user.is_staff or user.is_superuser:
            return
        from projects.models import Project
        from projects.services import ProjectService

        try:
            # Re-use the same accessible queryset that the project list uses.
            # This ensures that if they can see the project, they can see its reports.
            ProjectService.get_accessible_queryset(user).get(pk=project_id, is_deleted=False)
        except Project.DoesNotExist as err:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this project.") from err

    @staticmethod
    def _parse_date(value) -> datetime.date | None:
        if not value:
            return None
        try:
            return datetime.date.fromisoformat(value)
        except ValueError as err:
            raise ParseError(f"Invalid date format: '{value}'. Use YYYY-MM-DD.") from err


# ---------------------------------------------------------------------------
# Analytics: Milestone Burndown / Burnup
# ---------------------------------------------------------------------------


class MilestoneBurndownView(APIView):
    """
    Burndown and Burnup chart for a single Milestone.

    Access
    ~~~~~~
    * **Employee**: only if they are a member of the milestone's project.
    * **Manager / Admin / Owner**: any milestone.

    Shows three data series:
    * ``ideal_line``      — straight-line projection from total → 0 on target_date.
    * ``actual_burndown`` — tasks still remaining each day.
    * ``burnup``          — cumulative done vs. total tasks each day.
    """

    permission_classes = [IsAuthenticated, IsEmployeeOrAbove]

    @extend_schema(
        summary="Milestone Burndown / Burnup",
        description=("Returns daily burndown and burnup series for the specified milestone."),
        parameters=[
            OpenApiParameter(
                "tz", OpenApiTypes.STR, required=False, description="IANA timezone (default: UTC)."
            ),
        ],
        responses={200: MilestoneBurndownSerializer},
        tags=["reports"],
    )
    def get(self, request, milestone_id):
        self._check_milestone_access(request.user, milestone_id)
        tz_name = request.query_params.get("tz", "UTC")
        data = MilestoneBurndownService.get_burndown(
            milestone_id=str(milestone_id),
            tz_name=tz_name,
        )
        if "error" in data:
            raise NotFound(data["error"])
        serializer = MilestoneBurndownSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _check_milestone_access(self, user, milestone_id):
        if user.is_staff or user.is_superuser:
            return
        try:
            m = Milestone.objects.select_related("project").get(pk=milestone_id, is_deleted=False)
        except Milestone.DoesNotExist as err:
            raise NotFound("Milestone not found.") from err

        from projects.services import ProjectService

        try:
            ProjectService.get_accessible_queryset(user).get(pk=m.project_id, is_deleted=False)
        except Exception as err:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this project.") from err


# ---------------------------------------------------------------------------
# Analytics: Cycle Time & Lead Time
# ---------------------------------------------------------------------------


class CycleLeadTimeView(APIView):
    """
    Cycle Time & Lead Time analysis for a project.

    Access
    ~~~~~~
    * **Manager / Admin / Owner** only — cycle time reveals team performance
      patterns that employees should not audit individually.

    Metrics returned
    ~~~~~~~~~~~~~~~~
    * ``avg_lead_time_hours``  — mean time from task creation to Done.
    * ``avg_cycle_time_hours`` — mean time from leaving 'todo' to Done.
    * ``p50 / p95`` percentiles for both metrics.
    * ``by_status`` — average hours spent in each intermediate status.
    * ``tasks`` — individual task breakdown.
    """

    permission_classes = [IsAuthenticated, IsEmployeeOrAbove]

    @extend_schema(
        summary="Cycle Time & Lead Time",
        description=(
            "Returns cycle time and lead time statistics for completed tasks in the project."
        ),
        parameters=[
            OpenApiParameter(
                "board_id",
                OpenApiTypes.UUID,
                required=False,
                description="Narrow to a single board.",
            ),
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                required=False,
                description="ISO date (default: 90 days ago).",
            ),
            OpenApiParameter(
                "end_date",
                OpenApiTypes.DATE,
                required=False,
                description="ISO date (default: today).",
            ),
            OpenApiParameter(
                "assignee_id", OpenApiTypes.UUID, required=False, description="Filter by assignee."
            ),
            OpenApiParameter(
                "tz", OpenApiTypes.STR, required=False, description="IANA timezone (default: UTC)."
            ),
        ],
        responses={200: CycleLeadTimeSerializer},
        tags=["reports"],
    )
    def get(self, request, project_id):
        self._check_project_access(request.user, project_id)

        board_id = request.query_params.get("board_id")
        assignee_id = request.query_params.get("assignee_id")
        tz_name = request.query_params.get("tz", "UTC")
        start_date = self._parse_date(request.query_params.get("start_date"))
        end_date = self._parse_date(request.query_params.get("end_date"))

        data = CycleLeadTimeService.get_cycle_lead_time(
            project_id=str(project_id),
            board_id=str(board_id) if board_id else None,
            start_date=start_date,
            end_date=end_date,
            assignee_id=str(assignee_id) if assignee_id else None,
            tz_name=tz_name,
        )
        serializer = CycleLeadTimeSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @staticmethod
    def _parse_date(value) -> datetime.date | None:
        if not value:
            return None
        try:
            return datetime.date.fromisoformat(value)
        except ValueError as err:
            raise ParseError(f"Invalid date format: '{value}'. Use YYYY-MM-DD.") from err

    def _check_project_access(self, user, project_id):
        if user.is_staff or user.is_superuser:
            return
        from projects.models import Project
        from projects.services import ProjectService

        try:
            # Re-use the same accessible queryset that the project list uses.
            project = ProjectService.get_accessible_queryset(user).get(
                pk=project_id, is_deleted=False
            )
        except Project.DoesNotExist as err:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this project.") from err

        from rest_framework.exceptions import PermissionDenied

        from organizations.services import PermissionService

        has_team_report_access = project.owner_id == user.pk or any(
            PermissionService.has_permission(user, permission, project.organization_id)
            for permission in (
                "project.manage",
                "report.view",
                "report.view_team_lead",
                "org.manage_settings",
            )
        )
        if not has_team_report_access:
            raise PermissionDenied(
                "You do not have permission to view this team's performance data."
            )
