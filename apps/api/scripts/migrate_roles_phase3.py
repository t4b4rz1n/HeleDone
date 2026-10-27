import os
import sys

import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.db import transaction

from organizations.models import OrganizationMembership, Permission, Role

PERMISSIONS_DATA = [
    # Organization Level
    {"code": "org.manage_settings", "name": "Manage Org Settings", "module": "core"},
    {"code": "org.manage_roles", "name": "Manage Roles & Permissions", "module": "core"},
    {"code": "org.manage_members", "name": "Manage Members", "module": "core"},
    # Project Level
    {"code": "project.create", "name": "Create Projects", "module": "projects"},
    {"code": "project.manage", "name": "Manage All Projects", "module": "projects"},
    # Task Level
    {"code": "task.create", "name": "Create Tasks", "module": "tasks"},
    {"code": "task.manage_all", "name": "Manage All Tasks", "module": "tasks"},
    {"code": "task.review", "name": "Review Tasks", "module": "tasks"},
    # Attendance & Leave
    {"code": "leave.approve", "name": "Approve Leave Requests", "module": "attendance"},
    {"code": "attendance.view_all", "name": "View All Attendance Records", "module": "attendance"},
    # Finance & HR
    {"code": "finance.manage", "name": "Manage Financial Records", "module": "billing"},
    {"code": "finance.view_reports", "name": "View Financial Reports", "module": "billing"},
]

ROLE_PERMISSIONS_MAP = {
    "owner": [p["code"] for p in PERMISSIONS_DATA],  # Owner gets everything
    "employee": [
        "notification.view",
        "project.view",
        "board.view",
        "task.view",
        "task.create",  # Minimal default permissions
    ],
}


@transaction.atomic
def run():
    print("1. Creating Permissions...")
    for perm in PERMISSIONS_DATA:
        Permission.objects.get_or_create(
            code=perm["code"], defaults={"name": perm["name"], "module": perm["module"]}
        )

    print("2. Migrating Organization Roles...")
    # Get all distinct organizations that have memberships
    org_ids = OrganizationMembership.objects.values_list("organization_id", flat=True).distinct()

    for org_id in org_ids:
        # Create standard roles for this org
        org_roles = {}
        for role_key, perms in ROLE_PERMISSIONS_MAP.items():
            role_name = role_key.replace("_", " ").title()
            is_protected = role_key == "owner"

            role, created = Role.objects.get_or_create(
                organization_id=org_id, name=role_name, defaults={"is_protected": is_protected}
            )

            # Assign permissions
            perm_objs = Permission.objects.filter(code__in=perms)
            role.permissions.set(perm_objs)
            org_roles[role_key] = role

        # Migrate users in this org
        memberships = OrganizationMembership.objects.filter(organization_id=org_id)
        for membership in memberships:
            static_role = membership.role
            dynamic_role = org_roles.get(static_role)
            if dynamic_role:
                membership.dynamic_roles.add(dynamic_role)

    print("Migration completed successfully!")


if __name__ == "__main__":
    run()
