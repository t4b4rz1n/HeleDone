import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from panel.Ticketing.models import Attachment, Message, Ticket, TicketType
from panel.Ticketing.validators import validate_attachment_extension

MAX_FILE_SIZE = settings.TICKET_ATTACHMENT_MAX_FILE_SIZE
MAX_ATTACHMENTS_PER_MESSAGE = settings.TICKET_ATTACHMENT_MAX_FILES
User = get_user_model()


class TicketUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["username", "email"]
        ref_name = "ticket_user_dashboard"


class MessageSenderSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["username", "is_staff"]
        ref_name = "message_sender_dashboard"


class TicketTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketType
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        from panel.Ticketing.constants import get_translated_category_name

        data["name"] = get_translated_category_name(data.get("name", ""))
        return data


class AttachmentSerializer(serializers.ModelSerializer):
    file_type = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "file", "created_at", "file_type"]

    def get_file_type(self, obj):
        if not obj.file:
            return "unknown"
        name, extension = os.path.splitext(obj.file.name)
        ext = extension.lower()
        IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"]
        VIDEO_EXTS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"]
        AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".m4a"]
        DOC_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"]
        ARCHIVE_EXTS = [".zip", ".rar", ".7z", ".tar", ".gz"]

        if ext in IMAGE_EXTS:
            return "image"
        if ext in VIDEO_EXTS:
            return "video"
        if ext in AUDIO_EXTS:
            return "audio"
        if ext in DOC_EXTS:
            return "document"
        if ext in ARCHIVE_EXTS:
            return "archive"
        return "file"


class MessageSerializer(serializers.ModelSerializer):
    sender = MessageSenderSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ["id", "sender", "text", "seen", "created_at", "updated_at", "attachments"]
        read_only_fields = ["id", "sender", "seen", "created_at", "updated_at", "attachments"]

    def validate_text(self, value):
        if not value.strip():
            raise serializers.ValidationError("Message text cannot be empty.")
        return value


class MessageCreateSerializer(serializers.ModelSerializer):
    attachments = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False), write_only=True, required=False
    )

    class Meta:
        model = Message
        fields = ["id", "text", "attachments"]

    def validate_attachments(self, files):
        if len(files) > MAX_ATTACHMENTS_PER_MESSAGE:
            raise serializers.ValidationError(
                f"You can upload a maximum of {MAX_ATTACHMENTS_PER_MESSAGE} files."
            )
        for file in files:
            if file.size > MAX_FILE_SIZE:
                raise serializers.ValidationError(
                    f"File size exceeds the limit of {MAX_FILE_SIZE // 1024 // 1024}MB."
                )
            validate_attachment_extension(file)
        return files

    def create(self, validated_data):
        attachments_data = validated_data.pop("attachments", [])
        ticket = self.context["ticket"]
        sender = self.context["request"].user

        if ticket.status == Ticket.Status.CLOSED:
            raise serializers.ValidationError("Cannot add messages to a closed ticket.")

        message = Message.objects.create(ticket=ticket, sender=sender, **validated_data)

        for file_data in attachments_data:
            Attachment.objects.create(message=message, file=file_data)

        return message


class TicketListSerializer(serializers.ModelSerializer):
    user = TicketUserSerializer(read_only=True)
    ticket_type = serializers.StringRelatedField()

    class Meta:
        model = Ticket
        fields = [
            "id",
            "title",
            "user",
            "ticket_type",
            "priority",
            "status",
            "created_at",
            "updated_at",
        ]


class TicketDetailSerializer(serializers.ModelSerializer):
    user = TicketUserSerializer(read_only=True)
    ticket_type = TicketTypeSerializer()

    class Meta:
        model = Ticket
        fields = [
            "id",
            "title",
            "user",
            "ticket_type",
            "priority",
            "status",
            "created_at",
            "updated_at",
            "closed_at",
        ]


class TicketCreateSerializer(serializers.ModelSerializer):
    text = serializers.CharField(write_only=True, required=True, label="Initial Message")
    attachments = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False), write_only=True, required=False
    )

    class Meta:
        model = Ticket
        fields = ["id", "title", "ticket_type", "priority", "text", "attachments"]

    def validate_attachments(self, files):
        if len(files) > MAX_ATTACHMENTS_PER_MESSAGE:
            raise serializers.ValidationError(
                f"You can upload a maximum of {MAX_ATTACHMENTS_PER_MESSAGE} files."
            )
        for file in files:
            if file.size > MAX_FILE_SIZE:
                raise serializers.ValidationError(
                    f"File size exceeds the limit of {MAX_FILE_SIZE // 1024 // 1024}MB."
                )
            validate_attachment_extension(file)
        return files

    def create(self, validated_data):
        text_data = validated_data.pop("text")
        attachments_data = validated_data.pop("attachments", [])
        user = self.context["request"].user

        ticket = Ticket.objects.create(user=user, status=Ticket.Status.OPEN, **validated_data)

        message = Message.objects.create(ticket=ticket, sender=user, text=text_data)

        for file_data in attachments_data:
            Attachment.objects.create(message=message, file=file_data)

        return ticket


class TicketStatusUpdateSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=[(Ticket.Status.CLOSED, _("Closed"))])

    class Meta:
        model = Ticket
        fields = ["status"]

    def validate_status(self, value):
        if self.instance and self.instance.status == Ticket.Status.CLOSED:
            raise serializers.ValidationError("This ticket is already closed.")
        if value != Ticket.Status.CLOSED:
            raise serializers.ValidationError("You can only set the status to 'Closed'.")
        return value
