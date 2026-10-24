import datetime
import threading

from django.db import transaction
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Attendance, AttendanceSetting, Holiday, TimeLog, TimeOffRequest

# Thread-local flag to prevent recursive start_timer → move_task → start_timer calls
_start_timer_local = threading.local()


class AttendanceService:
    @staticmethod
    @transaction.atomic
    def check_in(user, organization, timezone_str="UTC"):
        today = timezone.localdate()
        attendance, created = Attendance.objects.get_or_create(
            user=user,
            date=today,
            defaults={
                "organization": organization,
                "check_in": timezone.now(),
                "timezone": timezone_str,
            },
        )

        update_fields = []
        if not created and not attendance.check_in:
            attendance.check_in = timezone.now()
            update_fields.append("check_in")

        if attendance.timezone != timezone_str:
            attendance.timezone = timezone_str
            update_fields.append("timezone")

        if update_fields:
            attendance.save(update_fields=update_fields)

        # Check if there is an active session
        active_session = attendance.sessions.filter(end_time__isnull=True).first()
        if not active_session:
            from .models import AttendanceSession

            active_session = AttendanceSession.objects.create(
                attendance=attendance, start_time=timezone.now()
            )

            # Schedule the rollover task for exactly midnight in the user's timezone
            from datetime import time

            import pytz

            from .tasks import process_midnight_attendance_rollover

            try:
                user_tz = pytz.timezone(timezone_str)
            except Exception:
                user_tz = pytz.UTC

            now_in_user_tz = timezone.now().astimezone(user_tz)
            # Find midnight of *today* in user's timezone
            midnight_local = user_tz.localize(
                timezone.datetime.combine(now_in_user_tz.date(), time(23, 59, 59))
            )
            midnight_utc = midnight_local.astimezone(pytz.UTC)

            # Schedule task only if we haven't passed midnight yet and not in eager mode
            from django.conf import settings

            if timezone.now() < midnight_utc and not getattr(
                settings, "CELERY_TASK_ALWAYS_EAGER", False
            ):
                process_midnight_attendance_rollover.apply_async(
                    args=[attendance.id], eta=midnight_utc
                )

        return attendance, created

    @staticmethod
    @transaction.atomic
    def check_out(user):
        today = timezone.localdate()
        attendance = Attendance.objects.filter(user=user, date=today).first()
        if not attendance:
            raise ValidationError(_("No check-in record found for today."))

        active_session = attendance.sessions.filter(end_time__isnull=True).first()
        if not active_session:
            raise ValidationError(_("Already checked out or no active session."))

        now = timezone.now()
        active_session.end_time = now
        active_session.duration_seconds = int((now - active_session.start_time).total_seconds())
        active_session.save(update_fields=["end_time", "duration_seconds"])

        attendance.check_out = now

        # Stop any active timers
        active_timers = TimeLogService.get_active_timers(user)
        for active_timer in active_timers:
            TimeLogService.stop_timer(user, active_timer.id, auto_move=False)

        # Auto calculate overtime if setting exists
        setting = AttendanceSetting.objects.filter(organization=attendance.organization).first()
        if setting and attendance.check_in:
            # Re-calculate based on total session durations?
            # Or just check_out - check_in? Actually we should use sum of session durations.
            total_duration_seconds = (
                attendance.sessions.aggregate(total=Sum("duration_seconds"))["total"] or 0
            )
            duration_hours = total_duration_seconds / 3600.0
            expected = float(setting.expected_daily_hours)
            if duration_hours > expected:
                attendance.overtime_minutes = int((duration_hours - expected) * 60)
            else:
                attendance.overtime_minutes = 0

        attendance.save(update_fields=["check_out", "overtime_minutes"])
        return attendance

    @staticmethod
    def get_today_attendance(user):
        return Attendance.objects.filter(user=user, date=timezone.localdate()).first()

    @staticmethod
    def get_user_attendance(user, start_date, end_date):
        return Attendance.objects.select_related("user", "organization").filter(
            user=user, date__range=(start_date, end_date)
        )

    @staticmethod
    @transaction.atomic
    def save_manual_attendance(user, data, instance=None):
        if instance:
            for attr, value in data.items():
                setattr(instance, attr, value)
        else:
            instance = Attendance(user=user, **data)

        # Recalculate overtime
        if instance.check_in and instance.check_out:
            setting = AttendanceSetting.objects.filter(organization=instance.organization).first()
            if setting:
                total_duration_seconds = 0
                if instance.pk:
                    total_duration_seconds = (
                        instance.sessions.aggregate(total=Sum("duration_seconds"))["total"] or 0
                    )

                if total_duration_seconds == 0:
                    total_duration_seconds = (
                        instance.check_out - instance.check_in
                    ).total_seconds()

                duration_hours = total_duration_seconds / 3600.0
                expected = float(setting.expected_daily_hours)
                if duration_hours > expected:
                    instance.overtime_minutes = int((duration_hours - expected) * 60)
                else:
                    instance.overtime_minutes = 0

        instance.save()
        return instance


class TimeLogService:
    @staticmethod
    @transaction.atomic
    def start_timer(user, task):
        # Permission check: Assignee, Superuser/Staff, Project Owner, or user with project.manage permission can start timer
        can_start = False
        if (
            task.assignees.filter(id=user.id).exists()
            or getattr(task, "reporter", None) == user
            or getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
        ):
            can_start = True
        elif task.project:
            if task.project.owner_id == user.id or (
                task.project.organization and task.project.organization.owner_id == user.id
            ):
                can_start = True
            else:
                from organizations.services import PermissionService

                # Use PermissionService: project.manage or attendance.view_all
                can_start = PermissionService.has_permission(
                    user=user,
                    permission_code="project.manage",
                    organization_id=str(task.project.organization_id),
                ) or PermissionService.has_permission(
                    user=user,
                    permission_code="attendance.view_all",
                    organization_id=str(task.project.organization_id),
                )

        if not can_start:
            raise PermissionDenied(
                _(
                    "You can only start a timer for tasks assigned to or created by you, or if you are a project lead/admin."
                )
            )

        # Org isolation check
        if task.project and task.project.organization_id:
            if not user.is_staff and not user.is_superuser:
                is_member = user.org_memberships.filter(
                    organization_id=task.project.organization_id
                ).exists()
                if not is_member:
                    raise PermissionDenied(_("You are not a member of this organization."))

        # Prevent duplicate active timers for the exact same task
        from rest_framework.exceptions import ValidationError

        from attendance.models import TimeLog

        if TimeLog.objects.filter(user=user, task=task, is_active=True).exists():
            raise ValidationError(_("A timer is already running for this task."))

        # Guard against re-entrant calls (move_task → start_timer loop)
        if getattr(_start_timer_local, "in_start_timer", False):
            return None

        now = timezone.now()
        timer = TimeLog.objects.create(
            user=user,
            task=task,
            project=task.project,
            date=now.date(),
            start_time=now,
            is_active=True,
        )

        # Auto-move task to the IN_PROGRESS status ONLY if it's currently in a TODO status
        from tasks.models import TaskStatus as TS

        if task.status and task.status.category == TS.Category.TODO:
            doing_status = (
                TS.objects.filter(
                    board=task.status.board,
                    category=TS.Category.IN_PROGRESS,
                    is_deleted=False,
                )
                .order_by("order")
                .first()
            )
            if doing_status:
                _start_timer_local.in_start_timer = True
                try:
                    from tasks.services import TaskService

                    TaskService.move_task(task, user, new_status=doing_status)
                finally:
                    _start_timer_local.in_start_timer = False

        # Log activity
        from projects.models import ProjectActivity

        if task.status and task.status.board and task.status.board.project:
            ProjectActivity.objects.create(
                project=task.status.board.project,
                event_type=ProjectActivity.EventType.TASK_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(task.id),
                actor=user,
                metadata={"action": "Started time tracking timer"},
            )

        return timer

    @staticmethod
    def _inject_to_standup(timer, is_manual=False):
        """
        Inject non-overlapping duration of stopped timer into the user's AsyncStandup.
        Splits by midnight to handle cross-day work safely.
        For manual timers, it entirely applies to the date of the timer's end_time.
        """
        if not timer.task or not timer.task.project:
            return

        import decimal
        from datetime import timedelta

        from tasks.models import AsyncStandup

        if is_manual:
            target_date = (
                timezone.localtime(timer.end_time).date()
                if timer.end_time
                else timezone.localdate()
            )
            hours = decimal.Decimal(str(round(timer.duration_seconds / 3600.0, 2)))
            if hours > 0:
                standup, _ = AsyncStandup.objects.get_or_create(
                    user=timer.user,
                    project=timer.task.project,
                    date=target_date,
                )
                new_hours = min(decimal.Decimal("24.00"), standup.hours_worked + hours)
                standup.hours_worked = new_hours
                standup.is_complete = False
                standup.save(update_fields=["hours_worked", "is_complete"])
            return

        start_time = timer.start_time
        end_time = timer.end_time or timezone.now()

        # 1. Split into daily chunks based on local timezone midnights
        chunks = []
        current = timezone.localtime(start_time)
        end_local = timezone.localtime(end_time)

        while current < end_local:
            next_midnight = (current + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            chunk_end = min(end_local, next_midnight)
            chunks.append((current, chunk_end))
            current = next_midnight

        for chunk_start, chunk_end in chunks:
            chunk_date = chunk_start.date()

            # 2. Find OTHER timelogs for this user that have priority over this timer.
            # Priority rule: A timer only subtracts overlaps with timers that started earlier.
            from django.db.models import Q

            from attendance.models import TimeLog

            other_logs = TimeLog.objects.filter(
                Q(start_time__lt=timer.start_time)
                | Q(start_time=timer.start_time, id__lt=timer.id),
                user=timer.user,
                is_deleted=False,
            )

            other_intervals = []
            for log in other_logs:
                log_start = timezone.localtime(log.start_time)
                # Active timers effectively end now()
                log_end = (
                    timezone.localtime(log.end_time)
                    if log.end_time
                    else timezone.localtime(timezone.now())
                )

                if log_start < chunk_end and log_end > chunk_start:
                    other_intervals.append((log_start, log_end))

            # 3. Calculate interval union to find non-overlapping duration
            clipped = []
            for s, e in other_intervals:
                s_clip = max(s, chunk_start)
                e_clip = min(e, chunk_end)
                if s_clip < e_clip:
                    clipped.append((s_clip, e_clip))

            if not clipped:
                non_overlap_duration = (chunk_end - chunk_start).total_seconds()
            else:
                clipped.sort(key=lambda x: x[0])
                merged = []
                for s, e in clipped:
                    if not merged:
                        merged.append([s, e])
                    else:
                        last_s, last_e = merged[-1]
                        if s <= last_e:
                            merged[-1][1] = max(last_e, e)
                        else:
                            merged.append([s, e])

                covered_duration = sum((e - s).total_seconds() for s, e in merged)
                non_overlap_duration = (chunk_end - chunk_start).total_seconds() - covered_duration

            # 4. Inject into AsyncStandup
            if non_overlap_duration > 0:
                hours = decimal.Decimal(str(round(non_overlap_duration / 3600.0, 2)))
                if hours > 0:
                    standup, created = AsyncStandup.objects.get_or_create(
                        user=timer.user,
                        project=timer.task.project,
                        date=chunk_date,
                    )
                    new_hours = min(decimal.Decimal("24.00"), standup.hours_worked + hours)
                    standup.hours_worked = new_hours
                    standup.is_complete = False
                    standup.save(update_fields=["hours_worked", "is_complete"])

    @staticmethod
    @transaction.atomic
    def stop_timer(user, log_id, auto_move=True):
        timer = (
            TimeLog.objects.select_related("task", "task__status", "task__project")
            .filter(id=log_id, user=user, is_active=True)
            .first()
        )
        if not timer:
            raise ValidationError(_("Timer not found or already stopped."))

        timer.end_time = timezone.now()
        timer.duration_seconds = int((timer.end_time - timer.start_time).total_seconds())
        timer.is_active = False
        timer.save(update_fields=["end_time", "duration_seconds", "is_active"])

        # Use F() expression to avoid Race Condition on concurrent timer stops
        from tasks.models import Task

        Task.objects.filter(pk=timer.task_id).update(
            spent_hours=F("spent_hours") + timer.duration_seconds / 3600.0
        )

        # Log activity
        from projects.models import ProjectActivity

        if timer.task.status and timer.task.status.board and timer.task.status.board.project:
            ProjectActivity.objects.create(
                project=timer.task.status.board.project,
                event_type=ProjectActivity.EventType.TASK_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(timer.task.id),
                actor=user,
                metadata={"action": f"Stopped timer after {timer.duration_seconds} seconds"},
            )

        # auto_move=True means this is a system-triggered stop (e.g., user manually stops timer).
        # auto_move=False means the task was dragged to Review/Done → no need to move again.
        from tasks.models import TaskStatus as TS

        if (
            auto_move
            and timer.task.status
            and timer.task.status.category == TS.Category.IN_PROGRESS
        ):
            review_status = (
                TS.objects.filter(
                    board=timer.task.status.board,
                    category=TS.Category.REVIEW,
                    is_deleted=False,
                )
                .order_by("order")
                .first()
            )
            if review_status:
                from tasks.services import TaskService

                timer.task.refresh_from_db()
                TaskService.move_task(timer.task, user, new_status=review_status)

        # Auto-inject into Standup
        TimeLogService._inject_to_standup(timer)

        return timer

    @staticmethod
    @transaction.atomic
    def create_manual_log(user, task, start_time, end_time, description=""):
        # Anti-fraud check: only assignees or superuser can log time manually for a task
        if not task.assignees.filter(id=user.id).exists() and not user.is_superuser:
            # We can also check if user has project permissions, but superuser/assignee is safe for now
            from projects.models import ProjectMember

            is_manager = (
                task.project.owner == user
                or ProjectMember.objects.filter(
                    project=task.project, user=user, is_active=True
                ).exists()
            )
            if not is_manager:
                raise PermissionDenied(_("You do not have permission to log time for this task."))

        duration_seconds = int((end_time - start_time).total_seconds())
        if duration_seconds < 0:
            raise ValidationError(_("End time must be after start time."))

        log = TimeLog.objects.create(
            user=user,
            task=task,
            project=task.project,
            date=start_time.date(),
            start_time=start_time,
            end_time=end_time,
            duration_seconds=duration_seconds,
            is_active=False,
            description=description,
        )
        # Use F() to avoid Race Condition
        from tasks.models import Task

        Task.objects.filter(pk=task.pk).update(
            spent_hours=F("spent_hours") + duration_seconds / 3600.0
        )

        # Auto-inject manual time logs into AsyncStandup
        TimeLogService._inject_to_standup(log, is_manual=True)

        return log

    @staticmethod
    def get_active_timer(user):
        return TimeLog.objects.filter(user=user, is_active=True).first()

    @staticmethod
    def get_active_timers(user):
        return TimeLog.objects.filter(user=user, is_active=True)

    @staticmethod
    @transaction.atomic
    def cancel_timer(user, log_id):
        timer = TimeLog.objects.select_related("task").filter(id=log_id, user=user).first()
        if not timer:
            raise ValidationError(_("Time log not found."))

        # Revert task spent_hours if the timer had already been stopped (has duration)
        if not timer.is_active and timer.duration_seconds:
            from tasks.models import Task

            Task.objects.filter(pk=timer.task_id).update(
                spent_hours=F("spent_hours") - timer.duration_seconds / 3600.0
            )

        timer.is_deleted = True
        timer.is_active = False
        timer.duration_seconds = 0
        timer.save(update_fields=["is_deleted", "is_active", "duration_seconds"])
        return timer


class TimeOffRequestService:
    @staticmethod
    @transaction.atomic
    def create_request(user, organization, request_type, start_dt, end_dt, reason=""):
        return TimeOffRequest.objects.create(
            user=user,
            organization=organization,
            request_type=request_type,
            start_datetime=start_dt,
            end_datetime=end_dt,
            reason=reason,
        )

    @staticmethod
    @transaction.atomic
    def approve(request_id, manager):
        req = get_object_or_404(TimeOffRequest, id=request_id)

        # Check permissions explicitly in service using PermissionService
        if not manager.is_staff and not manager.is_superuser:
            from organizations.services import PermissionService

            if not PermissionService.has_permission(
                manager, "leave.approve", str(req.organization_id)
            ):
                raise PermissionDenied(
                    _("You do not have permission to approve requests in this organization.")
                )

        if req.status != TimeOffRequest.Status.PENDING:
            raise ValidationError(_("Only pending requests can be approved."))
        req.status = TimeOffRequest.Status.APPROVED
        req.approved_by = manager
        req.save(update_fields=["status", "approved_by"])
        return req

    @staticmethod
    @transaction.atomic
    def reject(request_id, manager, note=""):
        req = get_object_or_404(TimeOffRequest, id=request_id)

        # Check permissions explicitly in service using PermissionService
        if not manager.is_staff and not manager.is_superuser:
            from organizations.services import PermissionService

            if not PermissionService.has_permission(
                manager, "leave.approve", str(req.organization_id)
            ):
                raise PermissionDenied(
                    _("You do not have permission to reject requests in this organization.")
                )

        if req.status != TimeOffRequest.Status.PENDING:
            raise ValidationError(_("Only pending requests can be rejected."))
        req.status = TimeOffRequest.Status.REJECTED
        req.manager_note = note
        req.save(update_fields=["status", "manager_note"])
        return req

    @staticmethod
    @transaction.atomic
    def cancel(user, request_id):
        req = get_object_or_404(TimeOffRequest, id=request_id, user=user)
        if req.status != TimeOffRequest.Status.PENDING:
            raise ValidationError(_("Only pending requests can be cancelled."))
        req.is_deleted = True
        req.save(update_fields=["is_deleted"])
        return req

    @staticmethod
    def get_pending_requests(organization):
        return TimeOffRequest.objects.filter(
            organization=organization, status=TimeOffRequest.Status.PENDING
        )


class HolidayService:
    @staticmethod
    def create(name, date, organization, description="", is_official=True):
        return Holiday.objects.create(
            name=name,
            date=date,
            organization=organization,
            description=description,
            is_official=is_official,
        )

    @staticmethod
    def get_year_holidays(year):
        return Holiday.objects.filter(date__year=year)


class TimesheetService:
    @staticmethod
    def _aggregate(qs):
        return qs.values("date").annotate(total_seconds=Sum("duration_seconds")).order_by("date")

    @staticmethod
    def get_daily(user, date):
        return TimeLog.objects.filter(user=user, date=date, is_deleted=False).aggregate(
            total_seconds=Sum("duration_seconds")
        )

    @staticmethod
    def get_weekly(user, week_start_date):
        week_end_date = week_start_date + datetime.timedelta(days=6)
        qs = TimeLog.objects.filter(
            user=user,
            date__range=(week_start_date, week_end_date),
            is_deleted=False,
        )
        return TimesheetService._aggregate(qs)

    @staticmethod
    def get_monthly(user, year, month):
        qs = TimeLog.objects.filter(user=user, date__year=year, date__month=month, is_deleted=False)
        return TimesheetService._aggregate(qs)

    @staticmethod
    def get_team_timesheet(manager, organization, start_date, end_date):
        from django.db.models import Q

        from organizations.models import OrganizationMembership

        # Check if the manager is an admin/owner or has view_all permissions for this org
        is_org_admin = (
            OrganizationMembership.objects.filter(
                user=manager,
                organization_id=organization,
                is_deleted=False,
            )
            .filter(
                Q(dynamic_roles__permissions__code__in=["attendance.view_all", "report.view"])
                | Q(role__in=[OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN])
            )
            .exists()
        )

        if is_org_admin:
            # Admins see everyone in the organization
            qs = TimeLog.objects.filter(
                user__org_memberships__organization=organization,
                user__org_memberships__is_deleted=False,
                task__project__organization=organization,
                date__range=(start_date, end_date),
                is_deleted=False,
            ).distinct()
        else:
            # Regular team leads only see their managed teams
            managed_teams = list(
                manager.led_teams.filter(organization=organization).values_list("id", flat=True)
            )
            qs = TimeLog.objects.filter(
                user__team_memberships__team_id__in=managed_teams,
                task__project__organization=organization,
                date__range=(start_date, end_date),
                is_deleted=False,
            ).distinct()

        return (
            qs.values("user__username", "date")
            .annotate(total_seconds=Sum("duration_seconds"))
            .order_by("user__username", "date")
        )

    @staticmethod
    def get_project_timesheet(project, start_date, end_date):
        qs = TimeLog.objects.filter(project=project, date__range=(start_date, end_date))
        return (
            qs.values("user__username", "date")
            .annotate(total_seconds=Sum("duration_seconds"))
            .order_by("user__username", "date")
        )
