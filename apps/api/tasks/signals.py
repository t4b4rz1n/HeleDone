import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from automations.events import EventDispatcher
from common.mentions import (
    MAX_MENTIONS_PER_MESSAGE,
    extract_mentioned_usernames,
    get_project_mention_users,
)

from .models import (
    AsyncStandup,
    Task,
    TaskChecklistItem,
    TaskComment,
    TaskStatus,
    TaskStatusTransition,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=TaskChecklistItem)
@receiver(post_delete, sender=TaskChecklistItem)
def update_task_progress_on_checklist_change(sender, instance, **kwargs):
    if instance.task_id:
        task = Task.all_objects.filter(id=instance.task_id).first()
        _update_task_progress_cache(task)


@receiver(pre_save, sender=Task)
def cache_previous_task_state(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            instance.__original_status_id = old.status_id
            instance.__original_status_code = old.status.code if old.status else None
            instance.__original_status_name = old.status.name if old.status else ""
            instance.__original_is_finished = old.is_finished
            instance.__original_description = old.description or ""
        except Task.DoesNotExist:
            pass


@receiver(post_save, sender=Task)
def record_status_transition(sender, instance, created, **kwargs):
    """
    Records a TaskStatusTransition whenever a task's status changes.
    This feeds CFD, Cycle Time, and Lead Time analytics.
    Swallows exceptions so it never aborts the main transaction.
    """
    try:
        new_status = instance.status
        if new_status is None:
            return

        if created:
            # First transition: None → initial status
            TaskStatusTransition.objects.create(
                task=instance,
                from_status=None,
                to_status=new_status,
                from_status_code="",
                from_status_name="",
                to_status_code=new_status.code,
                to_status_name=new_status.name,
                transitioned_at=instance.created_at or timezone.now(),
                transitioned_by=getattr(instance, "_actor", None),
            )
        else:
            old_status_id = getattr(instance, "__original_status_id", None)
            if old_status_id and old_status_id != instance.status_id:
                # Status changed — record transition
                from_status_code = getattr(instance, "__original_status_code", "") or ""
                from_status_name = getattr(instance, "__original_status_name", "") or ""
                try:
                    from_status_obj = TaskStatus.objects.get(pk=old_status_id)
                except TaskStatus.DoesNotExist:
                    from_status_obj = None

                TaskStatusTransition.objects.create(
                    task=instance,
                    from_status=from_status_obj,
                    to_status=new_status,
                    from_status_code=from_status_code,
                    from_status_name=from_status_name,
                    to_status_code=new_status.code,
                    to_status_name=new_status.name,
                    transitioned_at=timezone.now(),
                    transitioned_by=getattr(instance, "_actor", None),
                )
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning(
            "record_status_transition failed for Task %s: %s", instance.pk, exc
        )


@receiver(post_save, sender=Task)
@receiver(post_delete, sender=Task)
def update_parent_task_progress(sender, instance, **kwargs):
    _update_task_progress_cache(instance)
    if instance.parent_task_id:
        parent_task = Task.all_objects.filter(id=instance.parent_task_id).first()
        _update_task_progress_cache(parent_task)


@receiver(post_save, sender=Task)
def handle_task_automations(sender, instance, created, **kwargs):
    try:
        old_status = getattr(instance, "__original_status_code", None)
        old_finished = getattr(instance, "__original_is_finished", None)

        if created:
            EventDispatcher.dispatch(
                event_type="task_created",
                payload={
                    "project_id": str(instance.project_id) if instance.project_id else None,
                    "project_name": instance.project.name if instance.project_id else "—",
                    "task_title": instance.title,
                    "task_id": str(instance.id),
                    "board_id": str(instance.status.board_id)
                    if getattr(instance, "status", None)
                    and getattr(instance.status, "board_id", None)
                    else None,
                    "reporter_id": str(instance.reporter_id) if instance.reporter_id else None,
                },
            )

        # 7. task_assigned — dispatch for each assignee
        try:
            assignee_ids = list(instance.assignees.values_list("id", flat=True))
        except Exception:
            assignee_ids = []

        for assignee_id in assignee_ids:
            EventDispatcher.dispatch(
                event_type="task_assigned",
                payload={
                    "target_user_id": str(assignee_id),
                    "project_id": str(instance.project_id),
                    "assignee_id": str(assignee_id),
                    "reporter_id": str(instance.reporter_id) if instance.reporter_id else None,
                    "task_title": instance.title,
                    "task_id": str(instance.id),
                    "board_id": str(instance.status.board_id)
                    if getattr(instance, "status", None)
                    and getattr(instance.status, "board_id", None)
                    else None,
                    "assigner": "System",
                },
            )

        if not created:
            # 8. task_needs_review
            if instance.status and instance.status.code == "review" and old_status != "review":
                if instance.reporter_id:
                    first_assignee_name = "User"
                    try:
                        first_assignee = instance.assignees.first()
                        if first_assignee:
                            first_assignee_name = (
                                first_assignee.get_full_name() or first_assignee.username
                            )
                    except Exception:
                        pass
                    EventDispatcher.dispatch(
                        event_type="task_needs_review",
                        payload={
                            "target_user_id": str(instance.reporter_id),
                            "project_id": str(instance.project_id),
                            "reporter_id": str(instance.reporter_id),
                            "task_title": instance.title,
                            "task_id": str(instance.id),
                            "board_id": str(instance.status.board_id)
                            if getattr(instance, "status", None)
                            and getattr(instance.status, "board_id", None)
                            else None,
                            "assignee": first_assignee_name,
                        },
                    )

            # 9. task_completed
            if instance.is_finished and not old_finished:
                EventDispatcher.dispatch(
                    event_type="task_completed",
                    payload={
                        "project_id": str(instance.project_id),
                        "reporter_id": str(instance.reporter_id) if instance.reporter_id else None,
                        "task_title": instance.title,
                        "task_id": str(instance.id),
                        "board_id": str(instance.status.board_id)
                        if getattr(instance, "status", None)
                        and getattr(instance.status, "board_id", None)
                        else None,
                    },
                )

            # 10. Mentions in task description
            new_desc = instance.description or ""
            current_mentions = set(extract_mentioned_usernames(new_desc))
            if not created:
                old_desc = getattr(instance, "__original_description", "") or ""
                old_mentions = set(extract_mentioned_usernames(old_desc))
                newly_mentioned = current_mentions - old_mentions
            else:
                newly_mentioned = current_mentions

            if len(newly_mentioned) > MAX_MENTIONS_PER_MESSAGE:
                logger.warning("Skipped task description mentions above the per-message limit")
                newly_mentioned = set()

            if newly_mentioned:
                users_to_notify = get_project_mention_users(instance.project, newly_mentioned)
                actor = getattr(instance, "_actor", None) or instance.reporter
                actor_name = (actor.get_full_name() or actor.username) if actor else "A Colleague"

                for uid in users_to_notify:
                    EventDispatcher.dispatch(
                        event_type="user_mentioned",
                        payload={
                            "target_user_id": str(uid),
                            "project_id": str(instance.project_id) if instance.project_id else None,
                            "mentioned_user_ids": [str(uid)],
                            "assignee_id": str(instance.assignee_id)
                            if instance.assignee_id
                            else None,
                            "reporter_id": str(instance.reporter_id)
                            if instance.reporter_id
                            else None,
                            "task_title": instance.title,
                            "task_id": str(instance.id),
                            "board_id": str(instance.status.board_id)
                            if getattr(instance, "status", None)
                            and getattr(instance.status, "board_id", None)
                            else None,
                            "author": actor_name,
                            "comment_text": f"{actor_name} mentioned you in the description of {instance.title}",
                        },
                    )
    except Exception as exc:
        logger.error(
            f"handle_task_automations signal failed for Task {instance.pk}: {exc}",
            exc_info=True,
        )


@receiver(pre_save, sender=TaskComment)
def cache_previous_comment_content(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = TaskComment.objects.get(pk=instance.pk)
            instance.__original_content = old.content
        except TaskComment.DoesNotExist:
            pass


@receiver(post_save, sender=TaskComment)
def handle_task_comments(sender, instance, created, **kwargs):
    """
    11. user_mentioned
    12. task_commented
    """
    try:
        task = instance.task
        author_name = (
            instance.author.get_full_name() or instance.author.username
            if instance.author
            else "A User"
        )
        content = instance.content

        # Parse mentions (@username)
        mentioned_usernames = set(extract_mentioned_usernames(content))

        if not created:
            old_content = getattr(instance, "__original_content", "") or ""
            old_mentions = set(extract_mentioned_usernames(old_content))
            # Only notify newly added mentions
            mentioned_usernames = mentioned_usernames - old_mentions

        mentioned_users = []
        if len(mentioned_usernames) > MAX_MENTIONS_PER_MESSAGE:
            logger.warning("Skipped task comment mentions above the per-message limit")
            mentioned_usernames = set()
        if mentioned_usernames:
            mentioned_users = [
                user.id for user in get_project_mention_users(task.project, mentioned_usernames)
            ]

            for uid in mentioned_users:
                EventDispatcher.dispatch(
                    event_type="user_mentioned",
                    payload={
                        "target_user_id": str(uid),
                        "project_id": str(task.project_id),
                        "mentioned_user_ids": [str(uid)],
                        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
                        "reporter_id": str(task.reporter_id) if task.reporter_id else None,
                        "task_title": task.title,
                        "task_id": str(task.id),
                        "board_id": str(task.status.board_id)
                        if getattr(task, "status", None) and getattr(task.status, "board_id", None)
                        else None,
                        "author": author_name,
                        "comment_text": f"{author_name} mentioned you: {content[:50]}...",
                    },
                )

        if created:
            # General comment notification (task_commented)
            target_ids = list(task.assignees.values_list("id", flat=True))
            if task.reporter_id:
                target_ids.append(task.reporter_id)

            # Exclude author and mentioned users from generic notification to avoid spam
            final_targets = [
                str(tid)
                for tid in set(target_ids)
                if tid not in mentioned_users and (not instance.author or tid != instance.author.id)
            ]

            if final_targets:
                EventDispatcher.dispatch(
                    event_type="task_commented",
                    payload={
                        "target_user_ids": final_targets,
                        "project_id": str(task.project_id),
                        "reporter_id": str(task.reporter_id) if task.reporter_id else None,
                        "task_title": task.title,
                        "task_id": str(task.id),
                        "board_id": str(task.status.board_id)
                        if getattr(task, "status", None) and getattr(task.status, "board_id", None)
                        else None,
                        "author": author_name,
                    },
                )

    except Exception as exc:
        logger.error(
            f"handle_task_comments signal failed for Comment {instance.pk}: {exc}",
            exc_info=True,
        )


@receiver(post_save, sender=AsyncStandup)
def handle_standup_submitted(sender, instance, created, **kwargs):
    """
    13. standup_submitted
    """
    try:
        if created:
            user_name = (
                (instance.user.get_full_name() or instance.user.username)
                if instance.user
                else "A Colleague"
            )

            org_id = instance.project.organization_id if instance.project else None

            if org_id:
                EventDispatcher.dispatch(
                    event_type="standup_submitted",
                    payload={
                        "organization_id": str(org_id),
                        "project_id": str(instance.project_id) if instance.project else None,
                        "user_id": str(instance.user_id),
                        "user_name": user_name,
                    },
                )
    except Exception as exc:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(
            f"handle_standup_submitted signal failed for Standup {instance.pk}: {exc}",
            exc_info=True,
        )


def _update_task_progress_cache(task, depth=0):
    if not task or depth > 10:
        return

    new_progress = task._progress_percent_internal()

    if float(task.progress_cache) != float(new_progress):
        task.progress_cache = new_progress
        Task.objects.filter(pk=task.pk).update(progress_cache=new_progress)

        if task.parent_task_id:
            parent = Task.all_objects.filter(id=task.parent_task_id).first()
            _update_task_progress_cache(parent, depth + 1)
