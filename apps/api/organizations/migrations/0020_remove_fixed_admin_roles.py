from django.db import migrations, models


def clean_static_role_data(apps, schema_editor):
    Membership = apps.get_model("organizations", "OrganizationMembership")
    Role = apps.get_model("organizations", "Role")
    db = schema_editor.connection.alias
    Membership.objects.using(db).filter(role__in=["admin", "hr", "accountant"]).update(role="employee")
    Role.objects.using(db).filter(name__in=["Admin", "HR", "Hr", "Accountant"]).delete()


class Migration(migrations.Migration):
    dependencies = [("organizations", "0019_merge_20260914_1205")]

    operations = [
        migrations.RunPython(clean_static_role_data, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organizationmembership",
            name="role",
            field=models.CharField(
                blank=True,
                choices=[("owner", "Owner"), ("employee", "Employee")],
                default=None,
                max_length=20,
                null=True,
            ),
        ),
    ]
