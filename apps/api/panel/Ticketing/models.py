from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from common.models import BaseModel
from common.validators import validate_file_magic_bytes

User = settings.AUTH_USER_MODEL


class TicketType(BaseModel):
    name = models.CharField(_("Type Name"), max_length=100, unique=True, db_index=True)

    class Meta:
        verbose_name = _("Ticket Type")
        verbose_name_plural = _("Ticket Types")
        ordering = ["name"]

    def __str__(self):
        from panel.Ticketing.constants import get_translated_category_name

        return get_translated_category_name(self.name)


class Ticket(BaseModel):
    class Status(models.TextChoices):
        OPEN = "open", _("Open")
        ANSWERED = "answered", _("Answered")
        CLOSED = "closed", _("Closed")
        IN_PROGRESS = "in_progress", _("In Progress")

    class Priority(models.TextChoices):
        LOW = "low", _("Low")
        MEDIUM = "medium", _("Medium")
        HIGH = "high", _("High")
        URGENT = "urgent", _("Urgent")

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="tickets", verbose_name=_("User (Requester)")
    )
    title = models.CharField(_("Title"), max_length=250)
    ticket_type = models.ForeignKey(
        TicketType,
        on_delete=models.SET_NULL,
        null=True,
        related_name="tickets",
        verbose_name=_("Ticket Type"),
    )
    priority = models.CharField(
        _("Priority"),
        max_length=30,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )
    status = models.CharField(
        _("Status"), max_length=30, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    closed_at = models.DateTimeField(_("Closed At"), null=True, blank=True)

    class Meta:
        verbose_name = _("Ticket")
        verbose_name_plural = _("Tickets")
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title} ({str(self.id)[:8]})"

    def save(self, *args, **kwargs):
        if self.status == self.Status.CLOSED and not self.closed_at:
            self.closed_at = timezone.now()
        elif self.status != self.Status.CLOSED and self.closed_at:
            self.closed_at = None

        super().save(*args, **kwargs)


class Message(BaseModel):
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name="messages", verbose_name=_("Ticket")
    )
    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_messages", verbose_name=_("Sender")
    )
    text = models.TextField(_("Message Text"))
    seen = models.BooleanField(_("Seen"), default=False, db_index=True)

    class Meta:
        verbose_name = _("Message")
        verbose_name_plural = _("Messages")
        ordering = ["created_at"]

    def __str__(self):
        return f"Message from {self.sender.username} on Ticket {self.ticket.id}"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            ticket = self.ticket
            sender = self.sender
            # Treat staff, superusers, and org managers as support staff
            is_support_staff = sender.is_staff or sender.is_superuser
            if not is_support_staff:
                from organizations.services import PermissionService

                memberships = sender.org_memberships.filter(is_deleted=False).values_list(
                    "organization_id", flat=True
                )
                for org_id in memberships:
                    if PermissionService.has_permission(
                        sender, "org.manage_members", org_id
                    ) or PermissionService.has_permission(sender, "org.manage_settings", org_id):
                        is_support_staff = True
                        break

            if is_support_staff:
                ticket.status = Ticket.Status.ANSWERED
            else:
                ticket.status = Ticket.Status.OPEN
            ticket.updated_at = timezone.now()
            ticket.save()

            # Parse mentions (@username) in ticket messages
            import re
            mentioned_usernames = set(re.findall(r"@([\w.-]+)", self.text or ""))
            if mentioned_usernames:
                try:
                    from django.contrib.auth import get_user_model
                    from django.db.models.functions import Lower
                    from automations.events import EventDispatcher

                    User = get_user_model()
                    uids = list(
                        User.objects.annotate(uname_lower=Lower("username"))
                        .filter(uname_lower__in=[u.lower() for u in mentioned_usernames], is_active=True)
                        .values_list("id", flat=True)
                    )
                    author_name = sender.get_full_name() or sender.username
                    for uid in uids:
                        EventDispatcher.dispatch(
                            event_type="user_mentioned",
                            payload={
                                "target_user_id": str(uid),
                                "project_id": None,
                                "ticket_id": str(ticket.id),
                                "mentioned_user_ids": [str(uid)],
                                "task_title": f"Ticket #{str(ticket.id)[:8]}: {ticket.title}",
                                "author": author_name,
                                "comment_text": f"{author_name} mentioned you in ticket #{str(ticket.id)[:8]}",
                            },
                        )
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).warning("Failed to dispatch ticket mention notification: %s", exc)


class Attachment(BaseModel):
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="attachments", verbose_name=_("Message")
    )
    file = models.FileField(
        _("File"),
        upload_to="ticket_attachments/%Y/%m/%d/",
        validators=[
            FileExtensionValidator(
                allowed_extensions=[
                    "jpg",
                    "jpeg",
                    "png",
                    "gif",
                    "pdf",
                    "doc",
                    "docx",
                    "xls",
                    "xlsx",
                    "zip",
                    "rar",
                    "txt",
                    "csv",
                ]
            ),
            validate_file_magic_bytes,
        ],
    )

    class Meta:
        verbose_name = _("Attachment")
        verbose_name_plural = _("Attachments")

    def __str__(self):
        try:
            return self.file.name.split("/")[-1]
        except Exception:
            return "Attachment"
