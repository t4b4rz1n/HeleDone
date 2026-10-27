import logging
import re

from django.contrib.auth import get_user_model
from django.utils import translation
from django.utils.translation import gettext as _

from automations.catalog import EVENTS_BY_CODE, Recipient
from automations.channels.email import send_email_notification
from automations.channels.telegram import send_telegram_notification
from automations.models import AutomationRule
from panel.Notification.models import Notification

logger = logging.getLogger(__name__)
User = get_user_model()

_IN_APP_MESSAGE_FIELDS = {
    "project_created": ("creator_name", "project_name"),
    "project_member_removed": ("remover_name", "project_name"),
    "project_over_budget": ("project_name",),
    "milestone_approaching": ("milestone_title", "project_name"),
    "milestone_completed": ("milestone_title", "project_name"),
    "task_assigned": ("task_title", "assigner"),
    "task_needs_review": ("task_title", "assignee"),
    "task_completed": ("task_title",),
    "task_deadline_approaching": ("task_title",),
    "user_mentioned": ("author", "author_name", "task_title", "context_name", "file_name"),
    "task_commented": ("author", "task_title"),
    "standup_submitted": ("user_id", "user_name"),
    "leave_requested": ("user_name", "leave_type"),
    "leave_resolved": ("status",),
    "timer_started": ("user_name", "task_title"),
    "organization_created": ("org_name", "owner_name"),
    "project_actually_created": ("project_name", "org_name", "creator_name"),
    "project_budget_set": ("project_name", "budget", "org_name"),
    "member_added_to_project": ("project_name", "member_name", "org_name"),
    "member_added_to_org": ("org_name", "member_name", "role"),
    "you_added_to_org": ("org_name", "role"),
    "board_created": ("board_name", "project_name"),
    "milestone_created": ("milestone_title", "project_name"),
    "task_created": ("task_title", "project_name"),
}


def _get_event_link(event_type: str, payload: dict) -> str:
    """Generate a relevant frontend link based on event type and payload."""
    project_id = payload.get("project_id")
    task_id = payload.get("task_id")
    board_id = payload.get("board_id")
    organization_id = payload.get("organization_id")
    ticket_id = payload.get("ticket_id")
    file_id = payload.get("file_id")

    if file_id and project_id:
        return f"/tasks?project={project_id}&view=files&file={file_id}"
    elif file_id:
        return f"/tasks?view=files&file={file_id}"

    if ticket_id:
        return f"/tickets/{ticket_id}"

    if event_type == "standup_submitted":
        return "/standups"

    if task_id and project_id:
        if board_id:
            # Route to task management page with query params
            return f"/tasks?project={project_id}&board={board_id}&task={task_id}"
        else:
            # Unlinked task
            return f"/projects/{project_id}?task={task_id}"

    if board_id and project_id:
        return f"/tasks?project={project_id}&board={board_id}"

    if project_id:
        if event_type in ("milestone_created", "milestone_approaching", "milestone_completed"):
            return f"/projects/{project_id}?tab=milestones"
        return f"/projects/{project_id}"

    if event_type in ("leave_requested", "leave_resolved"):
        return "/attendance?tab=timeoff"
    if organization_id:
        return f"/organizations/{organization_id}"
    return "/"


def process_rules_for_event(event_type: str, payload: dict):
    """
    Evaluates business rules for an event and routes it to the appropriate channels.
    Optimized with a single DB query using select_related.
    """
    logger.info(f"Processing event: {event_type}")

    event = EVENTS_BY_CODE.get(event_type)
    if not event:
        logger.warning("Ignoring unsupported automation event '%s'.", event_type)
        return

    project_id = payload.get("project_id")
    organization_id = payload.get("organization_id")
    if project_id and not organization_id:
        from projects.models import Project

        project = Project.objects.filter(id=project_id).values("organization_id").first()
        if project:
            organization_id = project["organization_id"]

    rule = AutomationRule.objects.filter(
        organization_id=organization_id,
        event_type=event_type,
    ).first()

    if rule and not rule.is_active:
        logger.info(
            "Automation rule for '%s' is disabled for organization '%s'.",
            event_type,
            organization_id,
        )
        return

    # An absent rule means the catalog default is active.
    # Phase 6: Mandatory recipients are ALWAYS merged in, even if custom rule omitted them.
    configured_recipients = set(rule.recipients if rule else event["default_recipients"])
    mandatory_recipients = set(event.get("mandatory_recipients", []))
    recipients = list(configured_recipients | mandatory_recipients)
    action_type = rule.action_type if rule else AutomationRule.ActionType.BOTH

    # 1. Resolve configured recipient roles from the event context.
    target_user_ids = _determine_target_users(recipients, payload)

    if not target_user_ids:
        logger.info(f"No target users for event '{event_type}'. Skipping.")
        return

    # 2. Fetch users in a single optimized query, filtered by is_active=True
    users = User.objects.filter(id__in=target_user_ids, is_active=True).select_related(
        "work_style_profile"
    )
    sent_telegram_chat_ids = set()
    notifications_to_create = []

    from django.conf import settings

    if (
        rule
        and rule.telegram_group_id
        and action_type
        in (
            AutomationRule.ActionType.TELEGRAM,
            AutomationRule.ActionType.BOTH,
        )
    ):
        translation.activate(settings.LANGUAGE_CODE)
        grp_sub, grp_fmt = _format_message(event_type, payload)
        grp_msg = (
            _render_template(rule.message_template, payload)
            if rule and rule.message_template
            else grp_fmt
        )
        send_telegram_notification.delay(rule.telegram_group_id, grp_msg)

    # 3. Route to enabled channels, respecting security scope and delivery preferences.
    for user in users:
        # Phase 7: Pre-dispatch security validation (active membership & scope)
        if not _is_recipient_authorized(
            user, payload, organization_id, project_id, event_type=event_type
        ):
            logger.debug(
                "Skipping notification for user %s on event '%s': not authorized or not an active member.",
                user.id,
                event_type,
            )
            continue

        wsp = getattr(user, "work_style_profile", None)
        # select_related bypasses SoftDeleteManager, so a soft-deleted
        # profile is still loaded. Treat it as non-existent.
        if wsp and getattr(wsp, "is_deleted", False):
            wsp = None

        notify_email = wsp.notify_via_email if wsp else False
        notify_telegram = wsp.notify_via_telegram if wsp else False
        telegram_chat_id = wsp.telegram_chat_id if wsp else None

        should_send_email = (
            action_type in (AutomationRule.ActionType.EMAIL, AutomationRule.ActionType.BOTH)
            and notify_email
            and user.email
        )
        should_send_telegram = (
            action_type in (AutomationRule.ActionType.TELEGRAM, AutomationRule.ActionType.BOTH)
            and notify_telegram
            and telegram_chat_id
            and str(telegram_chat_id).strip()  # Guard against empty/whitespace-only chat IDs
        )

        if user.is_superuser:
            has_telegram = bool(telegram_chat_id and str(telegram_chat_id).strip())
            # Superusers always get in-app. Email/Telegram respect their profile settings.
            if has_telegram and notify_telegram:
                should_send_telegram = True
            if notify_email and user.email:
                should_send_email = True

        # Create English in-app notification (always, regardless of email/telegram)
        with translation.override("en"):
            from django.utils.html import strip_tags

            _, en_message = _format_message(event_type, payload)
            clean_text = strip_tags(en_message).replace("\n", " ").strip()
            # replace multiple spaces with single space
            clean_text = " ".join(clean_text.split())

        notifications_to_create.append(
            Notification(
                user=user,
                text=clean_text[:255],
                message_data={
                    "event": event_type,
                    "values": {
                        key: str(payload[key])
                        for key in _IN_APP_MESSAGE_FIELDS.get(event_type, ())
                        if payload.get(key) is not None
                    },
                },
                link=_get_event_link(event_type, payload),
            )
        )

        if not should_send_email and not should_send_telegram:
            continue

        # Determine language preferences
        lang = settings.LANGUAGE_CODE
        if wsp and getattr(wsp, "telegram_language", None):
            lang = wsp.telegram_language

        with translation.override(lang):
            subject, formatted_message = _format_message(event_type, payload)
            message = (
                _render_template(rule.message_template, payload)
                if rule and rule.message_template
                else formatted_message
            )

        if should_send_email:
            send_email_notification.delay(user.email, subject, message)

        if should_send_telegram:
            if telegram_chat_id not in sent_telegram_chat_ids:
                send_telegram_notification.delay(telegram_chat_id, message)
                sent_telegram_chat_ids.add(telegram_chat_id)

    if notifications_to_create:
        Notification.objects.bulk_create(notifications_to_create, ignore_conflicts=True)


def _determine_target_users(recipients: list[str], payload: dict) -> set[str]:
    """Resolve the configured recipient selectors against one event payload."""
    users = set()
    project = None
    project_id = payload.get("project_id")
    if project_id:
        from projects.models import Project

        project = Project.objects.filter(pk=project_id).first()

    def add(value):
        if value:
            users.add(str(value))

    def add_many(values):
        for value in values or []:
            add(value)

    for recipient in recipients:
        if recipient == Recipient.TARGET_USERS:
            add(payload.get("target_user_id"))
            add_many(payload.get("target_user_ids"))
        elif recipient == Recipient.MENTIONED_USERS:
            add_many(payload.get("mentioned_user_ids"))
            add_many(payload.get("recipient_ids"))
            add(payload.get("target_user_id"))
        elif recipient == Recipient.ASSIGNEE:
            add(payload.get("assignee_id"))
        elif recipient == Recipient.REPORTER:
            add(payload.get("reporter_id"))
        elif recipient == Recipient.REQUESTER:
            add(payload.get("requester_id") or payload.get("user_id"))
        elif recipient == Recipient.PROJECT_OWNER and project:
            add(project.owner_id)
        elif recipient == Recipient.PROJECT_MEMBERS and project:
            add_many(
                project.members.filter(is_active=True, user__isnull=False).values_list(
                    "user_id", flat=True
                )
            )
        elif recipient in (
            Recipient.HAS_PERM_ORG_MANAGE,
            Recipient.HAS_PERM_LEAVE_APPROVE,
            Recipient.HAS_PERM_PROJECT_MANAGE,
            Recipient.HAS_PERM_TASK_REVIEW,
            Recipient.HAS_PERM_TASK_MANAGE,
        ):

            from organizations.models import OrganizationMembership

            perm_map = {
                Recipient.HAS_PERM_ORG_MANAGE: "org.manage_settings",
                Recipient.HAS_PERM_LEAVE_APPROVE: "leave.approve",
                Recipient.HAS_PERM_PROJECT_MANAGE: "project.manage",
                Recipient.HAS_PERM_TASK_REVIEW: "task.review",
                Recipient.HAS_PERM_TASK_MANAGE: "task.manage_all",
            }
            perm_code = perm_map.get(recipient)
            org_id = project.organization_id if project else payload.get("organization_id")
            if org_id and perm_code:
                matching_memberships = (
                    OrganizationMembership.objects.filter(
                        organization_id=org_id,
                        is_deleted=False,
                        dynamic_roles__permissions__code=perm_code,
                    )
                    .values_list("user_id", flat=True)
                    .distinct()
                )

                add_many(matching_memberships)
        elif recipient == Recipient.SUPERUSERS:
            add_many(
                User.objects.filter(
                    is_superuser=True,
                    is_active=True,
                ).values_list("id", flat=True)
            )

    return users


def _is_recipient_authorized(
    user, payload: dict, organization_id, project_id, event_type=None
) -> bool:
    """Verifies that a recipient is still active and authorized within the organization/project scope."""
    if not user.is_active:
        return False
    if user.is_superuser:
        return True

    # If the user is the target of a project removal notification, they are authorized to receive it
    if event_type == "project_member_removed" and str(user.id) == str(
        payload.get("target_user_id")
    ):
        return True

    # If the user was explicitly mentioned, they are authorized to receive their mention notification
    if event_type == "user_mentioned" and (
        str(user.id) == str(payload.get("target_user_id"))
        or str(user.id) in [str(u) for u in payload.get("mentioned_user_ids", [])]
        or str(user.id) in [str(u) for u in payload.get("recipient_ids", [])]
    ):
        return True

    from organizations.models import OrganizationMembership

    if organization_id:
        is_org_member = OrganizationMembership.objects.filter(
            user=user, organization_id=organization_id, is_deleted=False
        ).exists()
        if not is_org_member:
            return False

    if project_id:
        from organizations.services import PermissionService
        from projects.models import ProjectMember

        is_proj_member = ProjectMember.objects.filter(
            user=user, project_id=project_id, is_active=True, is_deleted=False
        ).exists()
        if is_proj_member:
            return True

        # Org managers with project.manage or org.manage_settings are also authorized for project events
        if organization_id and (
            PermissionService.has_permission(user, "project.manage", organization_id)
            or PermissionService.has_permission(user, "org.manage_settings", organization_id)
        ):
            return True

        return False

    return True


_TEMPLATE_VARIABLE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}")


def _render_template(template: str, payload: dict) -> str:
    """Render simple {{variable}} placeholders without evaluating admin input."""

    def replace(match):
        value = payload
        for part in match.group(1).split("."):
            if not isinstance(value, dict):
                return ""
            value = value.get(part)
        return str(value) if value is not None else ""

    return _TEMPLATE_VARIABLE.sub(replace, template)


def _format_message(event_type: str, payload: dict) -> tuple:
    """
    Formats the notification message in HTML (for Telegram compatibility).
    Returns (subject, html_message_body).
    """
    formatter = _MESSAGE_FORMATTERS.get(event_type)
    if formatter:
        return formatter(payload)

    # Fallback
    return _("Madaar System Notification"), _(
        " A new event has been logged in the system: <code>{event_type}</code>"
    ).format(event_type=event_type)


# ─── Message Formatters ──────────────────────────────────────────────────────


def _fmt_project_created(p):
    return (
        _("Added to project"),
        _(
            " <b>You have been added to a new project!</b>\n\n"
            "You were added by {creator} to project <b>{project}</b>. Good luck!"
        ).format(
            creator=p.get("creator_name", _("your colleague")), project=p.get("project_name", "—")
        ),
    )


def _fmt_project_member_removed(p):
    return (
        _("Removed from project"),
        _(
            " <b>You have been removed from a project!</b>\n\n"
            "Your access to project <b>{project}</b> was revoked by {remover}."
        ).format(
            remover=p.get("remover_name", _("system admin")), project=p.get("project_name", "—")
        ),
    )


def _fmt_project_over_budget(p):
    return (
        _("Project budget warning"),
        _(
            " <b>Budget warning!</b>\n\n"
            "The budget for project <b>{project}</b> is running low or has been exceeded.\n"
            "Please review."
        ).format(project=p.get("project_name", "—")),
    )


def _fmt_milestone_approaching(p):
    return (
        _("Milestone deadline approaching"),
        _(
            " <b>Deadline approaching!</b>\n\n"
            "Less than 48 hours remain until milestone <b>{milestone}</b> "
            "in project <b>{project}</b>."
        ).format(milestone=p.get("milestone_title", "—"), project=p.get("project_name", "—")),
    )


def _fmt_milestone_completed(p):
    return (
        _("Milestone completed"),
        _(
            " <b>Milestone completed!</b>\n\n"
            "Milestone <b>{milestone}</b> in project <b>{project}</b> has been successfully completed. Great job!"
        ).format(milestone=p.get("milestone_title", "—"), project=p.get("project_name", "—")),
    )


def _fmt_task_assigned(p):
    return (
        _("New task assigned"),
        _(
            " <b>A new task has been assigned to you!</b>\n\n Task: <b>{task}</b>\n By: {assigner}"
        ).format(task=p.get("task_title", "—"), assigner=p.get("assigner", _("manager"))),
    )


def _fmt_task_needs_review(p):
    return (
        _("Task ready for review"),
        _(
            " <b>Task is ready for review!</b>\n\n Task: <b>{task}</b>\n Submitted by: {assignee}"
        ).format(task=p.get("task_title", "—"), assignee=p.get("assignee", _("your colleague"))),
    )


def _fmt_task_completed(p):
    return (
        _("Task completed"),
        _(" <b>Task completed!</b>\n\n Task <b>{task}</b> has been successfully completed.").format(
            task=p.get("task_title", "—")
        ),
    )


def _fmt_task_deadline_approaching(p):
    return (
        _("Task deadline warning"),
        _(" <b>Deadline warning!</b>\n\nLess than 24 hours remain for task <b>{task}</b>.").format(
            task=p.get("task_title", "—")
        ),
    )


def _fmt_user_mentioned(p):
    author_label = p.get("author") or p.get("author_name") or _("someone")
    file_name = p.get("file_name") or (
        p.get("context_name") if p.get("context_type") == "file" else None
    )
    if file_name:
        return (
            _("You were mentioned"),
            _(
                " <b>You were mentioned!</b>\n\n{author} mentioned you on file <b>{file}</b>."
            ).format(author=author_label, file=file_name),
        )
    task_label = p.get("task_title") or p.get("context_name") or "—"
    return (
        _("You were mentioned"),
        _(" <b>You were mentioned!</b>\n\n{author} mentioned you in <b>{task}</b>.").format(
            author=author_label, task=task_label
        ),
    )


def _fmt_task_commented(p):
    return (
        _("New comment"),
        _(" <b>New comment!</b>\n\n{author} added a new comment on task <b>{task}</b>.").format(
            author=p.get("author", _("someone")), task=p.get("task_title", "—")
        ),
    )


def _fmt_standup_submitted(p):
    return (
        _("Daily standup"),
        _(
            " <b>Daily Stand-up Report</b>\n\n"
            "Your colleague {user} has submitted their daily standup report."
        ).format(user=p.get("user_name", "—")),
    )


def _fmt_leave_requested(p):
    return (
        _("Leave requested"),
        _(" <b>New leave request!</b>\n\n {user}\n Type: {leave_type}\n\nPlease review.").format(
            user=p.get("user_name", "—"), leave_type=p.get("leave_type", _("leave"))
        ),
    )


def _fmt_leave_resolved(p):
    return (
        _("Leave status"),
        _(
            " <b>Leave request result</b>\n\n"
            "Your leave request has been reviewed.\n"
            " Status: <b>{status}</b>"
        ).format(status=p.get("status", "—")),
    )


def _fmt_timer_started(p):
    return (
        _("Timer started"),
        _(" <b>Work timer started!</b>\n\n {user}\n Task: <b>{task}</b>").format(
            user=p.get("user_name", "—"), task=p.get("task_title", "—")
        ),
    )


def _fmt_organization_created(p):
    return (
        _("New organization"),
        _(
            " <b>New organization created!</b>\n\n Name: <b>{org_name}</b>\n Owner: {owner_name}"
        ).format(
            org_name=p.get("org_name", "—"),
            owner_name=p.get("owner_name", "—"),
        ),
    )


def _fmt_project_actually_created(p):
    return (
        _("New project"),
        _(
            " <b>New project created!</b>\n\n"
            " Name: <b>{project_name}</b>\n"
            " Organization: {org_name}\n"
            " Creator: {creator_name}"
        ).format(
            project_name=p.get("project_name", "—"),
            org_name=p.get("org_name", "—"),
            creator_name=p.get("creator_name", "—"),
        ),
    )


def _fmt_project_budget_set(p):
    return (
        _("Project budget set"),
        _(
            " <b>Project budget set!</b>\n\n"
            " Project: <b>{project_name}</b>\n"
            " Budget: <b>{budget}</b>\n"
            " Organization: {org_name}"
        ).format(
            project_name=p.get("project_name", "—"),
            budget=p.get("budget", "—"),
            org_name=p.get("org_name", "—"),
        ),
    )


def _fmt_member_added_to_project(p):
    return (
        _("New member added to project"),
        _(
            " <b>New member added to project!</b>\n\n"
            " Project: <b>{project_name}</b>\n"
            " New member: {member_name}\n"
            " Organization: {org_name}"
        ).format(
            project_name=p.get("project_name", "—"),
            member_name=p.get("member_name", "—"),
            org_name=p.get("org_name", "—"),
        ),
    )


def _fmt_member_added_to_org(p):
    return (
        _("New organization member"),
        _(
            " <b>New member added to organization!</b>\n\n"
            " Organization: <b>{org_name}</b>\n"
            " New member: {member_name}\n"
            " Role: {role}"
        ).format(
            org_name=p.get("org_name", "—"),
            member_name=p.get("member_name", "—"),
            role=p.get("role", "—"),
        ),
    )


def _fmt_you_added_to_org(p):
    return (
        _("Added to organization"),
        _(
            " <b>You have been added to a new organization!</b>\n\n"
            " You are now a member of <b>{org_name}</b> as a <b>{role}</b>."
        ).format(
            org_name=p.get("org_name", "—"),
            role=p.get("role", "—"),
        ),
    )


def _fmt_board_created(p):
    return (
        _("New Board Created"),
        _(
            " <b>New Board Created!</b>\n\n"
            "Board <b>{board_name}</b> has been added to project <b>{project_name}</b>."
        ).format(
            board_name=p.get("board_name", "—"),
            project_name=p.get("project_name", "—"),
        ),
    )


def _fmt_milestone_created(p):
    return (
        _("New Milestone Created"),
        _(
            " <b>New Milestone Created!</b>\n\n"
            "Milestone <b>{milestone_title}</b> has been created in project <b>{project_name}</b>."
        ).format(
            milestone_title=p.get("milestone_title", "—"),
            project_name=p.get("project_name", "—"),
        ),
    )


def _fmt_task_created(p):
    return (
        _("New Task Created"),
        _(" <b>New Task Created!</b>\n\nTask: <b>{task_title}</b>\nProject: {project_name}").format(
            task_title=p.get("task_title", "—"),
            project_name=p.get("project_name", "—"),
        ),
    )


# Map event types to their formatter functions
_MESSAGE_FORMATTERS = {
    "project_created": _fmt_project_created,
    "project_member_removed": _fmt_project_member_removed,
    "project_over_budget": _fmt_project_over_budget,
    "milestone_approaching": _fmt_milestone_approaching,
    "milestone_completed": _fmt_milestone_completed,
    "task_assigned": _fmt_task_assigned,
    "task_needs_review": _fmt_task_needs_review,
    "task_completed": _fmt_task_completed,
    "task_deadline_approaching": _fmt_task_deadline_approaching,
    "user_mentioned": _fmt_user_mentioned,
    "task_commented": _fmt_task_commented,
    "standup_submitted": _fmt_standup_submitted,
    "leave_requested": _fmt_leave_requested,
    "leave_resolved": _fmt_leave_resolved,
    "timer_started": _fmt_timer_started,
    "organization_created": _fmt_organization_created,
    "project_actually_created": _fmt_project_actually_created,
    "project_budget_set": _fmt_project_budget_set,
    "member_added_to_project": _fmt_member_added_to_project,
    "member_added_to_org": _fmt_member_added_to_org,
    "you_added_to_org": _fmt_you_added_to_org,
    "board_created": _fmt_board_created,
    "milestone_created": _fmt_milestone_created,
    "task_created": _fmt_task_created,
}
