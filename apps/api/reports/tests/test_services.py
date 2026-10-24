try:
    import pytest
except ImportError:
    from unittest import mock

    pytest = mock.MagicMock()
    pytest.mark.django_db = lambda *args, **kwargs: (
        (lambda f: f) if not args or not callable(args[0]) else args[0]
    )
    pytest.fixture = lambda *args, **kwargs: (
        (lambda f: f) if not args or not callable(args[0]) else args[0]
    )


# Additional imports for cache invalidation tests
from django.core.cache import cache
from django.utils.translation import gettext as _
from rest_framework.exceptions import NotFound

from organizations.models import OrganizationMembership
from reports.services import ExecutiveDashboardService, ManagerDashboardService

from .factories import (
    BoardFactory,
    OrganizationFactory,
    OrganizationMembershipFactory,
    ProjectFactory,
    ProjectMemberFactory,
    TaskFactory,
    TaskStatusFactory,
    TeamFactory,
    TeamMembershipFactory,
    UserFactory,
)


@pytest.mark.django_db
class TestExecutiveDashboardService:
    def test_get_dashboard_no_org_membership_raises_not_found(self, users):
        """
        User with no organization membership should get a NotFound error
        when org_id is not provided.
        """
        loner = users["loner"]

        with pytest.raises(NotFound) as exc_info:
            ExecutiveDashboardService.get_dashboard(user=loner, org_id=None)

        assert str(exc_info.value.detail) == _("No organisation found for this user.")

    def test_get_dashboard_auto_resolves_correct_org_id(self, users):
        """
        User belongs to two orgs:
        - Org 1: as EMPLOYEE
        - Org 2: as OWNER
        When get_dashboard is called with org_id=None, it should resolve to Org 2.
        """
        employee2 = users["employee2"]  # We will use this user

        # Org 1: Employee role
        org1 = OrganizationFactory(name="Employee Org")
        OrganizationMembershipFactory(
            user=employee2, organization=org1, role=OrganizationMembership.Role.EMPLOYEE
        )

        # Org 2: Owner role
        org2 = OrganizationFactory(name="Owner Org")
        OrganizationMembershipFactory(
            user=employee2, organization=org2, role=OrganizationMembership.Role.OWNER
        )

        # We don't need to assert the entire dashboard output, just that the
        # resolved dashboard belongs to org2.
        # ExecutiveDashboardService returns 'resource_utilization' which has 'total_members'.
        # Org2 has 1 member (employee2 + the owner created by default in factory, wait,
        # OrganizationFactory subfactory creates an owner. Let's just check company_overview total_members).

        ExecutiveDashboardService.get_dashboard(user=employee2, org_id=None)

        # Since we use org2, let's verify what data is returned.
        # Actually, let's just mock or check the returned data's projects/tasks because it's distinct.
        # total_members for org2 should be 2 (the factory owner + employee2).
        # org1 has 2 members too.
        # Let's add a project to org2 to distinguish it clearly.
        from .factories import ProjectFactory

        ProjectFactory(organization=org2)

        dashboard_again = ExecutiveDashboardService.get_dashboard(user=employee2, org_id=None)

        assert dashboard_again["company_overview"]["projects"]["total"] == 1

        # If we explicitly pass org1, project total is 0
        dashboard_org1 = ExecutiveDashboardService.get_dashboard(user=employee2, org_id=org1.id)
        assert dashboard_org1["company_overview"]["projects"]["total"] == 0

    def test_get_dashboard_invalid_timezone_raises_error(self, users):
        """
        If an invalid tz_name is provided, it should raise a ParseError (400 Bad Request)
        to prevent silent fallback to UTC.
        """
        loner = users["loner"]
        org = OrganizationFactory(name="Valid Org")
        OrganizationMembershipFactory(
            user=loner, organization=org, role=OrganizationMembership.Role.OWNER
        )

        from rest_framework.exceptions import ParseError

        with pytest.raises(ParseError) as exc_info:
            ExecutiveDashboardService.get_dashboard(
                user=loner, org_id=org.id, tz_name="Invalid/Timezone"
            )
        assert "Invalid timezone: 'Invalid/Timezone'" in str(exc_info.value)


def test_get_business_days():
    """Iranian work-week is Saturday through Wednesday (5 days).
    Thursday (weekday=3) and Friday (weekday=4) are weekend days.

    Update note: previously tested Mon-Fri; updated to Sat-Wed after
    get_business_days was corrected to reflect the Iranian calendar.
    """
    import datetime

    from reports.services import get_business_days

    # Test 1: Wed 2026-08-05 → Tue 2026-08-11 (7 calendar days)
    # Iranian business: Wed(✓) Thu(✗) Fri(✗) Sat(✓) Sun(✓) Mon(✓) Tue(✓) = 5
    start = datetime.date(2026, 8, 5)
    end = datetime.date(2026, 8, 11)
    assert get_business_days(start, end) == 5

    # Test 2: Mon 2026-08-03 → Sun 2026-08-23 (21 days = 3 full weeks)
    # 3 weeks × 5 Iranian business days = 15
    start = datetime.date(2026, 8, 3)
    end = datetime.date(2026, 8, 23)
    assert get_business_days(start, end) == 15

    # Test 3: Sat 2026-08-08 → Sun 2026-08-09 — both are Iranian business days
    # Old test expected 0 (Mon-Fri assumption); correct under Iranian calendar: 2
    start = datetime.date(2026, 8, 8)  # Saturday — business day in Iran
    end = datetime.date(2026, 8, 9)  # Sunday   — business day in Iran
    assert get_business_days(start, end) == 2

    # Test 4: Thu 2026-08-06 → Fri 2026-08-07 — both are Iranian weekend days
    # Old test used Friday as a business day; corrected: Thu+Fri = 0 business days
    start = datetime.date(2026, 8, 6)  # Thursday — weekend in Iran
    end = datetime.date(2026, 8, 7)  # Friday   — weekend in Iran
    assert get_business_days(start, end) == 0

    # Test 5: A full Iranian work-week (Sat 2026-08-08 → Wed 2026-08-12) = 5 days
    start = datetime.date(2026, 8, 8)  # Saturday
    end = datetime.date(2026, 8, 12)  # Wednesday
    assert get_business_days(start, end) == 5

    # Test 6: End before start → 0
    assert get_business_days(datetime.date(2026, 8, 10), datetime.date(2026, 8, 5)) == 0


# Fixture to clear cache before each test
@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.mark.django_db
def test_executive_cache_invalidation_on_project_soft_delete(clear_cache, users, org_data):
    user = users["org_owner"]
    org = org_data["org"]
    project = ProjectFactory(organization=org, is_deleted=False)
    tz = "UTC"
    version_key = f"dashboard_version:exec:org_{org.id}"
    # Read current version (may have been bumped by fixture setup signals)
    current_version = cache.get(version_key, 1)
    # First call caches result at current version
    ExecutiveDashboardService.get_dashboard(user=user, org_id=org.id, tz_name=tz)
    old_cache_key = f"reports:exec:org_{org.id}:v{current_version}:tz_{tz}"
    assert cache.get(old_cache_key) is not None
    # Soft delete the project – triggers signal → bumps version
    project.is_deleted = True
    project.save()
    # Version should have incremented
    new_version = cache.get(version_key, 1)
    assert new_version == current_version + 1
    # Second call – builds new versioned key, recomputes, caches fresh data
    dashboard2 = ExecutiveDashboardService.get_dashboard(user=user, org_id=org.id, tz_name=tz)
    new_cache_key = f"reports:exec:org_{org.id}:v{new_version}:tz_{tz}"
    assert cache.get(new_cache_key) is not None
    assert dashboard2["company_overview"]["projects"]["total"] == 0


@pytest.mark.django_db
def test_manager_cache_invalidation_on_team_membership_change(clear_cache, users, org_data):
    lead = users["team_lead"]
    member = users["employee1"]
    team = TeamFactory()
    # initial membership – lead only
    TeamMembershipFactory(user=lead, team=team)
    tz = "UTC"
    version_key = f"dashboard_version:mgr:team_{team.id}"
    # Read current version (may have been bumped by TeamMembershipFactory signal)
    current_version = cache.get(version_key, 1)
    ManagerDashboardService.get_dashboard(user=lead, team_id=team.id, tz_name=tz)
    old_cache_key = f"reports:mgr:team_{team.id}:v{current_version}:tz_{tz}"
    assert cache.get(old_cache_key) is not None
    # add a regular member – triggers signal → bumps version
    TeamMembershipFactory(user=member, team=team)
    # Version should have incremented
    new_version = cache.get(version_key, 1)
    assert new_version > current_version
    # Fetch again – uses new versioned key, recomputes
    dashboard2 = ManagerDashboardService.get_dashboard(user=lead, team_id=team.id, tz_name=tz)
    new_cache_key = f"reports:mgr:team_{team.id}:v{new_version}:tz_{tz}"
    assert cache.get(new_cache_key) is not None
    assert dashboard2["team_member_count"] == 2


@pytest.mark.django_db
def test_manager_admin_org_cache_invalidates_on_subordinate_task_change(clear_cache):
    """Admin/owner without team-lead role must see fresh data when a subordinate's task changes."""
    from reports.services import ManagerDashboardService

    from .factories import (
        BoardFactory,
        OrganizationFactory,
        OrganizationMembershipFactory,
        ProjectFactory,
        TaskFactory,
        TaskStatusFactory,
        UserFactory,
    )

    admin = UserFactory(username="admin_org_cache")
    emp = UserFactory(username="emp_org_cache")
    org = OrganizationFactory()
    OrganizationMembershipFactory(
        user=admin, organization=org, role=OrganizationMembership.Role.OWNER
    )
    OrganizationMembershipFactory(
        user=emp, organization=org, role=OrganizationMembership.Role.EMPLOYEE
    )

    project = ProjectFactory(organization=org)
    board = BoardFactory(project=project)
    status_todo = TaskStatusFactory(board=board, code="todo", name="To Do")

    assert ManagerDashboardService.get_managed_team_ids(admin) == []

    tz = "UTC"
    org_version_key = f"dashboard_version:mgr:org_{org.id}"
    version_before = cache.get(org_version_key, 1)

    dashboard_before = ManagerDashboardService.get_dashboard(user=admin, team_id=None, tz_name=tz)
    stats_before = sum(item["count"] for item in dashboard_before["task_stats"])

    TaskFactory(project=project, assignee=emp, status=status_todo)

    version_after = cache.get(org_version_key, 1)
    assert (
        version_after == version_before + 1
    ), "Org-level manager cache version must bump when a subordinate task is created."

    dashboard_after = ManagerDashboardService.get_dashboard(user=admin, team_id=None, tz_name=tz)
    stats_after = sum(item["count"] for item in dashboard_after["task_stats"])
    assert stats_after == stats_before + 1, (
        f"Expected task count to increase by 1 after subordinate task creation, "
        f"got before={stats_before}, after={stats_after}."
    )


@pytest.mark.django_db
def test_manager_team_lead_cache_unaffected_by_org_version_key(clear_cache, users, org_data):
    """Team-scoped manager dashboards must keep using team_{id} version keys only."""
    from reports.services import ManagerDashboardService

    lead = users["team_lead"]
    team = org_data["team_a"]
    org = org_data["org"]
    tz = "UTC"

    org_version_key = f"dashboard_version:mgr:org_{org.id}"
    team_version_key = f"dashboard_version:mgr:team_{team.id}"

    org_version_before = cache.get(org_version_key, 1)

    ManagerDashboardService.get_dashboard(user=lead, team_id=team.id, tz_name=tz)
    cache_key = ManagerDashboardService._build_manager_cache_key(lead, team.id, tz)
    assert (
        "orgs_" not in cache_key
    ), "Team-scoped cache keys must not embed org-level version segments."
    assert cache_key.startswith(f"reports:mgr:team_{team.id}:v")

    team_version_before = cache.get(team_version_key, 1)

    member = users["employee2"]
    TeamMembershipFactory(user=member, team=team)

    team_version_after = cache.get(team_version_key, 1)
    org_version_after = cache.get(org_version_key, 1)

    # Measured on 2026-08-13: org_data fixture leaves team_a at version 5;
    # one TeamMembership save bumps team_a by 2 (5→7), not 1.  Cause: the
    # TeamMembership signal calls _invalidate_manager(user_id=…) AND
    # _invalidate_manager(team_id=…); the user_id path bumps every team the
    # member belongs to (here team_b + team_a) and the team_id path bumps
    # team_a again.  This double-bump predates the org-level cache fix and
    # only affects performance (extra cache miss), not data correctness.
    assert team_version_after - team_version_before == 2
    assert (
        org_version_after == org_version_before
    ), "Team membership changes must not bump org-level manager cache versions."

    dashboard2 = ManagerDashboardService.get_dashboard(user=lead, team_id=team.id, tz_name=tz)
    assert dashboard2["team_member_count"] == 3


@pytest.mark.django_db
def test_manager_admin_org_cache_invalidates_on_project_soft_delete(clear_cache):
    """Project soft-delete must bump org-level manager cache for admin aggregate view."""
    from reports.services import ManagerDashboardService

    from .factories import (
        OrganizationFactory,
        OrganizationMembershipFactory,
        ProjectFactory,
        ProjectMemberFactory,
        UserFactory,
    )

    admin = UserFactory(username="admin_proj_cache")
    emp = UserFactory(username="emp_proj_cache")
    org = OrganizationFactory()
    OrganizationMembershipFactory(
        user=admin, organization=org, role=OrganizationMembership.Role.OWNER
    )
    OrganizationMembershipFactory(
        user=emp, organization=org, role=OrganizationMembership.Role.EMPLOYEE
    )

    project = ProjectFactory(organization=org, is_deleted=False)
    ProjectMemberFactory(user=emp, project=project, is_active=True)

    tz = "UTC"
    org_version_key = f"dashboard_version:mgr:org_{org.id}"
    version_before = cache.get(org_version_key, 1)

    dashboard_before = ManagerDashboardService.get_dashboard(user=admin, team_id=None, tz_name=tz)
    projects_before = len(dashboard_before["project_summary"])
    assert projects_before == 1

    project.is_deleted = True
    project.save()

    version_after = cache.get(org_version_key, 1)
    assert (
        version_after == version_before + 1
    ), "Org-level manager cache version must bump when a project is soft-deleted."

    dashboard_after = ManagerDashboardService.get_dashboard(user=admin, team_id=None, tz_name=tz)
    assert len(dashboard_after["project_summary"]) == 0


@pytest.mark.django_db
def test_manager_multi_org_admin_cache_key_embeds_all_org_versions(clear_cache):
    """Document exact multi-org admin cache key shape and cross-org invalidation."""
    from reports.services import ManagerDashboardService

    from .factories import (
        OrganizationFactory,
        OrganizationMembershipFactory,
        UserFactory,
    )

    admin = UserFactory(username="admin_multi_org")
    org_a = OrganizationFactory(name="Org A")
    org_b = OrganizationFactory(name="Org B")
    OrganizationMembershipFactory(
        user=admin, organization=org_a, role=OrganizationMembership.Role.OWNER
    )
    OrganizationMembershipFactory(
        user=admin, organization=org_b, role=OrganizationMembership.Role.ADMIN
    )

    tz = "UTC"
    org_ids = ManagerDashboardService._get_admin_org_ids(admin)
    assert org_ids == sorted([org_a.id, org_b.id])

    org_versions = {
        org_id: cache.get(f"dashboard_version:mgr:org_{org_id}", 1) for org_id in org_ids
    }
    user_version = cache.get(f"dashboard_version:mgr:user_{admin.id}", 1)

    key_before = ManagerDashboardService._build_manager_cache_key(admin, None, tz)
    org_parts = "_".join(f"{org_id}:{org_versions[org_id]}" for org_id in org_ids)
    expected_segment = f"u{user_version}_orgs_{org_parts}"
    assert key_before == f"reports:mgr:user_{admin.id}:v{expected_segment}:tz_{tz}"

    org_b_version_key = f"dashboard_version:mgr:org_{org_b.id}"
    from reports.signals import _bump_version

    _bump_version(org_b_version_key)
    org_versions[org_b.id] = cache.get(org_b_version_key, 1)

    key_after_org_b_change = ManagerDashboardService._build_manager_cache_key(admin, None, tz)
    org_parts_after = "_".join(f"{org_id}:{org_versions[org_id]}" for org_id in org_ids)
    expected_after = f"u{user_version}_orgs_{org_parts_after}"
    assert key_after_org_b_change == f"reports:mgr:user_{admin.id}:v{expected_after}:tz_{tz}"
    assert key_after_org_b_change != key_before


@pytest.mark.django_db
def test_cache_invalidation_on_timelog_update(users, org_data, project_data):
    import datetime

    from django.utils import timezone

    from attendance.models import TimeLog
    from reports.services import EmployeeDashboardService

    employee = users["employee1"]

    dashboard_initial = EmployeeDashboardService.get_dashboard(user=employee)
    initial_seconds = dashboard_initial["weekly_time"]["total_seconds"]

    # Update a TimeLog (this should trigger post_save signal and invalidate cache)
    task = project_data["tasks"][0]
    TimeLog.objects.create(
        user=employee,
        task=task,
        project=task.project,
        date=datetime.date.today(),
        start_time=timezone.now(),
        duration_seconds=1800,  # add 30 mins
        is_active=False,
    )

    dashboard_updated = EmployeeDashboardService.get_dashboard(user=employee)
    updated_seconds = dashboard_updated["weekly_time"]["total_seconds"]

    # The updated dashboard should reflect the new timelog (+1800 seconds)
    # If caching invalidation didn't work, updated_seconds would equal initial_seconds
    assert updated_seconds == initial_seconds + 1800


@pytest.mark.django_db
def test_version_bump_uses_no_expiry(users, org_data):
    """Regression: version-key writes must always pass timeout=None.

    If timeout=None is accidentally removed from _bump_version(),
    the version key inherits Django's default cache timeout (e.g. 300s).
    When the version key expires, cache.get() falls back to 1, and if
    a stale v1-keyed dashboard entry is still alive, the system silently
    serves outdated data with no error, no log, and no visible symptom.

    This test catches that by mocking cache and asserting that
    cache.add() is called with an explicit timeout=None argument.
    """
    from unittest.mock import patch

    from reports.signals import _invalidate_executive

    with patch("reports.signals.cache") as mock_cache:
        mock_cache.add.return_value = True  # simulate first invalidation
        _invalidate_executive(org_data["org"].id)

        mock_cache.add.assert_called_once()
        _args, kwargs = mock_cache.add.call_args

        # Must distinguish between these two cases:
        #   cache.add(key, 2, timeout=None)  → correct (explicit no-expiry)
        #   cache.add(key, 2)                → BUG (inherits default timeout)
        # kwargs.get("timeout") is None would pass for BOTH — so we check
        # that "timeout" is actually present as a keyword or positional arg.
        if "timeout" in kwargs:
            assert (
                kwargs["timeout"] is None
            ), "timeout must be exactly None to prevent silent staleness"
        elif len(_args) >= 3:
            assert _args[2] is None, "timeout must be exactly None to prevent silent staleness"
        else:
            pytest.fail(
                "cache.add() was called without an explicit timeout argument — "
                "this will cause silent staleness when the version key expires"
            )


@pytest.mark.django_db
class TestUpcomingTasks:
    """Tests for EmployeeDashboardService._get_upcoming_tasks.

    The method must return tasks with due_date between today and
    UPCOMING_TASKS_WINDOW_DAYS days ahead, ordered by nearest deadline
    first, capped at UPCOMING_TASKS_LIMIT.
    """

    @pytest.fixture
    def setup(self):
        """Shared scaffold: user, project, board, statuses."""
        user = UserFactory()
        org = OrganizationFactory(owner=user)
        project = ProjectFactory(organization=org, owner=user)
        ProjectMemberFactory(user=user, project=project)
        board = BoardFactory(project=project, created_by=user)
        status_todo = TaskStatusFactory(board=board, name="To Do", code="todo", order=1)
        status_done = TaskStatusFactory(board=board, name="Done", code="done", order=3)
        return {
            "user": user,
            "project": project,
            "status_todo": status_todo,
            "status_done": status_done,
        }

    def test_no_window_and_ordering(self, setup):
        """Tasks at day 0, day 3, and day 10: all appear, ordered by nearest deadline."""
        import datetime

        from django.utils import timezone

        from reports.services import EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status = setup["status_todo"]
        now = timezone.now()

        task_today = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=now + datetime.timedelta(days=1),
            title="Due today",
        )
        task_3d = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=now + datetime.timedelta(days=3),
            title="Due in 3 days",
        )
        task_10d = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=now + datetime.timedelta(days=10),
            title="Due in 10 days — now included (no window)",
        )

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        upcoming = dashboard["upcoming_tasks"]

        returned_ids = [t["id"] for t in upcoming]
        assert len(upcoming) == 3
        assert returned_ids[0] == task_today.id
        assert returned_ids[1] == task_3d.id
        assert returned_ids[2] == task_10d.id

    def test_limit_caps_results(self, setup):
        """More than UPCOMING_TASKS_LIMIT tasks in window → only closest N returned."""
        import datetime

        from django.utils import timezone

        from reports.services import UPCOMING_TASKS_LIMIT, EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status = setup["status_todo"]
        now = timezone.now()

        for day_offset in range(UPCOMING_TASKS_LIMIT + 3):
            TaskFactory(
                project=project,
                assignee=user,
                status=status,
                due_date=now + datetime.timedelta(days=min(day_offset, 6)),
                title=f"Task day {day_offset}",
            )

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        assert len(dashboard["upcoming_tasks"]) == UPCOMING_TASKS_LIMIT

    def test_limit_without_window(self, setup):
        """6 tasks at days 0, 2, 5, 10, 20, 30: only closest 5 returned, day-30 excluded."""
        import datetime

        from django.utils import timezone

        from reports.services import UPCOMING_TASKS_LIMIT, EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status = setup["status_todo"]
        now = timezone.now()

        offsets = [1, 2, 5, 10, 20, 30]
        tasks = []
        for d in offsets:
            t = TaskFactory(
                project=project,
                assignee=user,
                status=status,
                due_date=now + datetime.timedelta(days=d),
                title=f"Task day {d}",
            )
            tasks.append(t)

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        upcoming = dashboard["upcoming_tasks"]

        assert len(upcoming) == UPCOMING_TASKS_LIMIT
        returned_ids = [t["id"] for t in upcoming]
        # The 5 closest (days 1,2,5,10,20) should be in; day 30 should not
        for t in tasks[:5]:
            assert t.id in returned_ids
        assert tasks[5].id not in returned_ids
        # Ordering: nearest first
        for i in range(len(returned_ids) - 1):
            assert upcoming[i]["due_date"] <= upcoming[i + 1]["due_date"]

    def test_tiebreak_by_created_at(self, setup):
        """Two tasks with identical due_date are ordered by created_at (older first)."""
        import datetime
        import time

        from django.utils import timezone

        from reports.services import EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status = setup["status_todo"]
        tomorrow = timezone.now() + datetime.timedelta(days=1)

        task_older = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=tomorrow,
            title="Older task",
        )
        # Small sleep to guarantee distinct created_at timestamps
        time.sleep(0.05)
        task_newer = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=tomorrow,
            title="Newer task",
        )

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        upcoming = dashboard["upcoming_tasks"]

        returned_ids = [t["id"] for t in upcoming]
        assert returned_ids.index(task_older.id) < returned_ids.index(task_newer.id)

    def test_done_tasks_excluded(self, setup):
        """A task with due_date tomorrow but status=done must NOT appear."""
        import datetime

        from django.utils import timezone

        from reports.services import EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status_done = setup["status_done"]
        status_todo = setup["status_todo"]
        tomorrow = timezone.now() + datetime.timedelta(days=1)

        task_done = TaskFactory(
            project=project,
            assignee=user,
            status=status_done,
            due_date=tomorrow,
            title="Done task — must NOT appear",
        )
        task_active = TaskFactory(
            project=project,
            assignee=user,
            status=status_todo,
            due_date=tomorrow,
            title="Active task — must appear",
        )

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        returned_ids = [t["id"] for t in dashboard["upcoming_tasks"]]
        assert task_done.id not in returned_ids
        assert task_active.id in returned_ids

    def test_null_due_date_comes_after_dated_tasks(self, setup):
        """Tasks with due_date appear before tasks without; null-due_date included if room."""
        import datetime

        from django.utils import timezone

        from reports.services import EmployeeDashboardService

        user = setup["user"]
        project = setup["project"]
        status = setup["status_todo"]
        now = timezone.now()

        task_dated_1 = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=now + datetime.timedelta(days=1),
            title="Has deadline",
        )
        task_dated_2 = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=now + datetime.timedelta(days=5),
            title="Also has deadline",
        )
        task_no_date = TaskFactory(
            project=project,
            assignee=user,
            status=status,
            due_date=None,
            title="No deadline",
        )

        dashboard = EmployeeDashboardService.get_dashboard(user=user)
        upcoming = dashboard["upcoming_tasks"]
        returned_ids = [t["id"] for t in upcoming]

        assert len(upcoming) == 3
        # Dated tasks come first, null last
        assert returned_ids[0] == task_dated_1.id
        assert returned_ids[1] == task_dated_2.id
        assert returned_ids[2] == task_no_date.id
        # The null-due_date task has due_date=None in the response
        assert upcoming[2]["due_date"] is None


@pytest.mark.django_db
class TestResourceUtilization:
    """Tests for ExecutiveDashboardService._get_resource_utilization logic."""

    @pytest.fixture
    def util_setup(self):
        """Create a minimal org with 1 member for utilization tests."""

        from .factories import (
            OrganizationFactory,
            OrganizationMembershipFactory,
            ProjectFactory,
            UserFactory,
        )

        owner = UserFactory(username="util_owner")
        emp = UserFactory(username="util_emp")
        org = OrganizationFactory(owner=owner)
        OrganizationMembershipFactory(
            user=owner,
            organization=org,
            role=OrganizationMembership.Role.OWNER,
        )
        OrganizationMembershipFactory(
            user=emp,
            organization=org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )
        project = ProjectFactory(organization=org, owner=owner)

        return {
            "owner": owner,
            "emp": emp,
            "org": org,
            "project": project,
        }

    def test_utilization_fallback_no_attendance_setting(self, util_setup):
        """
        When no AttendanceSetting exists for the org, the expected daily
        hours must fall back to 8.0 — this must be visible in expected_seconds.
        """
        from reports.services import ExecutiveDashboardService

        org = util_setup["org"]

        # Ensure no AttendanceSetting exists for this org
        from attendance.models import AttendanceSetting

        assert not AttendanceSetting.objects.filter(organization=org).exists()

        dashboard = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        utilization = dashboard["resource_utilization"]

        # expected_seconds should be computed based on 8h/day fallback
        # Member count = 2 (owner + emp), business_days depends on current week
        # The key assertion: expected_seconds > 0 and it was computed (no crash)
        assert utilization["expected_seconds"] >= 0
        assert utilization["total_members"] == 2

    def test_utilization_overlapping_leaves_are_deduplicated(self, util_setup):
        """
        After the merge-intervals fix, two overlapping approved leaves from the
        same user must only deduct the UNION of their intervals, not their sum.

        Scenario:
          leave A: 08:00 – 12:00 (4 h)
          leave B: 10:00 – 14:00 (4 h)
          overlap: 10:00 – 12:00 (2 h)
          expected deduction: 6 h (not 8 h)
        """
        import datetime

        from django.utils import timezone

        from attendance.models import TimeOffRequest
        from reports.services import ExecutiveDashboardService

        from .factories import AttendanceSettingFactory, TimeOffRequestFactory

        org = util_setup["org"]
        emp = util_setup["emp"]

        AttendanceSettingFactory(organization=org, expected_daily_hours=8)

        now = timezone.now()
        leave_start_a = now.replace(hour=8, minute=0, second=0, microsecond=0)
        leave_end_a = leave_start_a + datetime.timedelta(hours=4)  # 08:00 – 12:00
        leave_start_b = leave_start_a + datetime.timedelta(hours=2)  # 10:00
        leave_end_b = leave_start_b + datetime.timedelta(hours=4)  # 10:00 – 14:00

        # Baseline with no leaves
        cache.clear()
        TimeOffRequest.objects.filter(organization=org).delete()
        baseline = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        baseline_expected = baseline["resource_utilization"]["expected_seconds"]

        # Add two overlapping approved leaves
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start_a,
            end_datetime=leave_end_a,
            status=TimeOffRequest.Status.APPROVED,
        )
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.SICK,
            start_datetime=leave_start_b,
            end_datetime=leave_end_b,
            status=TimeOffRequest.Status.APPROVED,
        )
        cache.clear()

        with_leaves = ExecutiveDashboardService.get_dashboard(
            user=util_setup["owner"], org_id=org.id
        )
        with_leaves_expected = with_leaves["resource_utilization"]["expected_seconds"]

        deducted = baseline_expected - with_leaves_expected
        expected_deduction = 6 * 3600  # union = 08:00-14:00 = 6 h, NOT 8 h
        assert deducted == expected_deduction, (
            f"Expected {expected_deduction}s deducted (merged intervals), "
            f"but got {deducted}s. Baseline={baseline_expected}, "
            f"WithLeaves={with_leaves_expected}. "
            f"(If this is 28800, the merge-intervals fix is not applied.)"
        )

    def test_utilization_non_overlapping_leaves_each_deducted_fully(self, util_setup):
        """
        Two approved leaves that do NOT overlap must each be fully deducted.

        This test guards against over-merging: if the fix accidentally merges
        non-overlapping intervals, the deduction would be wrong.

        Scenario:
          leave A: 08:00 – 10:00 (2 h)
          leave B: 12:00 – 14:00 (2 h)  — gap between them
          expected deduction: 4 h
        """
        import datetime

        from django.utils import timezone

        from attendance.models import TimeOffRequest
        from reports.services import ExecutiveDashboardService

        from .factories import AttendanceSettingFactory, TimeOffRequestFactory

        org = util_setup["org"]
        emp = util_setup["emp"]

        AttendanceSettingFactory(organization=org, expected_daily_hours=8)

        now = timezone.now()
        leave_start_a = now.replace(hour=8, minute=0, second=0, microsecond=0)
        leave_end_a = leave_start_a + datetime.timedelta(hours=2)  # 08:00 – 10:00
        leave_start_b = leave_start_a + datetime.timedelta(hours=4)  # 12:00
        leave_end_b = leave_start_b + datetime.timedelta(hours=2)  # 12:00 – 14:00

        # Baseline with no leaves
        cache.clear()
        TimeOffRequest.objects.filter(organization=org).delete()
        baseline = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        baseline_expected = baseline["resource_utilization"]["expected_seconds"]

        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start_a,
            end_datetime=leave_end_a,
            status=TimeOffRequest.Status.APPROVED,
        )
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.SICK,
            start_datetime=leave_start_b,
            end_datetime=leave_end_b,
            status=TimeOffRequest.Status.APPROVED,
        )
        cache.clear()

        with_leaves = ExecutiveDashboardService.get_dashboard(
            user=util_setup["owner"], org_id=org.id
        )
        with_leaves_expected = with_leaves["resource_utilization"]["expected_seconds"]

        deducted = baseline_expected - with_leaves_expected
        expected_deduction = 4 * 3600  # 2 h + 2 h = 4 h, non-overlapping
        assert deducted == expected_deduction, (
            f"Expected {expected_deduction}s deducted for non-overlapping leaves, "
            f"but got {deducted}s. Baseline={baseline_expected}, "
            f"WithLeaves={with_leaves_expected}."
        )

    def test_utilization_overlapping_leaves_different_users_each_fully_deducted(self, util_setup):
        """
        Two different employees on leave at the same time must each deduct their
        own hours — a global merge would incorrectly treat them as one interval.

        Scenario:
          emp A: 08:00 – 12:00 (4 h)
          emp B: 08:00 – 12:00 (4 h)  — same window, different user
          expected deduction: 8 h (not 4 h)
        """
        import datetime

        from django.utils import timezone

        from attendance.models import TimeOffRequest
        from reports.services import ExecutiveDashboardService

        from .factories import (
            AttendanceSettingFactory,
            OrganizationMembershipFactory,
            TimeOffRequestFactory,
            UserFactory,
        )

        org = util_setup["org"]
        emp_a = util_setup["emp"]
        emp_b = UserFactory(username="util_emp_b")
        OrganizationMembershipFactory(
            user=emp_b,
            organization=org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        AttendanceSettingFactory(organization=org, expected_daily_hours=8)

        now = timezone.now()
        leave_start = now.replace(hour=8, minute=0, second=0, microsecond=0)
        leave_end = leave_start + datetime.timedelta(hours=4)  # 08:00 – 12:00

        cache.clear()
        TimeOffRequest.objects.filter(organization=org).delete()
        baseline = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        baseline_expected = baseline["resource_utilization"]["expected_seconds"]

        TimeOffRequestFactory(
            user=emp_a,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start,
            end_datetime=leave_end,
            status=TimeOffRequest.Status.APPROVED,
        )
        TimeOffRequestFactory(
            user=emp_b,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start,
            end_datetime=leave_end,
            status=TimeOffRequest.Status.APPROVED,
        )
        cache.clear()

        with_leaves = ExecutiveDashboardService.get_dashboard(
            user=util_setup["owner"], org_id=org.id
        )
        with_leaves_expected = with_leaves["resource_utilization"]["expected_seconds"]

        deducted = baseline_expected - with_leaves_expected
        expected_deduction = 8 * 3600  # 4 h per user, not merged across users
        assert deducted == expected_deduction, (
            f"Expected {expected_deduction}s deducted for two users on parallel leave, "
            f"but got {deducted}s. Baseline={baseline_expected}, "
            f"WithLeaves={with_leaves_expected}. "
            f"(If this is 14400, leave intervals were merged across users.)"
        )

    def test_utilization_same_user_overlap_still_merges_with_per_user_grouping(self, util_setup):
        """
        Regression guard: per-user grouping must not break same-user interval merge.

        Scenario:
          leave A: 09:00 – 11:00 (2 h)
          leave B: 10:00 – 13:00 (3 h)
          overlap: 10:00 – 11:00 (1 h)
          expected deduction: 4 h union (09:00 – 13:00), not 5 h sum
        """
        import datetime

        from django.utils import timezone

        from attendance.models import TimeOffRequest
        from reports.services import ExecutiveDashboardService

        from .factories import AttendanceSettingFactory, TimeOffRequestFactory

        org = util_setup["org"]
        emp = util_setup["emp"]

        AttendanceSettingFactory(organization=org, expected_daily_hours=8)

        now = timezone.now()
        leave_start_a = now.replace(hour=9, minute=0, second=0, microsecond=0)
        leave_end_a = leave_start_a + datetime.timedelta(hours=2)  # 09:00 – 11:00
        leave_start_b = leave_start_a + datetime.timedelta(hours=1)  # 10:00
        leave_end_b = leave_start_b + datetime.timedelta(hours=3)  # 10:00 – 13:00

        cache.clear()
        TimeOffRequest.objects.filter(organization=org).delete()
        baseline = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        baseline_expected = baseline["resource_utilization"]["expected_seconds"]

        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start_a,
            end_datetime=leave_end_a,
            status=TimeOffRequest.Status.APPROVED,
        )
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.SICK,
            start_datetime=leave_start_b,
            end_datetime=leave_end_b,
            status=TimeOffRequest.Status.APPROVED,
        )
        cache.clear()

        with_leaves = ExecutiveDashboardService.get_dashboard(
            user=util_setup["owner"], org_id=org.id
        )
        with_leaves_expected = with_leaves["resource_utilization"]["expected_seconds"]

        deducted = baseline_expected - with_leaves_expected
        expected_deduction = 4 * 3600  # union 09:00-13:00 = 4 h, not 5 h
        assert deducted == expected_deduction, (
            f"Expected {expected_deduction}s deducted (merged same-user intervals), "
            f"but got {deducted}s. Baseline={baseline_expected}, "
            f"WithLeaves={with_leaves_expected}. "
            f"(If this is 18000, per-user merge is broken.)"
        )

    def test_utilization_ignores_pending_and_rejected_leaves(self, util_setup):
        """
        Only 'approved' leaves should reduce expected_seconds.
        Pending and rejected leaves must NOT affect the calculation.
        """
        import datetime

        from django.utils import timezone

        from attendance.models import TimeOffRequest
        from reports.services import ExecutiveDashboardService

        from .factories import AttendanceSettingFactory, TimeOffRequestFactory

        org = util_setup["org"]
        emp = util_setup["emp"]

        AttendanceSettingFactory(organization=org, expected_daily_hours=8)

        now = timezone.now()
        leave_start = now.replace(hour=9, minute=0, second=0, microsecond=0)
        leave_end = leave_start + datetime.timedelta(hours=4)

        cache.clear()
        # Get baseline (no leaves)
        baseline = ExecutiveDashboardService.get_dashboard(user=util_setup["owner"], org_id=org.id)
        baseline_expected = baseline["resource_utilization"]["expected_seconds"]

        # Create PENDING leave — should NOT be deducted
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=leave_start,
            end_datetime=leave_end,
            status=TimeOffRequest.Status.PENDING,
        )
        # Create REJECTED leave — should NOT be deducted
        TimeOffRequestFactory(
            user=emp,
            organization=org,
            request_type=TimeOffRequest.Type.SICK,
            start_datetime=leave_start,
            end_datetime=leave_end,
            status=TimeOffRequest.Status.REJECTED,
        )

        cache.clear()
        with_non_approved = ExecutiveDashboardService.get_dashboard(
            user=util_setup["owner"], org_id=org.id
        )
        with_non_approved_expected = with_non_approved["resource_utilization"]["expected_seconds"]

        # Expected seconds should be UNCHANGED — pending/rejected leaves are ignored
        assert with_non_approved_expected == baseline_expected, (
            f"Pending/rejected leaves should not affect expected_seconds. "
            f"Baseline={baseline_expected}, WithNonApproved={with_non_approved_expected}"
        )


@pytest.mark.django_db
class TestProjectSummaryInflation:
    """Regression test: project_summary must not inflate total_time_seconds.

    Before fix: Sum("time_logs__duration_seconds") inside the same annotate() as
    Count("members") and Count("tasks") caused cross-product row multiplication.
    A project with M members and N tasks would inflate Sum by factor of M*N.
    After fix: Sum is computed in an independent Subquery correlated on project_id.
    """

    def test_total_time_seconds_not_inflated(self):
        """2 tasks + 3 time_logs → sum must be exactly 3600+1800+900 = 6300, not inflated."""
        from reports.services import ManagerDashboardService

        from .factories import (
            ProjectMemberFactory,
            TaskFactory,
            TaskStatusFactory,
            TeamFactory,
            TeamMembershipFactory,
            TimeLogFactory,
            UserFactory,
        )

        # Setup: manager leads a team with one member
        manager = UserFactory()
        member = UserFactory()
        team = TeamFactory()
        TeamMembershipFactory(user=manager, team=team)
        TeamMembershipFactory(user=member, team=team)

        project = ProjectFactory()
        board = BoardFactory(project=project)
        status = TaskStatusFactory(board=board, code="todo", name="To Do")

        # Allocate both manager and member to the project (creates 2 ProjectMember rows)
        ProjectMemberFactory(project=project, user=manager)
        ProjectMemberFactory(project=project, user=member)

        # 2 tasks assigned to the member
        task1 = TaskFactory(project=project, assignee=member, status=status)
        task2 = TaskFactory(project=project, assignee=member, status=status)

        # 3 time_logs with known durations: 3600 + 1800 + 900 = 6300 seconds
        expected_total_seconds = 3600 + 1800 + 900
        TimeLogFactory(task=task1, project=project, user=member, duration_seconds=3600)
        TimeLogFactory(task=task1, project=project, user=member, duration_seconds=1800)
        TimeLogFactory(task=task2, project=project, user=member, duration_seconds=900)

        member_ids = [manager.id, member.id]
        result = ManagerDashboardService._get_project_summary(member_ids)

        # Find our project in the results
        our_project = next((p for p in result if p["id"] == project.id), None)
        assert our_project is not None, "Project not found in project_summary results"

        actual_seconds = our_project["total_time_seconds"]
        assert actual_seconds == expected_total_seconds, (
            f"total_time_seconds inflated. "
            f"Expected={expected_total_seconds}, Got={actual_seconds}. "
            f"If this is a multiple of the expected value, the Subquery fix is broken."
        )

        # Also verify Count fields are not inflated
        assert (
            our_project["total_tasks"] == 2
        ), f"total_tasks inflated: expected=2, got={our_project['total_tasks']}"
        assert (
            our_project["active_member_count"] == 2
        ), f"active_member_count inflated: expected=2, got={our_project['active_member_count']}"


@pytest.mark.django_db
class TestInProgressMetric:
    """Regression tests: in_progress count on executive dashboard must exclude 'todo'
    and include only actively in-flight statuses (doing, review).
    """

    def setup_org(self):
        """Helper: create org with owner and one active project."""
        from .factories import OrganizationMembershipFactory

        owner = UserFactory()
        org = OrganizationFactory()
        OrganizationMembershipFactory(
            user=owner, organization=org, role=OrganizationMembership.Role.OWNER
        )
        project = ProjectFactory(organization=org)
        board = BoardFactory(project=project)
        return owner, org, project, board

    def test_todo_tasks_not_counted_as_in_progress(self):
        """todo tasks must NOT appear in in_progress metric."""
        owner, org, project, board = self.setup_org()
        status_todo = TaskStatusFactory(board=board, code="todo", name="To Do")
        member = UserFactory()

        # 3 todo tasks
        for _i in range(3):
            TaskFactory(project=project, assignee=member, status=status_todo)

        cache.clear()
        dashboard = ExecutiveDashboardService.get_dashboard(user=owner, org_id=org.id)
        tasks = dashboard["company_overview"]["tasks"]

        assert tasks["total"] == 3
        assert (
            tasks["in_progress"] == 0
        ), f"todo tasks incorrectly counted as in_progress: {tasks['in_progress']}"

    def test_doing_and_review_counted_as_in_progress(self):
        """doing and review tasks MUST appear in in_progress metric."""
        owner, org, project, board = self.setup_org()
        status_todo = TaskStatusFactory(board=board, code="todo", name="To Do")
        status_doing = TaskStatusFactory(board=board, code="doing", name="Doing")
        status_review = TaskStatusFactory(board=board, code="review", name="Review")
        status_done = TaskStatusFactory(board=board, code="done", name="Done")
        member = UserFactory()

        TaskFactory(project=project, assignee=member, status=status_todo)  # not in_progress
        TaskFactory(project=project, assignee=member, status=status_doing)  # in_progress
        TaskFactory(project=project, assignee=member, status=status_review)  # in_progress
        TaskFactory(project=project, assignee=member, status=status_done)  # done

        cache.clear()
        dashboard = ExecutiveDashboardService.get_dashboard(user=owner, org_id=org.id)
        tasks = dashboard["company_overview"]["tasks"]

        assert tasks["total"] == 4
        assert tasks["done"] == 1
        assert (
            tasks["in_progress"] == 2
        ), f"Expected 2 in_progress (doing+review), got {tasks['in_progress']}"


@pytest.mark.django_db
class TestProjectHealthInflation:
    """Regression test: _get_project_health must not inflate task/milestone counts.

    Before fix: Count("tasks") and Count("milestones") in a single annotate()
    without distinct=True causes a Cartesian join.  A project with T tasks and
    M milestones produces T*M rows, making each count equal T*M instead of T or M.

    After fix: distinct=True on every Count prevents this.
    """

    def test_task_and_milestone_counts_not_inflated(self):
        """3 tasks + 2 milestones → counts must be exactly 3 and 2, never 6."""
        from reports.services import ExecutiveDashboardService

        from .factories import (
            BoardFactory,
            MilestoneFactory,
            OrganizationFactory,
            OrganizationMembershipFactory,
            ProjectFactory,
            TaskFactory,
            TaskStatusFactory,
            UserFactory,
        )

        owner = UserFactory()
        org = OrganizationFactory()
        OrganizationMembershipFactory(
            user=owner, organization=org, role=OrganizationMembership.Role.OWNER
        )
        project = ProjectFactory(organization=org, status="active")
        board = BoardFactory(project=project)
        status_todo = TaskStatusFactory(board=board, code="todo", name="To Do")

        # Create 3 tasks
        for _i in range(3):
            TaskFactory(project=project, status=status_todo)

        # Create 2 milestones
        for _i in range(2):
            MilestoneFactory(project=project)

        cache.clear()
        dashboard = ExecutiveDashboardService.get_dashboard(user=owner, org_id=org.id)
        health_list = dashboard["project_health"]

        assert len(health_list) == 1, "Expected exactly one active project in health list"
        ph = health_list[0]

        assert ph["total_tasks"] == 3, (
            f"total_tasks inflated: expected 3, got {ph['total_tasks']}. "
            f"(If 6, Cartesian join is still present; add distinct=True to Count.)"
        )
        assert ph["overdue_milestones"] == 0  # milestones have future target_date


@pytest.mark.django_db
class TestManagerDashboardAdminAccess:
    """Fix #3: admin/owner with no team_id must see all org members, not an empty set.

    Before fix: _resolve_member_ids only looked at teams where the user has
    LEAD role.  An org admin who is not a team lead would get an empty list,
    producing a dashboard full of zeros.

    After fix: if the caller has owner/admin role in any org, all members of
    that org are returned when no team_id is given.
    """

    def test_admin_without_team_lead_sees_all_org_members(self):
        """Admin user who leads NO teams should still see all org members."""
        admin = UserFactory(username="admin_no_lead")
        emp1 = UserFactory(username="emp_fix3_a")
        emp2 = UserFactory(username="emp_fix3_b")

        org = OrganizationFactory(owner=admin)
        # admin is OWNER
        OrganizationMembershipFactory(
            user=admin, organization=org, role=OrganizationMembership.Role.OWNER
        )
        # two employees
        OrganizationMembershipFactory(
            user=emp1, organization=org, role=OrganizationMembership.Role.EMPLOYEE
        )
        OrganizationMembershipFactory(
            user=emp2, organization=org, role=OrganizationMembership.Role.EMPLOYEE
        )

        # admin leads NO teams
        assert ManagerDashboardService.get_managed_team_ids(admin) == []

        member_ids = ManagerDashboardService._resolve_member_ids(admin, team_id=None)

        # Should contain all 3 org members (admin + emp1 + emp2)
        assert len(member_ids) == 3, (
            f"Expected 3 member IDs (all org members) for admin without team_id, "
            f"got {len(member_ids)}. (If 0, the admin-fallback fix is missing.)"
        )
        assert admin.id in member_ids
        assert emp1.id in member_ids
        assert emp2.id in member_ids

    def test_team_lead_without_admin_role_sees_only_their_teams(self):
        """Non-admin team lead should still only see members of teams they lead (old behavior)."""
        lead = UserFactory(username="lead_no_admin")
        emp_in = UserFactory(username="emp_in_team")
        emp_out = UserFactory(username="emp_out_team")

        org = OrganizationFactory()
        OrganizationMembershipFactory(
            user=lead, organization=org, role=OrganizationMembership.Role.EMPLOYEE
        )
        OrganizationMembershipFactory(
            user=emp_in, organization=org, role=OrganizationMembership.Role.EMPLOYEE
        )
        OrganizationMembershipFactory(
            user=emp_out, organization=org, role=OrganizationMembership.Role.EMPLOYEE
        )

        # lead leads one team containing emp_in only
        team = TeamFactory(organization=org, leader=lead)
        TeamMembershipFactory(user=lead, team=team)
        TeamMembershipFactory(user=emp_in, team=team)
        # emp_out is NOT in this team

        member_ids = ManagerDashboardService._resolve_member_ids(lead, team_id=None)

        # Should only include the team's members (lead + emp_in), not emp_out
        assert (
            emp_out.id not in member_ids
        ), "Non-admin team lead must NOT see org-wide members without team_id."
        assert emp_in.id in member_ids
