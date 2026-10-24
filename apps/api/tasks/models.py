import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import (
    FileExtensionValidator,
    MinValueValidator,
)
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from common.models import BaseModel

logger = logging.getLogger(__name__)


def validate_file_size(value):
    filesize = value.size
    if filesize > 10 * 1024 * 1024:
        raise ValidationError(_("The maximum file size that can be uploaded is 10MB"))


class Board(BaseModel):
    """Kanban Board for a project."""

    title = models.CharField(_("Board Title"), max_length=255)
    description = models.TextField(_("Description"), blank=True, null=True)
    background_color = models.CharField(
        _("Background Color"), max_length=50, blank=True, null=True, default="#6366f1"
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="boards",
        verbose_name=_("Project"),
        null=False,
        blank=False,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="boards",
        verbose_name=_("Created By"),
        null=True,
        blank=True,
    )
    order = models.PositiveIntegerField(_("Order"), default=0)

    class Meta:
        verbose_name = _("Board")
        verbose_name_plural = _("Boards")
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.title


class TaskStatus(BaseModel):
    """
    Customizable task status per board (Acts as Kanban Column).
    Each board gets default statuses on creation;
    users can add, remove, and reorder statuses freely per board.
    """

    class Category(models.TextChoices):
        TODO = "todo", _("To Do")
        IN_PROGRESS = "in_progress", _("In Progress")
        REVIEW = "review", _("Review")
        DONE = "done", _("Done")

    board = models.ForeignKey(
        Board,
        on_delete=models.CASCADE,
        related_name="statuses",
        verbose_name=_("Board"),
        db_index=True,
    )
    code = models.SlugField(
        _("Code"),
        max_length=50,
        allow_unicode=True,
        help_text=_("Identifier for the status (e.g., 'todo', 'doing', 'review')"),
    )
    name = models.CharField(
        _("Name"),
        max_length=100,
        help_text=_("Display name for the status (e.g., 'To Do', 'Doing', 'Review')"),
    )
    category = models.CharField(
        _("Category"),
        max_length=20,
        choices=Category.choices,
        default=Category.TODO,
        help_text=_("Defines the logical behavior of this status (e.g., auto-start timer)"),
    )
    order = models.PositiveIntegerField(
        _("Order"),
        default=0,
        help_text=_("Order in Kanban board columns"),
    )

    class Meta:
        verbose_name = _("Task Status")
        verbose_name_plural = _("Task Statuses")
        ordering = ["order", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["board", "code"],
                name="unique_status_code_per_board",
            )
        ]

    def __str__(self):
        if self.board_id:
            try:
                return f"{self.board.title} - {self.name}"
            except Exception:
                pass
        return self.name


class Task(BaseModel):
    """Primary task model."""

    class Priority(models.TextChoices):
        LOW = "low", _("Low")
        MEDIUM = "medium", _("Medium")
        HIGH = "high", _("High")
        CRITICAL = "critical", _("Critical")

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="tasks",
        verbose_name=_("Project"),
        null=False,
        blank=False,
    )
    milestone = models.ForeignKey(
        "projects.Milestone",
        on_delete=models.SET_NULL,
        related_name="tasks",
        verbose_name=_("Milestone"),
        null=True,
        blank=True,
    )
    title = models.CharField(_("Title"), max_length=255)
    description = models.TextField(_("Description"), blank=True, null=True)
    status = models.ForeignKey(
        TaskStatus,
        on_delete=models.PROTECT,
        related_name="tasks",
        verbose_name=_("Status"),
    )
    priority = models.CharField(
        _("Priority"),
        max_length=20,
        choices=Priority.choices,
        default=Priority.LOW,
    )
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="assigned_tasks",
        verbose_name=_("Assignees"),
        blank=True,
    )

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="reported_tasks",
        verbose_name=_("Reporter"),
        null=True,
        blank=True,
    )
    due_date = models.DateTimeField(_("Due date"), null=True, blank=True, db_index=True)
    progress_cache = models.DecimalField(
        _("Progress Percent"), max_digits=5, decimal_places=2, default=0
    )
    estimated_hours = models.DecimalField(
        _("Estimated Hours"), max_digits=10, decimal_places=2, null=True, blank=True
    )
    spent_hours = models.DecimalField(
        _("Spent Hours"),
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=_("Hours logged by the assignee"),
    )
    parent_task = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="subtasks",
        verbose_name=_("Parent Task"),
        null=True,
        blank=True,
    )
    order = models.PositiveIntegerField(_("Kanban Order"), default=0)
    is_finished = models.BooleanField(_("Is Finished"), default=False, db_index=True)
    number = models.PositiveIntegerField(_("Task Number"), null=True, blank=True, db_index=True)
    is_blocked = models.BooleanField(_("Is Blocked"), default=False, db_index=True)

    class Meta:
        verbose_name = _("Task")
        verbose_name_plural = _("Tasks")
        ordering = ["order", "-created_at"]
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["status", "priority"]),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=["project", "number"],
                condition=Q(number__isnull=False),
                name="unique_task_number_per_project",
            )
        ]

    def __str__(self):
        if self.status_id:
            try:
                return f"{self.title} [{self.status.name}]"
            except Exception:
                pass
        return self.title

    def clean(self):
        super().clean()
        if self.status_id and self.project_id:
            try:
                if self.status.board and self.status.board.project_id != self.project_id:
                    from django.core.exceptions import ValidationError

                    raise ValidationError(
                        {"status": _("Status must belong to a board in the same project.")}
                    )
            except Exception:
                pass

    def __init__(self, *args, **kwargs):
        initial_assignee = kwargs.pop("assignee", None)
        super().__init__(*args, **kwargs)
        if initial_assignee is not None:
            self._initial_assignee = initial_assignee

    @property
    def assignee(self):
        """Returns the first assignee for backward compatibility."""
        return self.assignees.first()

    @assignee.setter
    def assignee(self, value):
        if self.pk:
            if value is None:
                self.assignees.clear()
            else:
                self.assignees.set([value])
        else:
            self._initial_assignee = value

    @property
    def assignee_id(self):
        """Returns the first assignee's ID for backward compatibility."""
        first = self.assignees.first()
        return first.id if first else None

    def _sync_initial_assignee(self):
        if hasattr(self, "_initial_assignee"):
            if self._initial_assignee:
                self.assignees.set([self._initial_assignee])
            else:
                self.assignees.clear()
            del self._initial_assignee

    def save(self, *args, **kwargs):
        if not self.number and self.project_id:
            import time

            from django.db import IntegrityError, transaction
            from django.db.models import Max

            # Retry loop for lock contention
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    with transaction.atomic():
                        # We lock the project only to ensure sequential task numbering.
                        # We use select_for_update to serialize creations.
                        from projects.models import Project

                        project = Project.objects.select_for_update().get(id=self.project_id)
                        max_num = (
                            Task.all_objects.filter(project=project).aggregate(Max("number"))[
                                "number__max"
                            ]
                            or 0
                        )
                        self.number = max_num + 1
                        super().save(*args, **kwargs)
                        self._sync_initial_assignee()
                        return  # Success, exit loop and function
                except (IntegrityError, Exception) as e:
                    # Catch IntegrityError (if concurrent insert happened despite lock)
                    # or OperationalError/Exception (if lock timed out)
                    from django.db import OperationalError

                    if isinstance(e, OperationalError) or isinstance(e, IntegrityError):
                        if attempt == max_retries - 1:
                            raise
                        time.sleep(0.1)  # Brief pause before retry
                        self.number = None  # Reset number for retry
                    else:
                        raise
            return

        super().save(*args, **kwargs)
        self._sync_initial_assignee()

    @property
    def key(self):
        """Returns the human-readable task key (e.g. MAD-15)."""
        if not self.number:
            return str(self.id)[:8]
        if getattr(self, "project", None) and self.project.prefix:
            return f"{self.project.prefix}-{self.number}"
        return f"TSK-{self.number}"

    @property
    def is_completed(self):
        """Returns True if the task is finished."""
        return self.is_finished

    def _progress_percent_internal(self, seen=None):
        """Recursive progress calculation with cycle detection.

        Uses prefetched subtasks/checklist_items when available to avoid
        issuing extra queries (N+1) during bulk progress recalculation.
        """
        if seen is None:
            seen = set()
        if self.id in seen:
            return 0.0
        seen = seen | {self.id}

        if hasattr(self, "annotated_checklist_total") and hasattr(self, "annotated_checklist_done"):
            checklist_total = self.annotated_checklist_total
            checklist_done = self.annotated_checklist_done
        else:
            checklist_total = self.checklist_items.count()
            checklist_done = self.checklist_items.filter(is_completed=True).count()

        checklist_progress = (
            (checklist_done / checklist_total * 100) if checklist_total > 0 else None
        )

        # Use prefetched subtasks if available; otherwise fall back to queryset.
        if "subtasks" in getattr(self, "_prefetched_objects_cache", {}):
            subtask_list = [
                s
                for s in self._prefetched_objects_cache["subtasks"]
                if not getattr(s, "is_deleted", False)
            ]
        else:
            subtask_list = list(self.subtasks.all())

        if subtask_list:
            subtask_progress = sum(s._progress_percent_internal(seen) for s in subtask_list) / len(
                subtask_list
            )
        else:
            subtask_progress = None

        if checklist_progress is not None and subtask_progress is not None:
            return round((checklist_progress + subtask_progress) / 2, 1)
        if checklist_progress is not None:
            return round(checklist_progress, 1)
        if subtask_progress is not None:
            return round(subtask_progress, 1)
        return 0.0

    @property
    def progress_percent(self):
        """Returns the cached progress percent."""
        return self.progress_cache


class TaskChecklistItem(BaseModel):
    """Checklist items belonging to a task."""

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="checklist_items",
        verbose_name=_("Task"),
    )
    description = models.CharField(_("Description"), max_length=255)
    is_completed = models.BooleanField(_("Completed"), default=False)

    class Meta:
        verbose_name = _("Task Checklist Item")
        verbose_name_plural = _("Task Checklist Items")
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["task"]),
            models.Index(fields=["task", "is_completed"], name="chk_task_completed_idx"),
        ]

    def __str__(self):
        if "task" in self.__dict__ and self.task:
            return f"{self.task.title} - {self.description}"
        return self.description


class TaskComment(BaseModel):
    """Comments on a task, with optional file attachment."""

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name=_("Task"),
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="task_comments",
        verbose_name=_("Author"),
        null=True,
        blank=True,
    )
    content = models.TextField(_("Content"), blank=True)
    attached_file = models.FileField(
        _("Attached file"),
        upload_to="task_attachments/",
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=[
                    "pdf",
                    "png",
                    "jpg",
                    "jpeg",
                    "zip",
                    "doc",
                    "docx",
                    "xls",
                    "xlsx",
                ]
            ),
            validate_file_size,
        ],
    )

    class Meta:
        verbose_name = _("Task Comment")
        verbose_name_plural = _("Task Comments")
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["task"]),
            models.Index(fields=["task", "-created_at"], name="comment_task_created_idx"),
        ]

    def __str__(self):
        return f"Comment {self.id} on Task {self.task_id}"


class AsyncStandup(BaseModel):
    """
    Daily standup report by team members, tied to a Project.
    One standup per user per project per date (see unique constraint).
    The grid lives at the project level; organization-level reporting is gone.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="standups",
        verbose_name=_("User"),
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="standups",
        verbose_name=_("Project"),
        db_index=True,
    )
    date = models.DateField(
        _("Standup date"),
        default=timezone.localdate,
        db_index=True,
        help_text=_("The working day this standup is reported for."),
    )
    hours_worked = models.DecimalField(
        _("Hours worked"),
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text=_("Number of hours worked on this project for the day."),
    )
    today_work = models.TextField(_("What did you do today? / What will you do tomorrow?"))
    blockers = models.TextField(_("Descriptions and Blockers"), blank=True, null=True)
    is_complete = models.BooleanField(
        _("Completed"),
        default=False,
        help_text=_("True if the user has finalized the standup text."),
    )

    class Meta:
        verbose_name = _("Async Standup")
        verbose_name_plural = _("Async Standups")
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["project", "date"], name="standup_project_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user", "date"],
                condition=Q(is_deleted=False),
                name="unique_active_standup_project_user_date",
            ),
        ]

    def __str__(self):
        user_info = f"User {self.user_id}" if self.user_id else "Unknown User"
        return f"Standup by {user_info} on {self.date}"


class TaskStatusTransition(models.Model):
    """
    Immutable audit trail of every status change on a Task.

    Created automatically by a post_save signal and by TaskService.move_task.
    NOT a BaseModel (no soft-delete) — history must never be erased.
    Used for CFD, Cycle Time, and Lead Time analytics.
    """

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="status_transitions",
        verbose_name=_("Task"),
        db_index=True,
    )
    from_status = models.ForeignKey(
        TaskStatus,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("From status"),
    )
    to_status = models.ForeignKey(
        TaskStatus,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
        verbose_name=_("To status"),
    )
    # Snapshots — preserved even if the TaskStatus row is later deleted/renamed
    from_status_code = models.CharField(
        _("From status code"), max_length=50, blank=True, default=""
    )
    from_status_name = models.CharField(
        _("From status name"), max_length=100, blank=True, default=""
    )
    to_status_code = models.CharField(_("To status code"), max_length=50)
    to_status_name = models.CharField(_("To status name"), max_length=100)

    transitioned_at = models.DateTimeField(
        _("Transitioned at"),
        default=timezone.now,
        db_index=True,
    )
    transitioned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_status_transitions",
        verbose_name=_("Transitioned by"),
    )

    class Meta:
        verbose_name = _("Task Status Transition")
        verbose_name_plural = _("Task Status Transitions")
        ordering = ["transitioned_at"]
        indexes = [
            models.Index(fields=["task", "transitioned_at"], name="transition_task_time_idx"),
            models.Index(
                fields=["to_status", "transitioned_at"], name="transition_status_time_idx"
            ),
        ]

    def __str__(self):
        return f"Task {self.task_id}: {self.from_status_code or '—'} → {self.to_status_code}"
