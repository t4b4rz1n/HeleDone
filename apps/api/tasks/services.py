from django.db import transaction
from django.utils import timezone
from django.utils.text import Truncator
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied, ValidationError

from projects.models import ProjectActivity

from .models import (
    Board,
    Task,
    TaskChecklistItem,
    TaskComment,
    TaskStatus,
)


class BoardService:
    """Service layer for Kanban Board business logic."""

    @staticmethod
    @transaction.atomic
    def create_board(
        title,
        project,
        created_by,
        description=None,
        background_color=None,
        create_default_statuses=True,
    ):
        # Lock existing boards to prevent race condition
        existing_boards = list(Board.objects.filter(project=project).select_for_update())
        max_order = len(existing_boards)
        board = Board.objects.create(
            title=title,
            description=description,
            background_color=background_color or "#6366f1",
            project=project,
            created_by=created_by,
            order=max_order + 1,
        )

        if create_default_statuses:
            # Create default Kanban statuses (columns) for the board
            default_statuses = [
                ("todo", _("To Do"), TaskStatus.Category.TODO),
                ("doing", _("Doing"), TaskStatus.Category.IN_PROGRESS),
                ("review", _("Review"), TaskStatus.Category.REVIEW),
                ("done", _("Done"), TaskStatus.Category.DONE),
            ]
            statuses_to_create = [
                TaskStatus(
                    board=board,
                    code=code,
                    name=str(name),
                    category=category,
                    order=index + 1,
                )
                for index, (code, name, category) in enumerate(default_statuses)
            ]
            TaskStatus.objects.bulk_create(statuses_to_create)

        # Dispatch board_created automation event
        from automations.events import EventDispatcher

        EventDispatcher.dispatch(
            event_type="board_created",
            payload={
                "project_id": str(project.id) if project else None,
                "board_id": str(board.id),
                "project_name": project.name if project else "—",
                "organization_id": str(project.organization_id)
                if project and project.organization_id
                else None,
                "board_name": title,
                "creator_name": created_by.get_full_name() or created_by.username
                if created_by
                else "System",
            },
        )

        return board

    @staticmethod
    @transaction.atomic
    def reorder_boards(project, board_orders, actor=None):
        """
        board_orders: list of dicts [{'id': uuid, 'order': int}, ...]
        """
        boards_to_update = []
        board_ids = [item["id"] for item in board_orders if "id" in item]
        if board_ids:
            boards_dict = {
                str(b.id): b
                for b in Board.objects.filter(id__in=board_ids, project=project).select_for_update()
            }
            for item in board_orders:
                board_obj = boards_dict.get(str(item["id"]))
                if board_obj:
                    board_obj.order = item["order"]
                    boards_to_update.append(board_obj)

            if boards_to_update:
                Board.objects.bulk_update(boards_to_update, ["order"])

        if actor and boards_to_update:
            first_board = boards_to_update[0]
            ProjectActivity.objects.create(
                project=first_board.project,
                event_type=ProjectActivity.EventType.BOARD_UPDATED,
                entity_type=ProjectActivity.EntityType.BOARD,
                entity_id=str(first_board.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(
                            _("Reordered boards in project '%(project)s'")
                            % {"project": project.name}
                        )
                    ).chars(255)
                },
            )


class TaskStatusService:
    """Service layer for per-board TaskStatus (Kanban Columns) CRUD and reordering."""

    @staticmethod
    @transaction.atomic
    def create_status(board, code, name, order=None, actor=None, category=None):
        from .models import Board

        # Lock the board to serialize concurrent status creations and prevent race conditions
        Board.objects.select_for_update().get(id=board.id)

        if not code:
            code = name.lower().replace(" ", "-")

        base_code = code
        counter = 1
        existing_codes = set(
            TaskStatus.objects.filter(board=board, is_deleted=False).values_list("code", flat=True)
        )

        while code in existing_codes:
            code = f"{base_code}-{counter}"
            counter += 1

        if order is None:
            order = len(existing_codes) + 1

        create_kwargs = {
            "board": board,
            "code": code,
            "name": name,
            "order": order,
        }
        if category:
            create_kwargs["category"] = category

        status_obj = TaskStatus.objects.create(**create_kwargs)

        if actor:
            ProjectActivity.objects.create(
                project=board.project,
                event_type=ProjectActivity.EventType.BOARD_UPDATED,
                entity_type=ProjectActivity.EntityType.BOARD,
                entity_id=str(board.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(_("Added status '%(name)s' to board") % {"name": name})
                    ).chars(255)
                },
            )

        return status_obj

    @staticmethod
    @transaction.atomic
    def delete_status(status_obj, actor=None):
        board = status_obj.board
        name = status_obj.name

        status_obj.is_deleted = True
        status_obj.save(update_fields=["is_deleted"])
        from .cascade_services import TaskCascadeService

        TaskCascadeService.soft_delete_status(status_obj)

        if actor:
            ProjectActivity.objects.create(
                project=board.project,
                event_type=ProjectActivity.EventType.BOARD_UPDATED,
                entity_type=ProjectActivity.EntityType.BOARD,
                entity_id=str(board.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(_("Removed status '%(name)s' from board") % {"name": name})
                    ).chars(255)
                },
            )

    @staticmethod
    @transaction.atomic
    def reorder_statuses(board, status_orders, actor=None):
        """
        status_orders: list of dicts [{'id': uuid, 'order': int}, ...]
        """
        status_ids = [item["id"] for item in status_orders if "id" in item]
        if status_ids:
            statuses_dict = {
                str(s.id): s
                for s in TaskStatus.objects.filter(
                    id__in=status_ids, board=board
                ).select_for_update()
            }
            statuses_to_update = []
            for item in status_orders:
                status_obj = statuses_dict.get(str(item["id"]))
                if status_obj:
                    status_obj.order = item["order"]
                    statuses_to_update.append(status_obj)

            if statuses_to_update:
                TaskStatus.objects.bulk_update(statuses_to_update, ["order"])

        if actor:
            ProjectActivity.objects.create(
                project=board.project,
                event_type=ProjectActivity.EventType.BOARD_UPDATED,
                entity_type=ProjectActivity.EntityType.BOARD,
                entity_id=str(board.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(_("Reordered statuses on board '%(board)s'") % {"board": board.title})
                    ).chars(255)
                },
            )


class TaskService:
    """Service layer for Task creation, updates, movement, and activity logging."""

    UPDATABLE_FIELDS = {
        "project",
        "milestone",
        "title",
        "description",
        "status",
        "priority",
        "assignees",
        "due_date",
        "estimated_hours",
        "parent_task",
        "is_finished",
        "is_blocked",
    }

    @staticmethod
    @transaction.atomic
    def create_task(
        title,
        reporter,
        project=None,
        description=None,
        status=None,
        priority=Task.Priority.MEDIUM,
        assignees=None,
        due_date=None,
        estimated_hours=None,
        parent_task=None,
        milestone=None,
        spent_hours=0,
        order=0,
        is_blocked=False,
        is_finished=False,
    ):
        # Validate that reporter is a project member (unless staff/superuser or org owner)
        if (
            project
            and reporter
            and not (
                getattr(reporter, "is_staff", False) or getattr(reporter, "is_superuser", False)
            )
        ):
            from organizations.models import OrganizationMembership
            from organizations.services import PermissionService
            from projects.models import ProjectMember

            is_org_manager = (
                project.organization.owner == reporter
                or project.owner == reporter
                or PermissionService.has_permission(
                    reporter, "project.manage", project.organization_id
                )
                or PermissionService.has_permission(
                    reporter, "task.manage_all", project.organization_id
                )
                or PermissionService.has_permission(
                    reporter, "org.manage_settings", project.organization_id
                )
            )

            if not is_org_manager:
                is_member = ProjectMember.objects.filter(
                    project=project, user=reporter, is_active=True, is_deleted=False
                ).exists()
                if not is_member:
                    raise PermissionDenied(_("You are not a member of this project."))

        # Validate that all assignees are members of the organization
        if assignees and project:
            from organizations.models import OrganizationMembership

            for assignee in assignees:
                is_assignee_org_member = OrganizationMembership.objects.filter(
                    organization=project.organization, user=assignee
                ).exists()
                if not is_assignee_org_member:
                    raise ValidationError(_("All assignees must be members of the organization."))

        if not status:
            if project:
                status = TaskStatus.objects.filter(board__project=project, code="todo").first()
                if not status:
                    status = TaskStatus.objects.filter(board__project=project).first()
            if not status:
                raise ValidationError(_("No statuses found for this project."))

        if parent_task and project and parent_task.project != project:
            raise ValidationError(_("Parent task must belong to the same project."))

        # Calculate max order for the given status to append at the bottom
        if order == 0:
            from django.db.models import Max

            max_order_agg = Task.objects.filter(status=status).aggregate(Max("order"))
            max_order = max_order_agg["order__max"]
            if max_order is not None:
                order = max_order + 1

        task = Task.objects.create(
            project=project,
            milestone=milestone,
            title=title,
            description=description,
            status=status,
            priority=priority,
            reporter=reporter,
            due_date=due_date,
            estimated_hours=estimated_hours,
            parent_task=parent_task,
            spent_hours=spent_hours,
            order=order,
            is_blocked=is_blocked,
        )

        # Set the many-to-many assignees
        if assignees:
            task.assignees.set(assignees)

        # Log activity
        ProjectActivity.objects.create(
            project=task.status.board.project
            if task.status and task.status.board
            else (task.project if hasattr(task, "project") else None),
            event_type=ProjectActivity.EventType.TASK_CREATED,
            entity_type=ProjectActivity.EntityType.TASK,
            entity_id=str(task.id),
            actor=reporter,
            metadata={"action": str(_("Task created: %(title)s") % {"title": task.title})},
        )

        if getattr(task, "milestone_id", None):
            try:
                from projects.services import MilestoneService

                MilestoneService.sync_completion_status(task.milestone_id, reporter)
            except Exception:
                pass

        return task

    @staticmethod
    @transaction.atomic
    def update_task(task, actor, **kwargs):
        # We rely on the serializer to validate that the assignees are valid ProjectMembers.
        # Human-readable field labels
        field_labels = {
            "assignees": _("Assignees"),
            "status": _("Status"),
            "priority": _("Priority"),
            "title": _("Title"),
            "description": _("Description"),
            "due_date": _("Due date"),
            "estimated_hours": _("Estimated hours"),
            "order": _("Order"),
            "parent_task": _("Parent task"),
            "is_finished": _("Finished"),
            "is_blocked": _("Blocked"),
            "milestone": _("Milestone"),
        }

        def _display(val, field_name):
            if val is None:
                return str(_("Unassigned")) if field_name == "assignees" else str(_("empty"))
            if isinstance(val, bool):
                return "✓" if val else "✗"
            if hasattr(val, "get_full_name"):
                return val.get_full_name() or getattr(val, "email", str(val))
            if hasattr(val, "name"):
                return val.name
            # Format dates nicely
            if hasattr(val, "strftime"):
                return val.strftime("%b %d, %Y")
            # Truncate long text (e.g. description)
            s = str(val)
            if len(s) > 50:
                return s[:47] + "..."
            return s

        # Fields to skip in activity log (noisy/internal)
        skip_log_fields = {"order"}

        changes = []
        assignees_to_set = None

        for field, value in kwargs.items():
            if field not in TaskService.UPDATABLE_FIELDS:
                continue

            # Handle M2M assignees separately
            if field == "assignees":
                old_assignees = set(task.assignees.values_list("id", flat=True))
                new_assignees = {u.id for u in value} if value else set()
                if old_assignees != new_assignees:
                    assignees_to_set = value
                    if field not in skip_log_fields:
                        if value:
                            names = ", ".join(u.get_full_name() or u.username for u in value)
                            changes.append(str(_("Task assigned to %(users)s")) % {"users": names})
                        else:
                            changes.append(str(_("Task unassigned")))
                continue

            old_val = getattr(task, field)
            if old_val != value:
                setattr(task, field, value)

                if field == "is_finished" and value is True:
                    # Stop active timers for this task
                    from attendance.models import TimeLog
                    from attendance.services import TimeLogService

                    active_timers = TimeLog.objects.filter(task=task, is_active=True)
                    for timer in active_timers:
                        TimeLogService.stop_timer(timer.user, timer.id, auto_move=False)

                if field not in skip_log_fields:
                    label = field_labels.get(field, field)
                    changes.append(
                        f"{label}: {_display(old_val, field)} → {_display(value, field)}"
                    )

        if changes or assignees_to_set is not None:
            # Sync is_finished if status changed and is_finished wasn't explicitly provided
            if "status" in kwargs and "is_finished" not in kwargs:
                if task.status:
                    code = task.status.code.lower() if task.status.code else ""
                    if code == "done":
                        task.is_finished = True
                    elif code in ["todo", "doing", "review"]:
                        task.is_finished = False

            task.save()

            # Set M2M assignees after save
            if assignees_to_set is not None:
                task.assignees.set(assignees_to_set)

            if changes:
                action_desc = ", ".join(changes)
                ProjectActivity.objects.create(
                    project=task.status.board.project
                    if task.status and task.status.board
                    else None,
                    event_type=ProjectActivity.EventType.TASK_UPDATED,
                    entity_type=ProjectActivity.EntityType.TASK,
                    entity_id=str(task.id),
                    actor=actor,
                    metadata={"action": Truncator(action_desc).chars(255)},
                )

        if "is_finished" in kwargs or "milestone" in kwargs:
            if getattr(task, "milestone_id", None):
                try:
                    from projects.services import MilestoneService

                    MilestoneService.sync_completion_status(task.milestone_id, actor)
                except Exception:
                    pass

        return task

    @staticmethod
    @transaction.atomic
    def move_task(task, actor, new_status=None, new_order=None):
        """Handles Drag & Drop movement across Kanban statuses and reorders tasks."""
        from django.db.models import F

        # Permission check for moving tasks
        if not actor.is_staff and not actor.is_superuser:
            org_id = str(task.project.organization_id) if task.project else None
            from organizations.services import PermissionService

            can_manage = org_id and PermissionService.has_permission(
                actor, "task.manage_all", org_id
            )
            is_assignee_or_reporter = (
                task.assignees.filter(id=actor.id).exists() or task.reporter_id == actor.id
            )
            is_member = (
                task.project
                and task.project.members.filter(
                    user=actor, is_active=True, is_deleted=False
                ).exists()
            )

            if not (can_manage or is_assignee_or_reporter or is_member):
                raise ValidationError(_("You do not have permission to move this task."))

        old_status = task.status
        old_order = task.order

        action_parts = []

        changed = False
        if new_status and task.status != new_status:
            if task.project and new_status.board and new_status.board.project_id != task.project_id:
                raise ValidationError(_("Target status does not belong to the same project."))
            action_parts.append(str(_("Status changed to %(st)s") % {"st": new_status.name}))
            task.status = new_status
            changed = True

            # Handle timer auto-start/stop
            from attendance.services import TimeLogService
            from tasks.models import TaskStatus

            category = new_status.category if new_status.category else ""
            code = new_status.code.lower() if new_status.code else ""

            is_doing = category == TaskStatus.Category.IN_PROGRESS or (
                category == TaskStatus.Category.TODO and code == "doing"
            )
            is_review = category == TaskStatus.Category.REVIEW or (
                category == TaskStatus.Category.TODO and code == "review"
            )
            is_done = category == TaskStatus.Category.DONE or (
                category == TaskStatus.Category.TODO and code == "done"
            )

            if is_doing:
                try:
                    TimeLogService.start_timer(actor, task)
                except Exception as timer_err:
                    import logging

                    logging.getLogger(__name__).warning(
                        "Auto start timer failed on task move: %s", timer_err
                    )

            elif is_review or is_done:
                # Stop timers for anyone working on this task
                from attendance.models import TimeLog

                active_timers = TimeLog.objects.filter(task=task, is_active=True)
                for timer in active_timers:
                    TimeLogService.stop_timer(timer.user, timer.id, auto_move=False)

                if is_done:
                    task.is_finished = True
                else:
                    task.is_finished = False

        # Order Shifting Logic
        if new_status and old_status != new_status:
            # Moving to a DIFFERENT status column
            if new_order is not None:
                # Shift tasks in the new column down to make room
                Task.objects.filter(status=new_status, order__gte=new_order).update(
                    order=F("order") + 1
                )
                task.order = new_order
            else:
                # Append to the end of the new column
                from django.db.models import Max

                max_order = Task.objects.filter(status=new_status).aggregate(Max("order"))[
                    "order__max"
                ]
                task.order = (max_order + 1) if max_order is not None else 0

            # Shift tasks in the old column up to fill the gap
            if old_status:
                Task.objects.filter(status=old_status, order__gt=old_order).update(
                    order=F("order") - 1
                )

            action_parts.append(str(_("Order changed")))
            changed = True
        else:
            # Moving within the SAME status column
            if new_order is not None and old_order != new_order:
                if new_order < old_order:
                    # Moving up: shift tasks down in the range
                    Task.objects.filter(
                        status=old_status, order__gte=new_order, order__lt=old_order
                    ).update(order=F("order") + 1)
                else:
                    # Moving down: shift tasks up in the range
                    Task.objects.filter(
                        status=old_status, order__gt=old_order, order__lte=new_order
                    ).update(order=F("order") - 1)

                task.order = new_order
                action_parts.append(str(_("Order changed")))
                changed = True

        if changed:
            task.save()

        if action_parts:
            ProjectActivity.objects.create(
                project=task.status.board.project if task.status and task.status.board else None,
                event_type=ProjectActivity.EventType.TASK_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(task.id),
                actor=actor,
                metadata={"action": Truncator(" | ".join(action_parts)).chars(255)},
            )

        if changed and getattr(task, "milestone_id", None):
            try:
                from projects.services import MilestoneService

                MilestoneService.sync_completion_status(task.milestone_id, actor)
            except Exception:
                pass

        return task

    @staticmethod
    @transaction.atomic
    def delete_task(task, actor):
        """Soft deletes task and logs activity."""
        title = task.title
        board = task.status.board if task.status else None
        task.is_deleted = True
        task.save(update_fields=["is_deleted"])
        from .cascade_services import TaskCascadeService

        TaskCascadeService.soft_delete_task(task)

        ProjectActivity.objects.create(
            project=board.project if board else None,
            event_type=ProjectActivity.EventType.TASK_DELETED,
            entity_type=ProjectActivity.EntityType.TASK,
            entity_id=str(task.id),
            actor=actor,
            metadata={
                "action": Truncator(str(_("Deleted task: %(title)s") % {"title": title})).chars(255)
            },
        )

        if getattr(task, "milestone_id", None):
            try:
                from projects.services import MilestoneService

                MilestoneService.sync_completion_status(task.milestone_id, actor)
            except Exception:
                pass

    @staticmethod
    @transaction.atomic
    def reorder_tasks(orders, actor=None):
        """
        orders: list of dicts [{'id': uuid, 'order': int}, ...]
        """
        task_ids = [item.get("id") for item in orders if item.get("id")]
        if not task_ids:
            return

        tasks_dict = {
            str(t.id): t for t in Task.objects.filter(id__in=task_ids).select_for_update()
        }
        tasks_to_update = []
        for item in orders:
            task_obj = tasks_dict.get(str(item.get("id")))
            if task_obj and item.get("order") is not None:
                task_obj.order = item["order"]
                tasks_to_update.append(task_obj)

        if tasks_to_update:
            Task.objects.bulk_update(tasks_to_update, ["order"])


class ChecklistService:
    """Service layer for Task Checklist items."""

    @staticmethod
    @transaction.atomic
    def add_item(task, description, actor=None):
        item = TaskChecklistItem.objects.create(
            task=task,
            description=description,
            is_completed=False,
        )
        if actor:
            ProjectActivity.objects.create(
                project=task.status.board.project if task.status and task.status.board else None,
                event_type=ProjectActivity.EventType.TASK_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(task.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(_("Added checklist item: %(desc)s") % {"desc": description})
                    ).chars(255)
                },
            )
        return item

    @staticmethod
    @transaction.atomic
    def toggle_item(item, actor=None):
        item.is_completed = not item.is_completed
        item.save()

        status_str = _("completed") if item.is_completed else _("uncompleted")
        if actor:
            ProjectActivity.objects.create(
                project=item.task.status.board.project
                if item.task.status and item.task.status.board
                else None,
                event_type=ProjectActivity.EventType.TASK_CHECKLIST_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(item.task.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(
                            _("Marked checklist '%(desc)s' as %(status)s")
                            % {"desc": item.description, "status": status_str}
                        )
                    ).chars(255)
                },
            )
        return item

    @staticmethod
    @transaction.atomic
    def delete_item(item, actor=None):
        task = item.task
        desc = item.description
        item.is_deleted = True
        item.save(update_fields=["is_deleted"])

        if actor:
            ProjectActivity.objects.create(
                project=task.status.board.project if task.status and task.status.board else None,
                event_type=ProjectActivity.EventType.TASK_UPDATED,
                entity_type=ProjectActivity.EntityType.TASK,
                entity_id=str(task.id),
                actor=actor,
                metadata={
                    "action": Truncator(
                        str(_("Deleted checklist item: %(desc)s") % {"desc": desc})
                    ).chars(255)
                },
            )


class CommentService:
    """Service layer for Task Comments and file attachments."""

    @staticmethod
    @transaction.atomic
    def add_comment(task, author, content, attached_file=None):
        if not content and not attached_file:
            raise ValidationError(
                _("Comment must contain either text content or an attached file.")
            )

        comment = TaskComment.objects.create(
            task=task,
            author=author,
            content=content,
            attached_file=attached_file,
        )

        ProjectActivity.objects.create(
            project=task.status.board.project if task.status and task.status.board else None,
            event_type=ProjectActivity.EventType.TASK_COMMENT_ADDED,
            entity_type=ProjectActivity.EntityType.TASK,
            entity_id=str(task.id),
            actor=author,
            metadata={"action": Truncator(str(_("Added a comment."))).chars(255)},
        )

        return comment


class StandupService:
    """Service layer for project-based Async Standups."""

    @staticmethod
    def _parse_date(value):
        from datetime import date as date_cls

        if isinstance(value, date_cls):
            return value
        try:
            parsed = date_cls.fromisoformat(str(value))
        except (TypeError, ValueError) as err:
            raise ValidationError(_("Invalid date format. Use YYYY-MM-DD.")) from err
        return parsed

    @staticmethod
    @transaction.atomic
    def create_standup(user, project, date, hours_worked, today_work, blockers=None):
        """Creates the single standup row of a user for a project/day."""
        from .models import AsyncStandup

        if not today_work:
            raise ValidationError(_("The 'today/tomorrow' description is required."))

        date = StandupService._parse_date(date)
        if date > timezone.localdate():
            raise ValidationError(_("You cannot log standups for future days."))

        if AsyncStandup.objects.filter(
            project=project, user=user, date=date, is_deleted=False
        ).exists():
            raise ValidationError(
                _("You have already logged a standup for this project on this day.")
            )

        if hours_worked is None:
            hours_worked = 0
        if hours_worked < 0:
            raise ValidationError(_("Hours worked cannot be negative."))
        if float(hours_worked) > 24:
            raise ValidationError(_("Hours worked cannot exceed 24 hours per day."))
        hours_worked = round(float(hours_worked), 2)

        return AsyncStandup.objects.create(
            user=user,
            project=project,
            date=date,
            hours_worked=hours_worked,
            today_work=today_work,
            blockers=blockers,
        )
