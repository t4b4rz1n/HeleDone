"""
reports/serializers.py
----------------------
Read-only serializers for the reporting & analytics endpoints.

These are plain ``Serializer`` classes (not ``ModelSerializer``)
because the reports app has no models — it aggregates data from
other apps and returns structured JSON responses.
"""

from django.core.files.storage import default_storage
from rest_framework import serializers


def _avatar_url(serializer, data):
    avatar = data.get("avatar")
    if not avatar:
        return None
    url = default_storage.url(avatar)
    request = serializer.context.get("request")
    if request and not url.startswith(("http://", "https://")):
        return request.build_absolute_uri(url)
    return url


class TaskSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    priority = serializers.CharField(allow_null=True)
    due_date = serializers.DateTimeField(allow_null=True)
    status_name = serializers.CharField(allow_null=True)
    status_code = serializers.CharField(allow_null=True, required=False)
    board_id = serializers.UUIDField(allow_null=True, required=False)
    project_name = serializers.CharField(allow_null=True)
    project_id = serializers.UUIDField(allow_null=True)


class TimeSummarySerializer(serializers.Serializer):
    total_seconds = serializers.IntegerField()
    total_logs = serializers.IntegerField()


class ActiveProjectSerializer(serializers.Serializer):
    project_id = serializers.UUIDField()
    project_name = serializers.CharField()
    project_status = serializers.CharField()
    project_deadline = serializers.DateField(allow_null=True)
    allocation_percentage = serializers.IntegerField()


class AttendanceStatusSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    check_in = serializers.DateTimeField(allow_null=True)
    check_out = serializers.DateTimeField(allow_null=True)
    is_remote = serializers.BooleanField()
    overtime_minutes = serializers.IntegerField()
    organization_name = serializers.CharField(allow_null=True)


class ActiveTimerSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    start_time = serializers.DateTimeField()
    task_id = serializers.UUIDField(allow_null=True)
    task_title = serializers.CharField(allow_null=True)
    project_name = serializers.CharField(allow_null=True)


class StandupSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    project = serializers.UUIDField(source="project_id")
    date = serializers.DateField()
    hours_worked = serializers.DecimalField(max_digits=5, decimal_places=2)
    today_work = serializers.CharField()
    blockers = serializers.CharField(allow_blank=True, allow_null=True)
    created_at = serializers.DateTimeField()


class MilestoneSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()
    target_date = serializers.DateField()
    project_name = serializers.CharField()
    project_id = serializers.UUIDField()


class EmployeeDashboardSerializer(serializers.Serializer):
    upcoming_tasks = TaskSummarySerializer(many=True)
    overdue_tasks = TaskSummarySerializer(many=True)
    blocked_tasks = TaskSummarySerializer(many=True)
    today_standup = StandupSummarySerializer(allow_null=True)
    weekly_time = TimeSummarySerializer()
    active_projects = ActiveProjectSerializer(many=True)
    attendance_today = AttendanceStatusSerializer(allow_null=True)
    active_timers = ActiveTimerSerializer(many=True)
    upcoming_milestones = MilestoneSummarySerializer(many=True)
    # Stubs for future modules
    points = serializers.IntegerField(allow_null=True)
    badges = serializers.ListField(allow_null=True)
    goals = serializers.ListField(allow_null=True)


class TaskStatSerializer(serializers.Serializer):
    status_code = serializers.CharField(allow_null=True)
    status_name = serializers.CharField(allow_null=True)
    count = serializers.IntegerField()


class OverdueMemberSerializer(serializers.Serializer):
    username = serializers.CharField()
    first_name = serializers.CharField()
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, data):
        return _avatar_url(self, data)


class OverdueSummarySerializer(serializers.Serializer):
    total_overdue = serializers.IntegerField()
    by_member = OverdueMemberSerializer(many=True)


class MemberWorkHoursSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    total_seconds = serializers.IntegerField()
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, data):
        return _avatar_url(self, data)


class MemberAttendanceSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    first_name = serializers.CharField()
    check_in = serializers.DateTimeField(allow_null=True)
    check_out = serializers.DateTimeField(allow_null=True)
    is_remote = serializers.BooleanField()
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, data):
        return _avatar_url(self, data)

class ProjectSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    budget = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    budget_currency = serializers.CharField()
    deadline = serializers.DateField(allow_null=True)
    active_member_count = serializers.IntegerField()
    total_tasks = serializers.IntegerField()
    done_tasks = serializers.IntegerField()
    total_time_seconds = serializers.IntegerField(allow_null=True)


class ManagerDashboardSerializer(serializers.Serializer):
    team_member_count = serializers.IntegerField()
    managed_team_count = serializers.IntegerField()
    task_stats = TaskStatSerializer(many=True)
    overdue_summary = OverdueSummarySerializer()
    work_hours = MemberWorkHoursSerializer(many=True)
    members_attendance = MemberAttendanceSerializer(many=True)
    project_summary = ProjectSummarySerializer(many=True)


class MemberDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField()
    total_tasks = serializers.IntegerField()
    done_tasks = serializers.IntegerField()
    overdue_tasks = serializers.IntegerField()
    week_seconds = serializers.IntegerField(allow_null=True)
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, data):
        return _avatar_url(self, data)

class ProjectStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()
    completed = serializers.IntegerField()
    on_hold = serializers.IntegerField()


class TaskStatsOverviewSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    done = serializers.IntegerField()
    in_progress = serializers.IntegerField()


class CompanyOverviewSerializer(serializers.Serializer):
    total_members = serializers.IntegerField()
    projects = ProjectStatsSerializer()
    tasks = TaskStatsOverviewSerializer()


class ResourceUtilizationSerializer(serializers.Serializer):
    total_work_seconds = serializers.IntegerField()
    expected_seconds = serializers.IntegerField()
    utilization_rate = serializers.FloatField()
    active_workers = serializers.IntegerField()
    total_members = serializers.IntegerField()


class ProjectHealthSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    deadline = serializers.DateField(allow_null=True)
    budget = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    budget_currency = serializers.CharField()
    total_tasks = serializers.IntegerField()
    done_tasks = serializers.IntegerField()
    overdue_tasks = serializers.IntegerField()
    overdue_milestones = serializers.IntegerField()
    progress = serializers.FloatField()
    health = serializers.CharField()


class FinancialSummarySerializer(serializers.Serializer):
    total_budget = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    project_count = serializers.IntegerField()
    total_time_seconds = serializers.IntegerField(allow_null=True)


class ExecutiveDashboardSerializer(serializers.Serializer):
    company_overview = CompanyOverviewSerializer()
    resource_utilization = ResourceUtilizationSerializer()
    project_health = ProjectHealthSerializer(many=True)
    financial_summary = FinancialSummarySerializer()


# ---------------------------------------------------------------------------
# Analytics serializers
# ---------------------------------------------------------------------------


class CfdStatusSerializer(serializers.Serializer):
    """Metadata for a single status column in the CFD."""

    code = serializers.CharField()
    name = serializers.CharField()
    order = serializers.IntegerField()


class CfdDaySerializer(serializers.Serializer):
    """One day's snapshot of task counts per status."""

    date = serializers.DateField()
    counts = serializers.DictField(child=serializers.IntegerField())


class CfdSerializer(serializers.Serializer):
    """Cumulative Flow Diagram response."""

    statuses = CfdStatusSerializer(many=True)
    data = CfdDaySerializer(many=True)


class MilestoneMetaSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.CharField()
    start_date = serializers.DateField(allow_null=True)
    target_date = serializers.DateField()
    project_id = serializers.UUIDField()
    project_name = serializers.CharField(allow_null=True)


class BurndownPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    remaining = serializers.FloatField()


class BurnupPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    done = serializers.IntegerField()
    total = serializers.IntegerField()


class MilestoneBurndownSerializer(serializers.Serializer):
    """Burndown / Burnup chart for a milestone."""

    milestone = MilestoneMetaSerializer()
    total_tasks = serializers.IntegerField()
    start_date = serializers.DateField(allow_null=True)
    target_date = serializers.DateField(allow_null=True)
    ideal_line = BurndownPointSerializer(many=True)
    actual_burndown = BurndownPointSerializer(many=True)
    burnup = BurnupPointSerializer(many=True)
    note = serializers.CharField(required=False, allow_null=True)


class CycleTimeByStatusSerializer(serializers.Serializer):
    status_code = serializers.CharField()
    avg_hours_in_status = serializers.FloatField(allow_null=True)


class CycleTimeTaskSerializer(serializers.Serializer):
    task_id = serializers.UUIDField()
    title = serializers.CharField()
    lead_time_hours = serializers.FloatField()
    cycle_time_hours = serializers.FloatField()
    done_at = serializers.DateTimeField()


class CycleLeadTimePeriodSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()


class CycleLeadTimeSerializer(serializers.Serializer):
    """Cycle Time & Lead Time analytics response."""

    period = CycleLeadTimePeriodSerializer(allow_null=True)
    task_count = serializers.IntegerField()
    avg_lead_time_hours = serializers.FloatField(allow_null=True)
    avg_cycle_time_hours = serializers.FloatField(allow_null=True)
    p50_lead_time_hours = serializers.FloatField(allow_null=True)
    p95_lead_time_hours = serializers.FloatField(allow_null=True)
    p50_cycle_time_hours = serializers.FloatField(allow_null=True)
    p95_cycle_time_hours = serializers.FloatField(allow_null=True)
    by_status = CycleTimeByStatusSerializer(many=True)
    tasks = CycleTimeTaskSerializer(many=True)
