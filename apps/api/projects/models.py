from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from common.models import BaseModel


class Project(BaseModel):
    """The planning container for a project's members, resource allocation, capacity, and milestones."""

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        ACTIVE = "active", _("Active")
        ON_HOLD = "on_hold", _("On hold")
        COMPLETED = "completed", _("Completed")
        ARCHIVED = "archived", _("Archived")

    class ProgressMode(models.TextChoices):
        TASK_BASED = "task_based", _("Task-based")
        MILESTONE_BASED = "milestone_based", _("Milestone-based")

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="projects",
        verbose_name=_("Organization"),
        db_index=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="owned_projects",
        verbose_name=_("Owner"),
        null=True,
        blank=True,
        db_index=True,
    )

    name = models.CharField(_("Name"), max_length=255)
    description = models.TextField(_("Description"), blank=True)
    prefix = models.CharField(
        _("Key Prefix"),
        max_length=10,
        blank=True,
        null=True,
        db_index=True,
        help_text=_("Short identifier for tasks (e.g., MAD)"),
    )
    budget = models.DecimalField(
        _("Budget"),
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    budget_currency = models.CharField(_("Budget currency"), max_length=10, default="IRR")
    status = models.CharField(
        _("Status"),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    start_date = models.DateField(
        _("Start date"),
        null=True,
        blank=True,
        help_text=_("The date when the project officially begins."),
    )
    deadline = models.DateField(
        _("Deadline"),
        null=True,
        blank=True,
        help_text=_("The absolute final date for project completion."),
    )
    completed_at = models.DateTimeField(_("Completed at"), null=True, blank=True)
    archived_at = models.DateTimeField(_("Archived at"), null=True, blank=True)
    color = models.CharField(
        _("Color"),
        max_length=20,
        blank=True,
        default="",
        help_text=_("Hex color code for project accent (e.g., #6366f1)"),
    )
    progress_mode = models.CharField(
        _("Progress mode"),
        max_length=20,
        choices=ProgressMode.choices,
        default=ProgressMode.TASK_BASED,
        db_index=True,
        help_text=_(
            "Controls how project progress percentage is calculated. "
            "'task_based': progress = completed tasks / total tasks. "
            "'milestone_based': progress = completed milestone weight / total weight."
        ),
    )

    class Meta:
        verbose_name = _("Project")
        verbose_name_plural = _("Projects")
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["organization", "status"], name="project_org_status_idx"),
            models.Index(fields=["owner", "status"], name="project_owner_status_idx"),
            models.Index(fields=["status", "deadline"], name="project_status_deadline_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(deadline__isnull=True)
                | Q(start_date__isnull=True)
                | Q(deadline__gte=models.F("start_date")),
                name="project_deadline_after_start_date",
            ),
            models.UniqueConstraint(
                fields=["organization", "prefix"],
                condition=Q(prefix__isnull=False),
                name="unique_project_prefix_per_org",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.prefix and self.name:
            import re

            base_prefix = re.sub(r"[^A-Z0-9]", "", self.name.upper())[:4]
            if not base_prefix:
                base_prefix = "PRJ"

            prefix = base_prefix
            counter = 1
            while (
                Project.all_objects.filter(organization_id=self.organization_id, prefix=prefix)
                .exclude(id=self.id)
                .exists()
            ):
                prefix = f"{base_prefix[:3]}{counter}"
                counter += 1
            self.prefix = prefix

        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ProjectMember(BaseModel):
    """Resource Allocation: Assigning users/resources to a project based on specialty and capacity allocation."""

    class SalaryType(models.TextChoices):
        MONTHLY = "monthly", _("Monthly")
        HOURLY = "hourly", _("Hourly")

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="members",
        verbose_name=_("Project"),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="project_memberships",
        verbose_name=_("User"),
        null=True,
        blank=True,
        db_index=True,
    )
    team = models.ForeignKey(
        "organizations.Team",
        on_delete=models.SET_NULL,
        related_name="project_memberships",
        verbose_name=_("Team"),
        null=True,
        blank=True,
        db_index=True,
    )
    specialty = models.CharField(
        _("Specialty"),
        max_length=100,
        blank=True,
        help_text=_("Specialty/Skill, e.g., Frontend, UI/UX"),
    )
    allocation_percentage = models.PositiveSmallIntegerField(
        _("Allocation percentage"),
        default=100,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text=_("Percentage of user's work capacity dedicated to this project (1-100%)"),
    )
    allocation_start_date = models.DateField(
        _("Allocation start date"),
        null=True,
        blank=True,
        help_text=_(
            "When this member starts working on the project. May differ from the project start date."
        ),
    )
    allocation_end_date = models.DateField(
        _("Allocation end date"),
        null=True,
        blank=True,
        help_text=_(
            "When this member stops working on the project. May differ from the project deadline."
        ),
    )
    is_active = models.BooleanField(_("Is active"), default=True, db_index=True)

    class Meta:
        verbose_name = _("Project Member")
        verbose_name_plural = _("Project Members")
        ordering = ["project", models.F("user").asc(nulls_last=True)]
        indexes = [models.Index(fields=["user", "is_active"], name="member_user_active_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user"],
                condition=Q(is_deleted=False),
                name="unique_active_project_member",
            ),
            models.UniqueConstraint(
                fields=["project", "team"],
                condition=Q(is_deleted=False, user__isnull=True),
                name="unique_active_project_team",
            ),
            models.CheckConstraint(
                condition=Q(allocation_end_date__isnull=True)
                | Q(allocation_start_date__isnull=True)
                | Q(allocation_end_date__gte=models.F("allocation_start_date")),
                name="member_allocation_end_after_start",
            ),
        ]

    def __str__(self):
        project_name = self.project.name if getattr(self, "project", None) else _("No project")
        identity = self.user or self.team or _("Unassigned")
        return f"{project_name} — {identity} ({self.allocation_percentage}%)"


class Milestone(BaseModel):
    """A project's major phase, objective, or key delivery point."""

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        IN_PROGRESS = "in_progress", _("In progress")
        COMPLETED = "completed", _("Completed")
        CANCELLED = "cancelled", _("Cancelled")

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="milestones",
        verbose_name=_("Project"),
    )
    title = models.CharField(_("Title"), max_length=255)
    description = models.TextField(_("Description"), blank=True)
    status = models.CharField(
        _("Status"),
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    start_date = models.DateField(
        _("Start date"),
        null=True,
        blank=True,
        help_text=_("When work on this milestone begins."),
    )
    target_date = models.DateField(
        _("Target date"),
        help_text=_("The expected completion date for this milestone."),
    )
    completed_at = models.DateTimeField(_("Completed at"), null=True, blank=True)
    sequence = models.PositiveSmallIntegerField(
        _("Sequence"), default=0, help_text=_("Phase order")
    )
    weight = models.PositiveSmallIntegerField(
        _("Weight"),
        default=1,
        help_text=_(
            "Weight/Percentage of this milestone in overall project progress (e.g. 1 to 100)"
        ),
    )

    class Meta:
        verbose_name = _("Milestone")
        verbose_name_plural = _("Milestones")
        ordering = ["target_date", "sequence"]
        indexes = [
            models.Index(
                fields=["project", "status", "target_date"],
                name="milestone_proj_status_date_idx",
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(start_date__isnull=True) | Q(target_date__gte=models.F("start_date")),
                name="milestone_target_after_start",
            )
        ]

    def __str__(self):
        return f"{self.project.name} – {self.title}"


class ProjectActivity(BaseModel):
    """Live timeline feed for all project events, task completions, and internal changes."""

    class EventType(models.TextChoices):
        PROJECT_CREATED = "project_created", _("Project created")
        PROJECT_UPDATED = "project_updated", _("Project updated")
        PROJECT_DELETED = "project_deleted", _("Project deleted")
        MEMBER_ADDED = "member_added", _("Member added")
        MEMBER_UPDATED = "member_updated", _("Member updated")
        MEMBER_REMOVED = "member_removed", _("Member removed")
        MILESTONE_CREATED = "milestone_created", _("Milestone created")
        MILESTONE_UPDATED = "milestone_updated", _("Milestone updated")
        MILESTONE_COMPLETED = "milestone_completed", _("Milestone completed")
        MILESTONE_DELETED = "milestone_deleted", _("Milestone deleted")
        BOARD_CREATED = "board_created", _("Board created")
        BOARD_UPDATED = "board_updated", _("Board updated")
        BOARD_DELETED = "board_deleted", _("Board deleted")
        STATUS_ADDED = "status_added", _("Status added")
        STATUS_REMOVED = "status_removed", _("Status removed")
        TASK_CREATED = "task_created", _("Task created")
        TASK_UPDATED = "task_updated", _("Task updated")
        TASK_COMPLETED = "task_completed", _("Task completed")
        TASK_DELETED = "task_deleted", _("Task deleted")
        TASK_COMMENT_ADDED = "task_comment_added", _("Task comment added")
        TASK_CHECKLIST_UPDATED = "task_checklist_updated", _("Task checklist updated")

    class EntityType(models.TextChoices):
        PROJECT = "project", _("Project")
        MEMBER = "member", _("Member")
        MILESTONE = "milestone", _("Milestone")
        BOARD = "board", _("Board")
        TASK = "task", _("Task")

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name=_("Project"),
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="project_activities",
        verbose_name=_("Actor"),
        null=True,
        blank=True,
        db_index=True,
    )
    event_type = models.CharField(_("Event type"), max_length=30, choices=EventType.choices)
    entity_type = models.CharField(_("Entity type"), max_length=20, choices=EntityType.choices)
    entity_id = models.CharField(
        _("Entity ID"), max_length=255, null=True, blank=True, db_index=True
    )
    metadata = models.JSONField(_("Metadata"), default=dict, blank=True)

    class Meta:
        verbose_name = _("Project Activity")
        verbose_name_plural = _("Project Activities")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "created_at"], name="activity_project_created_idx"),
            models.Index(fields=["project", "event_type"], name="activity_project_event_idx"),
        ]

    def __str__(self):
        return f"{self.project.name} — {self.get_event_type_display()}"
