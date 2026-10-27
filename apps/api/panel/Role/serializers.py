from rest_framework import serializers

from organizations.models import Permission, Role
from organizations.services import PermissionService


def validate_role_permissions(codes, request, organization_id, existing_codes=()):
    available = set(Permission.objects.filter(is_deleted=False).values_list("code", flat=True))
    requested = set(codes)
    if len(codes) != len(requested) or requested - available:
        raise serializers.ValidationError("Invalid permission codes.")
    if request and not request.user.is_superuser:
        grantable = PermissionService.get_user_permissions(request.user, organization_id)
        if (requested - set(existing_codes)) - grantable:
            raise serializers.ValidationError(
                "You can only grant permissions you hold in this organization."
            )
    return codes


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "name", "description", "module"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "is_protected",
            "permissions",
            "member_count",
        ]

    def get_permissions(self, obj):
        # In-memory evaluation to avoid DB query if prefetched
        return [p.code for p in obj.permissions.all() if not getattr(p, "is_deleted", False)]

    def get_member_count(self, obj):
        if hasattr(obj, "annotated_member_count"):
            return obj.annotated_member_count
        return obj.memberships.filter(is_deleted=False).count()


class RoleCreateSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False, default=list
    )
    organization_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = Role
        fields = ["id", "name", "description", "permissions", "organization_id"]

    def validate_name(self, value):
        value = value.strip()
        if value.casefold() in {"admin", "hr", "accountant"}:
            raise serializers.ValidationError("This role name is reserved.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        org_id = attrs.get("organization_id") or (
            request.data.get("organization_id") if request else None
        )
        if not org_id and request and not request.user.is_superuser:
            membership = request.user.org_memberships.filter(is_deleted=False).first()
            org_id = membership.organization_id if membership else None
        if not org_id:
            raise serializers.ValidationError({"organization_id": "Organization context is required."})
        if request and not request.user.is_superuser:
            if not request.user.org_memberships.filter(
                organization_id=org_id, is_deleted=False
            ).exists():
                raise serializers.ValidationError({"organization_id": "Invalid organization context."})
            if not PermissionService.has_permission(request.user, "org.manage_roles", org_id) and not PermissionService.has_permission(request.user, "org.manage_settings", org_id):
                raise serializers.ValidationError({"organization_id": "You cannot manage roles in this organization."})
        attrs["organization_id"] = org_id
        if "permissions" in attrs:
            validate_role_permissions(attrs["permissions"], request, org_id)
        return attrs

    def create(self, validated_data):
        permission_codes = validated_data.pop("permissions", [])
        org_id = validated_data.pop("organization_id", None)

        if not org_id:
            raise serializers.ValidationError(
                {"organization_id": "Organization context is required."}
            )
        role = Role.objects.create(organization_id=org_id, **validated_data)

        if permission_codes:
            perms = Permission.objects.filter(code__in=permission_codes, is_deleted=False)
            role.permissions.set(perms)

        return role


class RoleUpdateSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )

    class Meta:
        model = Role
        fields = ["name", "description", "permissions"]

    def validate_name(self, value):
        value = value.strip()
        if value.casefold() in {"admin", "hr", "accountant"}:
            raise serializers.ValidationError("This role name is reserved.")
        return value
    def validate_permissions(self, value):
        return validate_role_permissions(
            value,
            self.context.get("request"),
            self.instance.organization_id,
            self.instance.permissions.values_list("code", flat=True),
        )

    def update(self, instance, validated_data):
        permission_codes = validated_data.pop("permissions", None)
        instance = super().update(instance, validated_data)

        if permission_codes is not None:
            perms = Permission.objects.filter(code__in=permission_codes, is_deleted=False)
            instance.permissions.set(perms)
            PermissionService.clear_users_with_role(instance)

        return instance
