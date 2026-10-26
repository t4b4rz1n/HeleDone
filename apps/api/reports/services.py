"""
reports/services.py
-------------------
Business-logic layer for the reporting & analytics application.

Design principles
~~~~~~~~~~~~~~~~~
* **Read-only** — no mutations, only aggregation queries.
* **DB-level aggregation** — all calculations use Django ORM
  ``Count``, ``Sum``, ``Avg``, ``annotate``, ``aggregate``.
  No Python-level loops for summing data.
* **Private method composition** — each data section lives in a
  ``_private`` method; ``get_dashboard`` composes them into a dict.
* **Timezone-aware** — "today" is calculated from the client's
  timezone, then converted to UTC boundaries for DB queries.
* **Manager → team_id scope** / **Executive → org_id scope**.
"""

from __future__ import annotations

import datetime
import logging
import zoneinfo
from collections import defaultdict

from django.core.cache import cache
from django.db.models import (
    Count,
    F,
    OuterRef,
    Q,
    Subquery,
    Sum,
)
from django.utils import timezone

from attendance.models import Attendance, AttendanceSetting, TimeLog, TimeOffRequest
from organizations.models import TeamMembership
from projects.models import Milestone, Project, ProjectMember
from tasks.models import AsyncStandup, Task, TaskStatusTransition

logger = logging.getLogger(__name__)

UPCOMING_TASKS_LIMIT = 5


def get_user_today_range(
    tz_name: str = "UTC",
) -> tuple[datetime.datetime, datetime.datetime]:
    """Return the UTC-aware start and end of *today* in the user's timezone.

    Example: for ``Asia/Tehran`` (UTC+3:30) at 2026-08-07 01:00 UTC,
    "today" in Tehran is already 2026-08-07, so the range is
    2026-08-06T20:30:00Z → 2026-08-07T20:30:00Z.
    """
    try:
        user_tz = zoneinfo.ZoneInfo(tz_name)
    except (zoneinfo.ZoneInfoNotFoundError, TypeError):
        from rest_framework.exceptions import ParseError

        raise ParseError(
            detail=f"Invalid timezone: '{tz_name}'. Use IANA timezone names, e.g. 'Asia/Tehran'."
        ) from None

    now_in_user_tz = timezone.now().astimezone(user_tz)
    today_start_local = now_in_user_tz.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_local = today_start_local + datetime.timedelta(days=1)

    # Convert back to UTC for DB queries
    today_start_utc = today_start_local.astimezone(zoneinfo.ZoneInfo("UTC"))
    today_end_utc = today_end_local.astimezone(zoneinfo.ZoneInfo("UTC"))
    return today_start_utc, today_end_utc


def get_user_week_range(
    tz_name: str = "UTC",
) -> tuple[datetime.datetime, datetime.datetime]:
    """Return the UTC-aware start (Saturday) and end of current week."""
    try:
        user_tz = zoneinfo.ZoneInfo(tz_name)
    except (zoneinfo.ZoneInfoNotFoundError, TypeError):
        from rest_framework.exceptions import ParseError

        raise ParseError(
            detail=f"Invalid timezone: '{tz_name}'. Use IANA timezone names, e.g. 'Asia/Tehran'."
        ) from None

    now_in_user_tz = timezone.now().astimezone(user_tz)
    today_local = now_in_user_tz.replace(hour=0, minute=0, second=0, microsecond=0)

    # Week starts on Saturday (weekday 5 in Python's Monday=0 system)
    days_since_saturday = (today_local.weekday() - 5) % 7
    week_start_local = today_local - datetime.timedelta(days=days_since_saturday)
    week_end_local = week_start_local + datetime.timedelta(days=7)

    week_start_utc = week_start_local.astimezone(zoneinfo.ZoneInfo("UTC"))
    week_end_utc = week_end_local.astimezone(zoneinfo.ZoneInfo("UTC"))
    return week_start_utc, week_end_utc


def _merge_intervals(
    intervals: list[tuple[datetime.datetime, datetime.datetime]],
) -> list[tuple[datetime.datetime, datetime.datetime]]:
    """Return a de-duplicated, sorted list of non-overlapping intervals.

    This is the classic O(n log n) merge-intervals algorithm:
    1. Sort by start time.
    2. Walk forward, extending the current interval whenever the next one
       overlaps (i.e. next.start <= current.end).

    Used in :func:`_get_resource_utilization` to prevent double-counting
    leave time when two approved TimeOffRequests overlap in the same week.
    """
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = [sorted_intervals[0]]
    for start, end in sorted_intervals[1:]:
        cur_start, cur_end = merged[-1]
        if start <= cur_end:  # overlap or adjacent — extend
            merged[-1] = (cur_start, max(cur_end, end))
        else:
            merged.append((start, end))
    return merged


def get_business_days(start_date: datetime.date, end_date: datetime.date) -> int:
    """Calculate the number of business days (Sat-Wed) between two dates inclusive.

    Assumes the Iranian work-week: Saturday through Wednesday (5 days).
    Thursday and Friday are weekend days (Python weekday 3=Thursday, 4=Friday —
    **but Saturday=5, Sunday=6 in Python's Monday=0 system**).

    Iranian weekdays:  Sat=5, Sun=6, Mon=0, Tue=1, Wed=2  → business days
    Iranian weekend:   Thu=3, Fri=4                        → skip

    NOTE: this is intentionally hard-coded to the Iranian calendar.
    If multi-locale support is needed in future, move working_days into
    AttendanceSetting and read from there.
    """
    if start_date > end_date:
        return 0

    # Iranian business days: Saturday(5), Sunday(6), Monday(0), Tuesday(1), Wednesday(2)
    BUSINESS_WEEKDAYS = {0, 1, 2, 5, 6}  # Mon, Tue, Wed, Sat, Sun

    days = (end_date - start_date).days + 1
    weeks = days // 7
    business_days = weeks * 5  # each full 7-day span contains exactly 5 business days

    remainder = days % 7
    start_weekday = start_date.weekday()
    for i in range(remainder):
        if (start_weekday + i) % 7 in BUSINESS_WEEKDAYS:
            business_days += 1

    return business_days


class EmployeeDashboardService:
    """Personal dashboard data for the authenticated employee."""

    @staticmethod
    def _get_upcoming_tasks(user, now):
        """Tasks not yet past their due_date, or with no due_date.

        Boundary: due_date >= now (exact UTC datetime), so a task due
        10 minutes ago is NOT shown here — it moves to overdue instead.
        """
        return (
            Task.objects.filter(
                assignees=user,
                is_deleted=False,
                project__is_deleted=False,
                is_finished=False,
            )
            .filter(Q(due_date__gte=now) | Q(due_date__isnull=True))
            .select_related("status", "project")
            .annotate(
                status_name=F("status__name"),
                status_code=F("status__code"),
                board_id=F("status__board_id"),
                project_name=F("project__name"),
            )
            .order_by(F("due_date").asc(nulls_last=True), "created_at")
            .values(
                "id",
                "title",
                "description",
                "priority",
                "due_date",
                "status_name",
                "status_code",
                "board_id",
                "project_name",
                "project_id",
            )[:UPCOMING_TASKS_LIMIT]
        )

    @staticmethod
    def _get_overdue_tasks(user, now):
        """Tasks whose due_date is strictly in the past (due_date < now).

        Even one minute past the deadline counts as overdue.
        Completed tasks (status code 'done') are excluded regardless.
        """
        return (
            Task.objects.filter(
                assignees=user,
                is_deleted=False,
                due_date__lt=now,
                project__is_deleted=False,
                is_finished=False,
            )
            .select_related("status", "project")
            .annotate(
                status_name=F("status__name"),
                status_code=F("status__code"),
                board_id=F("status__board_id"),
                project_name=F("project__name"),
            )
            .values(
                "id",
                "title",
                "description",
                "priority",
                "due_date",
                "status_name",
                "status_code",
                "board_id",
                "project_name",
                "project_id",
            )
        )

    @staticmethod
    def _get_blocked_tasks(user):
        return (
            Task.objects.filter(
                assignees=user,
                is_deleted=False,
                project__is_deleted=False,
                is_blocked=True,
                is_finished=False,
            )
            .select_related("status", "project")
            .annotate(
                status_name=F("status__name"),
                status_code=F("status__code"),
                project_name=F("project__name"),
            )
            .order_by("due_date", "created_at")
            .values(
                "id",
                "title",
                "priority",
                "due_date",
                "status_name",
                "status_code",
                "project_name",
                "project_id",
            )[:5]
        )

    @staticmethod
    def _get_today_standup(user, today_local_date):
        return (
            AsyncStandup.objects.filter(
                user=user,
                is_deleted=False,
                date=today_local_date,
            )
            .order_by("-created_at")
            .values(
                "id",
                "project_id",
                "date",
                "hours_worked",
                "today_work",
                "blockers",
                "created_at",
            )
            .first()
        )

    @staticmethod
    def _get_weekly_time_summary(user, week_start_date, week_end_date):
        result = TimeLog.objects.filter(
            user=user,
            is_deleted=False,
            date__gte=week_start_date,
            date__lte=week_end_date,
            is_active=False,
            project__is_deleted=False,
        ).aggregate(
            total_seconds=Sum("duration_seconds"),
            total_logs=Count("id"),
        )
        return {
            "total_seconds": result["total_seconds"] or 0,
            "total_logs": result["total_logs"] or 0,
        }

    @staticmethod
    def _get_active_projects(user):
        return (
            ProjectMember.objects.filter(
                user=user,
                is_deleted=False,
                is_active=True,
                project__is_deleted=False,
                project__status__in=[
                    Project.Status.ACTIVE,
                    Project.Status.DRAFT,
                ],
            )
            .select_related("project")
            .annotate(
                project_name=F("project__name"),
                project_status=F("project__status"),
                project_deadline=F("project__deadline"),
            )
            .values(
                "project_id",
                "project_name",
                "project_status",
                "project_deadline",
                "allocation_percentage",
            )
        )

    @staticmethod
    def _get_attendance_status(user, today_local_date):
        today_date = today_local_date
        attendance = (
            Attendance.objects.filter(
                user=user,
                date=today_date,
                is_deleted=False,
            )
            .annotate(organization_name=F("organization__name"))
            .values(
                "id",
                "check_in",
                "check_out",
                "is_remote",
                "overtime_minutes",
                "organization_name",
            )
            .first()
        )
        return attendance

    @staticmethod
    def _get_active_timers(user):
        timers = (
            TimeLog.objects.filter(
                user=user,
                is_active=True,
                is_deleted=False,
                project__is_deleted=False,
            )
            .select_related("task", "project")
            .annotate(
                task_title=F("task__title"),
                project_name=F("project__name"),
            )
            .values(
                "id",
                "start_time",
                "task_id",
                "task_title",
                "project_name",
            )
        )
        return timers

    @staticmethod
    def _get_upcoming_milestones(user):
        user_project_ids = ProjectMember.objects.filter(
            user=user,
            is_deleted=False,
            is_active=True,
        ).values_list("project_id", flat=True)

        return (
            Milestone.objects.filter(
                project_id__in=user_project_ids,
                is_deleted=False,
                status__in=[
                    Milestone.Status.PENDING,
                    Milestone.Status.IN_PROGRESS,
                ],
            )
            .select_related("project")
            .annotate(
                project_name=F("project__name"),
            )
            .order_by("target_date")
            .values(
                "id",
                "title",
                "status",
                "target_date",
                "project_name",
                "project_id",
            )[:5]
        )

    @classmethod
    def get_dashboard(cls, user, tz_name: str = "UTC") -> dict:
        """Compose all employee dashboard sections into a single dict."""
        version = cache.get(f"dashboard_version:emp:user_{user.id}", 1)
        cache_key = f"reports:emp:user_{user.id}:v{version}:tz_{tz_name}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return cached_data

        now = timezone.now()  # exact UTC moment — used as overdue boundary
        today_start, today_end = get_user_today_range(tz_name)
        week_start, week_end = get_user_week_range(tz_name)
        user_tz = zoneinfo.ZoneInfo(tz_name)
        today_local_date = today_start.astimezone(user_tz).date()
        week_start_date = week_start.astimezone(user_tz).date()
        week_end_date = week_end.astimezone(user_tz).date()

        result = {
            "upcoming_tasks": list(cls._get_upcoming_tasks(user, now)),
            "overdue_tasks": list(cls._get_overdue_tasks(user, now)),
            "blocked_tasks": list(cls._get_blocked_tasks(user)),
            "today_standup": cls._get_today_standup(user, today_local_date),
            "weekly_time": cls._get_weekly_time_summary(user, week_start_date, week_end_date),
            "active_projects": list(cls._get_active_projects(user)),
            "attendance_today": cls._get_attendance_status(user, today_local_date),
            "active_timers": list(cls._get_active_timers(user)),
            "upcoming_milestones": list(cls._get_upcoming_milestones(user)),
            # Stubs for future modules
            "points": None,  # Module 5 — Gamification (Phase 2)
            "badges": None,  # Module 5 — Gamification (Phase 2)
            "goals": None,  # Module 7 — OKR (Phase 3)
        }

        # Cache for 10 minutes (600 seconds)
        cache.set(cache_key, result, 600)
        return result


class ManagerDashboardService:
    """Team-scoped dashboard data for managers / team leads."""

    @staticmethod
    def get_managed_team_ids(user) -> list:
        from organizations.models import Team

        return list(
            Team.objects.filter(
                leader=user,
                is_deleted=False,
            ).values_list("id", flat=True)
        )

    @staticmethod
    def _get_admin_org_ids(user) -> list:
        from organizations.models import OrganizationMembership

        return sorted(
            OrganizationMembership.objects.filter(
                user=user,
                is_deleted=False,
            )
            .filter(
                Q(
                    dynamic_roles__permissions__code__in=[
                        "org.manage_settings",
                        "project.manage",
                        "report.view",
                    ]
                )
                | Q(role__in=[OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN])
            )
            .values_list("organization_id", flat=True)
            .distinct()
        )

    @classmethod
    def _build_manager_cache_key(cls, user, team_id, tz_name: str) -> str:
        """Build a versioned cache key for the manager dashboard.

        Team-scoped dashboards use ``team_{team_id}`` version keys (unchanged).

        Org-admin aggregate dashboards (no ``team_id``) additionally embed
        ``dashboard_version:mgr:org_{org_id}`` counters so subordinate data
        changes invalidate the admin view without relying on team-lead paths.
        """
        if team_id:
            key_prefix = f"team_{team_id}"
            version = cache.get(f"dashboard_version:mgr:{key_prefix}", 1)
            return f"reports:mgr:{key_prefix}:v{version}:tz_{tz_name}"

        admin_org_ids = cls._get_admin_org_ids(user)
        user_version = cache.get(f"dashboard_version:mgr:user_{user.id}", 1)
        key_prefix = f"user_{user.id}"

        if admin_org_ids:
            org_parts = []
            for org_id in admin_org_ids:
                org_version = cache.get(f"dashboard_version:mgr:org_{org_id}", 1)
                org_parts.append(f"{org_id}:{org_version}")
            version_segment = f"u{user_version}_orgs_{'_'.join(org_parts)}"
        else:
            version_segment = str(user_version)

        return f"reports:mgr:{key_prefix}:v{version_segment}:tz_{tz_name}"

    @staticmethod
    def _get_team_member_user_ids(team_id) -> list:
        return list(
            TeamMembership.objects.filter(
                team_id=team_id,
                is_deleted=False,
            ).values_list("user_id", flat=True)
        )

    @staticmethod
    def _get_task_stats(member_ids, admin_org_ids=None):
        q_filter = Q(assignees__id__in=member_ids)
        if admin_org_ids:
            q_filter |= Q(assignees__isnull=True, project__organization_id__in=admin_org_ids)

        return list(
            Task.objects.filter(
                q_filter,
                is_deleted=False,
                project__is_deleted=False,
            )
            .distinct()
            .annotate(
                status_code=F("status__code"),
                status_name=F("status__name"),
            )
            .values("status_code", "status_name")
            .annotate(count=Count("id"))
            .order_by("status_code")
        )

    @staticmethod
    def _get_overdue_tasks(member_ids, now, admin_org_ids=None):
        q_filter = Q(assignees__id__in=member_ids)
        if admin_org_ids:
            q_filter |= Q(assignees__isnull=True, project__organization_id__in=admin_org_ids)

        qs = Task.objects.filter(
            q_filter,
            is_deleted=False,
            due_date__lt=now,
            project__is_deleted=False,
            is_finished=False,
        ).distinct()

        return {
            "total_overdue": qs.count(),
            "by_member": list(
                qs.annotate(
                    username=F("assignees__username"),
                    first_name=F("assignees__first_name"),
                    avatar=F("assignees__avatar"),
                )
                .values("username", "first_name", "avatar")
                .annotate(count=Count("id"))
                .order_by("-count")
            ),
        }

    @staticmethod
    def _get_work_hours(member_ids, week_start_date, week_end_date):
        return list(
            TimeLog.objects.filter(
                user_id__in=member_ids,
                is_deleted=False,
                is_active=False,
                date__gte=week_start_date,
                date__lte=week_end_date,
                project__is_deleted=False,
            )
            .annotate(
                username=F("user__username"),
                first_name=F("user__first_name"),
                last_name=F("user__last_name"),
                avatar=F("user__avatar"),
            )
            .values(
                "user_id",
                "username",
                "first_name",
                "last_name",
                "avatar",
            )
            .annotate(
                total_seconds=Sum("duration_seconds"),
                total_logs=Count("id"),
            )
            .order_by("-total_seconds")
        )

    @staticmethod
    def _get_members_attendance(member_ids, today_local_date):
        today_date = today_local_date
        return list(
            Attendance.objects.filter(
                user_id__in=member_ids,
                date=today_date,
                is_deleted=False,
            )
            .annotate(
                username=F("user__username"),
                first_name=F("user__first_name"),
                avatar=F("user__avatar"),
            )
            .values(
                "user_id",
                "username",
                "first_name",
                "avatar",
                "check_in",
                "check_out",
                "is_remote",
            )
        )

    @staticmethod
    def _get_project_summary(member_ids):
        project_ids = (
            ProjectMember.objects.filter(
                user_id__in=member_ids,
                is_deleted=False,
                is_active=True,
            )
            .values_list("project_id", flat=True)
            .distinct()
        )

        # Subquery for total logged seconds per project — kept separate from the
        # Count annotations to prevent cross-product row multiplication that occurs
        # when Django JOINs multiple reverse relations (members + tasks + time_logs)
        # in a single annotate call. A Subquery correlated on OuterRef('id') avoids
        # this by running an independent aggregation per project.
        time_subquery = Subquery(
            TimeLog.objects.filter(
                project_id=OuterRef("id"),
                is_deleted=False,
                is_active=False,
            )
            .values("project_id")
            .annotate(total=Sum("duration_seconds"))
            .values("total")[:1]
        )

        return list(
            Project.objects.filter(
                id__in=project_ids,
                is_deleted=False,
            )
            .annotate(
                # distinct=True prevents row multiplication when aggregating over
                # multiple FK paths (members + tasks) in one queryset.
                active_member_count=Count(
                    "members",
                    filter=Q(members__is_deleted=False, members__is_active=True),
                    distinct=True,
                ),
                total_tasks=Count(
                    "tasks",
                    filter=Q(tasks__is_deleted=False),
                    distinct=True,
                ),
                done_tasks=Count(
                    "tasks",
                    filter=Q(
                        tasks__is_deleted=False,
                        tasks__status__code__iexact="done",
                    ),
                    distinct=True,
                ),
                total_time_seconds=time_subquery,
            )
            .values(
                "id",
                "name",
                "status",
                "budget",
                "budget_currency",
                "deadline",
                "active_member_count",
                "total_tasks",
                "done_tasks",
                "total_time_seconds",
            )
        )

    @classmethod
    def _resolve_member_ids(cls, user, team_id=None) -> list:
        """Return the list of user-IDs whose data should appear in the dashboard.

        Resolution rules
        ~~~~~~~~~~~~~~~~
        1. **team_id provided** → members of that specific team only.
        2. **No team_id, user is org admin/owner** → *all* members of every
           organisation the user administers.  This prevents admins/owners from
           seeing an empty dashboard when they are not explicitly set as a LEAD
           on any team.
        3. **No team_id, user is a team-lead** → members of all teams the user
           leads (legacy behaviour, unchanged).

        Note: rule 2 takes precedence over rule 3, so an admin who also happens
        to be a team lead still sees the entire org.
        """
        from organizations.models import OrganizationMembership

        if team_id:
            return cls._get_team_member_user_ids(team_id)

        # Staff/superusers see everyone if no team_id is specified
        if user.is_staff or user.is_superuser:
            return list(
                OrganizationMembership.objects.filter(is_deleted=False)
                .values_list("user_id", flat=True)
                .distinct()
            )

        # Check whether the user has an admin/owner role in any org
        admin_org_ids = list(
            OrganizationMembership.objects.filter(
                user=user,
                is_deleted=False,
            )
            .filter(
                Q(
                    dynamic_roles__permissions__code__in=[
                        "org.manage_settings",
                        "project.manage",
                        "report.view",
                    ]
                )
                | Q(role__in=[OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN])
            )
            .values_list("organization_id", flat=True)
            .distinct()
        )

        if admin_org_ids:
            # Admin/Owner without explicit team_id → show all org members
            return list(
                OrganizationMembership.objects.filter(
                    organization_id__in=admin_org_ids,
                    is_deleted=False,
                )
                .values_list("user_id", flat=True)
                .distinct()
            )

        # Regular team-lead (not org admin): show only members of their teams
        managed_teams = cls.get_managed_team_ids(user)
        team_members = list(
            TeamMembership.objects.filter(
                team_id__in=managed_teams,
                is_deleted=False,
            )
            .values_list("user_id", flat=True)
            .distinct()
        )

        # Also include members of projects owned by this user
        owned_projects = list(
            Project.objects.filter(owner=user, is_deleted=False).values_list("id", flat=True)
        )
        project_members = list(
            ProjectMember.objects.filter(
                project_id__in=owned_projects,
                is_deleted=False,
                is_active=True,
            )
            .values_list("user_id", flat=True)
            .distinct()
        )

        return list(set(team_members + project_members))

    @classmethod
    def get_dashboard(cls, user, team_id=None, tz_name: str = "UTC") -> dict:
        """Compose all manager dashboard sections."""
        cache_key = cls._build_manager_cache_key(user, team_id, tz_name)

        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return cached_data

        member_ids = cls._resolve_member_ids(user, team_id)

        # Count actual managed teams (used by frontend to show empty-state
        # when no real team exists, even if org members are visible).
        if team_id:
            managed_team_count = 1
            admin_org_ids_for_tasks = None
        elif user.is_staff or user.is_superuser:
            from organizations.models import Organization, Team

            managed_team_count = Team.objects.filter(is_deleted=False).count()
            admin_org_ids_for_tasks = list(
                Organization.objects.filter(is_deleted=False).values_list("id", flat=True)
            )
        else:
            admin_org_ids = cls._get_admin_org_ids(user)
            if admin_org_ids:
                from organizations.models import Team

                managed_team_count = Team.objects.filter(
                    organization_id__in=admin_org_ids,
                    is_deleted=False,
                ).count()
                admin_org_ids_for_tasks = admin_org_ids
            else:
                managed_team_count = len(cls.get_managed_team_ids(user))
                admin_org_ids_for_tasks = None

        now = timezone.now()
        today_start, today_end = get_user_today_range(tz_name)
        week_start, week_end = get_user_week_range(tz_name)
        user_tz = zoneinfo.ZoneInfo(tz_name)
        today_local_date = today_start.astimezone(user_tz).date()
        week_start_date = week_start.astimezone(user_tz).date()
        week_end_date = week_end.astimezone(user_tz).date()

        result = {
            "team_member_count": len(member_ids),
            "managed_team_count": managed_team_count,
            "task_stats": cls._get_task_stats(member_ids, admin_org_ids_for_tasks),
            "overdue_summary": cls._get_overdue_tasks(member_ids, now, admin_org_ids_for_tasks),
            "work_hours": cls._get_work_hours(member_ids, week_start_date, week_end_date),
            "members_attendance": cls._get_members_attendance(member_ids, today_local_date),
            "project_summary": cls._get_project_summary(member_ids),
        }

        # Cache for 15 minutes (900 seconds)
        cache.set(cache_key, result, 900)
        return result

    @classmethod
    def get_members_detail(cls, user, team_id=None, tz_name: str = "UTC") -> list:
        """Detailed per-member view: tasks, hours, attendance."""
        member_ids = cls._resolve_member_ids(user, team_id)

        now = timezone.now()
        today_start, _ = get_user_today_range(tz_name)
        week_start, week_end = get_user_week_range(tz_name)
        user_tz = zoneinfo.ZoneInfo(tz_name)
        week_start_date = week_start.astimezone(user_tz).date()
        week_end_date = week_end.astimezone(user_tz).date()

        from accounts.models import User

        members = (
            User.objects.filter(id__in=member_ids, is_deleted=False)
            .annotate(
                total_tasks=Count(
                    "assigned_tasks",
                    filter=Q(
                        assigned_tasks__is_deleted=False,
                        assigned_tasks__project__is_deleted=False,
                    ),
                    distinct=True,
                ),
                done_tasks=Count(
                    "assigned_tasks",
                    filter=Q(
                        assigned_tasks__is_deleted=False,
                        assigned_tasks__project__is_deleted=False,
                        assigned_tasks__is_finished=True,
                    ),
                    distinct=True,
                ),
                overdue_tasks=Count(
                    "assigned_tasks",
                    filter=Q(
                        assigned_tasks__is_deleted=False,
                        assigned_tasks__project__is_deleted=False,
                        assigned_tasks__due_date__lt=now,
                        assigned_tasks__is_finished=False,
                    ),
                    distinct=True,
                ),
                week_seconds=Subquery(
                    TimeLog.objects.filter(
                        user_id=OuterRef("id"),
                        is_deleted=False,
                        is_active=False,
                        date__gte=week_start_date,
                        date__lte=week_end_date,
                        project__is_deleted=False,
                    )
                    .values("user_id")
                    .annotate(total=Sum("duration_seconds"))
                    .values("total")[:1]
                ),
            )
            .values(
                "id",
                "username",
                "first_name",
                "last_name",
                "avatar",
                "total_tasks",
                "done_tasks",
                "overdue_tasks",
                "week_seconds",
            )
        )

        return list(members)


class ExecutiveDashboardService:
    """Organisation-wide dashboard data for owners and admins."""

    @staticmethod
    def _get_company_overview(org_id):
        from organizations.models import OrganizationMembership

        member_count = OrganizationMembership.objects.filter(
            organization_id=org_id, is_deleted=False
        ).count()

        project_stats = Project.objects.filter(organization_id=org_id, is_deleted=False).aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(status=Project.Status.ACTIVE)),
            completed=Count("id", filter=Q(status=Project.Status.COMPLETED)),
            on_hold=Count("id", filter=Q(status=Project.Status.ON_HOLD)),
        )

        task_stats = Task.objects.filter(
            project__organization_id=org_id,
            is_deleted=False,
            project__is_deleted=False,
        ).aggregate(
            total=Count("id"),
            done=Count("id", filter=Q(status__code__iexact="done")),
            # "In-progress" means actively being worked on or under review.
            # TaskStatus has no semantic category field (is_terminal, category, …),
            # so we must enumerate the known in-flight codes explicitly.
            # Default board codes are: todo | doing | review | done.
            # "todo" is NOT in-progress (work hasn't started); only doing + review are.
            # If a project adds a custom in-flight status, it must be added here too.
            # This is a known model-level gap; the long-term fix is adding a
            # TaskStatus.category field (todo / in_progress / done).
            in_progress=Count(
                "id",
                filter=Q(status__code__in=["doing", "review", "in_progress", "in_review"]),
            ),
        )

        return {
            "total_members": member_count,
            "projects": project_stats,
            "tasks": task_stats,
        }

    @staticmethod
    def _get_resource_utilization(org_id, week_start, week_end, week_start_date, week_end_date):
        from organizations.models import OrganizationMembership

        member_count = OrganizationMembership.objects.filter(
            organization_id=org_id, is_deleted=False
        ).count()

        work_data = TimeLog.objects.filter(
            project__organization_id=org_id,
            is_deleted=False,
            is_active=False,
            date__gte=week_start_date,
            date__lte=week_end_date,
            project__is_deleted=False,
        ).aggregate(
            total_seconds=Sum("duration_seconds"),
            active_workers=Count("user_id", distinct=True),
        )

        total_seconds = work_data["total_seconds"] or 0
        active_workers = work_data["active_workers"] or 0

        # Calculate business days in the week range
        current = week_start_date
        end = min(week_end_date, timezone.now().astimezone(zoneinfo.ZoneInfo("UTC")).date())
        business_days = get_business_days(current, end)

        # Get expected daily hours for the organization
        setting = AttendanceSetting.objects.filter(organization_id=org_id).first()
        expected_daily_hours = float(setting.expected_daily_hours) if setting else 8.0

        # Calculate approved leave time in the week range (in seconds)
        leave_requests = TimeOffRequest.objects.filter(
            organization_id=org_id,
            status=TimeOffRequest.Status.APPROVED,
            request_type__in=[
                TimeOffRequest.Type.VACATION,
                TimeOffRequest.Type.SICK,
                TimeOffRequest.Type.HOURLY,
            ],
            is_deleted=False,
            start_datetime__lt=week_end,
            end_datetime__gt=week_start,
        ).values("user_id", "start_datetime", "end_datetime")

        # Clip each leave to the week window, group by user, then merge
        # overlapping intervals per user before summing.  Merging must happen
        # per-user: two different employees on leave at the same time each
        # deduct their own capacity — a global merge would under-count leave.
        clipped_by_user: dict[int, list[tuple[datetime.datetime, datetime.datetime]]] = defaultdict(
            list
        )
        for req in leave_requests:
            req_start = max(req["start_datetime"], week_start)
            req_end = min(req["end_datetime"], week_end)
            if req_end > req_start:
                clipped_by_user[req["user_id"]].append((req_start, req_end))

        leave_seconds = 0.0
        for user_intervals in clipped_by_user.values():
            merged_leaves = _merge_intervals(user_intervals)
            leave_seconds += sum((end - start).total_seconds() for start, end in merged_leaves)

        expected_seconds = int(
            (member_count * business_days * expected_daily_hours * 3600) - leave_seconds
        )
        expected_seconds = max(expected_seconds, 0)

        return {
            "total_work_seconds": total_seconds,
            "expected_seconds": expected_seconds,
            "utilization_rate": (
                round(total_seconds / expected_seconds * 100, 1) if expected_seconds > 0 else 0.0
            ),
            "active_workers": active_workers,
            "total_members": member_count,
        }

    @staticmethod
    def _get_project_health(org_id, today_local_date):
        today_date = today_local_date

        projects = (
            Project.objects.filter(
                organization_id=org_id,
                is_deleted=False,
                status=Project.Status.ACTIVE,
            )
            .annotate(
                # distinct=True prevents row multiplication when Django JOINs both
                # the tasks reverse-relation and the milestones reverse-relation in
                # a single queryset.  Without distinct, each task row is repeated
                # once per milestone (and vice-versa), inflating all counts by the
                # cross-product factor (tasks × milestones).
                total_tasks=Count(
                    "tasks",
                    filter=Q(tasks__is_deleted=False),
                    distinct=True,
                ),
                done_tasks=Count(
                    "tasks",
                    filter=Q(
                        tasks__is_deleted=False,
                        tasks__status__code__iexact="done",
                    ),
                    distinct=True,
                ),
                overdue_tasks=Count(
                    "tasks",
                    filter=Q(
                        tasks__is_deleted=False,
                        tasks__due_date__date__lt=today_date,
                    )
                    & ~Q(tasks__status__code__iexact="done"),
                    distinct=True,
                ),
                overdue_milestones=Count(
                    "milestones",
                    filter=Q(
                        milestones__is_deleted=False,
                        milestones__project__is_deleted=False,
                        milestones__target_date__lt=today_date,
                    )
                    & ~Q(milestones__status=Milestone.Status.COMPLETED),
                    distinct=True,
                ),
            )
            .values(
                "id",
                "name",
                "deadline",
                "budget",
                "budget_currency",
                "total_tasks",
                "done_tasks",
                "overdue_tasks",
                "overdue_milestones",
            )
        )

        result = []
        for p in projects:
            total = p["total_tasks"] or 0
            done = p["done_tasks"] or 0
            overdue = p["overdue_tasks"] or 0

            progress = round(done / total * 100, 1) if total > 0 else 0.0

            if overdue == 0 and p["overdue_milestones"] == 0:
                health = "on_track"
            elif overdue <= 2 and p["overdue_milestones"] <= 1:
                health = "at_risk"
            else:
                health = "delayed"

            result.append({**p, "progress": progress, "health": health})

        return result

    @staticmethod
    def _get_financial_summary(org_id):
        return (
            Project.objects.filter(
                organization_id=org_id,
                is_deleted=False,
            )
            .exclude(status=Project.Status.ARCHIVED)
            .aggregate(
                total_budget=Sum("budget", default=0),
                project_count=Count("id"),
                total_time_seconds=Sum(
                    "time_logs__duration_seconds",
                    filter=Q(
                        time_logs__is_deleted=False,
                        time_logs__is_active=False,
                    ),
                    default=0,
                ),
            )
        )

    @classmethod
    def get_dashboard(cls, user, org_id=None, tz_name: str = "UTC") -> dict:
        """Compose the executive dashboard sections."""
        if not org_id:
            from organizations.models import OrganizationMembership

            # order_by('created_at') ensures deterministic selection for multi-org users:
            # the earliest (primary) membership is always chosen, not an arbitrary row.
            membership = (
                OrganizationMembership.objects.filter(
                    user=user,
                    is_deleted=False,
                )
                .filter(
                    Q(
                        dynamic_roles__permissions__code__in=[
                            "org.manage_settings",
                            "finance.view_reports",
                            "report.view",
                        ]
                    )
                    | Q(
                        role__in=[
                            OrganizationMembership.Role.OWNER,
                            OrganizationMembership.Role.ADMIN,
                        ]
                    )
                )
                .order_by("created_at")
                .first()
            )
            if not membership:
                from django.utils.translation import gettext_lazy as _
                from rest_framework.exceptions import NotFound

                raise NotFound(_("No organisation found for this user."))
            org_id = membership.organization_id

        version = cache.get(f"dashboard_version:exec:org_{org_id}", 1)
        cache_key = f"reports:exec:org_{org_id}:v{version}:tz_{tz_name}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return cached_data

        today_start, today_end = get_user_today_range(tz_name)
        week_start, week_end = get_user_week_range(tz_name)
        user_tz = zoneinfo.ZoneInfo(tz_name)
        today_local_date = today_start.astimezone(user_tz).date()
        week_start_date = week_start.astimezone(user_tz).date()
        week_end_date = week_end.astimezone(user_tz).date()

        result = {
            "company_overview": cls._get_company_overview(org_id),
            "resource_utilization": cls._get_resource_utilization(
                org_id, week_start, week_end, week_start_date, week_end_date
            ),
            "project_health": cls._get_project_health(org_id, today_local_date),
            "financial_summary": cls._get_financial_summary(org_id),
        }

        # Cache for 60 minutes (3600 seconds)
        cache.set(cache_key, result, 3600)
        return result


# ---------------------------------------------------------------------------
# CumulativeFlowService
# ---------------------------------------------------------------------------


class CumulativeFlowService:
    """
    Cumulative Flow Diagram (CFD) for a project or a specific board.

    Algorithm
    ~~~~~~~~~
    For each calendar day in [start_date, end_date]:
      - Find the latest TaskStatusTransition for each task up to the end of that day.
      - Count tasks per status.

    Because TaskStatusTransition is append-only and indexed on (task, transitioned_at),
    the queries are efficient even for large projects.

    Status ordering
    ~~~~~~~~~~~~~~~
    Statuses are returned in their Kanban board order (TaskStatus.order).  If a
    status has been deleted (to_status is NULL), the snapshot columns
    (to_status_code / to_status_name) are used so historical data is never lost.
    """

    @classmethod
    def get_cfd(
        cls,
        *,
        project_id: str,
        board_id: str | None = None,
        start_date: datetime.date | None = None,
        end_date: datetime.date | None = None,
        tz_name: str = "UTC",
    ) -> dict:
        try:
            user_tz = zoneinfo.ZoneInfo(tz_name)
        except (zoneinfo.ZoneInfoNotFoundError, TypeError):
            user_tz = zoneinfo.ZoneInfo("UTC")

        now = datetime.datetime.now(tz=user_tz)
        end_date = end_date or now.date()
        start_date = start_date or (end_date - datetime.timedelta(days=30))

        # Build base queryset scoped to project (and optionally board)
        transition_qs = TaskStatusTransition.objects.filter(
            task__project_id=project_id,
            task__is_deleted=False,
        )
        if board_id:
            transition_qs = transition_qs.filter(task__status__board_id=board_id)

        # Collect all status metadata from transitions in the window
        # We use snapshots (to_status_code / to_status_name) so deleted statuses
        # still appear correctly in historic data.
        status_meta: dict[str, dict] = {}  # code -> {code, name, order}

        # Also pull live statuses from the board(s) for ordering
        from tasks.models import TaskStatus

        live_statuses_qs = TaskStatus.objects.filter(board__project_id=project_id, is_deleted=False)
        if board_id:
            live_statuses_qs = live_statuses_qs.filter(board_id=board_id)
        for s in live_statuses_qs.order_by("order"):
            status_meta[s.code] = {"code": s.code, "name": s.name, "order": s.order}

        # Add any codes that appear in transitions but not in live statuses (deleted ones)
        snapshot_codes = transition_qs.values("to_status_code", "to_status_name").distinct()
        extra_order = len(status_meta) + 1
        for row in snapshot_codes:
            code = row["to_status_code"]
            if code and code not in status_meta:
                status_meta[code] = {
                    "code": code,
                    "name": row["to_status_name"],
                    "order": extra_order,
                }
                extra_order += 1

        statuses_ordered = sorted(status_meta.values(), key=lambda x: x["order"])
        status_codes = [s["code"] for s in statuses_ordered]

        # For each task, find its status at each day boundary (end of day UTC)
        # We use a Python-level reconstruction because SQL window functions
        # would be DB-specific.  The transition table is typically small.
        all_transitions = list(
            transition_qs.filter(transitioned_at__date__lte=end_date)
            .values("task_id", "to_status_code", "transitioned_at")
            .order_by("task_id", "transitioned_at")
        )

        # Build per-task sorted transition history
        # Store transition timestamps and corresponding status codes in parallel lists
        # to allow fast binary search using bisect.
        import bisect

        task_history: dict[str, tuple[list[float], list[str]]] = {}
        for t in all_transitions:
            tid = str(t["task_id"])
            if tid not in task_history:
                task_history[tid] = ([], [])
            task_history[tid][0].append(t["transitioned_at"].timestamp())
            task_history[tid][1].append(t["to_status_code"])

        # Day-by-day aggregation
        data = []
        current = start_date
        delta = datetime.timedelta(days=1)
        utc_zone = zoneinfo.ZoneInfo("UTC")
        while current <= end_date:
            # End of this day in UTC as a timestamp
            day_end_ts = (
                datetime.datetime(
                    current.year,
                    current.month,
                    current.day,
                    23,
                    59,
                    59,
                    tzinfo=user_tz,
                )
                .astimezone(utc_zone)
                .timestamp()
            )

            counts: dict[str, int] = dict.fromkeys(status_codes, 0)
            for _tid, (times, codes) in task_history.items():
                # Fast binary search for the last transition at or before day_end
                idx = bisect.bisect_right(times, day_end_ts)
                if idx > 0:
                    last_code = codes[idx - 1]
                    if last_code in counts:
                        counts[last_code] += 1

            data.append({"date": current.isoformat(), "counts": counts})
            current += delta

        return {
            "statuses": statuses_ordered,
            "data": data,
        }


# ---------------------------------------------------------------------------
# MilestoneBurndownService
# ---------------------------------------------------------------------------


class MilestoneBurndownService:
    """
    Burndown and Burnup chart for a single Milestone.

    Inputs
    ~~~~~~
    * milestone.start_date  (day work begins — defaults to earliest task created_at)
    * milestone.target_date (the deadline)
    * Tasks linked via Task.milestone FK

    Outputs
    ~~~~~~~
    ideal_line      — straight line from total tasks on start_date to 0 on target_date.
    actual_burndown — actual remaining (not-Done) tasks each day.
    burnup          — cumulative Done tasks each day vs. total tasks each day.

    "Done" definition
    ~~~~~~~~~~~~~~~~~
    A task is counted as Done on a given day if it had a transition to a status
    whose code is 'done' (case-insensitive) by the end of that day.
    This is robust to dynamic statuses — we look for code == 'done', not a fixed FK.
    """

    @classmethod
    def get_burndown(
        cls,
        *,
        milestone_id: str,
        tz_name: str = "UTC",
    ) -> dict:
        try:
            user_tz = zoneinfo.ZoneInfo(tz_name)
        except (zoneinfo.ZoneInfoNotFoundError, TypeError):
            user_tz = zoneinfo.ZoneInfo("UTC")

        try:
            milestone = Milestone.objects.select_related("project").get(
                pk=milestone_id, is_deleted=False
            )
        except Milestone.DoesNotExist:
            return {"error": "Milestone not found"}

        tasks = list(
            Task.objects.filter(milestone=milestone, is_deleted=False).values(
                "id", "created_at", "updated_at", "is_finished"
            )
        )
        total_tasks = len(tasks)

        if total_tasks == 0:
            return {
                "milestone": cls._milestone_meta(milestone),
                "total_tasks": 0,
                "ideal_line": [],
                "actual_burndown": [],
                "burnup": [],
                "note": "No tasks linked to this milestone.",
            }

        # Date range
        target_date = milestone.target_date
        if milestone.start_date:
            start_date = milestone.start_date
        else:
            earliest = min(t["created_at"] for t in tasks)
            start_date = earliest.astimezone(user_tz).date()

        # Ensure start_date is not after target_date (prevents 1-dot charts if deadline is in the past)
        start_date = min(start_date, target_date)

        today = datetime.datetime.now(tz=user_tz).date()
        end_date = max(target_date, today)  # always extend to today so the chart is live

        # Collect all "done" transitions for milestone tasks
        task_ids = [t["id"] for t in tasks]
        done_transitions = list(
            TaskStatusTransition.objects.filter(
                task_id__in=task_ids,
                to_status_code__iexact="done",
            )
            .values("task_id", "transitioned_at")
            .order_by("task_id", "transitioned_at")
        )

        # Per-task first Done date
        first_done: dict[str, datetime.date] = {}
        for tr in done_transitions:
            tid = str(tr["task_id"])
            if tid not in first_done:
                first_done[tid] = tr["transitioned_at"].astimezone(user_tz).date()

        # Fallback for tasks marked is_finished=True but without a transition to a "done" status
        for t in tasks:
            tid = str(t["id"])
            if t["is_finished"] and tid not in first_done:
                first_done[tid] = t["updated_at"].astimezone(user_tz).date()

        # Bug Fix: Only count tasks as "done" historically if they are STILL finished today!
        # This prevents the chart from showing tasks as permanently done if they were moved back to 'todo'
        valid_finished_ids = {str(t["id"]) for t in tasks if t["is_finished"]}
        first_done = {tid: date for tid, date in first_done.items() if tid in valid_finished_ids}

        # Ideal line: linear decrease from total to 0
        num_days = (target_date - start_date).days or 1
        ideal_line = []
        current = start_date
        delta = datetime.timedelta(days=1)
        while current <= end_date:
            if current <= target_date:
                days_elapsed = (current - start_date).days
                ideal_remaining = max(
                    0,
                    round(total_tasks - (total_tasks * days_elapsed / num_days), 1),
                )
            else:
                ideal_remaining = 0
            ideal_line.append({"date": current.isoformat(), "remaining": ideal_remaining})
            current += delta

        import bisect

        # Pre-compute and sort dates to avoid timezone conversion in the loop
        task_created_dates = sorted([t["created_at"].astimezone(user_tz).date() for t in tasks])
        done_dates = sorted(first_done.values())

        # Actual burndown & burnup
        actual_burndown = []
        burnup = []
        current = start_date
        while current <= end_date:
            done_by_today = bisect.bisect_right(done_dates, current)
            tasks_by_today = bisect.bisect_right(task_created_dates, current)

            remaining = tasks_by_today - done_by_today
            actual_burndown.append({"date": current.isoformat(), "remaining": remaining})
            burnup.append(
                {
                    "date": current.isoformat(),
                    "done": done_by_today,
                    "total": tasks_by_today,
                }
            )
            current += delta

        return {
            "milestone": cls._milestone_meta(milestone),
            "total_tasks": total_tasks,
            "start_date": start_date.isoformat(),
            "target_date": target_date.isoformat(),
            "ideal_line": ideal_line,
            "actual_burndown": actual_burndown,
            "burnup": burnup,
        }

    @staticmethod
    def _milestone_meta(m: Milestone) -> dict:
        return {
            "id": str(m.id),
            "title": m.title,
            "status": m.status,
            "start_date": m.start_date.isoformat() if m.start_date else None,
            "target_date": m.target_date.isoformat(),
            "project_id": str(m.project_id),
            "project_name": m.project.name if m.project else None,
        }


# ---------------------------------------------------------------------------
# CycleLeadTimeService
# ---------------------------------------------------------------------------


class CycleLeadTimeService:
    """
    Cycle Time & Lead Time analytics for a project.

    Definitions
    ~~~~~~~~~~~
    Lead Time  — duration from task.created_at to the moment it first entered
                 a 'done' status.  Measures the total wait + work.
    Cycle Time — duration from the moment the task first LEFT 'todo' (i.e. first
                 entered any non-todo active status) to when it reached 'done'.
                 Measures actual work time excluding queue wait.

    If a board has no 'todo' status (deleted or renamed), Cycle Time falls back
    to Lead Time.

    Only tasks that have at least one 'done' transition are included.
    """

    @classmethod
    def get_cycle_lead_time(
        cls,
        *,
        project_id: str,
        board_id: str | None = None,
        start_date: datetime.date | None = None,
        end_date: datetime.date | None = None,
        assignee_id: str | None = None,
        tz_name: str = "UTC",
    ) -> dict:
        try:
            user_tz = zoneinfo.ZoneInfo(tz_name)
        except (zoneinfo.ZoneInfoNotFoundError, TypeError):
            user_tz = zoneinfo.ZoneInfo("UTC")

        now = datetime.datetime.now(tz=user_tz)
        end_date = end_date or now.date()
        start_date = start_date or (end_date - datetime.timedelta(days=90))

        # Convert dates to UTC-aware datetimes for DB comparison
        utc = zoneinfo.ZoneInfo("UTC")
        start_dt = datetime.datetime(
            start_date.year, start_date.month, start_date.day, tzinfo=user_tz
        ).astimezone(utc)
        end_dt = datetime.datetime(
            end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=user_tz
        ).astimezone(utc)

        # Tasks that completed (entered 'done') within the window
        task_qs = Task.objects.filter(
            project_id=project_id,
            is_deleted=False,
            is_finished=True,
        )
        if board_id:
            task_qs = task_qs.filter(status__board_id=board_id)
        if assignee_id:
            task_qs = task_qs.filter(assignees__id=assignee_id)

        task_ids = list(task_qs.values_list("id", flat=True))
        if not task_ids:
            return cls._empty_response()

        # Group by task
        by_task: dict[str, list] = defaultdict(list)

        # Fetch transitions in chunks to avoid loading everything into RAM at once
        chunk_size = 1000
        for i in range(0, len(task_ids), chunk_size):
            chunk = task_ids[i : i + chunk_size]
            transitions_chunk = (
                TaskStatusTransition.objects.filter(task_id__in=chunk)
                .values("task_id", "to_status_code", "from_status_code", "transitioned_at")
                .order_by("task_id", "transitioned_at")
            )
            for tr in transitions_chunk.iterator(chunk_size=2000):
                by_task[str(tr["task_id"])].append(tr)

        task_details = list(
            task_qs.select_related("status").values(
                "id", "title", "created_at", "updated_at", "status__code", "status__name"
            )
        )

        rows = []
        lead_times_h: list[float] = []
        cycle_times_h: list[float] = []
        status_buckets: dict[str, list[float]] = defaultdict(list)  # code -> hours spent

        for task in task_details:
            tid = str(task["id"])
            transitions = by_task.get(tid, [])

            # Find first 'done' transition inside our window
            done_at = None
            for tr in transitions:
                if tr["to_status_code"].lower() == "done":
                    if start_dt <= tr["transitioned_at"] <= end_dt:
                        done_at = tr["transitioned_at"]
                        break

            # Fallback: if task is_finished but never physically moved to 'done' column, use updated_at
            if done_at is None:
                updated_at_utc = task["updated_at"]
                if start_dt <= updated_at_utc <= end_dt:
                    done_at = updated_at_utc
                else:
                    continue  # Completed outside window — skip

            created_at = task["created_at"]
            lead_seconds = (done_at - created_at).total_seconds()
            lead_hours = lead_seconds / 3600

            # Cycle time: from first non-todo transition to done
            active_start = None
            for tr in transitions:
                if tr["from_status_code"].lower() in ("todo", ""):
                    # Left todo for the first time
                    active_start = tr["transitioned_at"]
                    break
            if active_start is None:
                cycle_hours = lead_hours  # Fallback
            else:
                cycle_seconds = (done_at - active_start).total_seconds()
                cycle_hours = max(0.0, cycle_seconds / 3600)

            lead_times_h.append(lead_hours)
            cycle_times_h.append(cycle_hours)

            # Time spent in each status
            for i, tr in enumerate(transitions):
                if i + 1 < len(transitions):
                    next_tr = transitions[i + 1]
                    hours_in = (
                        next_tr["transitioned_at"] - tr["transitioned_at"]
                    ).total_seconds() / 3600
                    status_buckets[tr["to_status_code"]].append(max(0.0, hours_in))

            rows.append(
                {
                    "task_id": tid,
                    "title": task["title"],
                    "lead_time_hours": round(lead_hours, 1),
                    "cycle_time_hours": round(cycle_hours, 1),
                    "done_at": done_at.isoformat(),
                }
            )

        if not rows:
            return cls._empty_response()

        def _avg(lst):
            return round(sum(lst) / len(lst), 1) if lst else None

        def _percentile(lst, p):
            if not lst:
                return None
            s = sorted(lst)
            k = (len(s) - 1) * p / 100
            f, c = int(k), min(int(k) + 1, len(s) - 1)
            return round(s[f] + (s[c] - s[f]) * (k - f), 1)

        by_status = [
            {"status_code": code, "avg_hours_in_status": _avg(hours)}
            for code, hours in sorted(status_buckets.items())
        ]

        return {
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "task_count": len(rows),
            "avg_lead_time_hours": _avg(lead_times_h),
            "avg_cycle_time_hours": _avg(cycle_times_h),
            "p50_lead_time_hours": _percentile(lead_times_h, 50),
            "p95_lead_time_hours": _percentile(lead_times_h, 95),
            "p50_cycle_time_hours": _percentile(cycle_times_h, 50),
            "p95_cycle_time_hours": _percentile(cycle_times_h, 95),
            "by_status": by_status,
            "tasks": rows,
        }

    @staticmethod
    def _empty_response() -> dict:
        return {
            "period": None,
            "task_count": 0,
            "avg_lead_time_hours": None,
            "avg_cycle_time_hours": None,
            "p50_lead_time_hours": None,
            "p95_lead_time_hours": None,
            "p50_cycle_time_hours": None,
            "p95_cycle_time_hours": None,
            "by_status": [],
            "tasks": [],
        }
