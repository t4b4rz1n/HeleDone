from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .cookie_auth import uses_cookie_transport

User = get_user_model()


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
        validators=[validate_password],
    )
    password_confirm = serializers.CharField(
        write_only=True, required=True, style={"input_type": "password"}
    )

    avatar = serializers.ImageField(required=False, allow_null=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    access = serializers.SerializerMethodField(read_only=True)
    refresh = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "avatar",
            "password",
            "password_confirm",
            "access",
            "refresh",
        )

    def get_access(self, obj):
        if uses_cookie_transport(self.context.get("request")):
            return None
        if not hasattr(obj, "_tokens"):
            refresh = RefreshToken.for_user(obj)
            obj._tokens = (str(refresh.access_token), str(refresh))
        return obj._tokens[0]

    def get_refresh(self, obj):
        if uses_cookie_transport(self.context.get("request")):
            return None
        if not hasattr(obj, "_tokens"):
            refresh = RefreshToken.for_user(obj)
            obj._tokens = (str(refresh.access_token), str(refresh))
        return obj._tokens[1]

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        user = User.objects.create_user(**validated_data)
        return user

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if uses_cookie_transport(self.context.get("request")):
            representation.pop("access", None)
            representation.pop("refresh", None)
        return representation


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"] = serializers.CharField(required=False, write_only=True)
        self.fields[self.username_field] = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        username = attrs.get("username")
        email = attrs.get(self.username_field)

        if not email and not username:
            raise serializers.ValidationError(
                {"detail": "Must include 'email' or 'username' and 'password'."}
            )

        if not email and username:
            if "@" in username:
                attrs[self.username_field] = username
            else:
                user = User.objects.filter(username=username).first()
                if user:
                    attrs[self.username_field] = user.email
                else:
                    attrs[self.username_field] = username

        data = super().validate(attrs)

        telegram_connected = False
        notify_via_email = True
        notify_via_telegram = False

        try:
            wsp = self.user.work_style_profile
            if wsp and not wsp.is_deleted:
                if wsp.telegram_chat_id:
                    telegram_connected = True
                notify_via_email = wsp.notify_via_email
                notify_via_telegram = wsp.notify_via_telegram
        except Exception:
            pass

        # ---- Collect permissions from dynamic_roles (or legacy fallback) ----
        user_permissions: list[str] = []
        user_role_id = None
        user_role_name = None

        try:
            from organizations.models import OrganizationMembership

            memberships = list(
                OrganizationMembership.objects.filter(user=self.user, is_deleted=False)
                .prefetch_related("dynamic_roles__permissions")
                .order_by("-created_at")
            )

            membership = None
            if memberships:
                membership_with_dynamic_role = next(
                    (
                        m
                        for m in memberships
                        if any(not r.is_deleted for r in m.dynamic_roles.all())
                    ),
                    None,
                )
                membership = membership_with_dynamic_role or memberships[0]

            if membership:
                from organizations.services import (
                    COMPATIBILITY_ROLE_PERMISSIONS_MAP,
                    DEFAULT_ORG_PERMISSIONS,
                )

                dynamic_roles = [r for r in membership.dynamic_roles.all() if not r.is_deleted]
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

        can_manage_automations = bool(
            self.user.is_staff
            or self.user.is_superuser
            or "automation.manage" in user_permissions
            or "org.manage_settings" in user_permissions
        )

        user_data = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "is_staff": self.user.is_staff,
            "avatar_url": self.user.avatar.url if self.user.avatar else None,
            "telegram_connected": telegram_connected,
            "notify_via_email": notify_via_email,
            "notify_via_telegram": notify_via_telegram,
            "can_manage_automations": can_manage_automations,
            # New: role + permissions for frontend permission gating
            "role": {
                "id": user_role_id,
                "name": user_role_name,
                "permissions": user_permissions,
            }
            if (user_role_id or user_role_name)
            else None,
        }

        data["user"] = user_data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True, write_only=True)


class CookieAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def to_internal_value(self, data):
        request = self.context.get("request")
        if uses_cookie_transport(request):
            data = data.copy()
            data["refresh"] = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME, "")
        return super().to_internal_value(data)
