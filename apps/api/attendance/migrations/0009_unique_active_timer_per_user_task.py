from django.db import migrations, models
from django.db.models import Count, Q


def ensure_no_duplicate_active_task_timers(apps, schema_editor):
    TimeLog = apps.get_model("attendance", "TimeLog")
    duplicates = list(
        TimeLog.objects.using(schema_editor.connection.alias)
        .filter(is_active=True, is_deleted=False, task__isnull=False)
        .values("user_id", "task_id")
        .annotate(row_count=Count("pk"))
        .filter(row_count__gt=1)[:10]
    )
    if duplicates:
        pairs = ", ".join(
            f"user={row['user_id']} task={row['task_id']} rows={row['row_count']}"
            for row in duplicates
        )
        raise RuntimeError(
            "Cannot add unique_active_timer_per_user_task: duplicate active timers exist. "
            "Resolve these records explicitly, then rerun the migration. "
            f"Examples: {pairs}"
        )


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0008_attendance_timezone"),
    ]

    operations = [
        migrations.RunPython(
            ensure_no_duplicate_active_task_timers,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="timelog",
            constraint=models.UniqueConstraint(
                fields=("user", "task"),
                condition=Q(is_active=True, is_deleted=False, task__isnull=False),
                name="unique_active_timer_per_user_task",
            ),
        ),
    ]
