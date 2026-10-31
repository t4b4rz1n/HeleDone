"""
Centralized constants for Organization Roles, Permissions, and Default Mappings.
Eliminates duplication across signals, services, views, and migrations.
"""

SYSTEM_PERMISSIONS = [
    {"code": "org.view", "name": "View Organization", "module": "core"},
    {"code": "org.manage_settings", "name": "Manage Org Settings", "module": "core"},
    {"code": "org.manage_roles", "name": "Manage Roles & Permissions", "module": "core"},
    {"code": "org.manage_members", "name": "Manage Organization Members", "module": "core"},
    {"code": "user.view", "name": "View Users List", "module": "core"},
    {"code": "role.view", "name": "View Roles List", "module": "core"},
    {"code": "project.view", "name": "View Projects", "module": "projects"},
    {"code": "project.create", "name": "Create New Project", "module": "projects"},
    {"code": "project.manage", "name": "Manage All Projects", "module": "projects"},
    {"code": "task.view", "name": "View Tasks", "module": "tasks"},
    {"code": "task.create", "name": "Create Task", "module": "tasks"},
    {"code": "task.manage_all", "name": "Manage All Tasks", "module": "tasks"},
    {"code": "task.review", "name": "Review & Approve Tasks", "module": "tasks"},
    {"code": "board.view", "name": "View Kanban Boards", "module": "tasks"},
    {"code": "board.manage", "name": "Manage Boards & Columns", "module": "tasks"},
    {"code": "attendance.view", "name": "View Personal Attendance", "module": "attendance"},
    {
        "code": "attendance.view_all",
        "name": "View All Member Attendances",
        "module": "attendance",
    },
    {
        "code": "leave.approve",
        "name": "Approve & Reject Leave Requests",
        "module": "attendance",
    },
    {
        "code": "finance.manage",
        "name": "Manage Payroll & Financial Records",
        "module": "billing",
    },
    {"code": "finance.view_reports", "name": "View Financial Reports", "module": "billing"},
    {"code": "notification.view", "name": "View Notifications", "module": "automations"},
    {"code": "automation.manage", "name": "Manage Automation Rules", "module": "automations"},
    {"code": "report.view", "name": "View Executive & Manager Reports", "module": "reports"},
]

# Organization-wide access can only be assigned by platform staff.
ORG_LEVEL_PERMISSION_CODES = frozenset(
    permission["code"]
    for permission in SYSTEM_PERMISSIONS
    if permission["code"].startswith("org.") or permission["code"] in {"user.view", "role.view"}
)

DEFAULT_ORG_PERMISSIONS = [
    "org.view",
    "user.view",
    "role.view",
    "project.view",
    "task.view",
    "board.view",
    "notification.view",
]


# Legacy Static Role -> Dynamic Permission Codes Mapping
COMPATIBILITY_ROLE_PERMISSIONS_MAP = {
    "owner": [
        "org.view", "org.manage_settings", "org.manage_roles", "org.manage_members",
        "user.view", "role.view", "project.view", "project.create", "project.manage",
        "task.view", "task.create", "task.manage_all", "task.review", "board.view",
        "board.manage", "attendance.view", "attendance.view_all", "leave.approve",
        "finance.manage", "finance.view_reports", "notification.view", "automation.manage",
        "report.view",
    ],
    "employee": [
        "org.view", "user.view", "role.view", "project.view", "task.view", "task.create",
        "board.view", "attendance.view", "notification.view",
    ],
}

# Dynamically injected for users who are Team.leader
TEAM_LEAD_PERMISSIONS = [
    "user.view",
    "project.view",
    "task.view",
    "task.create",
    "board.view",
    "attendance.view",
    "notification.view",
    "report.view_team_lead",
]

SYSTEM_DEFAULT_ROLES = [
    {
        "name": "Owner",
        "description": "Full access to all organization settings, finances, projects, and roles.",
        "is_protected": True,
        "permissions": COMPATIBILITY_ROLE_PERMISSIONS_MAP["owner"],
    },
    {
        "name": "Employee",
        "description": "Standard member with view access to projects and personal task execution.",
        "is_protected": False,
        "permissions": COMPATIBILITY_ROLE_PERMISSIONS_MAP["employee"],
    },
]
