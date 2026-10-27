from django.db.models import Exists, OuterRef
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from finance.services import FinanceService


def _get_user_org(request):
    """Return the requested organization, or the user's active project workspace."""
    from organizations.models import OrganizationMembership
    from projects.models import ProjectMember

    user = request.user
    memberships = OrganizationMembership.objects.filter(
        user=user,
        is_deleted=False,
        organization__is_deleted=False,
    ).select_related("organization")
    organization_id = request.query_params.get("organization_id") or request.headers.get(
        "X-Organization-Id"
    )
    if organization_id:
        membership = memberships.filter(organization_id=organization_id).first()
    else:
        active_project = ProjectMember.objects.filter(
            user=user,
            is_active=True,
            is_deleted=False,
            project__organization_id=OuterRef("organization_id"),
            project__is_deleted=False,
        )
        membership = (
            memberships.annotate(has_project=Exists(active_project))
            .order_by("-has_project", "created_at")
            .first()
        )
    return user, membership.organization if membership else None


class MyFinanceReportView(APIView):
    """GET /api/v1/finance/my-reports/ — personal finance summary."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="My finance summary", tags=["finance"])
    def get(self, request):
        user, organization = _get_user_org(request)
        if not organization:
            return Response(
                {
                    "user_id": str(user.pk),
                    "total_income": 0.0,
                    "total_paid": 0.0,
                    "current_balance": 0.0,
                    "currency": "IRR",
                    "projects": [],
                }
            )

        data = FinanceService.get_user_finance_summary(user, organization)
        return Response(data)


class AdminFinanceReportView(APIView):
    """GET /api/v1/finance/admin/reports/ — org-wide finance report (managers only)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin finance report", tags=["finance"])
    def get(self, request):
        user, organization = _get_user_org(request)
        if not organization:
            return Response(
                {"detail": _("You are not a member of any active organization.")},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Permission check
        from organizations.services import PermissionService

        if not (
            user.is_superuser
            or PermissionService.has_permission(user, "finance.manage", organization.pk)
            or PermissionService.has_permission(user, "finance.view_reports", organization.pk)
            or PermissionService.has_permission(user, "org.manage_settings", organization.pk)
        ):
            return Response(
                {"detail": _("You do not have permission to view finance reports.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        search = request.query_params.get("search", "").strip()

        from django.db.models import Q

        from organizations.models import OrganizationMembership

        qs = (
            OrganizationMembership.objects.filter(
                organization=organization,
                is_deleted=False,
            )
            .select_related("user")
            .order_by("user__username")
        )

        if search:
            qs = qs.filter(
                Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )

        total = qs.count()

        # Simple pagination
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 20))
        except ValueError:
            return Response(
                {"detail": _("page and page_size must be integers.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page < 1 or not 1 <= page_size <= 100:
            return Response(
                {"detail": _("page must be positive and page_size must be between 1 and 100.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start = (page - 1) * page_size
        end = start + page_size
        paginated_memberships = list(qs[start:end])
        total_pages = max(1, (total + page_size - 1) // page_size)

        data = FinanceService.get_org_finance_report(organization, paginated_memberships)

        return Response(
            {
                "results": data,
                "total_results": total,
                "current_page": page,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
        )


class ProjectBillingView(APIView):
    """GET /api/v1/finance/projects/{project_id}/billing/ — project cost breakdown."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Project billing breakdown", tags=["finance"])
    def get(self, request, project_id):
        from projects.models import Project

        try:
            project = Project.objects.select_related("organization").get(
                pk=project_id, is_deleted=False
            )
        except Project.DoesNotExist:
            return Response({"detail": _("Project not found.")}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        organization = project.organization

        # Only owners/admins/finance roles can see billing
        from organizations.services import PermissionService

        if not (
            user.is_superuser
            or project.owner_id == user.pk
            or PermissionService.has_permission(user, "finance.manage", organization.pk)
            or PermissionService.has_permission(user, "finance.view_reports", organization.pk)
            or PermissionService.has_permission(user, "org.manage_settings", organization.pk)
        ):
            return Response(
                {"detail": _("You do not have permission to view this project's billing.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Pagination and search
        search = request.query_params.get("search", "").strip()
        data = FinanceService.get_project_billing(project)

        if search:
            q = search.lower()
            data["members"] = [
                m
                for m in data["members"]
                if q in m["username"].lower()
                or q in m["first_name"].lower()
                or q in m["last_name"].lower()
            ]

        total = len(data["members"])

        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 20))
        except ValueError:
            return Response(
                {"detail": _("page and page_size must be integers.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page < 1 or not 1 <= page_size <= 100:
            return Response(
                {"detail": _("page must be positive and page_size must be between 1 and 100.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start = (page - 1) * page_size
        end = start + page_size
        paginated_members = data["members"][start:end]
        total_pages = max(1, (total + page_size - 1) // page_size)

        data["members"] = paginated_members
        data["pagination"] = {
            "total_results": total,
            "current_page": page,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1,
        }

        return Response(data)
