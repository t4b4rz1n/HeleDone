from django.db import migrations, models
from django.db.models import Q


def ensure_valid_project_member_allocations(apps, schema_editor):
    ProjectMember = apps.get_model("projects", "ProjectMember")
    invalid_rows = list(
        ProjectMember.objects.using(schema_editor.connection.alias)
        .exclude(allocation_percentage__gte=1, allocation_percentage__lte=100)
        .values_list("pk", "allocation_percentage")[:10]
    )
    if invalid_rows:
        examples = ", ".join(f"id={pk} value={value}" for pk, value in invalid_rows)
        raise RuntimeError(
            "Cannot add project_member_allocation_percentage_range: invalid allocations exist. "
            "Correct these records explicitly, then rerun the migration. "
            f"Examples: {examples}"
        )


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0017_add_project_file"),
    ]

    operations = [
        migrations.RunPython(
            ensure_valid_project_member_allocations,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="projectmember",
            constraint=models.CheckConstraint(
                condition=Q(allocation_percentage__gte=1, allocation_percentage__lte=100),
                name="project_member_allocation_percentage_range",
            ),
        ),
    ]
