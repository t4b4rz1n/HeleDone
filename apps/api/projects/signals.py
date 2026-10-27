from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from automations.events import EventDispatcher

from .models import Milestone, Project, ProjectMember


@receiver(pre_save, sender=ProjectMember)
def cache_previous_project_member(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = ProjectMember.objects.get(pk=instance.pk)
            instance.__original_user_id = old.user_id
            instance.__original_is_deleted = old.is_deleted
        except ProjectMember.DoesNotExist:
            instance.__original_user_id = None
            instance.__original_is_deleted = False
    else:
        instance.__original_user_id = None
        instance.__original_is_deleted = False


@receiver(
    post_save, sender=ProjectMember, dispatch_uid="notify_project_member_added_or_changed_uid"
)
def notify_project_member_added_or_changed(sender, instance, created, **kwargs):
    """
    3. project_created: When a user is added to a project
    Also handles when a member user is changed.
    """
    project = instance.project
    creator_name = (
        project.owner.get_full_name() or project.owner.username if project.owner else "System"
    )

    if getattr(instance, "_skip_project_member_added_signal", False):
        return

    if created and instance.user:
        EventDispatcher.dispatch(
            event_type="project_created",
            payload={
                "target_user_id": str(instance.user.id),
                "project_id": str(project.id),
                "project_name": project.name,
                "creator_name": creator_name,
            },
        )
        # Also notify superusers that a new member was added
        member_name = instance.user.get_full_name() or instance.user.username
        org_name = project.organization.name if project.organization else "—"
        EventDispatcher.dispatch(
            event_type="member_added_to_project",
            payload={
                "project_id": str(project.id),
                "project_name": project.name,
                "member_name": member_name,
                "org_name": org_name,
                "organization_id": str(project.organization_id)
                if project.organization_id
                else None,
            },
        )
    elif not created:
        old_user_id = getattr(instance, "__original_user_id", None)
        old_is_deleted = getattr(instance, "__original_is_deleted", False)

        # Handle soft deletion and un-deletion
        if not old_is_deleted and instance.is_deleted:
            if instance.user:
                EventDispatcher.dispatch(
                    event_type="project_member_removed",
                    payload={
                        "target_user_id": str(instance.user.id),
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "remover_name": creator_name,
                    },
                )
        elif old_is_deleted and not instance.is_deleted:
            if instance.user:
                EventDispatcher.dispatch(
                    event_type="project_created",
                    payload={
                        "target_user_id": str(instance.user.id),
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "creator_name": creator_name,
                    },
                )
        # Handle user change
        elif old_user_id and old_user_id != instance.user_id:
            # Notify old user they were removed
            EventDispatcher.dispatch(
                event_type="project_member_removed",
                payload={
                    "target_user_id": str(old_user_id),
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "remover_name": creator_name,
                },
            )
            # Notify new user they were added
            if instance.user and not instance.is_deleted:
                EventDispatcher.dispatch(
                    event_type="project_created",
                    payload={
                        "target_user_id": str(instance.user.id),
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "creator_name": creator_name,
                    },
                )


@receiver(post_delete, sender=ProjectMember, dispatch_uid="notify_project_member_deleted_uid")
def notify_project_member_deleted(sender, instance, **kwargs):
    # Guard: BaseModel.delete() performs a soft-delete by setting is_deleted=True and
    # calling save() (which fires post_save) THEN manually fires post_delete to mimic
    # Django's default behaviour.  The post_save listener
    # (notify_project_member_added_or_changed) has already dispatched
    # "project_member_removed" for soft-deletes, so we must not dispatch it again here.
    # Only dispatch from this handler when the row is truly hard-deleted (is_deleted is
    # still False because no soft-delete logic ran).
    if getattr(instance, "is_deleted", False):
        return

    if instance.user:
        project = instance.project
        remover_name = (
            project.owner.get_full_name() or project.owner.username if project.owner else "System"
        )
        EventDispatcher.dispatch(
            event_type="project_member_removed",
            payload={
                "target_user_id": str(instance.user.id),
                "project_id": str(project.id),
                "project_name": project.name,
                "remover_name": remover_name,
            },
        )


@receiver(pre_save, sender=Milestone)
def cache_previous_milestone_state(sender, instance, **kwargs):
    if instance.pk:
        try:
            old_instance = Milestone.objects.get(pk=instance.pk)
            instance.__original_status = old_instance.status
        except Milestone.DoesNotExist:
            instance.__original_status = None
    else:
        instance.__original_status = None


@receiver(post_save, sender=Milestone)
def notify_milestone_created_or_completed(sender, instance, created, **kwargs):
    """
    milestone_created: When a new milestone is created
    milestone_completed: When milestone status changes to completed
    """
    if created:
        project = instance.project
        EventDispatcher.dispatch(
            event_type="milestone_created",
            payload={
                "project_id": str(project.id) if project else None,
                "project_name": project.name if project else "—",
                "organization_id": str(project.organization_id)
                if project and project.organization_id
                else None,
                "milestone_title": instance.title,
            },
        )
        return

    old_status = getattr(instance, "__original_status", None)
    if old_status != Milestone.Status.COMPLETED and instance.status == Milestone.Status.COMPLETED:
        project = instance.project
        owner_id = project.owner_id
        target_ids = []
        if owner_id:
            target_ids.append(str(owner_id))

        if target_ids:
            EventDispatcher.dispatch(
                event_type="milestone_completed",
                payload={
                    "target_user_ids": target_ids,
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "milestone_title": instance.title,
                },
            )


@receiver(pre_save, sender=Project)
def cache_previous_project_state(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Project.objects.get(pk=instance.pk)
            instance.__original_budget = old.budget
            instance.__original_status = old.status
        except Project.DoesNotExist:
            instance.__original_budget = None
            instance.__original_status = None
    else:
        instance.__original_budget = None
        instance.__original_status = None


@receiver(post_save, sender=Project, dispatch_uid="notify_project_budget_or_status_uid")
def notify_project_budget_or_status(sender, instance, created, **kwargs):
    """
    4. project_over_budget: Triggered if the budget changes drastically or status changes
    Also notifies superusers on creation.
    """
    if created:
        creator_name = (
            instance.owner.get_full_name() or instance.owner.username if instance.owner else "—"
        )
        org_name = instance.organization.name if instance.organization else "—"
        EventDispatcher.dispatch(
            event_type="project_actually_created",
            payload={
                "project_id": str(instance.id),
                "project_name": instance.name,
                "org_name": org_name,
                "creator_name": creator_name,
                "organization_id": str(instance.organization_id)
                if instance.organization_id
                else None,
            },
        )
    if not created:
        old_budget = getattr(instance, "__original_budget", None)
        if old_budget is not None and instance.budget is not None:
            if instance.budget < old_budget:
                target_ids = []
                if instance.owner_id:
                    target_ids.append(str(instance.owner_id))

                from organizations.models import OrganizationMembership
                from organizations.services import PermissionService

                memberships = OrganizationMembership.objects.filter(
                    organization_id=instance.organization_id, is_deleted=False
                ).select_related("user")
                target_ids.extend(
                    str(membership.user_id)
                    for membership in memberships
                    if PermissionService.has_permission(
                        membership.user, "finance.manage", instance.organization_id
                    )
                )

                if target_ids:
                    EventDispatcher.dispatch(
                        event_type="project_over_budget",
                        payload={
                            "target_user_ids": list(set(target_ids)),
                            "project_id": str(instance.id),
                            "project_name": instance.name,
                        },
                    )

        # Notify superusers when budget is set or changed
        if instance.budget != old_budget and instance.budget is not None:
            org_name = instance.organization.name if instance.organization else "—"
            EventDispatcher.dispatch(
                event_type="project_budget_set",
                payload={
                    "project_id": str(instance.id),
                    "project_name": instance.name,
                    "budget": f"{instance.budget:,.0f}",
                    "org_name": org_name,
                    "organization_id": str(instance.organization_id)
                    if instance.organization_id
                    else None,
                },
            )
