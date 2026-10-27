from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.services import PermissionService

from .models import Organization, OrganizationMembership, Role, Team, TeamMembership
from .permissions import CanManageOrganization
from .serializers import (
    AddOrgMemberSerializer,
    OrganizationMemberSerializer,
    OrganizationSerializer,
    UpdateOrgMemberSalarySerializer,
)


class CanCreateOrganization(permissions.BasePermission):
    """
    Determines who can create a new organization (tenant).

    Allowed:
    - Staff and superusers (always).
    - Users who hold the `org.manage_settings` permission in ANY existing org.
    - Authenticated users who are not yet a member of any organization
      (first-time setup flow — they need to create their first workspace).
    """

    message = "You do not have permission to create an organization."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Staff / superusers always allowed
        if user.is_superuser:
            return True

        # Allow users who have org.manage_settings in ANY organization they belong to
        from organizations.models import OrganizationMembership
        from organizations.services import PermissionService

        memberships = OrganizationMembership.objects.filter(
            user=user, is_deleted=False
        ).values_list("organization_id", flat=True)

        # First-time user: not a member of any org yet — allow them to create their first org
        if not memberships.exists():
            return True

        # Check if they have org.manage_settings in any of their orgs
        for org_id in memberships:
            if PermissionService.has_permission(user, "org.manage_settings", org_id):
                return True

        return False


def can_assign_org_role(actor, organization, role):
    if actor.is_superuser:
        return True
    if not role or role.organization_id != organization.id:
        return False
    held = PermissionService.get_user_permissions(actor, organization.id)
    granted = set(role.permissions.filter(is_deleted=False).values_list("code", flat=True))
    return granted.issubset(held)


class OrganizationViewSet(viewsets.ModelViewSet):
    """
    Provides organization discovery and lifecycle management.

    Every authenticated member can see organizations they belong to. Only
    the organization owner, an organization admin, or staff can update or
    delete an existing organization. A new organization can be created by
    staff, superusers, users with org.manage_settings permission, or
    first-time users who do not yet belong to any organization.
    """

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = (
            Organization.objects.filter(is_deleted=False)
            .annotate(
                member_count=Count(
                    "memberships",
                    filter=Q(memberships__is_deleted=False),
                    distinct=True,
                ),
                team_count=Count(
                    "teams",
                    filter=Q(teams__parent_team__isnull=True, teams__is_deleted=False),
                    distinct=True,
                ),
                project_count=Count(
                    "projects",
                    filter=Q(projects__is_deleted=False),
                    distinct=True,
                ),
            )
            .select_related("owner")
        )

        if user.is_superuser:
            return queryset

        return queryset.filter(
            Q(owner=user) | Q(memberships__user=user, memberships__is_deleted=False)
        ).distinct()

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), CanCreateOrganization()]
        if self.action in ("update", "partial_update", "destroy", "members", "remove_member"):
            return [IsAuthenticated(), CanManageOrganization()]
        return [IsAuthenticated()]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        user = request.user
        has_permission = False

        if user.is_superuser:
            has_permission = True
        elif not user.org_memberships.filter(is_deleted=False).exists():
            has_permission = True
        else:
            from organizations.services import PermissionService

            for mem in user.org_memberships.filter(is_deleted=False):
                if PermissionService.has_permission(
                    user, "org.manage_settings", mem.organization_id
                ):
                    has_permission = True
                    break

        if not has_permission:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Only administrators or users without an organization can create new organizations."
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        has_active_org = OrganizationMembership.objects.filter(
            user=request.user,
            is_deleted=False,
            organization__is_deleted=False,
        ).exists()
        if has_active_org and not getattr(request.user, "is_superuser", False):
            return Response(
                {"detail": "User already belongs to an active organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        OrganizationMembership.all_objects.filter(
            user=request.user,
            is_deleted=False,
            organization__is_deleted=True,
        ).update(is_deleted=True)

        organization = serializer.save(owner=request.user)
        response_serializer = self.get_serializer(self.get_queryset().get(pk=organization.pk))
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        organization = self.get_object()

        with transaction.atomic():
            OrganizationMembership.objects.filter(organization=organization).update(is_deleted=True)
            TeamMembership.objects.filter(team__organization=organization).update(is_deleted=True)
            Team.objects.filter(organization=organization).update(is_deleted=True)

            # Cascade soft-delete projects safely
            try:
                from projects.models import Project

                Project.objects.filter(organization=organization).update(is_deleted=True)
            except (ImportError, AttributeError):
                pass

            Organization.objects.filter(pk=organization.pk).update(is_deleted=True)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        organization = self.get_object()

        if request.method == "GET":
            memberships = (
                OrganizationMembership.objects.filter(
                    organization=organization,
                    is_deleted=False,
                )
                .select_related("user")
                .prefetch_related("dynamic_roles")
                .order_by("-created_at")
            )
            serializer = OrganizationMemberSerializer(
                memberships, many=True, context={"request": request}
            )
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = AddOrgMemberSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            user_id = serializer.validated_data["user_id"]
            raw_role = serializer.validated_data.get("role_id")

            # Resolve Role object and map to valid OrganizationMembership.Role choice
            role_obj = None
            legacy_role = None
            if raw_role:
                import uuid

                try:
                    role_uuid = uuid.UUID(str(raw_role))
                except (ValueError, TypeError):
                    role_uuid = None
                if role_uuid:
                    role_obj = Role.objects.filter(
                        id=role_uuid, organization=organization, is_deleted=False
                    ).first()
                if not role_obj:
                    role_obj = Role.objects.filter(
                        name__iexact=str(raw_role), organization=organization, is_deleted=False
                    ).first()
                if role_obj:
                    name_lower = role_obj.name.lower().replace(" ", "_")
                    if name_lower in [c[0] for c in OrganizationMembership.Role.choices]:
                        legacy_role = name_lower
                    elif "admin" in name_lower:
                        legacy_role = OrganizationMembership.Role.ADMIN
                    else:
                        legacy_role = None
                elif raw_role in [c[0] for c in OrganizationMembership.Role.choices]:
                    legacy_role = raw_role

            target = (
                OrganizationMembership._meta.get_field("user")
                .remote_field.model.objects.filter(pk=user_id)
                .first()
            )
            if organization.owner_id == user_id:
                return Response(
                    {"detail": "The organization owner's role cannot be changed here."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target and target.is_superuser and target.pk != request.user.pk:
                return Response(
                    {"detail": "Another superuser cannot be changed."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if raw_role and not role_obj:
                return Response(
                    {"detail": "Role must belong to this organization."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if role_obj and not can_assign_org_role(request.user, organization, role_obj):
                return Response(
                    {"detail": "Cannot assign permissions you do not hold."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            try:
                with transaction.atomic():
                    if (
                        OrganizationMembership.objects.filter(
                            user_id=user_id,
                            is_deleted=False,
                            organization__is_deleted=False,
                        )
                        .exclude(organization=organization)
                        .exists()
                    ):
                        return Response(
                            {"detail": "User already belongs to another active organization."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    # Look up existing membership including soft-deleted records
                    membership = OrganizationMembership.all_objects.filter(
                        organization=organization, user_id=user_id
                    ).first()

                    if membership:
                        # Restore soft-deleted membership
                        membership.is_deleted = False
                        membership.role = legacy_role
                        membership.invited_by = (
                            request.user if request.user.is_authenticated else None
                        )
                        membership.save()
                        if role_obj:
                            membership.dynamic_roles.set([role_obj])
                        created = False
                    else:
                        membership = OrganizationMembership.objects.create(
                            user_id=user_id,
                            organization=organization,
                            role=legacy_role,
                            invited_by=request.user if request.user.is_authenticated else None,
                        )
                        if role_obj:
                            membership.dynamic_roles.set([role_obj])
                        created = True

                    salary_type = serializer.validated_data.get("salary_type")
                    salary_amount = serializer.validated_data.get("salary_amount")
                    if salary_type is not None or salary_amount is not None:
                        from finance.services import FinanceService

                        FinanceService.set_org_salary(
                            user=membership.user,
                            organization=organization,
                            payment_type=salary_type,
                            rate=salary_amount,
                        )
            except IntegrityError:
                return Response(
                    {"detail": "User already belongs to another active organization."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            response_serializer = OrganizationMemberSerializer(
                membership, context={"request": request}
            )
            status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            return Response(response_serializer.data, status=status_code)

    @action(detail=True, methods=["delete"], url_path="members/(?P<user_id>[^/.]+)")
    def remove_member(self, request, pk=None, user_id=None):
        organization = self.get_object()

        if str(organization.owner_id) == user_id:
            return Response(
                {"detail": "Cannot remove the organization owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = (
            OrganizationMembership._meta.get_field("user")
            .remote_field.model.objects.filter(pk=user_id)
            .first()
        )
        if target and target.is_superuser and target.pk != request.user.pk:
            return Response(
                {"detail": "Another superuser cannot be changed."}, status=status.HTTP_403_FORBIDDEN
            )

        membership = (
            OrganizationMembership.all_objects.filter(
                organization=organization,
            )
            .filter(Q(user_id=user_id) | Q(id=user_id))
            .first()
        )

        if membership and membership.user.is_superuser and membership.user_id != request.user.pk:
            return Response(
                {"detail": "Another superuser cannot be changed."}, status=status.HTTP_403_FORBIDDEN
            )
        if membership and membership.user_id == organization.owner_id:
            return Response(
                {"detail": "Cannot remove the organization owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if membership:
            membership.is_deleted = True
            membership.save(update_fields=["is_deleted"])

        return Response({"detail": "Member removed."}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["patch"],
        url_path="members/(?P<user_id>[^/.]+)/salary",
        permission_classes=[IsAuthenticated, CanManageOrganization],
    )
    def update_member_salary(self, request, pk=None, user_id=None):
        """Update the org-level salary for a specific member.
        This creates or updates a SalaryConfig for the user in this organization.
        """
        organization = self.get_object()

        membership = (
            OrganizationMembership.objects.filter(
                organization=organization,
                is_deleted=False,
            )
            .filter(Q(user_id=user_id) | Q(id=user_id))
            .first()
        )

        if not membership:
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateOrgMemberSalarySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from finance.services import FinanceService

        FinanceService.set_org_salary(
            user=membership.user,
            organization=organization,
            payment_type=serializer.validated_data.get("salary_type"),
            rate=serializer.validated_data.get("salary_amount"),
        )

        response_serializer = OrganizationMemberSerializer(membership, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="invite_member",
        permission_classes=[IsAuthenticated, CanManageOrganization],
    )
    def invite_member(self, request, pk=None):
        organization = self.get_object()
        from .serializers import InviteOrgMemberSerializer

        serializer = InviteOrgMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        username = serializer.validated_data["username"]
        first_name = serializer.validated_data.get("first_name", "")
        last_name = serializer.validated_data.get("last_name", "")
        password = serializer.validated_data["password"]
        role_id = serializer.validated_data.get("role_id", OrganizationMembership.Role.ADMIN)

        from django.contrib.auth import get_user_model

        User = get_user_model()

        if role_id:
            import uuid

            try:
                uuid.UUID(str(role_id))
                requested_role = Role.objects.filter(
                    id=role_id, organization=organization, is_deleted=False
                ).first()
            except (ValueError, TypeError):
                requested_role = Role.objects.filter(
                    name__iexact=str(role_id), organization=organization, is_deleted=False
                ).first()
            if not requested_role:
                return Response(
                    {"detail": "Role must belong to this organization."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not can_assign_org_role(request.user, organization, requested_role):
                return Response(
                    {"detail": "Cannot assign permissions you do not hold."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Check if user exists
        user = User.objects.filter(email=email).first()
        if user and organization.owner_id == user.pk:
            return Response(
                {"detail": "The organization owner's role cannot be changed here."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user and user.is_superuser and user.pk != request.user.pk:
            return Response(
                {"detail": "Another superuser cannot be changed."}, status=status.HTTP_403_FORBIDDEN
            )
        # created_user variable is no longer needed
        if not user:
            # Check if username exists
            if User.objects.filter(username=username).exists():
                return Response(
                    {"detail": "Username already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
                password=password,
            )
            # User was created successfully

        # Add to organization
        role_obj = None
        legacy_role = None
        if role_id:
            import uuid as _uuid

            is_uuid = True
            try:
                _uuid.UUID(str(role_id))
            except (ValueError, AttributeError):
                is_uuid = False

            if is_uuid:
                role_obj = Role.objects.filter(
                    id=role_id, organization=organization, is_deleted=False
                ).first()

            if not role_obj:
                role_obj = Role.objects.filter(
                    name__iexact=str(role_id), organization=organization, is_deleted=False
                ).first()

            if role_obj:
                name_lower = role_obj.name.lower().replace(" ", "_")
                if name_lower in [c[0] for c in OrganizationMembership.Role.choices]:
                    legacy_role = name_lower
                elif "admin" in name_lower:
                    legacy_role = OrganizationMembership.Role.ADMIN
                else:
                    legacy_role = None
            elif role_id in [c[0] for c in OrganizationMembership.Role.choices]:
                legacy_role = role_id

        if user.is_superuser and user.pk != request.user.pk:
            return Response(
                {"detail": "Another superuser cannot be changed."}, status=status.HTTP_403_FORBIDDEN
            )
        if role_id and not role_obj:
            return Response(
                {"detail": "Role must belong to this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if role_obj and not can_assign_org_role(request.user, organization, role_obj):
            return Response(
                {"detail": "Cannot assign permissions you do not hold."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            with transaction.atomic():
                membership = OrganizationMembership.all_objects.filter(
                    organization=organization, user_id=user.id
                ).first()

                if membership:
                    membership.is_deleted = False
                    membership.role = legacy_role
                    membership.invited_by = request.user
                    membership.save()
                    if role_obj:
                        membership.dynamic_roles.set([role_obj])
                    created_mem = False
                else:
                    membership = OrganizationMembership.objects.create(
                        user_id=user.id,
                        organization=organization,
                        role=legacy_role,
                        invited_by=request.user,
                    )
                    if role_obj:
                        membership.dynamic_roles.set([role_obj])
                    created_mem = True
        except IntegrityError:
            return Response(
                {"detail": "User already belongs to this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = OrganizationMemberSerializer(membership, context={"request": request})
        status_code = status.HTTP_201_CREATED if created_mem else status.HTTP_200_OK
        return Response(response_serializer.data, status=status_code)
