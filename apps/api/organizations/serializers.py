from django.utils.text import slugify
from rest_framework import serializers

from accounts.models import User
from common.media import file_url
from organizations.services import PermissionService

from .models import Organization, OrganizationMembership


class OrganizationOwnerSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name", "avatar", "avatar_url")
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_avatar_url(self, obj):
        return file_url(obj.avatar, self.context.get("request"))


class OrganizationSerializer(serializers.ModelSerializer):
    owner = OrganizationOwnerSerializer(read_only=True)
    member_count = serializers.IntegerField(read_only=True, default=0)
    team_count = serializers.IntegerField(read_only=True, default=0)
    project_count = serializers.IntegerField(read_only=True, default=0)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    slug = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "currency",
            "status",
            "status_display",
            "owner",
            "member_count",
            "team_count",
            "project_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "owner",
            "status_display",
            "member_count",
            "team_count",
            "project_count",
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Organization name must be at least 2 characters.")
        return value

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", ""))
        supplied_slug = attrs.get("slug")
        base_slug = slugify(supplied_slug or name, allow_unicode=True)
        if not base_slug:
            raise serializers.ValidationError(
                {"slug": "Provide a name that can be used as a URL slug."}
            )

        candidate = base_slug
        suffix = 2
        queryset = Organization.all_objects.filter(slug=candidate)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        while queryset.exists():
            candidate = f"{base_slug}-{suffix}"
            suffix += 1
            queryset = Organization.all_objects.filter(slug=candidate)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)

        attrs["slug"] = candidate
        return attrs


class OrganizationMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    avatar = serializers.ImageField(source="user.avatar", read_only=True)
    avatar_url = serializers.SerializerMethodField(read_only=True)
    role_id = serializers.SerializerMethodField()
    role_name = serializers.SerializerMethodField()
    role_display = serializers.SerializerMethodField()
    salary_type = serializers.SerializerMethodField()
    salary_amount = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationMembership
        fields = (
            "id",
            "user_id",
            "full_name",
            "email",
            "username",
            "avatar",
            "avatar_url",
            "role",
            "role_id",
            "role_name",
            "role_display",
            "salary_type",
            "salary_amount",
            "created_at",
        )
        read_only_fields = fields

    def _get_dynamic_role(self, obj):
        if (
            hasattr(obj, "_prefetched_objects_cache")
            and "dynamic_roles" in obj._prefetched_objects_cache
        ):
            roles = [r for r in obj.dynamic_roles.all() if not getattr(r, "is_deleted", False)]
            return roles[0] if roles else None
        return obj.dynamic_roles.filter(is_deleted=False).first()

    def get_full_name(self, obj):
        return obj.user.get_full_name() if obj.user else ""

    def get_avatar_url(self, obj):
        return file_url(obj.user.avatar if obj.user else None, self.context.get("request"))

    def get_role_id(self, obj):
        dyn_role = self._get_dynamic_role(obj)
        if dyn_role:
            return str(dyn_role.id)
        return obj.role

    def get_role_name(self, obj):
        dyn_role = self._get_dynamic_role(obj)
        if dyn_role:
            return dyn_role.name
        return obj.role

    def get_role_display(self, obj):
        dyn_role = self._get_dynamic_role(obj)
        if dyn_role:
            return dyn_role.name
        return obj.get_role_display()

    def _can_manage_salary(self, membership):
        request = self.context.get("request")
        actor = request.user if request and request.user and request.user.is_authenticated else None
        if not actor:
            return False
        if actor.is_superuser:
            return True
        return PermissionService.has_permission(actor, "finance.manage", membership.organization_id)

    def get_salary_type(self, obj):
        if self._can_manage_salary(obj):
            from finance.services import FinanceService

            salary = FinanceService.get_effective_salary(obj.user, obj.organization)
            return salary.get("payment_type") if salary else None
        return None

    def get_salary_amount(self, obj):
        if self._can_manage_salary(obj):
            from finance.services import FinanceService

            salary = FinanceService.get_effective_salary(obj.user, obj.organization)
            return str(salary.get("rate")) if salary and salary.get("rate") is not None else None
        return None


class AddOrgMemberSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(required=True)
    role_id = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        default=OrganizationMembership.Role.EMPLOYEE,
    )
    salary_type = serializers.ChoiceField(
        choices=[("hourly", "Hourly"), ("monthly", "Monthly"), ("fixed", "Fixed")],
        required=False,
        allow_null=True,
    )
    salary_amount = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    class Meta:
        validators = []

    def validate_user_id(self, value):
        try:
            user = User.objects.get(pk=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.") from None

        if not user.is_active:
            raise serializers.ValidationError("User is not active.")

        return value


class UpdateOrgMemberSalarySerializer(serializers.Serializer):
    """Serializer for updating a member's salary at the organization level."""

    salary_type = serializers.ChoiceField(
        choices=[("hourly", "Hourly"), ("monthly", "Monthly"), ("fixed", "Fixed")],
        required=False,
        allow_null=True,
    )
    salary_amount = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        if "salary_type" not in attrs and "salary_amount" not in attrs:
            raise serializers.ValidationError("Provide at least salary_type or salary_amount.")
        return attrs


class InviteOrgMemberSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    username = serializers.CharField(max_length=150, required=True)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    password = serializers.CharField(max_length=128, required=True)
    role_id = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        default=OrganizationMembership.Role.EMPLOYEE,
    )
