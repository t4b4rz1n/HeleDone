from django.db import migrations

OWNER_PERMISSION_CODES = (
    "org.view", "org.manage_settings", "org.manage_roles", "org.manage_members",
    "user.view", "role.view", "project.view", "project.create", "project.manage",
    "task.view", "task.create", "task.manage_all", "task.review", "board.view",
    "board.manage", "attendance.view", "attendance.view_all", "leave.approve",
    "finance.manage", "finance.view_reports", "notification.view", "automation.manage",
    "report.view",
)


def backfill_owner_memberships(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Membership = apps.get_model("organizations", "OrganizationMembership")
    Role = apps.get_model("organizations", "Role")
    Permission = apps.get_model("organizations", "Permission")
    db = schema_editor.connection.alias

    for org in Organization.objects.using(db).filter(is_deleted=False, owner_id__isnull=False):
        owner_role = Role.objects.using(db).filter(
            organization_id=org.pk, name="Owner", is_deleted=False
        ).first()
        if owner_role is None:
            owner_role = Role.objects.using(db).create(
                organization_id=org.pk,
                name="Owner",
                description="Organization owner",
                is_protected=True,
            )
            owner_role.permissions.set(
                Permission.objects.using(db).filter(
                    code__in=OWNER_PERMISSION_CODES, is_deleted=False
                )
            )

        membership = Membership._base_manager.using(db).filter(
            user_id=org.owner_id, organization_id=org.pk, is_deleted=False
        ).first()
        if membership is None:
            membership = Membership._base_manager.using(db).filter(
                user_id=org.owner_id, organization_id=org.pk
            ).first()
            if membership is None:
                membership = Membership.objects.using(db).create(
                    user_id=org.owner_id, organization_id=org.pk, role="owner"
                )
            else:
                Membership._base_manager.using(db).filter(pk=membership.pk).update(
                    is_deleted=False, role="owner"
                )
        elif membership.role != "owner":
            Membership._base_manager.using(db).filter(pk=membership.pk).update(role="owner")

        membership.dynamic_roles.set([owner_role])


class Migration(migrations.Migration):
    dependencies = [("organizations", "0020_remove_fixed_admin_roles")]

    operations = [
        migrations.RunPython(backfill_owner_memberships, migrations.RunPython.noop),
    ]
