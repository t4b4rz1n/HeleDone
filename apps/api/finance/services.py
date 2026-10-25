"""
FinanceService — core salary logic for Madaar.

Responsibilities:
- set_org_salary(user, organization, payment_type, rate)
- set_project_salary(user, project, payment_type, rate)
- get_effective_salary(user, organization, project=None) → dict
- reset_project_salary(user, project)
- get_user_finance_summary(user, organization) → dict  (for UserFinanceDashboard)
- get_org_finance_report(organization) → list[dict]   (for AdminFinanceDashboard)
- get_project_billing(project) → dict                 (for ProjectBillingTab)
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce

logger = logging.getLogger(__name__)


class FinanceService:
    # ------------------------------------------------------------------
    # Salary configuration helpers
    # ------------------------------------------------------------------

    @classmethod
    @transaction.atomic
    def set_org_salary(cls, *, user, organization, payment_type: str, rate):
        """Create or update the org-level (default) salary for a user."""
        from finance.models import SalaryConfig

        rate = Decimal(str(rate)) if rate is not None else Decimal("0")

        # Deactivate old configs
        SalaryConfig.objects.filter(
            user=user,
            organization=organization,
            project__isnull=True,
            is_active=True,
            is_deleted=False,
        ).update(is_active=False)

        config = SalaryConfig.objects.create(
            user=user,
            organization=organization,
            project=None,
            payment_type=payment_type or SalaryConfig.PaymentType.MONTHLY,
            rate=rate,
        )
        logger.info("Org salary set for user %s in org %s", user.pk, organization.pk)
        return config

    @classmethod
    @transaction.atomic
    def set_project_salary(cls, *, user, project, payment_type: str | None = None, rate=None):
        """Create or update a project-level salary override for a user."""
        from finance.models import SalaryConfig

        rate = Decimal(str(rate)) if rate is not None else None
        organization = project.organization

        # Deactivate old project-level configs for this user/project
        SalaryConfig.objects.filter(
            user=user,
            organization=organization,
            project=project,
            is_active=True,
            is_deleted=False,
        ).update(is_active=False)

        # If no explicit type/rate, fall back to org-level values
        if payment_type is None or rate is None:
            org_config = cls.get_active_org_config(user, organization)
            if org_config:
                payment_type = payment_type or org_config.payment_type
                rate = rate if rate is not None else org_config.rate

        config = SalaryConfig.objects.create(
            user=user,
            organization=organization,
            project=project,
            payment_type=payment_type or SalaryConfig.PaymentType.MONTHLY,
            rate=rate or Decimal("0"),
        )
        logger.info("Project salary set for user %s in project %s", user.pk, project.pk)
        return config

    @classmethod
    def reset_project_salary(cls, *, user, project) -> None:
        """Remove the project-level override so org-level salary takes effect again."""
        from finance.models import SalaryConfig

        SalaryConfig.objects.filter(
            user=user,
            organization=project.organization,
            project=project,
            is_active=True,
            is_deleted=False,
        ).update(is_active=False, is_deleted=True)
        logger.info("Project salary reset for user %s in project %s", user.pk, project.pk)

    @classmethod
    def get_active_org_config(cls, user, organization):
        """Return the active org-level SalaryConfig or None."""
        from finance.models import SalaryConfig

        return (
            SalaryConfig.objects.filter(
                user=user,
                organization=organization,
                project__isnull=True,
                is_active=True,
                is_deleted=False,
            )
            .order_by("-created_at")
            .first()
        )

    @classmethod
    def get_active_project_config(cls, user, organization, project):
        """Return the active project-level SalaryConfig or None."""
        from finance.models import SalaryConfig

        return (
            SalaryConfig.objects.filter(
                user=user,
                organization=organization,
                project=project,
                is_active=True,
                is_deleted=False,
            )
            .order_by("-created_at")
            .first()
        )

    @classmethod
    def get_effective_salary(cls, user, organization, project=None) -> dict:
        """
        Return the effective salary for a user in a given scope.

        Priority: project-level config > org-level config > defaults.
        Returns a dict with keys: type, amount, override, currency.
        """
        if user is None:
            return {"type": None, "amount": None, "override": False, "currency": "IRR"}

        project_config = None
        if project:
            project_config = cls.get_active_project_config(user, organization, project)

        if project_config:
            return {
                "type": project_config.payment_type,
                "amount": project_config.rate,
                "override": True,
                "currency": project_config.currency,
                # also expose flat dict keys for org serializers
                "payment_type": project_config.payment_type,
                "rate": project_config.rate,
            }

        org_config = cls.get_active_org_config(user, organization)
        if org_config:
            return {
                "type": org_config.payment_type,
                "amount": org_config.rate,
                "override": False,
                "currency": org_config.currency,
                "payment_type": org_config.payment_type,
                "rate": org_config.rate,
            }

        return {
            "type": None,
            "amount": None,
            "override": False,
            "currency": "IRR",
            "payment_type": None,
            "rate": None,
        }

    # ------------------------------------------------------------------
    # Finance reporting
    # ------------------------------------------------------------------

    @classmethod
    def get_user_finance_summary(cls, user, organization) -> dict:
        """
        Build the UserFinanceDashboard payload for a given user.
        Aggregates earnings per project (based on hours logged × rate or monthly rate).
        """
        from attendance.models import TimeLog
        from finance.models import SalaryConfig
        from projects.models import Project, ProjectMember

        memberships = ProjectMember.objects.filter(
            user=user,
            project__organization=organization,
            is_active=True,
            is_deleted=False,
        ).select_related("project__organization")

        projects_by_id = {membership.project_id: membership.project for membership in memberships}

        # A user's recorded work is attributable through TimeLog.user/project,
        # even when the task itself has no assignee or the logger is not an
        # active ProjectMember. Coalesce supports older logs with project=NULL.
        timelogs = (
            TimeLog.objects.filter(user=user, is_deleted=False)
            .filter(
                Q(project__organization=organization, project__is_deleted=False)
                | Q(task__project__organization=organization, task__project__is_deleted=False)
            )
            .annotate(logged_project_id=Coalesce("project_id", "task__project_id"))
            .filter(logged_project_id__isnull=False)
            .values("logged_project_id")
            .annotate(total=Sum("duration_seconds"))
        )
        timelog_map = {row["logged_project_id"]: row["total"] or 0 for row in timelogs}

        member_project_ids = set(projects_by_id)
        tracked_project_ids = set(timelog_map) - member_project_ids
        if tracked_project_ids:
            projects_by_id.update(
                {
                    project.pk: project
                    for project in Project.objects.filter(
                        pk__in=tracked_project_ids,
                        organization=organization,
                        is_deleted=False,
                    ).select_related("organization")
                }
            )
        projects = list(projects_by_id.values())

        configs = SalaryConfig.objects.filter(
            user=user, organization=organization, is_active=True, is_deleted=False
        ).order_by("-created_at")

        org_config = None
        project_configs = {}
        for c in configs:
            if c.project_id:
                if c.project_id not in project_configs:
                    project_configs[c.project_id] = c
            else:
                if not org_config:
                    org_config = c

        projects_data = []
        total_earned = Decimal("0")
        org_monthly_counted = False

        for project in projects:
            c = project_configs.get(project.pk)
            if c:
                payment_type, rate, override, currency = c.payment_type, c.rate, True, c.currency
            elif org_config:
                payment_type, rate, override, currency = (
                    org_config.payment_type,
                    org_config.rate,
                    False,
                    org_config.currency,
                )
            else:
                payment_type, rate, override, currency = None, Decimal("0"), False, "IRR"

            seconds = timelog_map.get(project.pk, 0)
            total_hours = Decimal(str(seconds)) / Decimal("3600")

            if payment_type == "hourly":
                earned = rate * total_hours if total_hours else Decimal("0")
            elif payment_type == "monthly":
                # Preserve current monthly earnings on active membership rows.
                # A project included only because this user logged time must not
                # add the same org-level monthly salary again.
                if override or project.pk in member_project_ids or not org_monthly_counted:
                    earned = rate
                    if not override:
                        org_monthly_counted = True
                else:
                    earned = Decimal("0")
            else:
                earned = Decimal("0")

            total_earned += earned

            projects_data.append(
                {
                    "project_id": str(project.pk),
                    "project_name": project.name,
                    "payment_type": payment_type,
                    "rate": float(rate),
                    "total_worked_hours": float(total_hours),
                    "total_earned": float(earned),
                    "total_paid": 0.0,
                    "current_balance": float(earned),
                    "currency": currency,
                    "salary_override": override,
                }
            )

        return {
            "user_id": str(user.pk),
            "total_income": float(total_earned),
            "total_paid": 0.0,
            "current_balance": float(total_earned),
            "currency": "IRR",
            "projects": projects_data,
        }

    @classmethod
    def _get_worked_hours(cls, user, project) -> Decimal:
        """Return total logged hours for a user in a project (from attendance/time logs)."""
        try:
            from attendance.models import TimeLog

            result = TimeLog.objects.filter(
                user=user,
                task__project=project,
                is_deleted=False,
            ).aggregate(total=Sum("duration_seconds"))
            seconds = result.get("total") or 0
            return Decimal(str(seconds)) / Decimal("3600")
        except Exception:
            return Decimal("0")

    @classmethod
    def get_org_finance_report(cls, organization, memberships=None) -> list:
        """
        Build the AdminFinanceDashboard payload — one entry per user.
        Uses bulk prefetching to prevent N+1 queries.
        """
        from attendance.models import TimeLog
        from finance.models import SalaryConfig
        from organizations.models import OrganizationMembership
        from projects.models import Project, ProjectMember

        if memberships is None:
            memberships = OrganizationMembership.objects.filter(
                organization=organization,
                is_deleted=False,
            ).select_related("user")

        users = [m.user for m in memberships if m.user]
        user_ids = [u.pk for u in users]
        if not user_ids:
            return []

        # 1. Active Projects per user
        project_members = ProjectMember.objects.filter(
            user_id__in=user_ids,
            project__organization=organization,
            is_active=True,
            is_deleted=False,
        ).select_related("project")

        user_projects_map = {uid: {} for uid in user_ids}
        for pm in project_members:
            user_projects_map[pm.user_id][pm.project_id] = pm.project
        member_project_ids_by_user = {
            user_id: set(projects_by_id) for user_id, projects_by_id in user_projects_map.items()
        }

        # 2. Salary Configs
        configs = SalaryConfig.objects.filter(
            user_id__in=user_ids, organization=organization, is_active=True, is_deleted=False
        ).order_by("-created_at")

        org_configs = {}
        project_configs = {}
        for c in configs:
            if c.project_id:
                if (c.user_id, c.project_id) not in project_configs:
                    project_configs[(c.user_id, c.project_id)] = c
            else:
                if c.user_id not in org_configs:
                    org_configs[c.user_id] = c

        # 3. TimeLogs Aggregation
        timelogs = list(
            TimeLog.objects.filter(user_id__in=user_ids, is_deleted=False)
            .filter(
                Q(project__organization=organization, project__is_deleted=False)
                | Q(task__project__organization=organization, task__project__is_deleted=False)
            )
            .annotate(logged_project_id=Coalesce("project_id", "task__project_id"))
            .filter(logged_project_id__isnull=False)
            .values("user_id", "logged_project_id")
            .annotate(total=Sum("duration_seconds"))
        )

        timelog_map = {}
        logged_project_ids = set()
        for tl in timelogs:
            project_id = tl["logged_project_id"]
            timelog_map[(tl["user_id"], project_id)] = tl["total"] or 0
            logged_project_ids.add(project_id)

        projects_by_id = {
            project.pk: project
            for project in Project.objects.filter(
                pk__in=logged_project_ids,
                organization=organization,
                is_deleted=False,
            )
        }
        for tl in timelogs:
            project = projects_by_id.get(tl["logged_project_id"])
            if project is not None:
                user_projects_map[tl["user_id"]][project.pk] = project

        def _get_eff_salary(u_id, p_id):
            c = project_configs.get((u_id, p_id))
            if c:
                return {
                    "type": c.payment_type,
                    "amount": c.rate,
                    "override": True,
                    "currency": c.currency,
                }
            c = org_configs.get(u_id)
            if c:
                return {
                    "type": c.payment_type,
                    "amount": c.rate,
                    "override": False,
                    "currency": c.currency,
                }
            return {"type": None, "amount": None, "override": False, "currency": "IRR"}

        report = []
        for membership in memberships:
            user = membership.user
            if not user:
                continue

            projects = list(user_projects_map[user.pk].values())
            total_earned = Decimal("0")
            currency = "IRR"
            org_monthly_counted = False

            for project in projects:
                salary = _get_eff_salary(user.pk, project.pk)
                payment_type = salary["type"]
                rate = Decimal(str(salary["amount"] or 0))
                currency = salary["currency"]

                seconds = timelog_map.get((user.pk, project.pk), 0)
                total_hours = Decimal(str(seconds)) / Decimal("3600")

                if payment_type == "hourly":
                    earned = rate * total_hours if total_hours else Decimal("0")
                elif payment_type == "monthly":
                    if (
                        salary["override"]
                        or project.pk in member_project_ids_by_user[user.pk]
                        or not org_monthly_counted
                    ):
                        earned = rate
                        if not salary["override"]:
                            org_monthly_counted = True
                    else:
                        earned = Decimal("0")
                else:
                    earned = Decimal("0")

                total_earned += earned

            report.append(
                {
                    "user_id": str(user.pk),
                    "username": user.username,
                    "first_name": user.first_name or "",
                    "last_name": user.last_name or "",
                    "active_projects": len(projects),
                    "total_income": float(total_earned),
                    "total_paid": 0.0,
                    "current_balance": float(total_earned),
                    "currency": currency,
                }
            )

        return report

    @classmethod
    def get_project_billing(cls, project, members=None) -> dict:
        """
        Build the ProjectBillingTab payload — one entry per member, plus totals.
        Uses bulk prefetching to prevent N+1 queries.
        """
        from attendance.models import TimeLog
        from finance.models import SalaryConfig
        from projects.models import ProjectMember

        if members is None:
            members = ProjectMember.objects.filter(
                project=project,
                is_active=True,
                is_deleted=False,
            ).select_related("user", "project__organization")

        users = [m.user for m in members if m.user]
        user_ids = [u.pk for u in users]

        # Bulk fetch salary configs
        configs = SalaryConfig.objects.filter(
            user_id__in=user_ids,
            organization=project.organization,
            is_active=True,
            is_deleted=False,
        ).order_by("-created_at")

        org_configs = {}
        project_configs = {}
        for c in configs:
            if c.project_id == project.pk:
                if c.user_id not in project_configs:
                    project_configs[c.user_id] = c
            elif not c.project_id:
                if c.user_id not in org_configs:
                    org_configs[c.user_id] = c

        # Bulk fetch timelogs
        timelogs = (
            TimeLog.objects.filter(user_id__in=user_ids, task__project=project, is_deleted=False)
            .values("user_id")
            .annotate(total=Sum("duration_seconds"))
        )

        timelog_map = {tl["user_id"]: tl["total"] or 0 for tl in timelogs}

        members_data = []
        total_cost = Decimal("0")

        for member in members:
            if not member.user:
                continue

            c = project_configs.get(member.user.pk)
            if c:
                payment_type, rate, override, currency = c.payment_type, c.rate, True, c.currency
            else:
                c = org_configs.get(member.user.pk)
                if c:
                    payment_type, rate, override, currency = (
                        c.payment_type,
                        c.rate,
                        False,
                        c.currency,
                    )
                else:
                    payment_type, rate, override, currency = None, Decimal("0"), False, "IRR"

            seconds = timelog_map.get(member.user.pk, 0)
            total_hours = Decimal(str(seconds)) / Decimal("3600")

            if payment_type == "hourly":
                cost = rate * total_hours if total_hours else Decimal("0")
            elif payment_type == "monthly":
                cost = rate
            else:
                cost = Decimal("0")

            total_cost += cost

            members_data.append(
                {
                    "user_id": str(member.user.pk),
                    "username": member.user.username,
                    "first_name": member.user.first_name or "",
                    "last_name": member.user.last_name or "",
                    "specialty": member.specialty or "",
                    "allocation_percentage": member.allocation_percentage,
                    "payment_type": payment_type,
                    "rate": float(rate),
                    "currency": currency,
                    "salary_override": override,
                    "total_worked_hours": float(total_hours),
                    "total_cost": float(cost),
                }
            )

        return {
            "project_id": str(project.pk),
            "project_name": project.name,
            "total_cost": float(total_cost),
            "currency": "IRR",
            "members": members_data,
        }
