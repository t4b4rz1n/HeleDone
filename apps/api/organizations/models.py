from django.conf import settings
from django.db import models

from common.models import BaseModel


class Organization(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, db_index=True)
    description = models.TextField(blank=True)
    currency = models.CharField(
        max_length=10,
        default="IRR",
        help_text="Default currency for the organization",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_organizations",
    )

    class Meta:
        db_table = "organizations"
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Team(BaseModel):
    name = models.CharField(max_length=100)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="teams",
    )
    leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_teams",
        verbose_name="Team Lead",
    )
    parent_team = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subteams",
        verbose_name="Parent Team",
    )
    description = models.TextField(blank=True)

    class Meta:
        db_table = "teams"
        verbose_name = "Team"
        verbose_name_plural = "Teams"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                condition=models.Q(is_deleted=False),
                name="unique_team_org_name_active",
            )
        ]

    def __str__(self):
        return self.name


class Permission(BaseModel):
    code = models.CharField(
        max_length=100, unique=True, db_index=True, help_text="e.g., 'task.create', 'leave.approve'"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    module = models.CharField(max_length=50, help_text="e.g., 'tasks', 'attendance', 'core'")

    class Meta:
        db_table = "permissions"
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"
        ordering = ["module", "code"]

    def __str__(self):
        return f"{self.module} - {self.code}"


class Role(BaseModel):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="custom_roles",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_protected = models.BooleanField(
        default=False,
        help_text="Protected roles (like Owner) cannot be deleted or completely stripped of permissions.",
    )
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)

    class Meta:
        db_table = "roles"
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        ordering = ["organization", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                condition=models.Q(is_deleted=False),
                name="unique_active_role_name_per_org",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class OrganizationMembership(BaseModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        EMPLOYEE = "employee", "Employee"

    class SalaryType(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        HOURLY = "hourly", "Hourly"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="org_memberships",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        null=True,
        blank=True,
        default=None,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invited_memberships",
    )
    dynamic_roles = models.ManyToManyField(
        "Role",
        related_name="memberships",
        blank=True,
        verbose_name="Dynamic Roles",
        help_text="The new permission-based roles assigned to this member.",
    )

    class Meta:
        db_table = "organization_memberships"
        verbose_name = "Organization Membership"
        verbose_name_plural = "Organization Memberships"
        ordering = ["-created_at"]  # BaseModel provides created_at
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"],
                condition=models.Q(is_deleted=False),
                name="unique_active_org_membership_user_org",
            )
        ]

    def __str__(self):
        return f"{self.user_id} - {self.organization_id} ({self.role})"


class TeamMembership(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="memberships",
    )

    class Meta:
        db_table = "team_memberships"
        verbose_name = "Team Membership"
        verbose_name_plural = "Team Memberships"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "team"],
                condition=models.Q(is_deleted=False),
                name="unique_active_team_membership_user_team",
            )
        ]

    def __str__(self):
        return f"{self.user_id} - {self.team_id}"


class OrganizationAuditLog(BaseModel):
    class Action(models.TextChoices):
        ROLE_CREATED = "role_created", "Role Created"
        ROLE_UPDATED = "role_updated", "Role Updated"
        ROLE_DELETED = "role_deleted", "Role Deleted"
        PERMISSION_GRANTED = "permission_granted", "Permission Granted"
        PERMISSION_REVOKED = "permission_revoked", "Permission Revoked"
        NOTIFICATION_POLICY_CHANGED = "notification_policy_changed", "Notification Policy Changed"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="performed_org_audits",
    )
    action = models.CharField(max_length=50, choices=Action.choices)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="targeted_org_audits",
        help_text="The user who was affected by this action (e.g. granted a role).",
    )
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Detailed payload about what changed (e.g. which permissions were added).",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "organization_audit_logs"
        verbose_name = "Organization Audit Log"
        verbose_name_plural = "Organization Audit Logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.organization.name} - {self.action} by {self.actor_id}"
