from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from accounts.models import User
from organizations.models import Organization, OrganizationMembership


def _extract_org_id(request):
    if not request:
        return None
    req_data = getattr(request, "data", None)
    if isinstance(req_data, dict):
        val = req_data.get("organization_id")
        if val:
            return val
    query_params = getattr(request, "query_params", getattr(request, "GET", None))
    if query_params:
        val = query_params.get("organization_id")
        if val:
            return val
    headers = getattr(request, "headers", None)
    if headers:
        val = headers.get("X-Organization-Id")
        if val:
            return val
    return None


class UserListSerializer(serializers.ModelSerializer):
    role_id = serializers.SerializerMethodField()
    role_name = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    salary_type = serializers.SerializerMethodField()
    salary_amount = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "avatar",
            "role_id",
            "role_name",
            "organization",
            "salary_type",
            "salary_amount",
            "calendar_preference",
        ]
        ref_name = "users_panel"

    def _get_active_membership_and_role(self, obj):
        request = self.context.get("request")
        raw_org_id = _extract_org_id(request)
        actor = (
            request.user if (request and request.user and request.user.is_authenticated) else None
        )
        target_org_id = raw_org_id
        if not target_org_id and actor and not actor.is_superuser:
            actor_mem = actor.org_memberships.filter(is_deleted=False).first()
            if actor_mem:
                target_org_id = actor_mem.organization_id

        if not target_org_id:
            first_org = Organization.objects.filter(is_deleted=False).first()
            if first_org:
                target_org_id = first_org.id

        memberships = [m for m in obj.org_memberships.all() if not getattr(m, "is_deleted", False)]
        if target_org_id:
            matching = [m for m in memberships if str(m.organization_id) == str(target_org_id)]
            if matching:
                memberships = matching

        if memberships:
            membership = memberships[0]
            dynamic_roles = [
                r for r in membership.dynamic_roles.all() if not getattr(r, "is_deleted", False)
            ]
            if dynamic_roles:
                return membership, dynamic_roles[0]
            return membership, None
        return None, None

    def get_role_id(self, obj):
        membership, dynamic_role = self._get_active_membership_and_role(obj)
        if dynamic_role:
            return str(dynamic_role.id)
        if membership:
            return membership.role
        return None

    def get_role_name(self, obj):
        membership, dynamic_role = self._get_active_membership_and_role(obj)
        if dynamic_role:
            return dynamic_role.name
        if membership and membership.role:
            return membership.get_role_display()
        return None

    def get_organization(self, obj):
        membership = (
            obj.org_memberships.filter(
                is_deleted=False,
                organization__is_deleted=False,
            )
            .select_related("organization")
            .first()
        )
        if membership:
            return {
                "id": str(membership.organization.id),
                "name": membership.organization.name,
            }
        return None

    def _can_manage_salary(self, membership):
        if not membership:
            return False
        request = self.context.get("request")
        actor = request.user if request and request.user and request.user.is_authenticated else None
        if not actor:
            return False
        if actor.is_superuser:
            return True
        org = membership.organization
        if org.owner == actor:
            return True
        return OrganizationMembership.objects.filter(
            user=actor,
            organization=org,
            role__in=[OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN],
            is_deleted=False,
        ).exists()

    def _get_salary_config(self, membership):
        from finance.services import FinanceService

        return FinanceService.get_effective_salary(membership.user, membership.organization)

    def get_salary_type(self, obj):
        membership, _ = self._get_active_membership_and_role(obj)
        if membership and self._can_manage_salary(membership):
            return self._get_salary_config(membership).get("type")
        return None

    def get_salary_amount(self, obj):
        membership, _ = self._get_active_membership_and_role(obj)
        if membership and self._can_manage_salary(membership):
            amt = self._get_salary_config(membership).get("amount")
            return str(amt) if amt is not None else None
        return None


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, style={"input_type": "password"}
    )
    email = serializers.EmailField(required=True)
    organization_id = serializers.UUIDField(required=False, write_only=True, allow_null=True)
    role_id = serializers.CharField(write_only=True, required=False, allow_null=True)
    salary_type = serializers.CharField(write_only=True, required=False, allow_null=True)
    salary_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "avatar",
            "organization_id",
            "role_id",
            "salary_type",
            "salary_amount",
            "calendar_preference",
        ]
        extra_kwargs = {
            "avatar": {"validators": []},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }
        ref_name = "user_panel"

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(_("A user with this email already exists."))
        return value

    def validate_organization_id(self, value):
        from django.utils.translation import gettext_lazy as _

        if value is None:
            return value

        try:
            org = Organization.objects.get(pk=value)
        except Organization.DoesNotExist:
            raise serializers.ValidationError(_("Organization not found.")) from None

        request_user = getattr(self.context.get("request"), "user", None)

        if request_user and request_user.is_authenticated:
            if request_user.is_superuser:
                return value
            if org.owner == request_user:
                return value
            if OrganizationMembership.objects.filter(
                user=request_user,
                organization=org,
                role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                ],
                is_deleted=False,
            ).exists():
                return value

        raise serializers.ValidationError(
            _("You do not have permission to create members for this organization.")
        )

    def create(self, validated_data):
        from automations.events import EventDispatcher
        from organizations.models import Organization, Role
        from organizations.services import PermissionService

        request = self.context.get("request")
        actor = (
            request.user if (request and request.user and request.user.is_authenticated) else None
        )

        # Only superusers can grant is_staff
        if "is_staff" in validated_data and not (actor and actor.is_superuser):
            validated_data["is_staff"] = False

        organization_id = validated_data.pop("organization_id", None)
        role_id = validated_data.pop("role_id", None)
        salary_type = validated_data.pop("salary_type", None)
        salary_amount = validated_data.pop("salary_amount", None)

        org = None
        if organization_id:
            org = Organization.objects.filter(id=organization_id, is_deleted=False).first()
        elif actor and not actor.is_superuser:
            mem = (
                actor.org_memberships.filter(is_deleted=False)
                .select_related("organization")
                .first()
            )
            if mem:
                org = mem.organization

        if not org:
            org = Organization.objects.filter(is_deleted=False).first()

        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data["username"],
                email=validated_data["email"],
                password=validated_data["password"],
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
                is_active=validated_data.get("is_active", True),
                is_staff=validated_data.get("is_staff", False),
                avatar=validated_data.get("avatar"),
            )

            if org:
                request_user = getattr(self.context.get("request"), "user", None)
                invited_by = (
                    request_user if request_user and request_user.is_authenticated else None
                )
                membership = OrganizationMembership.objects.filter(
                    user=user,
                    organization=org,
                    is_deleted=False,
                ).first()
                if not membership:
                    membership = OrganizationMembership(
                        user=user,
                        organization=org,
                        invited_by=invited_by,
                    )
                    membership._skip_member_added_signal = True

                if salary_type is not None or salary_amount is not None:
                    is_salary_manager = False
                    if actor and actor.is_superuser:
                        is_salary_manager = True
                    elif actor and org.owner == actor:
                        is_salary_manager = True
                    elif actor:
                        is_salary_manager = OrganizationMembership.objects.filter(
                            user=actor,
                            organization=org,
                            role__in=[
                                OrganizationMembership.Role.OWNER,
                                OrganizationMembership.Role.ADMIN,
                            ],
                            is_deleted=False,
                        ).exists()
                    if is_salary_manager:
                        from finance.services import FinanceService

                        FinanceService.set_org_salary(
                            user=user,
                            organization=org,
                            payment_type=salary_type,
                            rate=salary_amount,
                        )

                membership.save()
                role_obj = None
                if role_id:
                    import uuid

                    try:
                        role_uuid = uuid.UUID(role_id)
                        role_obj = (
                            Role.objects.filter(
                                id=role_uuid, organization=org, is_deleted=False
                            ).first()
                            or Role.objects.filter(id=role_uuid, is_deleted=False).first()
                        )
                    except ValueError:
                        pass

                    if not role_obj:
                        role_obj = (
                            Role.objects.filter(
                                name__iexact=str(role_id), organization=org, is_deleted=False
                            ).first()
                            or Role.objects.filter(
                                name__iexact=str(role_id), is_deleted=False
                            ).first()
                        )
                    if role_obj:
                        membership.dynamic_roles.set([role_obj])
                        if role_obj.name.lower() in OrganizationMembership.Role.values:
                            membership.role = role_obj.name.lower()
                        else:
                            membership.role = OrganizationMembership.Role.EMPLOYEE
                        membership.save()
                    elif str(role_id) in OrganizationMembership.Role.values:
                        membership.role = str(role_id)
                        membership.save()

                    PermissionService.clear_user_cache(user, org.id)

                try:
                    from organizations.models import OrganizationAuditLog
                    from organizations.services import AuditService

                    AuditService.log_action(
                        organization=org,
                        actor=actor,
                        action=OrganizationAuditLog.Action.ROLE_UPDATED,
                        target_user=user,
                        details={
                            "role_id": str(role_id),
                            "role_name": role_obj.name
                            if role_obj
                            else (role_id or membership.role),
                        },
                    )
                except Exception:
                    pass

                # Dispatch member_added_to_org with the real dynamic role name and target user
                try:
                    role_display = role_obj.name if role_obj else membership.get_role_display()
                    payload = {
                        "org_name": org.name,
                        "member_name": user.get_full_name() or user.username,
                        "role": role_display,
                        "organization_id": str(org.id),
                        "target_user_id": str(user.id),
                    }
                    EventDispatcher.dispatch(
                        event_type="member_added_to_org",
                        payload=payload,
                    )
                    EventDispatcher.dispatch(
                        event_type="you_added_to_org",
                        payload=payload,
                    )
                except Exception:
                    pass

        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False)
    role_id = serializers.CharField(write_only=True, required=False, allow_null=True)
    salary_type = serializers.CharField(write_only=True, required=False, allow_null=True)
    salary_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, write_only=True, required=False, allow_null=True
    )
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        allow_null=True,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "avatar",
            "role_id",
            "salary_type",
            "salary_amount",
            "calendar_preference",
            "password",
        ]
        extra_kwargs = {
            "avatar": {"validators": []},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }
        ref_name = "user_panel__update"

    def validate_email(self, value):
        if (
            self.instance
            and User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists()
        ):
            raise serializers.ValidationError(_("A user with this email already exists."))
        return value

    def update(self, instance, validated_data):
        from organizations.models import Organization, Role

        request = self.context.get("request")
        actor = (
            request.user if (request and request.user and request.user.is_authenticated) else None
        )

        # Only superusers can modify is_staff
        if "is_staff" in validated_data and not (actor and actor.is_superuser):
            validated_data.pop("is_staff")

        # Handle password change with permission check
        new_password = validated_data.pop("password", None) or None
        if new_password:
            can_change_password = False
            if actor:
                if actor.is_superuser or actor.is_staff:
                    can_change_password = True
                elif actor.pk == instance.pk:
                    # Users can always change their own password
                    can_change_password = True
                else:
                    # Check if actor is owner or admin of any org the target user belongs to
                    target_org_ids = instance.org_memberships.filter(
                        is_deleted=False
                    ).values_list("organization_id", flat=True)
                    if OrganizationMembership.objects.filter(
                        user=actor,
                        organization_id__in=target_org_ids,
                        role__in=[
                            OrganizationMembership.Role.OWNER,
                            OrganizationMembership.Role.ADMIN,
                        ],
                        is_deleted=False,
                    ).exists():
                        can_change_password = True
                    else:
                        # Also check dynamic role permissions (org.manage_members)
                        from organizations.services import PermissionService

                        for org_id in target_org_ids:
                            if PermissionService.has_permission(
                                actor, "org.manage_members", org_id
                            ):
                                can_change_password = True
                                break

            if can_change_password:
                instance.set_password(new_password)
                instance.save(update_fields=["password"])
            else:
                raise serializers.ValidationError(
                    {"password": _("You do not have permission to change this user's password.")}
                )

        has_role_id = "role_id" in validated_data
        role_id = validated_data.pop("role_id", None)
        has_salary_type = "salary_type" in validated_data
        salary_type = validated_data.pop("salary_type", None)
        has_salary_amount = "salary_amount" in validated_data
        salary_amount = validated_data.pop("salary_amount", None)

        with transaction.atomic():
            user = super().update(instance, validated_data)

            if has_role_id or has_salary_type or has_salary_amount:
                raw_org_id = _extract_org_id(request)
                org = None

                if raw_org_id:
                    org = Organization.objects.filter(id=raw_org_id, is_deleted=False).first()

                if not org and actor and not actor.is_superuser:
                    actor_mem = (
                        actor.org_memberships.filter(is_deleted=False)
                        .select_related("organization")
                        .first()
                    )
                    if actor_mem:
                        org = actor_mem.organization

                existing_membership = (
                    OrganizationMembership.objects.filter(user=user, is_deleted=False)
                    .select_related("organization")
                    .first()
                )

                if not org and existing_membership:
                    org = existing_membership.organization

                if not org:
                    org = Organization.objects.filter(is_deleted=False).first()

                if org:
                    membership = OrganizationMembership.objects.filter(
                        user=user, organization=org, is_deleted=False
                    ).first()
                    if not membership:
                        membership = OrganizationMembership.objects.create(
                            user=user, organization=org, is_deleted=False
                        )

                    if has_salary_type or has_salary_amount:
                        is_salary_manager = False
                        if actor and actor.is_superuser:
                            is_salary_manager = True
                        elif actor and org.owner == actor:
                            is_salary_manager = True
                        elif actor:
                            is_salary_manager = OrganizationMembership.objects.filter(
                                user=actor,
                                organization=org,
                                role__in=[
                                    OrganizationMembership.Role.OWNER,
                                    OrganizationMembership.Role.ADMIN,
                                ],
                                is_deleted=False,
                            ).exists()
                        if is_salary_manager:
                            from finance.services import FinanceService

                            FinanceService.set_org_salary(
                                user=user,
                                organization=org,
                                payment_type=salary_type if has_salary_type else None,
                                rate=salary_amount if has_salary_amount else None,
                            )
                    if not has_role_id:
                        # Only skip role update, keep existing dynamic_roles unless role_id was explicitly sent as null
                        pass
                    elif not role_id:
                        membership.dynamic_roles.clear()
                        membership.save()
                    else:
                        import uuid

                        role_obj = None
                        try:
                            role_uuid = uuid.UUID(role_id)
                            role_obj = (
                                Role.objects.filter(
                                    id=role_uuid, organization=org, is_deleted=False
                                ).first()
                                or Role.objects.filter(id=role_uuid, is_deleted=False).first()
                            )
                        except ValueError:
                            pass

                        if not role_obj:
                            role_obj = (
                                Role.objects.filter(
                                    name__iexact=str(role_id), organization=org, is_deleted=False
                                ).first()
                                or Role.objects.filter(
                                    name__iexact=str(role_id), is_deleted=False
                                ).first()
                            )
                        if role_obj:
                            membership.dynamic_roles.set([role_obj])
                            if role_obj.name.lower() in OrganizationMembership.Role.values:
                                membership.role = role_obj.name.lower()
                            else:
                                membership.role = OrganizationMembership.Role.EMPLOYEE
                            membership.save()
                        elif str(role_id) in OrganizationMembership.Role.values:
                            membership.role = str(role_id)
                            membership.dynamic_roles.clear()
                            membership.save()

                        from organizations.services import PermissionService

                        PermissionService.clear_user_cache(user, org.id)

                        try:
                            from organizations.models import OrganizationAuditLog
                            from organizations.services import AuditService

                            AuditService.log_action(
                                organization=org,
                                actor=actor,
                                action=OrganizationAuditLog.Action.ROLE_UPDATED,
                                target_user=user,
                                details={
                                    "role_id": str(role_id),
                                    "role_name": role_obj.name if role_obj else str(role_id),
                                },
                            )
                        except Exception:
                            pass

        return user
