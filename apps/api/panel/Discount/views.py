from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter

from billing.models import DiscountCode
from common.utils.mixins import FieldFilterOverviewMixin
from organizations.services import PermissionService

from .filters import DiscountCodeFilter
from .serializers import StaffDiscountCodeSerializer


class CanManageDiscounts(permissions.BasePermission):
    """
    Permission class guarding Discount Code endpoints:
    - Read: requires 'finance.view_reports', 'finance.manage', or 'org.manage_settings'.
    - Write: requires 'finance.manage' or 'org.manage_settings'.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        mem = user.org_memberships.filter(is_deleted=False).first()
        if not mem:
            return False
        org_id = mem.organization_id

        if request.method in permissions.SAFE_METHODS:
            return (
                PermissionService.has_permission(user, "finance.view_reports", org_id)
                or PermissionService.has_permission(user, "finance.manage", org_id)
                or PermissionService.has_permission(user, "org.manage_settings", org_id)
            )

        return PermissionService.has_permission(
            user, "finance.manage", org_id
        ) or PermissionService.has_permission(user, "org.manage_settings", org_id)


class StaffDiscountCodeViewSet(FieldFilterOverviewMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, CanManageDiscounts]
    serializer_class = StaffDiscountCodeSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = DiscountCodeFilter
    search_fields = ["code", "description"]
    ordering_fields = ["created_at", "expiration_date", "percent", "current_usage"]
    lookup_field = "id"

    def get_queryset(self):
        return DiscountCode.objects.all()
