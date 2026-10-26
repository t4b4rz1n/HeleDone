from rest_framework import serializers

from panel.Notification.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    sender_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "text", "message_data", "link", "seen", "created_at", "sender_avatar_url"]
        read_only_fields = ["id", "text", "message_data", "link", "created_at", "sender_avatar_url"]

    def get_sender_avatar_url(self, obj):
        if obj.message_data.get("event") != "standup_submitted":
            return None
        sender_id = obj.message_data.get("values", {}).get("user_id")
        if not sender_id:
            return None
        from django.contrib.auth import get_user_model

        sender = get_user_model().objects.filter(id=sender_id).only("avatar").first()
        if not sender or not sender.avatar:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(sender.avatar.url) if request else sender.avatar.url
