"""
projects/serializers.py
-----------------------
DRF serializers for the projects application.

Design:
    * **Read serializers** (``…ListSerializer``, ``…DetailSerializer``,
      ``…ReadSerializer``) embed nested objects for rich responses.
    * **Write serializers** (``…WriteSerializer``) accept flat ``_id``
      fields and perform cross-field validation.
    * Annotated fields (``member_count``, ``task_count``, etc.) declare
      ``default=0`` so the serialiser works correctly on freshly-created
      model instances that have not yet been annotated by the queryset.
"""

from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from accounts.models import User
from common.media import file_url
from common.mentions import MentionLimitExceeded, validate_mention_limit
from organizations.models import Organization, OrganizationMembership, Team, TeamMembership

from .models import Milestone, Project, ProjectActivity, ProjectFile, ProjectMember

# ---------------------------------------------------------------------------
# Nested / lightweight read serializers
# ---------------------------------------------------------------------------


class UserMinimalSerializer(serializers.ModelSerializer):
    """Compact user representation for nested embedding."""

    full_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name", "avatar", "avatar_url", "first_name", "last_name", "is_active")
        read_only_fields = fields

    @staticmethod
    def get_full_name(obj) -> str:
        return obj.get_full_name()

    def get_avatar_url(self, obj):
        return file_url(obj.avatar, self.context.get("request"))


class OrganizationMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug")
        read_only_fields = fields


class TeamMinimalSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ("id", "name", "members")
        read_only_fields = fields

    def get_members(self, obj):
        memberships = getattr(obj, "active_memberships", None)
        if memberships is None:
            memberships = TeamMembership.objects.filter(
                team=obj,
                is_deleted=False,
                user__is_deleted=False,
                user__is_active=True,
            ).select_related("user")
        users = [membership.user for membership in memberships]
        return UserMinimalSerializer(users, many=True, context=self.context).data


# ---------------------------------------------------------------------------
# Project serializers
# ---------------------------------------------------------------------------


class ProjectListSerializer(serializers.ModelSerializer):
    """Lightweight serialiser used for list endpoints."""

    owner = UserMinimalSerializer(read_only=True)
    organization = OrganizationMinimalSerializer(read_only=True)

    # Annotated counts — default=0 prevents crashes on non-annotated objects
    member_count = serializers.IntegerField(read_only=True, default=0)
    task_count = serializers.IntegerField(read_only=True, default=0)
    completed_task_count = serializers.IntegerField(read_only=True, default=0)
    progress_percentage = serializers.SerializerMethodField()
    milestone_count = serializers.IntegerField(read_only=True, default=0)
    completed_milestone_count = serializers.IntegerField(read_only=True, default=0)
    unlinked_task_count = serializers.IntegerField(read_only=True, default=0)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    progress_mode_display = serializers.CharField(
        source="get_progress_mode_display", read_only=True
    )

    def get_progress_percentage(self, obj):
        """
        Calculates project progress based on progress_mode:

        - 'task_based'      : completed_task_count / task_count * 100
        - 'milestone_based' : completed_milestone_weight / total_milestone_weight * 100

        Returns 0 if denominator is zero.
        """
        mode = getattr(obj, "progress_mode", "task_based")

        if mode == "milestone_based":
            total_weight = getattr(obj, "total_milestone_weight", None) or 0
            if total_weight > 0:
                completed_weight = getattr(obj, "completed_milestone_weight", None) or 0
                return round((completed_weight / total_weight) * 100)
            return 0

        # Default: task_based
        task_count = getattr(obj, "task_count", None) or 0
        if task_count > 0:
            completed = getattr(obj, "completed_task_count", None) or 0
            return round((completed / task_count) * 100)
        return 0

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "description",
            "color",
            "organization",
            "owner",
            "status",
            "status_display",
            "budget",
            "budget_currency",
            "start_date",
            "deadline",
            "completed_at",
            "archived_at",
            "member_count",
            "task_count",
            "completed_task_count",
            "progress_percentage",
            "progress_mode",
            "progress_mode_display",
            "milestone_count",
            "completed_milestone_count",
            "unlinked_task_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProjectDetailSerializer(ProjectListSerializer):
    """Full-detail serialiser — includes nested members and milestones.

    Nested collections are capped at 50 items to prevent unbounded
    memory usage.  For full paginated access, use the dedicated
    ``/members/`` and ``/milestones/`` endpoints.
    """

    _NESTED_LIMIT = 50

    members = serializers.SerializerMethodField()
    milestones = serializers.SerializerMethodField()

    has_more_members = serializers.SerializerMethodField()
    has_more_milestones = serializers.SerializerMethodField()

    class Meta(ProjectListSerializer.Meta):
        fields = ProjectListSerializer.Meta.fields + (
            "members",
            "milestones",
            "has_more_members",
            "has_more_milestones",
        )

    def get_members(self, obj):
        qs = obj.members.filter(is_deleted=False).select_related("user", "team")[
            : self._NESTED_LIMIT
        ]
        return ProjectMemberReadSerializer(qs, many=True).data

    def get_has_more_members(self, obj) -> bool:
        return obj.members.filter(is_deleted=False).count() > self._NESTED_LIMIT

    def get_milestones(self, obj):
        qs = obj.milestones.filter(is_deleted=False)[: self._NESTED_LIMIT]
        ctx = {**self.context, "project_pk": str(obj.pk)}
        return MilestoneSerializer(qs, many=True, context=ctx).data

    def get_has_more_milestones(self, obj) -> bool:
        return obj.milestones.filter(is_deleted=False).count() > self._NESTED_LIMIT


class ProjectWriteSerializer(serializers.ModelSerializer):
    """Flat write serialiser for create / update operations."""

    owner_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="owner",
        required=False,
        allow_null=True,
    )
    organization_id = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        source="organization",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Project
        fields = (
            "name",
            "description",
            "color",
            "organization_id",
            "owner_id",
            "status",
            "budget",
            "budget_currency",
            "start_date",
            "deadline",
            "progress_mode",
        )

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if start and deadline and deadline < start:
            raise serializers.ValidationError(
                {"deadline": _("Deadline must be on or after the start date.")}
            )

        if self.instance:
            if start:
                if self.instance.milestones.filter(
                    Q(start_date__lt=start) | Q(target_date__lt=start), is_deleted=False
                ).exists():
                    raise serializers.ValidationError(
                        {"start_date": _("Start date cannot be after an existing milestone.")}
                    )
                if self.instance.members.filter(
                    Q(allocation_start_date__lt=start) | Q(allocation_end_date__lt=start),
                    is_deleted=False,
                ).exists():
                    raise serializers.ValidationError(
                        {
                            "start_date": _(
                                "Start date cannot be after an existing member allocation."
                            )
                        }
                    )

            if deadline:
                if self.instance.milestones.filter(
                    Q(start_date__gt=deadline) | Q(target_date__gt=deadline),
                    is_deleted=False,
                ).exists():
                    raise serializers.ValidationError(
                        {"deadline": _("Deadline cannot be before an existing milestone.")}
                    )
                if self.instance.members.filter(
                    Q(allocation_start_date__gt=deadline) | Q(allocation_end_date__gt=deadline),
                    is_deleted=False,
                ).exists():
                    raise serializers.ValidationError(
                        {"deadline": _("Deadline cannot be before an existing member allocation.")}
                    )

        # Resolve org and related objects once
        org = attrs.get("organization", getattr(self.instance, "organization", None))
        owner = attrs.get("owner", getattr(self.instance, "owner", None))

        # Ensure owner belongs to the organization
        if owner and org:
            if not OrganizationMembership.objects.filter(
                user=owner, organization=org, is_deleted=False
            ).exists():
                raise serializers.ValidationError(
                    {"owner_id": _("The selected owner is not a member of this organisation.")}
                )

        # Prevent changing organization of an existing project
        if (
            self.instance
            and "organization" in attrs
            and attrs["organization"] != self.instance.organization
        ):
            raise serializers.ValidationError(
                {"organization_id": _("You cannot change the organisation of an existing project.")}
            )

        return attrs


# ---------------------------------------------------------------------------
# ProjectMember serializers
# ---------------------------------------------------------------------------


class ProjectMemberReadSerializer(serializers.ModelSerializer):
    """Rich read serialiser for project members."""

    user = UserMinimalSerializer(read_only=True)
    team = TeamMinimalSerializer(read_only=True)
    salary_type = serializers.SerializerMethodField()
    salary_amount = serializers.SerializerMethodField()
    salary_override = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMember
        fields = (
            "id",
            "user",
            "team",
            "specialty",
            "allocation_percentage",
            "allocation_start_date",
            "allocation_end_date",
            "is_active",
            "salary_type",
            "salary_amount",
            "salary_override",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def _can_view_salary(self, obj: ProjectMember) -> bool:
        """Only org owners, project owners, and superusers can see salary details."""
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        actor = request.user
        if actor.is_superuser:
            return True

        if getattr(obj.project, "owner_id", None) == actor.id:
            return True

        # Get the org from the project
        try:
            org = obj.project.organization
        except Exception:
            return False
        from organizations.models import OrganizationMembership

        return OrganizationMembership.objects.filter(
            user=actor,
            organization=org,
            role=OrganizationMembership.Role.OWNER,
            is_deleted=False,
        ).exists()

    def _get_salary_config(self, obj: ProjectMember):
        if not hasattr(self, "_salary_configs_cache"):
            self._salary_configs_cache = {}
        cache_key = f"{obj.user_id}_{obj.project_id}"
        if cache_key in self._salary_configs_cache:
            return self._salary_configs_cache[cache_key]

        from finance.services import FinanceService

        result = FinanceService.get_effective_salary(
            obj.user, obj.project.organization, obj.project
        )

        self._salary_configs_cache[cache_key] = result
        return result

    def get_salary_type(self, obj: ProjectMember):
        if self._can_view_salary(obj):
            return self._get_salary_config(obj)["type"]
        return None

    def get_salary_amount(self, obj: ProjectMember):
        if self._can_view_salary(obj):
            amt = self._get_salary_config(obj)["amount"]
            return str(amt) if amt is not None else None
        return None

    def get_salary_override(self, obj: ProjectMember):
        if self._can_view_salary(obj):
            return self._get_salary_config(obj)["override"]
        return None


class ProjectMemberWriteSerializer(serializers.ModelSerializer):
    """Flat write serialiser for adding / updating project members."""

    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="user",
        required=False,
        allow_null=True,
    )
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        source="team",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ProjectMember
        fields = (
            "user_id",
            "team_id",
            "specialty",
            "allocation_percentage",
            "allocation_start_date",
            "allocation_end_date",
            "is_active",
        )

    def validate(self, attrs: dict) -> dict:
        user = attrs.get("user", getattr(self.instance, "user", None))
        team = attrs.get("team", getattr(self.instance, "team", None))

        # At least one of user / team is required
        if not user and not team:
            raise serializers.ValidationError(
                {"user_id": _("A project member must have either a user or a team assigned.")}
            )

        # Duplicate membership check
        project_pk = getattr(self.instance, "project_id", self.context.get("project_pk"))
        if project_pk:
            user_exists = ProjectMember.objects.filter(
                project_id=project_pk, user=user, is_deleted=False
            )
            team_exists = ProjectMember.objects.filter(
                project_id=project_pk, team=team, user__isnull=True, is_deleted=False
            )

            if self.instance:
                user_exists = user_exists.exclude(pk=self.instance.pk)
                team_exists = team_exists.exclude(pk=self.instance.pk)

            if user and user_exists.exists():
                raise serializers.ValidationError(
                    {"user_id": _("This user is already a member of this project.")}
                )
            if team and not user and team_exists.exists():
                raise serializers.ValidationError(
                    {"team_id": _("This team is already a member of this project.")}
                )

        # Date range validation
        start = attrs.get(
            "allocation_start_date",
            getattr(self.instance, "allocation_start_date", None),
        )
        end = attrs.get(
            "allocation_end_date",
            getattr(self.instance, "allocation_end_date", None),
        )
        if start and end and end < start:
            raise serializers.ValidationError(
                {
                    "allocation_end_date": _(
                        "Allocation end date must be on or after the allocation start date."
                    )
                }
            )

        # Validate allocation dates fall within project bounds
        project = getattr(self.instance, "project", None)
        if not project and project_pk:
            project = Project.objects.filter(pk=project_pk).first()

        if project:
            if start and project.start_date and start < project.start_date:
                raise serializers.ValidationError(
                    {
                        "allocation_start_date": _(
                            "Allocation start date cannot be before the project's start date."
                        )
                    }
                )
            if end and project.deadline and end > project.deadline:
                raise serializers.ValidationError(
                    {
                        "allocation_end_date": _(
                            "Allocation end date cannot be after the project's deadline."
                        )
                    }
                )

        # Org membership validation
        org_id = project.organization_id if project else None

        if org_id:
            if (
                user
                and not OrganizationMembership.objects.filter(
                    user=user, organization_id=org_id, is_deleted=False
                ).exists()
            ):
                raise serializers.ValidationError(
                    {
                        "user_id": _(
                            "The selected user is not a member of the project's organisation."
                        )
                    }
                )
            if team and team.organization_id != org_id:
                raise serializers.ValidationError(
                    {
                        "team_id": _(
                            "The selected team does not belong to the project's organisation."
                        )
                    }
                )

        return attrs


# ---------------------------------------------------------------------------
# Milestone serializers
# ---------------------------------------------------------------------------


class MilestoneSerializer(serializers.ModelSerializer):
    """Read/write serialiser for milestones.

    ``completed_at`` is managed by the service layer and is therefore
    read-only via the API.
    """

    # default=0 prevents errors when object is not annotated
    task_count = serializers.IntegerField(read_only=True, default=0)
    completed_task_count = serializers.IntegerField(read_only=True, default=0)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Milestone
        fields = (
            "id",
            "project",
            "title",
            "description",
            "status",
            "status_display",
            "start_date",
            "target_date",
            "completed_at",
            "sequence",
            "weight",
            "task_count",
            "completed_task_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "project", "completed_at", "created_at", "updated_at")

    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        target = attrs.get("target_date", getattr(self.instance, "target_date", None))
        if start and target and target < start:
            raise serializers.ValidationError(
                {"target_date": _("Target date must be on or after the start date.")}
            )

        # Ensure milestone dates fall within project bounds if the project has them defined
        project_pk = self.context.get("project_pk")
        project = getattr(self.instance, "project", None)

        if not project and project_pk:
            project = Project.objects.filter(pk=project_pk).first()

        if project:
            if target and project.deadline and target > project.deadline:
                raise serializers.ValidationError(
                    {"target_date": _("Target date cannot be after the project's deadline.")}
                )
            if start and project.start_date and start < project.start_date:
                raise serializers.ValidationError(
                    {"start_date": _("Start date cannot be before the project's start date.")}
                )

        return attrs


# ---------------------------------------------------------------------------
# ProjectActivity serializer
# ---------------------------------------------------------------------------


class ProjectActivitySerializer(serializers.ModelSerializer):
    """Read-only serialiser for the project activity feed."""

    actor = UserMinimalSerializer(read_only=True)
    event_type_display = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = ProjectActivity
        fields = (
            "id",
            "project",
            "actor",
            "event_type",
            "event_type_display",
            "entity_type",
            "entity_id",
            "metadata",
            "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# ProjectFile serializers
# ---------------------------------------------------------------------------


class ProjectFileSerializer(serializers.ModelSerializer):
    """Read and update serializer for project files."""

    uploaded_by = UserMinimalSerializer(read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectFile
        fields = (
            "id",
            "project",
            "uploaded_by",
            "file",
            "file_url",
            "name",
            "description",
            "file_size",
            "file_type",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "project",
            "uploaded_by",
            "file",
            "file_url",
            "file_size",
            "file_type",
            "created_at",
            "updated_at",
        )

    def get_file_url(self, obj) -> str | None:
        return file_url(obj.file, self.context.get("request"))

    def validate_description(self, value):
        try:
            validate_mention_limit(value)
        except MentionLimitExceeded as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value


class ProjectFileUploadSerializer(serializers.ModelSerializer):
    """Upload serializer for creating project files with metadata & description."""

    file = serializers.FileField(required=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    name = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = ProjectFile
        fields = (
            "id",
            "file",
            "name",
            "description",
        )

    def validate_description(self, value):
        try:
            validate_mention_limit(value)
        except MentionLimitExceeded as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value
