from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.db.models import Count, Q, QuerySet, Sum
from django.utils import timezone

from .models import Milestone, Project, ProjectActivity, ProjectFile, ProjectMember

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal activity-logging helper
# ---------------------------------------------------------------------------


class _ActivityLogger:
    """Thin wrapper around ``ProjectActivity.objects.create``.

    Swallows exceptions so that a logging failure never aborts the
    business transaction that triggered it.
    """

    @staticmethod
    def log(
        *,
        project: Project,
        actor,
        event_type: str,
        entity_type: str,
        entity_id: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        try:
            ProjectActivity.objects.create(
                project=project,
                actor=actor,
                event_type=event_type,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id else None,
                metadata=metadata or {},
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to log project activity: %s", exc)


# ---------------------------------------------------------------------------
# ProjectService
# ---------------------------------------------------------------------------


class ProjectService:
    """Handles all Project-level mutations and queries."""

    # -- Query helpers -----------------------------------------------------

    @staticmethod
    def get_base_queryset(*, include_deleted: bool = False) -> QuerySet[Project]:
        """Return the canonical annotated queryset used by views.

        Every place that needs a ``Project`` queryset should call this
        method so that annotations (``member_count``, ``task_count``,
        ``milestone_count``) are always present and consistent.
        """
        qs = Project.all_objects.all() if include_deleted else Project.objects.all()
        return qs.select_related("organization", "owner").annotate(
            member_count=Count(
                "members",
                filter=Q(members__is_deleted=False),
                distinct=True,
            ),
            task_count=Count("tasks", filter=Q(tasks__is_deleted=False), distinct=True),
            completed_task_count=Count(
                "tasks", filter=Q(tasks__is_deleted=False, tasks__is_finished=True), distinct=True
            ),
            milestone_count=Count(
                "milestones", filter=Q(milestones__is_deleted=False), distinct=True
            ),
            completed_milestone_count=Count(
                "milestones",
                filter=Q(milestones__is_deleted=False, milestones__status="completed"),
                distinct=True,
            ),
            # Weighted milestone progress fields
            total_milestone_weight=Sum(
                "milestones__weight",
                filter=Q(milestones__is_deleted=False),
            ),
            completed_milestone_weight=Sum(
                "milestones__weight",
                filter=Q(milestones__is_deleted=False, milestones__status="completed"),
            ),
            # Unlinked tasks = tasks without a milestone
            unlinked_task_count=Count(
                "tasks",
                filter=Q(tasks__is_deleted=False, tasks__milestone__isnull=True),
                distinct=True,
            ),
        )

    @classmethod
    def get_accessible_queryset(cls, user) -> QuerySet[Project]:
        """
        Return projects accessible by the given user.

        Users can see projects if they are:
        - Staff/Superuser (all projects), OR
        - Organization owner (all org projects), OR
        - Organization admin with manage permissions (all org projects), OR
        - Project owner, OR
        - Active project member
        """
        qs = cls.get_base_queryset()

        if user.is_staff or user.is_superuser:
            return qs

        from organizations.models import Organization, OrganizationMembership
        from organizations.services import PermissionService

        # Organizations where user is owner
        owned_org_ids = Organization.objects.filter(owner=user, is_deleted=False).values_list(
            "id", flat=True
        )

        # Organizations where user has admin/manage permissions
        admin_org_ids = []
        memberships = OrganizationMembership.objects.filter(
            user=user, is_deleted=False
        ).select_related("organization")

        for membership in memberships:
            if PermissionService.has_permission(
                user, "org.manage_settings", membership.organization_id
            ) or PermissionService.has_permission(
                user, "project.manage", membership.organization_id
            ):
                admin_org_ids.append(membership.organization_id)

        privileged_org_ids = list(owned_org_ids) + admin_org_ids

        qs = qs.filter(
            Q(organization_id__in=privileged_org_ids)
            | Q(owner=user)
            | Q(members__user=user, members__is_deleted=False)
        ).distinct()

        return qs

    @staticmethod
    def get_project_teams(project: Project) -> QuerySet:
        """Return all teams involved in the project."""
        # Avoid circular imports by importing Team here or assuming it's available
        from organizations.models import Team

        team_filter = Q(project_memberships__project=project, project_memberships__is_deleted=False)
        return Team.objects.filter(team_filter).distinct()

    @classmethod
    def get_with_annotations(cls, pk) -> Project:
        """Fetch a single project with all standard annotations.

        Use this after create / update so the serialiser receives the
        expected annotated fields.
        """
        return cls.get_base_queryset().get(pk=pk)

    # -- Mutations ---------------------------------------------------------

    @classmethod
    @transaction.atomic
    def create(cls, *, actor, validated_data: dict[str, Any]) -> Project:
        """Create a new Project and log a ``PROJECT_CREATED`` event."""
        if not validated_data.get("owner") and actor and actor.is_authenticated:
            validated_data["owner"] = actor

        project = Project.objects.create(**validated_data)

        # Automatically add creator and owner as active project members
        members_to_add = set()
        if actor and actor.is_authenticated:
            members_to_add.add(actor)
        if project.owner and project.owner.is_authenticated:
            members_to_add.add(project.owner)

        for member_user in members_to_add:
            mem = ProjectMember.objects.filter(project=project, user=member_user).first()
            if not mem:
                mem = ProjectMember(
                    project=project,
                    user=member_user,
                    allocation_percentage=100,
                    is_active=True,
                )
                if member_user == actor:
                    mem._skip_project_member_added_signal = True
                mem.save()

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.PROJECT_CREATED,
            entity_type=ProjectActivity.EntityType.PROJECT,
            entity_id=project.pk,
            metadata={"name": project.name, "status": project.status},
        )
        logger.info("Project created: %s (by %s)", project.pk, actor)
        return cls.get_with_annotations(project.pk)

    @classmethod
    @transaction.atomic
    def update(cls, *, project: Project, actor, validated_data: dict[str, Any]) -> Project:
        """Update a Project's fields and manage lifecycle timestamps."""
        old_status = project.status
        new_status = validated_data.get("status", old_status)

        for attr, value in validated_data.items():
            setattr(project, attr, value)

        now = timezone.now()
        if new_status == Project.Status.COMPLETED and old_status != Project.Status.COMPLETED:
            project.completed_at = now
        elif (
            new_status != Project.Status.COMPLETED
            and old_status == Project.Status.COMPLETED
            and new_status != Project.Status.ARCHIVED
        ):
            # Only clear completed_at when moving BACK from completed
            # to a non-terminal state.  ARCHIVED preserves it.
            project.completed_at = None

        if new_status == Project.Status.ARCHIVED and old_status != Project.Status.ARCHIVED:
            project.archived_at = now
        elif new_status != Project.Status.ARCHIVED and old_status == Project.Status.ARCHIVED:
            # Only clear archived_at when moving BACK from archived.
            project.archived_at = None

        project.save()

        metadata: dict[str, Any] = {"updated_fields": list(validated_data.keys())}
        if old_status != new_status:
            metadata["status_changed"] = {"from": old_status, "to": new_status}

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.PROJECT_UPDATED,
            entity_type=ProjectActivity.EntityType.PROJECT,
            entity_id=project.pk,
            metadata=metadata,
        )
        logger.info("Project updated: %s (by %s)", project.pk, actor)
        return cls.get_with_annotations(project.pk)

    @classmethod
    @transaction.atomic
    def archive(cls, *, project: Project, actor) -> Project:
        """Move a project to ARCHIVED status."""
        return cls.update(
            project=project,
            actor=actor,
            validated_data={"status": Project.Status.ARCHIVED},
        )

    @classmethod
    @transaction.atomic
    def complete(cls, *, project: Project, actor) -> Project:
        """Move a project to COMPLETED status."""
        return cls.update(
            project=project,
            actor=actor,
            validated_data={"status": Project.Status.COMPLETED},
        )

    @classmethod
    @transaction.atomic
    def delete(cls, *, project: Project, actor) -> None:
        """Soft-delete a Project and cascade to members / milestones / activities.

        Activities are soft-deleted *before* the deletion log is written
        so the deletion event itself remains visible in the audit trail.
        """
        project.activities.filter(is_deleted=False).update(is_deleted=True)

        # Then: log the deletion event (this new record stays is_deleted=False)
        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.PROJECT_DELETED,
            entity_type=ProjectActivity.EntityType.PROJECT,
            entity_id=project.pk,
            metadata={"name": project.name},
        )

        project.members.filter(is_deleted=False).update(is_deleted=True)
        project.milestones.filter(is_deleted=False).update(is_deleted=True)
        if hasattr(project, "tasks"):
            project.tasks.filter(is_deleted=False).update(is_deleted=True)
        project.delete()  # BaseModel.delete → sets is_deleted=True
        logger.info("Project soft-deleted: %s (by %s)", project.pk, actor)


# ---------------------------------------------------------------------------
# ProjectMemberService
# ---------------------------------------------------------------------------


class ProjectMemberService:
    """Handles all ProjectMember mutations."""

    @staticmethod
    def get_base_queryset(project_id=None) -> QuerySet[ProjectMember]:
        qs = ProjectMember.objects.select_related("user", "team")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    @classmethod
    def get_by_pk(cls, pk) -> ProjectMember:
        return cls.get_base_queryset().get(pk=pk)

    @classmethod
    @transaction.atomic
    def add(cls, *, project: Project, actor, validated_data: dict[str, Any]) -> ProjectMember:
        """Add a member (user or team) to a project.

        If the same user/team was previously soft-deleted from this
        project, we reactivate the existing record instead of creating
        a duplicate to avoid IntegrityError.
        """
        user = validated_data.get("user")
        team = validated_data.get("team")
        reactivated = None
        existing = None

        if user:
            existing = ProjectMember.objects.filter(project=project, user=user).first()
            if not existing:
                reactivated = ProjectMember.all_objects.filter(
                    project=project, user=user, is_deleted=True
                ).first()
        elif team:
            existing = ProjectMember.objects.filter(
                project=project, team=team, user__isnull=True
            ).first()
            if not existing:
                reactivated = ProjectMember.all_objects.filter(
                    project=project, team=team, user__isnull=True, is_deleted=True
                ).first()

        if existing:
            for attr, value in validated_data.items():
                setattr(existing, attr, value)
            existing.is_active = True
            existing.save()
            member = existing
        elif reactivated:
            reactivated.is_deleted = False
            reactivated.is_active = True
            for attr, value in validated_data.items():
                setattr(reactivated, attr, value)
            reactivated.save()
            member = reactivated
        else:
            member = ProjectMember.objects.create(project=project, **validated_data)

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.MEMBER_ADDED,
            entity_type=ProjectActivity.EntityType.MEMBER,
            entity_id=member.pk,
            metadata={
                "user_id": str(member.user_id) if member.user_id else None,
                "team_id": str(member.team_id) if member.team_id else None,
                "specialty": member.specialty,
                "allocation_percentage": member.allocation_percentage,
            },
        )
        logger.info("Member %s added to project %s (by %s)", member.pk, project.pk, actor)

        if team and not user:
            from organizations.models import TeamMembership

            team_memberships = TeamMembership.objects.filter(
                team=team, is_deleted=False
            ).select_related("user")

            # Optimization: Fetch existing project member user IDs to avoid N+1 queries
            existing_user_ids = set(
                ProjectMember.objects.filter(
                    project=project,
                    user__in=[tm.user_id for tm in team_memberships],
                    is_deleted=False,
                ).values_list("user_id", flat=True)
            )

            for tm in team_memberships:
                if tm.user_id not in existing_user_ids:
                    user_data = validated_data.copy()
                    user_data.pop("team", None)
                    user_data["user"] = tm.user
                    if "allocation_percentage" not in user_data:
                        user_data["allocation_percentage"] = 100

                    cls.add(
                        project=project,
                        actor=actor,
                        validated_data=user_data,
                    )

        return cls.get_by_pk(member.pk)

    @classmethod
    @transaction.atomic
    def update(
        cls, *, member: ProjectMember, actor, validated_data: dict[str, Any]
    ) -> ProjectMember:
        """Update a project member's allocation or specialty."""
        for attr, value in validated_data.items():
            setattr(member, attr, value)
        member.save()

        _ActivityLogger.log(
            project=member.project,
            actor=actor,
            event_type=ProjectActivity.EventType.MEMBER_UPDATED,
            entity_type=ProjectActivity.EntityType.MEMBER,
            entity_id=member.pk,
            metadata={"updated_fields": list(validated_data.keys())},
        )
        logger.info(
            "Member %s updated in project %s (by %s)",
            member.pk,
            member.project_id,
            actor,
        )
        return cls.get_by_pk(member.pk)

    @classmethod
    @transaction.atomic
    def remove(cls, *, member: ProjectMember, actor) -> None:
        """Soft-delete a project member."""
        project = member.project
        user_id = str(member.user_id) if member.user_id else None

        member.delete()  # soft delete via BaseModel

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.MEMBER_REMOVED,
            entity_type=ProjectActivity.EntityType.MEMBER,
            entity_id=member.pk,
            metadata={"user_id": user_id},
        )
        logger.info("Member %s removed from project %s (by %s)", member.pk, project.pk, actor)

    @classmethod
    @transaction.atomic
    def update_salary(
        cls,
        *,
        member: ProjectMember,
        actor,
        salary_type: str | None,
        salary_amount,
    ) -> ProjectMember:
        """Set a project-level salary override for a member.

        This marks ``salary_override=True`` so that future changes to the
        org-level salary will NOT cascade to this member in this project.
        """
        from finance.services import FinanceService

        FinanceService.set_project_salary(
            user=member.user, project=member.project, payment_type=salary_type, rate=salary_amount
        )

        _ActivityLogger.log(
            project=member.project,
            actor=actor,
            event_type=ProjectActivity.EventType.MEMBER_UPDATED,
            entity_type=ProjectActivity.EntityType.MEMBER,
            entity_id=member.pk,
            metadata={
                "salary_type": salary_type,
                "salary_amount": str(salary_amount) if salary_amount is not None else None,
                "salary_override": True,
            },
        )
        logger.info(
            "Project-level salary set for member %s in project %s (by %s)",
            member.pk,
            member.project_id,
            actor,
        )
        return cls.get_by_pk(member.pk)

    @classmethod
    @transaction.atomic
    def reset_salary_to_org(cls, *, member: ProjectMember, actor) -> ProjectMember:
        """Reset a member's salary back to the org-level value.

        Clears the ``salary_override`` flag so future org-level changes
        will again propagate to this member in this project.
        """
        from finance.services import FinanceService

        FinanceService.reset_project_salary(
            user=member.user,
            project=member.project,
        )

        _ActivityLogger.log(
            project=member.project,
            actor=actor,
            event_type=ProjectActivity.EventType.MEMBER_UPDATED,
            entity_type=ProjectActivity.EntityType.MEMBER,
            entity_id=member.pk,
            metadata={"salary_override": False, "reset_to_org": True},
        )
        logger.info(
            "Salary reset to org-level for member %s in project %s (by %s)",
            member.pk,
            member.project_id,
            actor,
        )
        return cls.get_by_pk(member.pk)


# ---------------------------------------------------------------------------
# MilestoneService
# ---------------------------------------------------------------------------


class MilestoneService:
    @classmethod
    @transaction.atomic
    def sync_completion_status(cls, milestone_id: str, actor=None):
        """Automatically updates milestone status to COMPLETED if all tasks are finished, or IN_PROGRESS otherwise."""
        milestone = Milestone.objects.get(pk=milestone_id)

        from django.db.models import Count, Q

        stats = milestone.tasks.filter(is_deleted=False).aggregate(
            total=Count("id"), done=Count("id", filter=Q(is_finished=True))
        )
        total = stats["total"] or 0
        done = stats["done"] or 0

        if total > 0 and done == total:
            if milestone.status != Milestone.Status.COMPLETED:
                cls.update(
                    milestone=milestone,
                    actor=actor,
                    validated_data={"status": Milestone.Status.COMPLETED},
                )
        else:
            if milestone.status == Milestone.Status.COMPLETED:
                cls.update(
                    milestone=milestone,
                    actor=actor,
                    validated_data={"status": Milestone.Status.IN_PROGRESS},
                )

    """Handles all Milestone mutations."""

    @staticmethod
    def get_base_queryset(project_id=None) -> QuerySet[Milestone]:
        qs = Milestone.objects.annotate(
            task_count=Count("tasks", filter=Q(tasks__is_deleted=False)),
            completed_task_count=Count(
                "tasks", filter=Q(tasks__is_deleted=False, tasks__is_finished=True)
            ),
        )
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    @classmethod
    def get_by_pk(cls, pk) -> Milestone:
        return cls.get_base_queryset().get(pk=pk)

    @classmethod
    @transaction.atomic
    def create(cls, *, project: Project, actor, validated_data: dict[str, Any]) -> Milestone:
        """Create a new Milestone under a project."""
        milestone = Milestone.objects.create(project=project, **validated_data)

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.MILESTONE_CREATED,
            entity_type=ProjectActivity.EntityType.MILESTONE,
            entity_id=milestone.pk,
            metadata={
                "title": milestone.title,
                "target_date": str(milestone.target_date),
            },
        )
        logger.info(
            "Milestone %s created in project %s (by %s)",
            milestone.pk,
            project.pk,
            actor,
        )
        return cls.get_by_pk(milestone.pk)

    @classmethod
    @transaction.atomic
    def update(cls, *, milestone: Milestone, actor, validated_data: dict[str, Any]) -> Milestone:
        """Update a Milestone and manage completion timestamp."""
        old_status = milestone.status
        new_status = validated_data.get("status", old_status)

        for attr, value in validated_data.items():
            setattr(milestone, attr, value)

        if new_status == Milestone.Status.COMPLETED and old_status != Milestone.Status.COMPLETED:
            milestone.completed_at = timezone.now()
        elif new_status != Milestone.Status.COMPLETED and old_status == Milestone.Status.COMPLETED:
            # Only clear completed_at when moving BACK from completed.
            milestone.completed_at = None

        milestone.save()

        event_type = (
            ProjectActivity.EventType.MILESTONE_COMPLETED
            if new_status == Milestone.Status.COMPLETED and old_status != Milestone.Status.COMPLETED
            else ProjectActivity.EventType.MILESTONE_UPDATED
        )
        _ActivityLogger.log(
            project=milestone.project,
            actor=actor,
            event_type=event_type,
            entity_type=ProjectActivity.EntityType.MILESTONE,
            entity_id=milestone.pk,
            metadata={"updated_fields": list(validated_data.keys())},
        )
        logger.info(
            "Milestone %s updated in project %s (by %s)",
            milestone.pk,
            milestone.project_id,
            actor,
        )
        return cls.get_by_pk(milestone.pk)

    @classmethod
    @transaction.atomic
    def delete(cls, *, milestone: Milestone, actor) -> None:
        """Soft-delete a Milestone."""
        project = milestone.project
        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.MILESTONE_DELETED,
            entity_type=ProjectActivity.EntityType.MILESTONE,
            entity_id=milestone.pk,
            metadata={"title": milestone.title},
        )

        # Unlink all tasks connected to this milestone so they become orphans instead of zombies
        if hasattr(milestone, "tasks"):
            milestone.tasks.update(milestone=None)

        milestone.delete()  # soft delete
        logger.info(
            "Milestone %s soft-deleted from project %s (by %s)",
            milestone.pk,
            project.pk,
            actor,
        )


# ---------------------------------------------------------------------------
# ProjectActivityService
# ---------------------------------------------------------------------------


class ProjectActivityService:
    """Handles all ProjectActivity queries."""

    @staticmethod
    def get_base_queryset(project_id: str) -> QuerySet[ProjectActivity]:
        return ProjectActivity.objects.filter(project_id=project_id).select_related(
            "actor", "project"
        )


# ---------------------------------------------------------------------------
# ProjectFileService
# ---------------------------------------------------------------------------


class ProjectFileService:
    """Handles all ProjectFile mutations and queries."""

    @staticmethod
    def get_base_queryset(project_id: str) -> QuerySet[ProjectFile]:
        return ProjectFile.objects.filter(project_id=project_id, is_deleted=False).select_related(
            "uploaded_by", "project"
        )

    @classmethod
    @transaction.atomic
    def create(
        cls, *, project: Project, actor, file_obj, description: str = "", name: str = ""
    ) -> ProjectFile:
        original_name = name.strip() or getattr(file_obj, "name", "file")
        ext = original_name.split(".")[-1].lower() if "." in original_name else ""

        file_type = "other"
        if ext in ["jpg", "jpeg", "png", "gif", "webp", "svg"]:
            file_type = "image"
        elif ext == "pdf":
            file_type = "pdf"
        elif ext in ["doc", "docx", "txt", "md", "xls", "xlsx", "csv"]:
            file_type = "document"
        elif ext in ["zip", "rar", "7z", "tar", "gz"]:
            file_type = "archive"

        size_bytes = getattr(file_obj, "size", 0)
        if size_bytes >= 1024 * 1024:
            file_size_str = f"{size_bytes / (1024 * 1024):.2f} MB"
        else:
            file_size_str = f"{size_bytes / 1024:.1f} KB"

        project_file = ProjectFile.objects.create(
            project=project,
            uploaded_by=actor,
            file=file_obj,
            name=original_name,
            description=description.strip(),
            file_size=file_size_str,
            file_type=file_type,
        )

        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.FILE_UPLOADED,
            entity_type=ProjectActivity.EntityType.FILE,
            entity_id=project_file.pk,
            metadata={"filename": original_name, "size": file_size_str},
        )

        cls._dispatch_mentions(
            project=project,
            project_file=project_file,
            actor=actor,
            message=description,
        )

        logger.info(
            "ProjectFile %s uploaded to project %s (by %s)",
            project_file.pk,
            project.pk,
            actor,
        )
        return project_file

    @classmethod
    @transaction.atomic
    def update_description(
        cls, *, project_file: ProjectFile, actor, description: str
    ) -> ProjectFile:
        project_file.description = description.strip()
        project_file.save(update_fields=["description", "updated_at"])

        cls._dispatch_mentions(
            project=project_file.project,
            project_file=project_file,
            actor=actor,
            message=description,
        )
        return project_file

    @classmethod
    @transaction.atomic
    def delete(cls, *, project_file: ProjectFile, actor) -> None:
        project = project_file.project
        _ActivityLogger.log(
            project=project,
            actor=actor,
            event_type=ProjectActivity.EventType.FILE_DELETED,
            entity_type=ProjectActivity.EntityType.FILE,
            entity_id=project_file.pk,
            metadata={"filename": project_file.name},
        )
        project_file.delete()  # soft delete
        logger.info(
            "ProjectFile %s soft-deleted from project %s (by %s)",
            project_file.pk,
            project.pk,
            actor,
        )

    @staticmethod
    def _dispatch_mentions(
        *, project: Project, project_file: ProjectFile, actor, message: str
    ) -> None:
        if not message or "@" not in message:
            return

        import re
        from django.contrib.auth import get_user_model
        from django.db.models.functions import Lower
        from automations.events import EventDispatcher

        usernames = re.findall(r"@([\w.-]+)", message)
        if not usernames:
            return

        lower_usernames = [u.lower() for u in usernames]
        User = get_user_model()
        mentioned_users = list(
            User.objects.annotate(lower_uname=Lower("username"))
            .filter(lower_uname__in=lower_usernames, is_active=True)
        )
        if not mentioned_users:
            return

        try:
            EventDispatcher.dispatch(
                event_type="user_mentioned",
                payload={
                    "author": actor.get_full_name() or actor.username,
                    "author_id": str(actor.id),
                    "author_name": actor.get_full_name() or actor.username,
                    "mentioned_user_ids": [str(u.id) for u in mentioned_users],
                    "recipient_ids": [str(u.id) for u in mentioned_users],
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "file_id": str(project_file.id),
                    "file_name": str(project_file.name),
                    "context_name": str(project_file.name),
                    "context_type": "file",
                    "message": message,
                    "link": f"/tasks?project={project.id}&view=files&file={project_file.id}",
                },
            )
        except Exception as exc:
            logger.warning(
                "Failed to dispatch mention notification on file %s: %s",
                project_file.id,
                exc,
            )
