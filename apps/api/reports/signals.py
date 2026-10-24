from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from attendance.models import Attendance, AttendanceSetting, TimeLog, TimeOffRequest
from organizations.models import OrganizationMembership, TeamMembership
from projects.models import Milestone, Project, ProjectMember
from tasks.models import AsyncStandup, Task


def _bump_version(version_key):
    """Atomically increment a version counter in cache.

    Uses add() + incr() instead of set() to be safe under concurrent
    invalidations: whichever caller wins the add() initialises the
    counter, every other concurrent caller increments it via incr().\n
    timeout=None is mandatory — the version key must never expire.
    If it did, cache.get() would fall back to the default (1), and
    stale v1-keyed dashboard data could be served silently.
    """
    if not cache.add(version_key, 2, timeout=None):
        try:
            cache.incr(version_key)
        except ValueError:
            # Key expired between add() and incr() — re-seed it
            cache.set(version_key, 2, timeout=None)


def _invalidate_employee(user_id):
    """Bump the version for all employee dashboard cache keys of this user."""
    if user_id:
        _bump_version(f"dashboard_version:emp:user_{user_id}")


def _invalidate_manager(user_id=None, team_id=None):
    """Bump version keys for manager dashboards.

    If team_id is given, bump that specific team and all managers leading it.
    If user_id is given, find all their teams and bump those versions too.
    """
    if team_id:
        _bump_version(f"dashboard_version:mgr:team_{team_id}")
        # Bump the aggregate cache for the leader of this team
        from organizations.models import Team

        team = Team.objects.filter(id=team_id).first()
        if team and team.leader_id:
            _bump_version(f"dashboard_version:mgr:user_{team.leader_id}")

    if user_id:
        # User might be an employee in several teams. Bump those teams' versions.
        teams = TeamMembership.objects.filter(user_id=user_id, is_deleted=False).values_list(
            "team_id", flat=True
        )
        for t_id in teams:
            _bump_version(f"dashboard_version:mgr:team_{t_id}")
            # Bump aggregate leader for these teams
            from organizations.models import Team

            team = Team.objects.filter(id=t_id).first()
            if team and team.leader_id:
                _bump_version(f"dashboard_version:mgr:user_{team.leader_id}")

        # Also bump the user's own aggregate view if they are a manager
        _bump_version(f"dashboard_version:mgr:user_{user_id}")


def _invalidate_executive(org_id):
    """Bump the version for executive dashboard cache keys of this org."""
    if org_id:
        _bump_version(f"dashboard_version:exec:org_{org_id}")


def _invalidate_manager_org(org_id):
    """Bump org-scoped manager dashboard cache keys.

    Used when org-level data changes (tasks, timelogs, membership, etc.)
    so admin/owner aggregate views without ``team_id`` are invalidated.
    """
    if org_id:
        _bump_version(f"dashboard_version:mgr:org_{org_id}")


@receiver([post_save, post_delete], sender=Task)
def invalidate_on_task_change(sender, instance, **kwargs):
    try:
        assignee_ids = list(instance.assignees.values_list("id", flat=True))
    except Exception:
        assignee_ids = []
    for uid in assignee_ids:
        _invalidate_employee(uid)
        _invalidate_manager(user_id=uid)

    if instance.project_id:
        project = Project.objects.filter(id=instance.project_id).first()
        if project:
            _invalidate_executive(project.organization_id)
            _invalidate_manager_org(project.organization_id)


@receiver([post_save, post_delete], sender=AsyncStandup)
def invalidate_on_standup_change(sender, instance, **kwargs):
    _invalidate_employee(instance.user_id)


@receiver([post_save, post_delete], sender=TimeLog)
def invalidate_on_timelog_change(sender, instance, **kwargs):
    _invalidate_employee(instance.user_id)
    _invalidate_manager(user_id=instance.user_id)

    if instance.project_id:
        project = Project.objects.filter(id=instance.project_id).first()
        if project:
            _invalidate_executive(project.organization_id)
            _invalidate_manager_org(project.organization_id)


@receiver([post_save, post_delete], sender=Attendance)
def invalidate_on_attendance_change(sender, instance, **kwargs):
    _invalidate_employee(instance.user_id)
    _invalidate_manager(user_id=instance.user_id)
    _invalidate_executive(instance.organization_id)
    _invalidate_manager_org(instance.organization_id)


@receiver([post_save, post_delete], sender=Project)
def invalidate_on_project_change(sender, instance, **kwargs):
    # This covers Soft Delete of a Project as requested
    _invalidate_executive(instance.organization_id)
    _invalidate_manager_org(instance.organization_id)

    # We should also invalidate employees and managers related to this project.
    # To be precise, any user allocated to this project:
    members = ProjectMember.objects.filter(project_id=instance.id).values_list("user_id", flat=True)
    for u_id in members:
        _invalidate_employee(u_id)
        _invalidate_manager(user_id=u_id)


@receiver([post_save, post_delete], sender=TeamMembership)
def invalidate_on_team_membership_change(sender, instance, **kwargs):
    _invalidate_employee(instance.user_id)
    _invalidate_manager(user_id=instance.user_id)
    _invalidate_manager(team_id=instance.team_id)


@receiver([post_save, post_delete], sender=Milestone)
def invalidate_on_milestone_change(sender, instance, **kwargs):
    """Milestone changes affect upcoming_milestones and project_health."""
    if instance.project_id:
        project = Project.objects.filter(id=instance.project_id).first()
        if project:
            _invalidate_executive(project.organization_id)
            # Also invalidate employee dashboards for members of the project
            member_ids = ProjectMember.objects.filter(project_id=instance.project_id).values_list(
                "user_id", flat=True
            )
            for u_id in member_ids:
                _invalidate_employee(u_id)


@receiver([post_save, post_delete], sender=ProjectMember)
def invalidate_on_project_member_change(sender, instance, **kwargs):
    """ProjectMember changes affect active_projects, project_summary, utilization."""
    if instance.user_id:
        _invalidate_employee(instance.user_id)
        _invalidate_manager(user_id=instance.user_id)

    if instance.project_id:
        project = Project.objects.filter(id=instance.project_id).first()
        if project:
            _invalidate_executive(project.organization_id)
            _invalidate_manager_org(project.organization_id)
            if project.owner_id:
                _bump_version(f"dashboard_version:mgr:user_{project.owner_id}")


@receiver([post_save, post_delete], sender=OrganizationMembership)
def invalidate_on_org_membership_change(sender, instance, **kwargs):
    """OrganizationMembership changes affect total_members and utilization."""
    _invalidate_executive(instance.organization_id)
    _invalidate_manager_org(instance.organization_id)
    # The member themselves may also have their own dashboard invalidated
    _invalidate_employee(instance.user_id)


@receiver([post_save, post_delete], sender=TimeOffRequest)
def invalidate_on_timeoff_change(sender, instance, **kwargs):
    """TimeOffRequest changes affect resource_utilization expected_seconds calculation."""
    _invalidate_executive(instance.organization_id)


@receiver([post_save, post_delete], sender=AttendanceSetting)
def invalidate_on_attendance_setting_change(sender, instance, **kwargs):
    """AttendanceSetting changes affect resource_utilization expected_daily_hours."""
    _invalidate_executive(instance.organization_id)
