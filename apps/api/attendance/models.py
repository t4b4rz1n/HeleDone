from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils.translation import gettext_lazy as _

from common.models import BaseModel


class AttendanceSetting(BaseModel):
    """Per-organization working hours configuration."""

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="attendance_setting",
    )
    expected_daily_hours = models.DecimalField(
        _("Expected Daily Working Hours"), max_digits=4, decimal_places=2, default=8.00
    )

    class Meta:
        verbose_name = _("Attendance Setting")
        verbose_name_plural = _("Attendance Settings")

    def __str__(self):
        return f"Settings for {self.organization}"


class Attendance(BaseModel):
    """Daily check-in/out records per user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendances"
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    date = models.DateField(_("Date"), db_index=True)
    check_in = models.DateTimeField(_("Check-in Time"), null=True, blank=True)
    check_out = models.DateTimeField(_("Check-out Time"), null=True, blank=True)
    is_remote = models.BooleanField(_("Is Remote Work"), default=False)
    overtime_minutes = models.PositiveIntegerField(_("Overtime Minutes"), default=0)
    timezone = models.CharField(_("Timezone"), max_length=50, default="UTC")

    class Meta:
        verbose_name = _("Attendance")
        verbose_name_plural = _("Attendances")
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                condition=Q(is_deleted=False),
                name="unique_daily_attendance",
            ),
            models.CheckConstraint(
                condition=Q(check_out__gte=F("check_in")) | Q(check_out__isnull=True),
                name="check_out_after_check_in",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "date"]),
            models.Index(fields=["organization", "date"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.date}"


class TimeLog(BaseModel):
    """Time tracking entries linked to tasks and projects."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_logs"
    )
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="time_logs",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="time_logs",
    )
    date = models.DateField(_("Date"), db_index=True)
    start_time = models.DateTimeField(_("Start Time"), db_index=True)
    end_time = models.DateTimeField(_("End Time"), null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(_("Duration in Seconds"), default=0)
    is_active = models.BooleanField(_("Is Active Timer"), default=True, db_index=True)
    description = models.TextField(_("Description"), blank=True)

    class Meta:
        verbose_name = _("Time Log")
        verbose_name_plural = _("Time Logs")
        ordering = ["-date", "-start_time"]
        indexes = [
            models.Index(fields=["user", "date"]),
            models.Index(fields=["task", "date"]),
            models.Index(fields=["project", "date"]),
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["task", "is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gte=F("start_time")) | Q(end_time__isnull=True),
                name="end_time_after_start_time",
            ),
            models.UniqueConstraint(
                fields=["user", "task"],
                condition=Q(is_active=True, is_deleted=False, task__isnull=False),
                name="unique_active_timer_per_user_task",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.start_time and not self.date:
            self.date = self.start_time.date()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} - Task: {self.task_id}"


class TimeOffRequest(BaseModel):
    """Leave, remote-work, and overtime requests."""

    class Type(models.TextChoices):
        VACATION = "vacation", _("Vacation")
        SICK = "sick", _("Sick Leave")
        HOURLY = "hourly", _("Hourly Leave")
        REMOTE = "remote", _("Remote Work Request")
        OVERTIME = "overtime", _("Overtime")

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="timeoff_requests",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="timeoff_requests",
    )
    request_type = models.CharField(_("Request Type"), max_length=20, choices=Type.choices)
    start_datetime = models.DateTimeField(_("Start Date/Time"))
    end_datetime = models.DateTimeField(_("End Date/Time"))
    reason = models.TextField(_("Reason"), blank=True)
    status = models.CharField(
        _("Status"),
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_timeoffs",
    )
    manager_note = models.TextField(_("Manager Note"), blank=True)

    class Meta:
        verbose_name = _("Time Off Request")
        verbose_name_plural = _("Time Off Requests")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["organization", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_datetime__gte=F("start_datetime")),
                name="end_datetime_after_start_datetime",
            )
        ]

    def __str__(self):
        return f"{self.user} - {self.request_type}"


class Holiday(BaseModel):
    """Official and organization-specific holidays."""

    name = models.CharField(_("Holiday Name"), max_length=255)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="holidays",
        null=True,
        blank=True,
    )
    description = models.TextField(_("Description"), blank=True)
    date = models.DateField(_("Date"), db_index=True)
    is_official = models.BooleanField(_("Is Official Holiday"), default=True)

    class Meta:
        verbose_name = _("Holiday")
        verbose_name_plural = _("Holidays")
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["date", "organization"], name="unique_holiday_org_date")
        ]

    def __str__(self):
        return f"{self.name} ({self.date})"


class AttendanceSession(BaseModel):
    """Individual time segments for a daily attendance."""

    attendance = models.ForeignKey(Attendance, on_delete=models.CASCADE, related_name="sessions")
    start_time = models.DateTimeField(_("Start Time"), db_index=True)
    end_time = models.DateTimeField(_("End Time"), null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(_("Duration in Seconds"), default=0)

    class Meta:
        verbose_name = _("Attendance Session")
        verbose_name_plural = _("Attendance Sessions")
        ordering = ["start_time"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gte=F("start_time")) | Q(end_time__isnull=True),
                name="attendance_session_end_after_start",
            )
        ]

    def __str__(self):
        return f"Session for {self.attendance} at {self.start_time}"
