import re
from decimal import Decimal

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from accounts.models import User

from .models import (
    AsyncStandup,
    Board,
    Task,
    TaskChecklistItem,
    TaskComment,
    TaskStatus,
)


class UserMinimalSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "avatar",
            "avatar_url",
        )

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.avatar.url)
        return obj.avatar.url


class BoardMinimalSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    title = serializers.CharField(read_only=True)


class TaskStatusSerializer(serializers.ModelSerializer):
    board_detail = BoardMinimalSerializer(source="board", read_only=True)

    class Meta:
        model = TaskStatus
        fields = ("id", "board", "board_detail", "code", "name", "category", "order", "created_at")
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "code": {"required": False},
        }
        validators = []

    def validate(self, attrs):
        board = attrs.get("board", getattr(self.instance, "board", None))
        name = attrs.get("name", getattr(self.instance, "name", ""))
        code = attrs.get("code") or name.lower().replace(" ", "-")

        if board and not self.instance:
            base_code = code
            counter = 1
            while TaskStatus.objects.filter(board=board, code=code, is_deleted=False).exists():
                code = f"{base_code}-{counter}"
                counter += 1
            attrs["code"] = code

        return attrs


class ProjectMinimalSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class BoardSerializer(serializers.ModelSerializer):
    statuses = TaskStatusSerializer(many=True, read_only=True)
    created_by_detail = UserMinimalSerializer(source="created_by", read_only=True)
    project_detail = ProjectMinimalSerializer(source="project", read_only=True)

    class Meta:
        model = Board
        fields = (
            "id",
            "title",
            "description",
            "background_color",
            "project",
            "project_detail",
            "created_by",
            "created_by_detail",
            "order",
            "statuses",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "order", "created_at")

    def validate_background_color(self, value):
        """Validate hex color format or linear-gradient string."""
        if value and not re.match(r"^(#(?:[0-9a-fA-F]{3}){1,2}|linear-gradient\(.+\))$", value):
            raise serializers.ValidationError(
                _("Invalid background_color format. Use hex format or linear-gradient.")
            )
        return value


class TaskChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskChecklistItem
        fields = ("id", "task", "description", "is_completed", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_description(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError(_("Checklist item description cannot be empty."))
        return value.strip()


class TaskCommentSerializer(serializers.ModelSerializer):
    author_detail = UserMinimalSerializer(source="author", read_only=True)
    attached_file_url = serializers.SerializerMethodField(read_only=True)
    content = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = TaskComment
        fields = (
            "id",
            "task",
            "author",
            "author_detail",
            "content",
            "attached_file",
            "attached_file_url",
            "created_at",
        )
        read_only_fields = ("id", "author", "created_at")

    def get_attached_file_url(self, obj):
        if not obj.attached_file:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.attached_file.url)
        return obj.attached_file.url

    def validate(self, attrs):
        content = attrs.get("content", "")
        attached_file = attrs.get("attached_file")
        if not content and not attached_file:
            raise serializers.ValidationError(
                _("Comment must contain either text content or an attached file.")
            )
        return attrs


class TaskListSerializer(serializers.ModelSerializer):
    status_detail = TaskStatusSerializer(source="status", read_only=True, allow_null=True)
    assignees_detail = UserMinimalSerializer(source="assignees", many=True, read_only=True)
    assignee = serializers.SerializerMethodField(read_only=True)
    assignee_detail = serializers.SerializerMethodField(read_only=True)
    reporter_detail = UserMinimalSerializer(source="reporter", read_only=True)
    subtasks_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    progress_percent = serializers.FloatField(read_only=True)
    is_finished = serializers.BooleanField(read_only=True)
    number = serializers.IntegerField(read_only=True)
    key = serializers.CharField(read_only=True)
    checklist_stats = serializers.SerializerMethodField()
    is_active_timer_running = serializers.SerializerMethodField()
    spent_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = (
            "id",
            "key",
            "number",
            "project",
            "milestone",
            "title",
            "description",
            "status",
            "status_detail",
            "priority",
            "assignee",
            "assignee_detail",
            "assignees",
            "assignees_detail",
            "reporter",
            "reporter_detail",
            "due_date",
            "estimated_hours",
            "spent_hours",
            "spent_seconds",
            "parent_task",
            "order",
            "is_finished",
            "is_blocked",
            "progress_percent",
            "subtasks_count",
            "comments_count",
            "checklist_stats",
            "is_active_timer_running",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "reporter", "created_at", "updated_at")

    def get_assignee(self, obj):
        first = obj.assignees.first()
        return first.id if first else None

    def get_assignee_detail(self, obj):
        first = obj.assignees.first()
        if not first:
            return None
        return UserMinimalSerializer(first, context=self.context).data

    def get_spent_seconds(self, obj):
        if hasattr(obj, "annotated_spent_seconds"):
            return obj.annotated_spent_seconds
        from django.db.models import Sum

        total = obj.time_logs.filter(is_active=False).aggregate(total=Sum("duration_seconds"))[
            "total"
        ]
        return total or 0

    def get_is_active_timer_running(self, obj):
        return getattr(obj, "is_active_timer_running", False)

    def get_subtasks_count(self, obj):
        if hasattr(obj, "annotated_subtasks_count"):
            return obj.annotated_subtasks_count
        return obj.subtasks.count()

    def get_comments_count(self, obj):
        if hasattr(obj, "annotated_comments_count"):
            return obj.annotated_comments_count
        return obj.comments.count()

    def get_checklist_stats(self, obj):
        if hasattr(obj, "annotated_checklist_total"):
            total = obj.annotated_checklist_total
            done = obj.annotated_checklist_done
        else:
            total = obj.checklist_items.filter(is_deleted=False).count()
            done = obj.checklist_items.filter(is_completed=True, is_deleted=False).count()

        percent = round((done / total * 100), 1) if total > 0 else 0.0
        return {"total": total, "done": done, "percent": percent}


class TaskDetailSerializer(TaskListSerializer):
    checklist_items = TaskChecklistItemSerializer(many=True, read_only=True)
    comments = TaskCommentSerializer(many=True, read_only=True)
    subtasks = serializers.SerializerMethodField()

    class Meta(TaskListSerializer.Meta):
        fields = TaskListSerializer.Meta.fields + (
            "checklist_items",
            "comments",
            "subtasks",
        )

    def get_subtasks(self, obj):
        # Prevent infinite recursion by using a simplified serializer or just TaskListSerializer
        serializer = TaskListSerializer(obj.subtasks.all(), many=True, context=self.context)
        return serializer.data


class TaskCreateUpdateSerializer(serializers.ModelSerializer):
    status = serializers.PrimaryKeyRelatedField(
        queryset=TaskStatus.objects.all(), required=False, allow_null=True
    )
    assignees = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )
    assignees_detail = UserMinimalSerializer(source="assignees", many=True, read_only=True)
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True, write_only=True
    )
    assignee_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Task
        fields = (
            "id",
            "project",
            "milestone",
            "title",
            "description",
            "status",
            "priority",
            "assignee",
            "assignee_detail",
            "assignees",
            "assignees_detail",
            "due_date",
            "estimated_hours",
            "parent_task",
            "order",
            "is_finished",
            "is_blocked",
        )
        read_only_fields = ("id", "assignee_detail", "assignees_detail")

    def get_assignee_detail(self, obj):
        first = obj.assignees.first()
        return UserMinimalSerializer(first, context=self.context).data if first else None

    def validate_estimated_hours(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError(_("Estimated hours cannot be negative."))
        return value

    def validate(self, attrs):
        parent_task = attrs.get("parent_task")
        project = attrs.get("project") or (self.instance.project if self.instance else None)
        task_status = attrs.get("status")

        # Map single 'assignee' to 'assignees' if provided
        if "assignee" in attrs:
            single_assignee = attrs.pop("assignee")
            if "assignees" not in attrs:
                attrs["assignees"] = [single_assignee] if single_assignee else []

        assignees = attrs.get("assignees")
        if assignees is None and self.instance:
            assignees = list(self.instance.assignees.all())

        if project and assignees:
            from projects.models import ProjectMember

            for assignee in assignees:
                is_member = ProjectMember.objects.filter(
                    project=project, user=assignee, is_active=True
                ).exists()
                if not is_member and project.owner != assignee:
                    raise serializers.ValidationError(
                        {
                            "assignees": _(
                                "All assignees must be active members or owner of the project."
                            )
                        }
                    )

        # Prevent circular parent assignment
        if self.instance and parent_task and parent_task.id == self.instance.id:
            raise serializers.ValidationError(
                {"parent_task": _("A task cannot be its own parent.")}
            )

        if parent_task and self.instance:
            ancestor_id = parent_task.id
            seen = {self.instance.id}
            from .models import Task

            depth = 0
            while ancestor_id:
                if depth > 10:
                    raise serializers.ValidationError(
                        {"parent_task": _("Parent task hierarchy is too deep.")}
                    )
                if ancestor_id in seen:
                    raise serializers.ValidationError(
                        {"parent_task": _("Circular parent task detected.")}
                    )
                seen.add(ancestor_id)
                ancestor_id = (
                    Task.all_objects.filter(id=ancestor_id)
                    .values_list("parent_task_id", flat=True)
                    .first()
                )
                depth += 1

        # Ensure status belongs to the same project
        if task_status and project and task_status.board.project_id != project.id:
            raise serializers.ValidationError(
                {"status": _("Status must belong to a board in the same project.")}
            )

        # Ensure parent task belongs to the same project
        if parent_task and project and parent_task.project_id != project.id:
            raise serializers.ValidationError(
                {"parent_task": _("Parent task must belong to the same project.")}
            )

        return attrs


class AsyncStandupSerializer(serializers.ModelSerializer):
    user_detail = UserMinimalSerializer(source="user", read_only=True)
    project_detail = ProjectMinimalSerializer(source="project", read_only=True)

    class Meta:
        model = AsyncStandup
        fields = (
            "id",
            "user",
            "user_detail",
            "project",
            "project_detail",
            "date",
            "hours_worked",
            "today_work",
            "blockers",
            "is_complete",
            "created_at",
        )
        read_only_fields = ("id", "user", "created_at", "is_complete")

    def validate_hours_worked(self, value):
        if value is None:
            return Decimal("0")
        if value < 0:
            raise serializers.ValidationError(_("Hours worked cannot be negative."))
        if value > Decimal("24"):
            raise serializers.ValidationError(_("Hours worked cannot exceed 24 hours per day."))
        return round(value, 2)

    def validate(self, attrs):
        # Partial updates (e.g. changing only hours from the grid) keep the
        # stored descriptions instead of failing the required-texts check.

        # If the user is submitting text, mark it complete and validate.
        if "today_work" in attrs:
            today_work = attrs.get("today_work", "")
            if not (today_work or "").strip():
                raise serializers.ValidationError(
                    _("The 'today/tomorrow' description is required.")
                )

        date = attrs.get("date") or (self.instance.date if self.instance else None)
        if date and date > timezone.localdate():
            raise serializers.ValidationError(_("You cannot log standups for future days."))
        return attrs

    def update(self, instance, validated_data):
        if "today_work" in validated_data and validated_data.get("today_work", "").strip():
            validated_data["is_complete"] = True
        return super().update(instance, validated_data)

    def create(self, validated_data):
        if "today_work" in validated_data and validated_data.get("today_work", "").strip():
            validated_data["is_complete"] = True
        return super().create(validated_data)


class OrderItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(help_text=_("UUID of the object to reorder"))
    order = serializers.IntegerField(min_value=1, help_text=_("New 1-based order position"))


class BoardReorderSerializer(serializers.Serializer):
    project_id = serializers.UUIDField(help_text=_("UUID of the project"))
    orders = OrderItemSerializer(
        many=True, allow_empty=False, help_text=_("List of board ordering objects")
    )


class StatusReorderSerializer(serializers.Serializer):
    board_id = serializers.UUIDField(help_text=_("UUID of the board"))
    orders = OrderItemSerializer(
        many=True, allow_empty=False, help_text=_("List of status ordering objects")
    )
