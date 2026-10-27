from django.db.models import Count, Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.constants import (
    SYSTEM_DEFAULT_ROLES,
    SYSTEM_PERMISSIONS,
)
from organizations.models import Organization, OrganizationAuditLog, Permission, Role
from organizations.services import AuditService, PermissionService
from panel.Role.permissions import CanManageRoles
from panel.Role.serializers import (
    PermissionSerializer,
    RoleCreateSerializer,
    RoleSerializer,
    RoleUpdateSerializer,
)


class RoleViewSet(viewsets.ViewSet):
    """
    Real Role management API backed by the organizations_roles database table.
    Endpoint: /panel/roles/
    """

    permission_classes = [IsAuthenticated, CanManageRoles]
    SYSTEM_PERMISSIONS_DATA = SYSTEM_PERMISSIONS

    def _get_org(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return None

        # 1. Check query_params, body, or custom header
        raw_org_id = (
            request.query_params.get("organization_id")
            or request.query_params.get("organization")
            or (
                request.data.get("organization_id")
                if hasattr(request, "data") and isinstance(request.data, dict)
                else None
            )
            or request.headers.get("X-Organization-Id")
        )
        if raw_org_id:
            if user.is_superuser:
                return Organization.objects.filter(id=raw_org_id, is_deleted=False).first()
            mem = user.org_memberships.filter(organization_id=raw_org_id, is_deleted=False).first()
            if mem and mem.organization:
                return mem.organization

        if hasattr(user, "org_memberships"):
            mem = (
                user.org_memberships.filter(is_deleted=False).select_related("organization").first()
            )
            if mem and mem.organization:
                return mem.organization

        if user.is_superuser:
            return Organization.objects.filter(is_deleted=False).first()

        return None

    def _paginate(self, queryset, request):
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 20))
        except (TypeError, ValueError):
            page, page_size = 1, 20

        total = queryset.count()
        start = (page - 1) * page_size
        end = start + page_size
        results = list(queryset[start:end])
        total_pages = (total + page_size - 1) // page_size or 1

        return {
            "results": results,
            "current_page": page,
            "has_next": end < total,
            "has_previous": page > 1,
            "next_page": page + 1 if end < total else None,
            "previous_page": page - 1 if page > 1 else None,
            "result_count": len(results),
            "total_pages": total_pages,
            "total_results": total,
        }

    @classmethod
    def _ensure_default_permissions_and_roles(cls, org):
        if not org:
            return

        # 1. Auto-seed 23 permissions if missing
        if Permission.objects.filter(is_deleted=False).count() < len(cls.SYSTEM_PERMISSIONS_DATA):
            for pdata in cls.SYSTEM_PERMISSIONS_DATA:
                perm, created = Permission.objects.get_or_create(
                    code=pdata["code"],
                    defaults={"name": pdata["name"], "module": pdata["module"]},
                )
                if not created and perm.name != pdata["name"]:
                    perm.name = pdata["name"]
                    perm.module = pdata["module"]
                    perm.save()

        # 2. Auto-seed default roles for the organization if missing
        for role_data in SYSTEM_DEFAULT_ROLES:
            role, created = Role.objects.get_or_create(
                organization=org,
                name=role_data["name"],
                defaults={
                    "description": role_data.get("description", ""),
                    "is_protected": role_data.get("is_protected", False),
                },
            )
            if created or not role.permissions.exists():
                perms = Permission.objects.filter(
                    code__in=role_data["permissions"], is_deleted=False
                )
                role.permissions.set(perms)

    def list(self, request):
        org = self._get_org(request)
        if not org:
            # Return empty paginated response instead of 404 to avoid frontend crashes on fresh install
            return Response(
                {
                    "status": True,
                    "message": "No organization found.",
                    "data": {
                        "results": [],
                        "current_page": 1,
                        "has_next": False,
                        "has_previous": False,
                        "next_page": None,
                        "previous_page": None,
                        "result_count": 0,
                        "total_pages": 1,
                        "total_results": 0,
                    },
                }
            )

        self._ensure_default_permissions_and_roles(org)

        qs = (
            Role.objects.filter(organization=org, is_deleted=False)
            .annotate(
                annotated_member_count=Count("memberships", filter=Q(memberships__is_deleted=False))
            )
            .prefetch_related(
                Prefetch(
                    "permissions",
                    queryset=Permission.objects.filter(is_deleted=False).order_by("module", "code"),
                )
            )
            .order_by("name")
        )

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(name__icontains=search)

        page_data = self._paginate(qs, request)
        serialized = RoleSerializer(page_data["results"], many=True)
        page_data["results"] = serialized.data

        return Response(
            {"status": True, "message": "Roles fetched successfully", "data": page_data}
        )

    def create(self, request):
        serializer = RoleCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            role = serializer.save()
            try:
                AuditService.log_action(
                    organization=role.organization,
                    actor=request.user,
                    action=OrganizationAuditLog.Action.ROLE_CREATED,
                    details={
                        "role_id": str(role.id),
                        "name": role.name,
                        "permissions": list(role.permissions.values_list("code", flat=True)),
                    },
                )
            except Exception:
                pass
            return Response(
                {
                    "status": True,
                    "message": "Role created successfully",
                    "data": RoleSerializer(role).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {"status": False, "message": "Validation error", "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def retrieve(self, request, pk=None):
        org = self._get_org(request)
        qs = (
            Role.objects.prefetch_related(
                Prefetch(
                    "permissions",
                    queryset=Permission.objects.filter(is_deleted=False).order_by("module", "code"),
                )
            )
            .annotate(
                annotated_member_count=Count("memberships", filter=Q(memberships__is_deleted=False))
            )
            .filter(pk=pk, is_deleted=False)
        )
        if org and not request.user.is_superuser:
            qs = qs.filter(organization=org)
        role = qs.first()
        if not role:
            return Response(
                {"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response({"status": True, "data": RoleSerializer(role).data})

    def update(self, request, pk=None):
        org = self._get_org(request)
        qs = Role.objects.filter(pk=pk, is_deleted=False)
        if org and not request.user.is_superuser:
            qs = qs.filter(organization=org)
        role = qs.first()
        if not role:
            return Response(
                {"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = RoleUpdateSerializer(
            role, data=request.data, partial=False, context={"request": request}
        )
        if serializer.is_valid():
            role = serializer.save()
            try:
                AuditService.log_action(
                    organization=role.organization,
                    actor=request.user,
                    action=OrganizationAuditLog.Action.ROLE_UPDATED,
                    details={
                        "role_id": str(role.id),
                        "name": role.name,
                        "permissions": list(role.permissions.values_list("code", flat=True)),
                    },
                )
            except Exception:
                pass
            return Response(
                {"status": True, "message": "Role updated.", "data": RoleSerializer(role).data}
            )
        return Response(
            {"status": False, "message": "Validation error", "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def partial_update(self, request, pk=None):
        org = self._get_org(request)
        qs = Role.objects.filter(pk=pk, is_deleted=False)
        if org and not request.user.is_superuser:
            qs = qs.filter(organization=org)
        role = qs.first()
        if not role:
            return Response(
                {"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = RoleUpdateSerializer(
            role, data=request.data, partial=True, context={"request": request}
        )

        if serializer.is_valid():
            role = serializer.save()
            try:
                AuditService.log_action(
                    organization=role.organization,
                    actor=request.user,
                    action=OrganizationAuditLog.Action.ROLE_UPDATED,
                    details={
                        "role_id": str(role.id),
                        "name": role.name,
                        "permissions": list(role.permissions.values_list("code", flat=True)),
                    },
                )
            except Exception:
                pass
            return Response(
                {"status": True, "message": "Role updated.", "data": RoleSerializer(role).data}
            )
        return Response(
            {"status": False, "message": "Validation error", "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def destroy(self, request, pk=None):
        org = self._get_org(request)
        qs = Role.objects.filter(pk=pk, is_deleted=False)
        if org and not request.user.is_superuser:
            qs = qs.filter(organization=org)
        role = qs.first()
        if not role:
            return Response(
                {"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if role.is_protected:
            return Response(
                {"status": False, "message": "This role is protected and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role_org = role.organization
        role_id_str = str(role.id)
        role_name = role.name
        role.delete()
        try:
            AuditService.log_action(
                organization=role_org,
                actor=request.user,
                action=OrganizationAuditLog.Action.ROLE_DELETED,
                details={"role_id": role_id_str, "name": role_name},
            )
        except Exception:
            pass
        return Response({"status": True, "message": "Role deleted."})

    @action(detail=False, methods=["get"], url_path="permissions")
    def permissions(self, request):
        """
        Returns all available system permissions grouped by module.
        Frontend uses this to build the permission checkboxes dynamically.
        GET /panel/roles/permissions/
        """
        all_perms = Permission.objects.filter(is_deleted=False).order_by("module", "code")
        if not request.user.is_superuser:
            org = self._get_org(request)
            if not org:
                all_perms = all_perms.none()
            else:
                allowed = PermissionService.get_user_permissions(request.user, org.id)
                all_perms = all_perms.filter(code__in=allowed)

        data = {
            "permissions": PermissionSerializer(all_perms, many=True).data,
        }
        return Response({"status": True, "data": data})
