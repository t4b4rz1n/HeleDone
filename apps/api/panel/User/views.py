from django.db import transaction
from django.db.models import Exists, OuterRef
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from common.utils.mixins import FieldFilterOverviewMixin
from organizations.models import OrganizationMembership

from .filters import UserFilter
from .permissions import CanManageUsers
from .serializers import UserCreateSerializer, UserListSerializer, UserUpdateSerializer


class UserViewSet(FieldFilterOverviewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageUsers]
    queryset = User.objects.all().order_by("-date_joined")
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = UserFilter
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["date_joined", "username", "email"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset().prefetch_related("org_memberships__dynamic_roles")
        unassigned = self.request.query_params.get("unassigned")
        if unassigned and unassigned.lower() in ("true", "1"):
            active_membership = OrganizationMembership.objects.filter(
                user_id=OuterRef("pk"),
                is_deleted=False,
                organization__is_deleted=False,
            )
            qs = qs.filter(~Exists(active_membership))

        if user.is_superuser:
            return qs

        # Get organizations the user belongs to
        org_ids = user.org_memberships.filter(is_deleted=False).values_list(
            "organization_id", flat=True
        )

        # Filter users who belong to the same organizations
        return (
            qs.filter(
                org_memberships__organization_id__in=org_ids,
                org_memberships__is_deleted=False,
            )
            .exclude(is_superuser=True)
            .distinct()
        )

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ["update", "partial_update"]:
            return UserUpdateSerializer
        if self.action == "list":
            return UserListSerializer
        return UserListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        created_instance = self.get_queryset().filter(pk=user.pk).first() or user
        return Response(
            UserListSerializer(created_instance, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}

        updated_instance = self.get_queryset().filter(pk=instance.pk).first() or instance
        return Response(
            UserListSerializer(updated_instance, context=self.get_serializer_context()).data
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        from organizations.models import Organization

        if Organization.objects.filter(owner=instance, is_deleted=False).exists():
            return Response(
                {"detail": "Cannot delete an organization owner."}, status=status.HTTP_403_FORBIDDEN
            )
        user_id = instance.pk
        with transaction.atomic():
            if hasattr(instance, "org_memberships"):
                instance.org_memberships.all().delete()
            if hasattr(instance, "memberships"):
                instance.memberships.all().delete()
            # Direct database hard delete to ensure DB record removal
            User.objects.filter(pk=user_id).delete()
        return Response(
            {"status": True, "message": "User deleted successfully", "data": None},
            status=status.HTTP_200_OK,
        )
