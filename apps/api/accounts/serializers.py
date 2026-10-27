from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from organizations.constants import TEAM_LEAD_PERMISSIONS
from organizations.models import OrganizationMembership, Team
from organizations.services import (
    COMPATIBILITY_ROLE_PERMISSIONS_MAP,
    DEFAULT_ORG_PERMISSIONS,
)

User = get_user_model()


class UserUpdateSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    telegram_connected = serializers.SerializerMethodField()
    notify_via_email = serializers.BooleanField(required=False)
    notify_via_telegram = serializers.BooleanField(required=False)
    password = serializers.CharField(
        write_only=True, required=False, validators=[validate_password]
    )
    password_confirm = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "first_name",
            "last_name",
            "avatar",
            "avatar_url",
            "password",
            "password_confirm",
            "telegram_connected",
            "notify_via_email",
            "notify_via_telegram",
            "calendar_preference",
        )
        read_only_fields = ("username", "email", "telegram_connected")

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None

        request = self.context.get("request")
        image_url = obj.avatar.url
        return request.build_absolute_uri(image_url) if request else image_url

    def get_telegram_connected(self, obj):
        try:
            wsp = obj.work_style_profile
            if wsp and not wsp.is_deleted and wsp.telegram_chat_id:
                return True
        except Exception:
            pass
        return False

    def validate(self, attrs):
        if "password" in attrs:
            if attrs["password"] != attrs.get("password_confirm"):
                raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def to_representation(self, instance):
        ret = super().to_representation(instance)

        telegram_connected = False
        notify_via_email = True
        notify_via_telegram = False

        try:
            wsp = instance.work_style_profile
            if wsp and not wsp.is_deleted:
                if wsp.telegram_chat_id:
                    telegram_connected = True
                notify_via_email = wsp.notify_via_email
                notify_via_telegram = wsp.notify_via_telegram
        except Exception:
            pass

        user_permissions: list[str] = []
        user_role_id = None
        user_role_name = None

        try:
            memberships = list(
                OrganizationMembership.objects.filter(user=instance, is_deleted=False)
                .prefetch_related("dynamic_roles__permissions")
                .order_by("-created_at")
            )

            membership = None
            if memberships:
                membership_with_dynamic_role = next(
                    (
                        m
                        for m in memberships
                        if any(not r.is_deleted and r.organization_id == m.organization_id for r in m.dynamic_roles.all())
                    ),
                    None,
                )
                membership = membership_with_dynamic_role or memberships[0]

            if membership:
                dynamic_roles = [r for r in membership.dynamic_roles.all() if not r.is_deleted and r.organization_id == membership.organization_id]
                if dynamic_roles:
                    first_role = dynamic_roles[0]
                    user_role_id = str(first_role.id)
                    user_role_name = first_role.name
                    for role in dynamic_roles:
                        for perm in role.permissions.all():
                            if not perm.is_deleted and perm.code not in user_permissions:
                                user_permissions.append(perm.code)
                else:
                    static_role = membership.role
                    user_role_name = static_role
                    user_permissions = list(
                        COMPATIBILITY_ROLE_PERMISSIONS_MAP.get(static_role, DEFAULT_ORG_PERMISSIONS)
                    )
        except Exception:
            pass

        try:
            if Team.objects.filter(leader=instance, is_deleted=False).exists():
                for perm in TEAM_LEAD_PERMISSIONS:
                    if perm not in user_permissions:
                        user_permissions.append(perm)
        except Exception:
            pass

        can_manage_automations = bool(
            instance.is_superuser
            or "automation.manage" in user_permissions
            or "org.manage_settings" in user_permissions
        )

        ret["id"] = instance.id
        ret["is_staff"] = instance.is_staff
        ret["is_superuser"] = instance.is_superuser
        ret["telegram_connected"] = telegram_connected
        ret["notify_via_email"] = notify_via_email
        ret["notify_via_telegram"] = notify_via_telegram
        ret["can_manage_automations"] = can_manage_automations
        ret["role"] = {
            "id": user_role_id,
            "name": user_role_name or "Member",
            "permissions": user_permissions,
        }

        return ret

    def update(self, instance, validated_data):
        notify_via_email = validated_data.pop("notify_via_email", None)
        notify_via_telegram = validated_data.pop("notify_via_telegram", None)

        validated_data.pop("password_confirm", None)
        if "password" in validated_data:
            instance.set_password(validated_data.pop("password"))

        user = super().update(instance, validated_data)

        if notify_via_email is not None or notify_via_telegram is not None:
            try:
                wsp = user.work_style_profile
                if not wsp.is_deleted:
                    if notify_via_email is not None:
                        wsp.notify_via_email = notify_via_email
                    if notify_via_telegram is not None:
                        wsp.notify_via_telegram = notify_via_telegram
                    wsp.save()
            except Exception:
                pass

        return user
