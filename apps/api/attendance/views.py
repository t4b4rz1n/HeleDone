import datetime

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from organizations.models import Organization, OrganizationMembership
from organizations.services import PermissionService
from tasks.models import Task

from .models import Attendance, Holiday, TimeLog, TimeOffRequest
from .permissions import (
    IsAttendanceOwnerOrAdmin,
    IsHolidayPermission,
    IsTimeLogOwnerOrAdmin,
    IsTimeOffRequestPermission,
    IsTimesheetPermission,
)
from .serializers import (
    AttendanceSerializer,
    AttendanceWriteSerializer,
    HolidaySerializer,
    LiveActivitySerializer,
    TimeLogSerializer,
    TimeLogWriteSerializer,
    TimeOffRequestSerializer,
    TimeOffRequestWriteSerializer,
    TimesheetDailySerializer,
    TimesheetTeamSerializer,
)
from .services import (
    AttendanceService,
    TimeLogService,
    TimeOffRequestService,
    TimesheetService,
)


class AttendanceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAttendanceOwnerOrAdmin]
    pagination_class = PageNumberPagination
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "check_in"]:
            return AttendanceWriteSerializer
        return AttendanceSerializer

    def get_queryset(self):
        from django.db.models import Exists, Max, OuterRef, Sum
        from django.db.models.functions import Coalesce

        from .models import AttendanceSession

        qs = (
            Attendance.objects.select_related("user", "organization")
            .prefetch_related("sessions")
            .filter(is_deleted=False)
        )

        qs = qs.annotate(
            annotated_total_seconds=Coalesce(
                Sum(
                    "sessions__duration_seconds",
                    filter=Q(sessions__is_deleted=False, sessions__duration_seconds__isnull=False),
                ),
                0,
            ),
            annotated_is_active=Exists(
                AttendanceSession.objects.filter(
                    attendance=OuterRef("pk"), is_deleted=False, end_time__isnull=True
                )
            ),
            annotated_active_start=Max(
                "sessions__start_time",
                filter=Q(sessions__is_deleted=False, sessions__end_time__isnull=True),
            ),
        )

        user = self.request.user
        if getattr(user, "is_superuser", False):
            qs = qs.all()
        else:
            # Use PermissionService: orgs where the user has attendance.view_all permission
            admin_org_ids = [
                m.organization_id
                for m in user.org_memberships.filter(is_deleted=False).prefetch_related(
                    "dynamic_roles__permissions"
                )
                if PermissionService.has_permission(
                    user=user,
                    permission_code="attendance.view_all",
                    organization_id=str(m.organization_id),
                )
            ]
            qs = qs.filter(Q(user=user) | Q(organization_id__in=admin_org_ids)).distinct()

        # Optional filters
        org_id = self.request.query_params.get("organization")
        if org_id:
            qs = qs.filter(organization_id=org_id)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs.order_by("-date", "-created_at")

    def perform_create(self, serializer):
        AttendanceService.save_manual_attendance(self.request.user, serializer.validated_data)

    def perform_update(self, serializer):
        AttendanceService.save_manual_attendance(
            self.request.user, serializer.validated_data, instance=serializer.instance
        )

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    @action(detail=False, methods=["post"], url_path="check-in")
    def check_in(self, request):
        org_id = request.data.get("organization")
        if not org_id:
            return Response(
                {"error": "Organization ID is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        org = get_object_or_404(Organization, id=org_id)
        if not OrganizationMembership.objects.filter(organization=org, user=request.user).exists():
            return Response(
                {"error": "You are not a member of this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )
        timezone_str = request.data.get("timezone", "UTC")
        attendance, created = AttendanceService.check_in(
            request.user, org, timezone_str=timezone_str
        )
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(AttendanceSerializer(attendance).data, status=resp_status)

    @action(detail=False, methods=["post"], url_path="check-out")
    def check_out(self, request):
        attendance = AttendanceService.check_out(request.user)
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="my-today")
    def my_today(self, request):
        attendance = AttendanceService.get_today_attendance(request.user)
        if not attendance:
            return Response({"detail": "Not checked in today."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AttendanceSerializer(attendance).data)


class TimeLogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTimeLogOwnerOrAdmin]
    pagination_class = PageNumberPagination
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return TimeLogWriteSerializer
        return TimeLogSerializer

    def get_queryset(self):
        qs = TimeLog.objects.select_related(
            "user", "task", "task__status", "task__project", "project"
        ).filter(is_deleted=False)
        user = self.request.user
        if getattr(user, "is_superuser", False):
            qs = qs.all()
        else:
            organization_ids = set(
                user.org_memberships.filter(is_deleted=False).values_list(
                    "organization_id", flat=True
                )
            )
            organization_ids.update(
                Organization.objects.filter(owner=user, is_deleted=False).values_list(
                    "id", flat=True
                )
            )
            reportable_org_ids = [
                organization_id
                for organization_id in organization_ids
                if PermissionService.has_permission(user, "attendance.view_all", organization_id)
            ]

            qs = qs.filter(
                Q(user=user)
                | Q(project__organization_id__in=reportable_org_ids)
                | Q(task__project__organization_id__in=reportable_org_ids)
            ).distinct()

        # Optional filters
        task_id = self.request.query_params.get("task")
        if task_id:
            qs = qs.filter(task_id=task_id)
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def perform_create(self, serializer):
        task = serializer.validated_data.get("task")
        start_time = serializer.validated_data.get("start_time")
        end_time = serializer.validated_data.get("end_time")

        duration = 0
        if start_time and end_time:
            duration = int((end_time - start_time).total_seconds())

        serializer.save(
            user=self.request.user,
            project=task.project if task else None,
            duration_seconds=duration,
            is_active=serializer.validated_data.get("is_active", not bool(end_time)),
        )

    def perform_update(self, serializer):
        start_time = serializer.validated_data.get("start_time", serializer.instance.start_time)
        end_time = serializer.validated_data.get("end_time", serializer.instance.end_time)

        duration = 0
        if start_time and end_time:
            duration = int((end_time - start_time).total_seconds())

        serializer.save(
            duration_seconds=duration,
            is_active=serializer.validated_data.get("is_active", not bool(end_time)),
        )

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    @action(detail=False, methods=["post"], url_path="manual-timer")
    def manual_timer(self, request):
        serializer = TimeLogWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.validated_data.get("task")
        start_time = serializer.validated_data.get("start_time")
        end_time = serializer.validated_data.get("end_time")
        description = serializer.validated_data.get("description", "")

        if not start_time or not end_time:
            return Response(
                {"error": "start_time and end_time are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        log = TimeLogService.create_manual_log(
            request.user, task, start_time, end_time, description
        )
        return Response(TimeLogSerializer(log).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="start-timer")
    def start_timer(self, request):
        task_id = request.data.get("task")
        if not task_id:
            return Response({"error": "task ID is required"}, status=status.HTTP_400_BAD_REQUEST)
        task = get_object_or_404(Task, id=task_id)
        timer = TimeLogService.start_timer(request.user, task)
        return Response(TimeLogSerializer(timer).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="stop-timer")
    def stop_timer(self, request, pk=None):
        # Manual stop by user → task stays in current status (auto_move=False)
        timer = TimeLogService.stop_timer(request.user, pk, auto_move=False)
        return Response(TimeLogSerializer(timer).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="active-timers")
    def active_timers(self, request):
        timers = TimeLogService.get_active_timers(request.user)
        return Response(TimeLogSerializer(timers, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_timer(self, request, pk=None):
        timer = TimeLogService.cancel_timer(request.user, pk)
        return Response(TimeLogSerializer(timer).data, status=status.HTTP_200_OK)


class TimeOffRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTimeOffRequestPermission]
    pagination_class = PageNumberPagination
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return TimeOffRequestWriteSerializer
        return TimeOffRequestSerializer

    def get_queryset(self):
        qs = TimeOffRequest.objects.select_related("user", "approved_by", "organization").filter(
            is_deleted=False
        )
        user = self.request.user
        if getattr(user, "is_superuser", False):
            qs = qs.all()
        else:
            # Use PermissionService: orgs where the user can approve leaves
            admin_org_ids = [
                m.organization_id
                for m in user.org_memberships.filter(is_deleted=False).prefetch_related(
                    "dynamic_roles__permissions"
                )
                if PermissionService.has_permission(
                    user=user,
                    permission_code="leave.approve",
                    organization_id=str(m.organization_id),
                )
            ]
            qs = qs.filter(Q(user=user) | Q(organization_id__in=admin_org_ids)).distinct()

        # Optional filters are applied after the user/organization visibility scope.
        requested_user = self.request.query_params.get("user")
        if requested_user:
            qs = qs.filter(user_id=requested_user)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        org_id = self.request.query_params.get("organization")
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = TimeOffRequestService.approve(pk, request.user)
        return Response(TimeOffRequestSerializer(req).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        req = TimeOffRequestService.reject(pk, request.user)
        return Response(TimeOffRequestSerializer(req).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_request(self, request, pk=None):
        req = TimeOffRequestService.cancel(request.user, pk)
        return Response(TimeOffRequestSerializer(req).data, status=status.HTTP_200_OK)


class HolidayViewSet(viewsets.ModelViewSet):
    pagination_class = PageNumberPagination
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    serializer_class = HolidaySerializer
    permission_classes = [IsAuthenticated, IsHolidayPermission]

    def get_queryset(self):
        qs = Holiday.objects.filter(is_deleted=False)
        user = self.request.user

        if not user.is_superuser:
            user_orgs = OrganizationMembership.objects.filter(user=user).values_list(
                "organization_id", flat=True
            )
            qs = qs.filter(Q(organization_id__in=user_orgs) | Q(organization__isnull=True))

        org_id = self.request.query_params.get("organization")
        if org_id:
            qs = qs.filter(Q(organization_id=org_id) | Q(organization__isnull=True))
        return qs

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])


class TimesheetViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsTimesheetPermission]
    pagination_class = PageNumberPagination
    throttle_classes = [UserRateThrottle, AnonRateThrottle]

    def paginate_and_respond(self, data, serializer_class):
        page = self.paginate_queryset(data)
        if page is not None:
            return self.get_paginated_response(serializer_class(page, many=True).data)
        return Response(serializer_class(data, many=True).data)

    @action(detail=False, methods=["get"], url_path="daily")
    def daily(self, request):
        date_str = request.query_params.get("date")
        if not date_str:
            date_str = timezone.localdate().isoformat()
        try:
            date = datetime.date.fromisoformat(date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = TimesheetService.get_daily(request.user, date)
        # aggregate returns {'total_seconds': value}
        total = data.get("total_seconds") or 0
        return Response({"date": date_str, "total_seconds": total})

    @action(detail=False, methods=["get"], url_path="weekly")
    def weekly(self, request):
        date_str = request.query_params.get("week_start")
        if not date_str:
            # Default to the start of the current week (Saturday)
            today = timezone.localdate()
            # weekday(): Mon=0 ... Sat=5, Sun=6  →  days since last Saturday
            days_since_saturday = (today.weekday() - 5) % 7
            date = today - datetime.timedelta(days=days_since_saturday)
        else:
            try:
                date = datetime.date.fromisoformat(date_str)
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        data = TimesheetService.get_weekly(request.user, date)
        return self.paginate_and_respond(data, TimesheetDailySerializer)

    @action(detail=False, methods=["get"], url_path="monthly")
    def monthly(self, request):
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if not year or not month:
            return Response(
                {"error": "year and month are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year = int(year)
            month = int(month)
        except (TypeError, ValueError):
            return Response(
                {"error": "year and month must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not 1 <= year <= 9999 or not 1 <= month <= 12:
            return Response(
                {"error": "year must be between 1 and 9999 and month between 1 and 12"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = TimesheetService.get_monthly(request.user, year, month)
        return self.paginate_and_respond(data, TimesheetDailySerializer)

    @action(detail=False, methods=["get"], url_path="team")
    def team(self, request):
        org_id = request.query_params.get("organization")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if not org_id or not start_date or not end_date:
            return Response(
                {"error": "organization, start_date, end_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = TimesheetService.get_team_timesheet(request.user, org_id, start_date, end_date)
        return self.paginate_and_respond(data, TimesheetTeamSerializer)

    @action(detail=False, methods=["get"], url_path="project")
    def project(self, request):
        project_id = request.query_params.get("project")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if not project_id or not start_date or not end_date:
            return Response(
                {"error": "project, start_date, end_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = TimesheetService.get_project_timesheet(project_id, start_date, end_date)
        return self.paginate_and_respond(data, TimesheetTeamSerializer)


class LiveActivityView(viewsets.GenericViewSet):
    """
    Read-only endpoint returning all active (running) timers for a given project.
    Used by the frontend to render a live pulse/indicator on tasks.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LiveActivitySerializer

    def list(self, request, project_id=None):
        if not project_id:
            return Response(
                {"detail": _("Project ID is required.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user

        # Check if user is staff or belongs to the project/organization
        if not user.is_superuser:
            project = get_object_or_404(
                Task.objects.model.project.field.related_model, id=project_id, is_deleted=False
            )
            is_member = project.members.filter(user=user, is_active=True, is_deleted=False).exists()
            if not is_member:
                # Use PermissionService: check project.manage or attendance.view_all
                can_view = PermissionService.has_permission(
                    user=user,
                    permission_code="project.manage",
                    organization_id=str(project.organization_id),
                ) or PermissionService.has_permission(
                    user=user,
                    permission_code="attendance.view_all",
                    organization_id=str(project.organization_id),
                )
                if not can_view:
                    return Response(
                        {
                            "detail": _(
                                "You do not have permission to view this project's activity."
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        # Retrieve all running timers for the project
        active_logs = (
            TimeLog.objects.select_related("user", "task", "project")
            .filter(
                project_id=project_id,
                is_active=True,
                is_deleted=False,
            )
            .order_by("-start_time")
        )

        serializer = self.get_serializer(active_logs, many=True, context={"request": request})
        return Response(serializer.data)
