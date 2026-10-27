from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from accounts.models import User
from common.media import file_url

from .models import Attendance, Holiday, TimeLog, TimeOffRequest

# (Assuming we have basic serializers for User and Org, we use PrimaryKeyRelatedField for writes,
# and a simple representation for reads)


class UserMinimalSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "avatar",
            "avatar_url",
        )

    def get_avatar_url(self, obj):
        return file_url(obj.avatar, self.context.get("request"))

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Remove raw avatar field, keep only avatar_url
        ret.pop("avatar", None)
        return ret


class AttendanceSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    is_active = serializers.SerializerMethodField()
    total_seconds = serializers.SerializerMethodField()
    base_total_seconds = serializers.SerializerMethodField()
    active_session_start = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = (
            "id",
            "user",
            "organization",
            "date",
            "check_in",
            "check_out",
            "is_remote",
            "overtime_minutes",
            "is_active",
            "total_seconds",
            "base_total_seconds",
            "active_session_start",
            "created_at",
        )
        read_only_fields = (
            "id",
            "overtime_minutes",
            "created_at",
            "is_active",
            "total_seconds",
            "base_total_seconds",
            "active_session_start",
        )

    def get_is_active(self, obj):
        if hasattr(obj, "annotated_is_active"):
            return obj.annotated_is_active
        return any(s.end_time is None for s in obj.sessions.all() if not s.is_deleted)

    def get_total_seconds(self, obj):
        if hasattr(obj, "annotated_total_seconds"):
            total = obj.annotated_total_seconds or 0
        else:
            total = sum(
                s.duration_seconds
                for s in obj.sessions.all()
                if s.duration_seconds and not s.is_deleted
            )

        if hasattr(obj, "annotated_active_start") and obj.annotated_active_start:
            total += int((timezone.now() - obj.annotated_active_start).total_seconds())
        else:
            active_session = next(
                (s for s in obj.sessions.all() if s.end_time is None and not s.is_deleted), None
            )
            if active_session:
                total += int((timezone.now() - active_session.start_time).total_seconds())
        return total

    def get_active_session_start(self, obj):
        if hasattr(obj, "annotated_active_start") and obj.annotated_active_start:
            return obj.annotated_active_start
        active_session = next(
            (s for s in obj.sessions.all() if s.end_time is None and not s.is_deleted), None
        )
        return active_session.start_time if active_session else None

    def get_base_total_seconds(self, obj):
        if hasattr(obj, "annotated_total_seconds"):
            return obj.annotated_total_seconds or 0
        return sum(
            s.duration_seconds
            for s in obj.sessions.all()
            if s.duration_seconds and not s.is_deleted
        )


class AttendanceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = (
            "id",
            "user",
            "organization",
            "date",
            "check_in",
            "check_out",
            "is_remote",
        )
        read_only_fields = ("user",)

    def validate(self, attrs):
        check_in = attrs.get("check_in", getattr(self.instance, "check_in", None))
        check_out = attrs.get("check_out", getattr(self.instance, "check_out", None))
        date = attrs.get("date", getattr(self.instance, "date", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))

        if date and date > timezone.localdate():
            raise serializers.ValidationError({"date": _("Date cannot be in the future.")})

        # Past date modification restriction: only users with attendance.view_all can create/edit past records
        request = self.context.get("request")
        if date and date < timezone.localdate():
            if request and request.user and request.user.is_authenticated:
                is_admin = request.user.is_superuser
                if not is_admin and organization:
                    from organizations.services import PermissionService

                    is_admin = PermissionService.has_permission(
                        user=request.user,
                        permission_code="attendance.view_all",
                        organization_id=str(organization.id)
                        if hasattr(organization, "id")
                        else str(organization),
                    )
                if not is_admin:
                    raise serializers.ValidationError(
                        {
                            "date": _(
                                "Only managers and admins can modify attendance records for past dates."
                            )
                        }
                    )

        if check_in and check_out:
            if check_out <= check_in:
                raise serializers.ValidationError(
                    {"check_out": _("Check-out time must be after check-in time.")}
                )

            # Check-in/out must be on the same date as the attendance date
            if date:
                if check_in.date() != date:
                    raise serializers.ValidationError(
                        {
                            "check_in": _(
                                "Check-in time must be on the same date as attendance date."
                            )
                        }
                    )
                if check_out.date() != date:
                    raise serializers.ValidationError(
                        {
                            "check_out": _(
                                "Check-out time must be on the same date as attendance date."
                            )
                        }
                    )

        # Organization validation - user must be member
        if organization:
            request = self.context.get("request")
            if request and request.user and request.user.is_authenticated:
                is_member = request.user.org_memberships.filter(
                    organization=organization,
                ).exists()
                if not is_member and not request.user.is_superuser:
                    raise serializers.ValidationError(
                        {"organization": _("You are not a member of this organization.")}
                    )

        return attrs


class TimeLogSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)

    class Meta:
        model = TimeLog
        fields = (
            "id",
            "user",
            "task",
            "project",
            "date",
            "start_time",
            "end_time",
            "duration_seconds",
            "is_active",
            "description",
            "created_at",
        )


class TimeLogWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeLog
        fields = ("id", "task", "project", "start_time", "end_time", "description")

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        task = attrs.get("task", getattr(self.instance, "task", None))
        project = attrs.get("project", getattr(self.instance, "project", None))

        if start_time and end_time:
            if end_time <= start_time:
                raise serializers.ValidationError(
                    {"end_time": _("End time must be after start time.")}
                )

        if task and project and task.project_id != project.pk:
            raise serializers.ValidationError(
                {"project": _("Project must match the task's project.")}
            )

        if task and not project:
            project = task.project
            attrs["project"] = project

        if not self.instance and not task and not project:
            raise serializers.ValidationError(
                {"task": _("A task or project is required for a time log.")}
            )

        if self.instance:
            existing_task = self.instance.task_id
            existing_project = self.instance.project_id or (
                self.instance.task.project_id if self.instance.task_id else None
            )
            if task and task.pk != existing_task:
                raise serializers.ValidationError({"task": _("Time log task cannot be reassigned.")})
            if project and project.pk != existing_project:
                raise serializers.ValidationError({"project": _("Time log project cannot be reassigned.")})

        org_id = project.organization_id if project else None
        request = self.context.get("request")
        if org_id and request and request.user and request.user.is_authenticated:
            if not request.user.is_superuser and not request.user.org_memberships.filter(
                organization_id=org_id, is_deleted=False
            ).exists():
                raise serializers.ValidationError(
                    {"project": _("You are not a member of this organization.")}
                )

        return attrs


class TimeOffRequestSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    approved_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = TimeOffRequest
        fields = (
            "id",
            "user",
            "organization",
            "request_type",
            "start_datetime",
            "end_datetime",
            "reason",
            "status",
            "approved_by",
            "created_at",
        )


class TimeOffRequestWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOffRequest
        fields = (
            "id",
            "organization",
            "request_type",
            "start_datetime",
            "end_datetime",
            "reason",
            "manager_note",
        )
        read_only_fields = ("manager_note",)

    def validate(self, attrs):
        start = attrs.get("start_datetime", getattr(self.instance, "start_datetime", None))
        end = attrs.get("end_datetime", getattr(self.instance, "end_datetime", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        request_type = attrs.get("request_type", getattr(self.instance, "request_type", None))

        if start and end and start >= end:
            raise serializers.ValidationError(
                {"end_datetime": _("End time must be after start time.")}
            )

        # Start time should not be in the past (with small buffer)
        if start and start < timezone.now() - timezone.timedelta(minutes=5):
            raise serializers.ValidationError(
                {"start_datetime": _("Start time cannot be in the past.")}
            )

        # Organization validation
        if organization:
            request = self.context.get("request")
            if request and request.user and request.user.is_authenticated:
                is_member = request.user.org_memberships.filter(
                    organization=organization,
                ).exists()
                if not is_member and not request.user.is_superuser:
                    raise serializers.ValidationError(
                        {"organization": _("You are not a member of this organization.")}
                    )

        # Type-specific validations
        if request_type == TimeOffRequest.Type.HOURLY and start and end:
            duration = end - start
            if duration > timezone.timedelta(hours=8):
                raise serializers.ValidationError(
                    {"end_datetime": _("Hourly leave cannot exceed 8 hours.")}
                )

        return attrs


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = (
            "id",
            "name",
            "organization",
            "description",
            "date",
            "is_official",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate(self, attrs):
        organization = attrs.get("organization")

        # Organization permission check for write operations
        request = self.context.get("request")
        if request and request.method in ["POST", "PUT", "PATCH"]:
            if organization:
                if request.user and request.user.is_authenticated:
                    from organizations.services import PermissionService

                    is_admin = PermissionService.has_permission(
                        user=request.user,
                        permission_code="org.manage_settings",
                        organization_id=str(organization.id)
                        if hasattr(organization, "id")
                        else str(organization),
                    )
                    if not is_admin and not request.user.is_superuser:
                        raise serializers.ValidationError(
                            {
                                "organization": _(
                                    "You do not have permission to manage holidays for this organization."
                                )
                            }
                        )
            else:
                # Global holiday - only superuser
                if not (request.user and request.user.is_superuser):
                    raise serializers.ValidationError(
                        {"organization": _("Only superusers can create global holidays.")}
                    )

        return attrs


class TimesheetDailySerializer(serializers.Serializer):
    date = serializers.DateField()
    total_seconds = serializers.IntegerField()


class TimesheetTeamSerializer(serializers.Serializer):
    """
    Serializer for team/project timesheet querysets returned as dicts.
    Values are annotated dicts like {'user__username': ..., 'date': ..., 'total_seconds': ...}.
    """

    username = serializers.CharField(source="user__username")
    date = serializers.DateField()
    total_seconds = serializers.IntegerField()


class LiveActivitySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    task_id = serializers.ReadOnlyField(source="task.id")
    task_title = serializers.ReadOnlyField(source="task.title")
    project_id = serializers.ReadOnlyField(source="project.id")
    project_name = serializers.ReadOnlyField(source="project.name")

    class Meta:
        model = TimeLog
        fields = [
            "id",
            "user",
            "task_id",
            "task_title",
            "project_id",
            "project_name",
            "start_time",
        ]

    def get_user(self, obj):
        return UserMinimalSerializer(obj.user).data
