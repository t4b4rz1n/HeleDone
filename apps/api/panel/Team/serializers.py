from rest_framework import serializers

from accounts.models import User
from common.media import file_url
from organizations.models import Organization, Team, TeamMembership


class LeaderDetailsSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "avatar", "avatar_url")

    def get_avatar_url(self, obj):
        return file_url(obj.avatar, self.context.get("request"))


class TeamSerializer(serializers.ModelSerializer):
    is_active = serializers.SerializerMethodField()
    lead_id = serializers.SerializerMethodField()
    leader_details = serializers.SerializerMethodField()
    organization_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Team
        fields = (
            "id",
            "name",
            "description",
            "organization",
            "parent_team",
            "is_active",
            "organization_id",
            "lead_id",
            "leader_details",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "lead_id",
            "leader_details",
        )

    def get_is_active(self, obj):
        return not obj.is_deleted

    def get_lead_id(self, obj):
        return str(obj.leader_id) if obj.leader_id else None

    def get_leader_details(self, obj):
        if obj.leader:
            return LeaderDetailsSerializer(obj.leader, context=self.context).data
        return None

    def create(self, validated_data):
        request = self.context.get("request")
        lead_id = request.data.get("lead_id") if request else None
        validated_data.pop("is_active", None)

        if "organization" not in validated_data:
            if request and request.user.is_authenticated:
                user_org = request.user.org_memberships.filter(is_deleted=False).first()
                if user_org:
                    validated_data["organization"] = user_org.organization
                else:
                    first_org = Organization.objects.filter(is_deleted=False).first()
                    if first_org:
                        validated_data["organization"] = first_org
                    else:
                        raise serializers.ValidationError(
                            {"organization": "No organization found."}
                        )

        if lead_id:
            validated_data["leader_id"] = lead_id

        team = super().create(validated_data)

        if lead_id:
            user = User.objects.filter(id=lead_id).first()
            if user:
                TeamMembership.objects.update_or_create(
                    team=team,
                    user=user,
                    defaults={"is_deleted": False},
                )

        return team

    def update(self, instance, validated_data):
        request = self.context.get("request")
        lead_id = request.data.get("lead_id") if request else None
        validated_data.pop("is_active", None)

        if lead_id is not None:
            validated_data["leader_id"] = lead_id if lead_id else None

        team = super().update(instance, validated_data)

        if lead_id:
            user = User.objects.filter(id=lead_id).first()
            if user:
                TeamMembership.objects.update_or_create(
                    team=team,
                    user=user,
                    defaults={"is_deleted": False},
                )

        return team


class TeamMembershipSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = TeamMembership
        fields = (
            "id",
            "team",
            "user",
            "user_details",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_user_details(self, obj):
        user = obj.get("user") if isinstance(obj, dict) else getattr(obj, "user", None)
        if user is None:
            return None
        return {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }
