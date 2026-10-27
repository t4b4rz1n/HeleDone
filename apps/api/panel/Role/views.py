from django.db.models import Count, Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.constants import SYSTEM_DEFAULT_ROLES, SYSTEM_PERMISSIONS
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
    permission_classes = [IsAuthenticated, CanManageRoles]
    SYSTEM_PERMISSIONS_DATA = SYSTEM_PERMISSIONS

    def _get_org(self, request):
        user = request.user
        raw_org_id = (
            request.query_params.get("organization_id")
            or request.query_params.get("organization")
            or (request.data.get("organization_id") if isinstance(request.data, dict) else None)
            or request.headers.get("X-Organization-Id")
        )
        if raw_org_id:
            if user.is_superuser:
                return Organization.objects.filter(pk=raw_org_id, is_deleted=False).first()
            membership = user.org_memberships.filter(
                organization_id=raw_org_id, is_deleted=False
            ).select_related("organization").first()
            return membership.organization if membership else None
        if user.is_superuser:
            return Organization.objects.filter(is_deleted=False).first()
        membership = user.org_memberships.filter(is_deleted=False).select_related("organization").first()
        return membership.organization if membership else None

    def _scope(self, request, queryset, org):
        if request.user.is_superuser:
            return queryset
        if not org:
            return queryset.none()
        return queryset.filter(organization=org)

    def _paginate(self, queryset, request):
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (TypeError, ValueError):
            page, page_size = 1, 20
        total = queryset.count()
        start, end = (page - 1) * page_size, page * page_size
        return {
            "results": list(queryset[start:end]),
            "current_page": page,
            "has_next": end < total,
            "has_previous": page > 1,
            "next_page": page + 1 if end < total else None,
            "previous_page": page - 1 if page > 1 else None,
            "result_count": min(page_size, max(0, total - start)),
            "total_pages": (total + page_size - 1) // page_size or 1,
            "total_results": total,
        }

    @classmethod
    def _ensure_default_permissions_and_roles(cls, org):
        if not org:
            return
        for data in cls.SYSTEM_PERMISSIONS_DATA:
            Permission.objects.get_or_create(
                code=data["code"],
                defaults={"name": data["name"], "module": data["module"]},
            )
        for data in SYSTEM_DEFAULT_ROLES:
            role, created = Role.objects.get_or_create(
                organization=org,
                name=data["name"],
                defaults={"description": data.get("description", ""), "is_protected": data.get("is_protected", False)},
            )
            if created or not role.permissions.exists():
                role.permissions.set(Permission.objects.filter(code__in=data["permissions"], is_deleted=False))

    def list(self, request):
        org = self._get_org(request)
        if not org and not request.user.is_superuser:
            return Response({"detail": "Organization context is required."}, status=status.HTTP_403_FORBIDDEN)
        self._ensure_default_permissions_and_roles(org)
        qs = self._scope(request, Role.objects.filter(is_deleted=False), org).annotate(
            annotated_member_count=Count("memberships", filter=Q(memberships__is_deleted=False))
        ).prefetch_related(Prefetch("permissions", queryset=Permission.objects.filter(is_deleted=False).order_by("module", "code"))).order_by("name")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        page = self._paginate(qs, request)
        page["results"] = RoleSerializer(page["results"], many=True).data
        return Response({"status": True, "message": "Roles fetched successfully", "data": page})

    def create(self, request):
        serializer = RoleCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        role = serializer.save()
        return Response({"status": True, "message": "Role created successfully", "data": RoleSerializer(role).data}, status=status.HTTP_201_CREATED)

    def _role(self, request, pk):
        org = self._get_org(request)
        if not org and not request.user.is_superuser:
            return None
        return self._scope(request, Role.objects.filter(pk=pk, is_deleted=False), org).first()

    def retrieve(self, request, pk=None):
        role = self._role(request, pk)
        if not role:
            return Response({"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"status": True, "data": RoleSerializer(role).data})

    def _update(self, request, pk, partial):
        role = self._role(request, pk)
        if not role:
            return Response({"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RoleUpdateSerializer(role, data=request.data, partial=partial, context={"request": request})
        serializer.is_valid(raise_exception=True)
        role = serializer.save()
        for membership in role.memberships.select_related("user"):
            PermissionService.clear_user_cache(membership.user, role.organization_id)
        return Response({"status": True, "message": "Role updated.", "data": RoleSerializer(role).data})

    def update(self, request, pk=None):
        return self._update(request, pk, partial=False)

    def partial_update(self, request, pk=None):
        return self._update(request, pk, partial=True)

    def destroy(self, request, pk=None):
        role = self._role(request, pk)
        if not role:
            return Response({"status": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if role.is_protected:
            return Response({"status": False, "message": "This role is protected and cannot be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        memberships = list(role.memberships.select_related("user"))
        role_org, role_id, role_name = role.organization, str(role.pk), role.name
        role.delete()
        for membership in memberships:
            PermissionService.clear_user_cache(membership.user, role_org.pk)
        AuditService.log_action(organization=role_org, actor=request.user, action=OrganizationAuditLog.Action.ROLE_DELETED, details={"role_id": role_id, "name": role_name})
        return Response({"status": True, "message": "Role deleted."})

    @action(detail=False, methods=["get"], url_path="permissions")
    def permissions(self, request):
        org = self._get_org(request)
        if not org and not request.user.is_superuser:
            return Response({"detail": "Organization context is required."}, status=status.HTTP_403_FORBIDDEN)
        all_perms = Permission.objects.filter(is_deleted=False).order_by("module", "code")
        if not request.user.is_superuser:
            all_perms = all_perms.filter(code__in=PermissionService.get_user_permissions(request.user, org.pk))
        return Response({"status": True, "data": {"permissions": PermissionSerializer(all_perms, many=True).data}})
