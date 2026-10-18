from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from automations.events import EventDispatcher

from .models import Task


@shared_task
def check_approaching_tasks():
    """
    Checks for tasks that are 24 hours away from their due_date
    and dispatches the task_deadline_approaching event.
    Designed to be run daily via Celery Beat (e.g., at 08:00 AM).
    """
    now = timezone.now()
    target_start = now + timedelta(days=1)
    target_end = target_start + timedelta(days=1)

    # We find tasks that are due tomorrow and not finished yet
    approaching_tasks = Task.objects.filter(
        due_date__gte=target_start, due_date__lt=target_end, is_finished=False
    ).exclude(status__code="done")  # Extra safety to exclude done tasks if is_finished was false

    for task in approaching_tasks:
        for assignee in task.assignees.all():
            EventDispatcher.dispatch(
                event_type="task_deadline_approaching",
                payload={
                    "target_user_id": str(assignee.id),
                    "project_id": str(task.project_id),
                    "assignee_id": str(assignee.id),
                    "task_title": task.title,
                },
            )

