import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from organizations.models import Organization, OrganizationMembership, Team
from projects.models import Milestone, Project, ProjectActivity, ProjectMember
from projects.services import MilestoneService, ProjectMemberService, ProjectService

User = get_user_model()


class ProjectModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            first_name="Project",
            last_name="Owner",
            password="password123",
        )
        cls.org = Organization.objects.create(name="Test Org", slug="test-org", owner=cls.user)
        cls.team = Team.objects.create(name="Dev Team", organization=cls.org)

    def test_project_str_and_creation(self):
        project = Project.objects.create(
            name="Alpha Project",
            organization=self.org,
            owner=self.user,
        )
        self.assertEqual(str(project), "Alpha Project")
        self.assertEqual(project.status, Project.Status.DRAFT)

    def test_project_member_str_handles_user_and_team_and_none(self):
        project = Project.objects.create(name="Beta Project", organization=self.org)

        # User member
        member1 = ProjectMember.objects.create(
            project=project, user=self.user, allocation_percentage=80
        )
        self.assertIn("Beta Project", str(member1))
        self.assertIn("owner", str(member1))

        # Team member (user is None)
        member2 = ProjectMember.objects.create(
            project=project, team=self.team, allocation_percentage=50
        )
        self.assertIn("Beta Project", str(member2))
        self.assertIn("Dev Team", str(member2))

        # Member without user or team or project (unassigned edge case)
        empty_member = ProjectMember(allocation_percentage=10)
        self.assertIn("No project", str(empty_member))
        self.assertIn("Unassigned", str(empty_member))

    def test_milestone_str(self):
        project = Project.objects.create(name="Gamma Project", organization=self.org)
        milestone = Milestone.objects.create(
            project=project, title="Phase 1", target_date=datetime.date.today()
        )
        self.assertEqual(str(milestone), "Gamma Project – Phase 1")


class ProjectServicesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="admin@example.com",
            username="admin",
            first_name="Admin",
            last_name="User",
            password="password123",
        )
        cls.org = Organization.objects.create(
            name="Service Org", slug="service-org", owner=cls.user
        )

    def test_project_service_lifecycle_and_activities(self):
        # Create
        project = ProjectService.create(
            actor=self.user,
            validated_data={
                "name": "Service Project",
                "organization": self.org,
                "owner": self.user,
            },
        )
        self.assertEqual(project.name, "Service Project")
        self.assertTrue(hasattr(project, "member_count"))
        self.assertTrue(hasattr(project, "task_count"))

        # Check creation activity
        act = ProjectActivity.objects.get(
            project=project, event_type=ProjectActivity.EventType.PROJECT_CREATED
        )
        self.assertEqual(act.actor, self.user)

        # Update to completed
        updated = ProjectService.update(
            project=project,
            actor=self.user,
            validated_data={"status": Project.Status.COMPLETED},
        )
        self.assertEqual(updated.status, Project.Status.COMPLETED)
        self.assertIsNotNone(updated.completed_at)

        # Delete
        ProjectService.delete(project=project, actor=self.user)
        project.refresh_from_db()
        self.assertTrue(project.is_deleted)

        # Check deletion activity was logged (stays visible even after project deletion)
        delete_act = ProjectActivity.objects.get(
            project=project, event_type=ProjectActivity.EventType.PROJECT_DELETED
        )
        self.assertEqual(delete_act.actor, self.user)

    def test_project_creation_includes_organization_owner_and_creator(self):
        creator = User.objects.create_superuser(
            email="project-creator@example.com", username="project-creator", password="password123"
        )
        project = ProjectService.create(
            actor=creator,
            validated_data={"name": "Shared Project", "organization": self.org},
        )
        member_ids = set(ProjectMember.objects.filter(project=project).values_list("user_id", flat=True))
        self.assertEqual(member_ids, {creator.id, self.org.owner_id})

    def test_member_and_milestone_services(self):
        project = ProjectService.create(
            actor=self.user,
            validated_data={"name": "Sub Service Proj", "organization": self.org},
        )

        # Add member
        member = ProjectMemberService.add(
            project=project,
            actor=self.user,
            validated_data={"user": self.user, "allocation_percentage": 100},
        )
        self.assertEqual(member.user, self.user)
        self.assertIsNotNone(member.user.email)

        # Update member
        updated_member = ProjectMemberService.update(
            member=member,
            actor=self.user,
            validated_data={"allocation_percentage": 50},
        )
        self.assertEqual(updated_member.allocation_percentage, 50)

        # Create milestone
        milestone = MilestoneService.create(
            project=project,
            actor=self.user,
            validated_data={
                "title": "M1",
                "target_date": datetime.date.today() + datetime.timedelta(days=10),
            },
        )
        self.assertEqual(milestone.title, "M1")
        self.assertTrue(hasattr(milestone, "task_count"))

        # Delete milestone
        MilestoneService.delete(milestone=milestone, actor=self.user)
        milestone.refresh_from_db()
        self.assertTrue(milestone.is_deleted)
        self.assertTrue(
            ProjectActivity.objects.filter(
                project=project, event_type=ProjectActivity.EventType.MILESTONE_DELETED
            ).exists()
        )


class ProjectAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="admin@madaar.io",
            username="admin_user",
            first_name="Admin",
            last_name="Madaar",
            password="Password123!",
            is_staff=True,
        )
        cls.member_user = User.objects.create_user(
            email="member@madaar.io",
            username="member_user",
            first_name="Member",
            last_name="User",
            password="Password123!",
        )
        cls.outside_user = User.objects.create_user(
            email="outside@madaar.io",
            username="outside_user",
            first_name="Outside",
            last_name="User",
            password="Password123!",
        )

        cls.org = Organization.objects.create(name="Madaar Org", slug="madaar-org", owner=cls.admin)
        OrganizationMembership.objects.create(
            user=cls.member_user,
            organization=cls.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        cls.project = ProjectService.create(
            actor=cls.admin,
            validated_data={
                "name": "Madaar Core",
                "organization": cls.org,
                "owner": cls.admin,
                "status": Project.Status.ACTIVE,
            },
        )

    def test_list_projects(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/projects/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_project_api(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "name": "New Web App",
            "description": "Next.js + Django",
            "organization_id": str(self.org.id),
            "status": "draft",
        }
        response = self.client.post("/api/v1/projects/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "New Web App")
        self.assertEqual(str(response.data["owner"]["id"]), str(self.admin.id))

    def test_project_creator_is_automatically_member(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/projects/",
            {
                "name": "Creator Membership Project",
                "organization_id": str(self.org.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        project_id = response.data["id"]
        self.assertTrue(
            ProjectMember.objects.filter(
                project_id=project_id, user=self.admin, is_deleted=False
            ).exists()
        )

    def test_add_duplicate_member_returns_field_error(self):
        self.client.force_authenticate(user=self.admin)

        # First addition
        url = f"/api/v1/projects/{self.project.id}/members/"
        payload = {"user_id": str(self.member_user.id), "allocation_percentage": 100}
        resp1 = self.client.post(url, payload, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Duplicate addition
        resp2 = self.client.post(url, payload, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_member_without_user_or_team_returns_field_error(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/members/"
        payload = {"allocation_percentage": 100}
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_id", response.data)

    def test_milestone_crud_api(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/milestones/"
        payload = {
            "title": "MVP Launch",
            "target_date": str(datetime.date.today() + datetime.timedelta(days=30)),
        }
        create_resp = self.client.post(url, payload, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        milestone_id = create_resp.data["id"]

        # List
        list_resp = self.client.get(url)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        # Delete
        del_resp = self.client.delete(f"{url}{milestone_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_activity_feed_api(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/activities/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_activity_feed_filter_by_event_type(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/activities/?event_type=project_created"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        ):
            self.assertEqual(item["event_type"], "project_created")

    def test_teams_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        team = Team.objects.create(name="Backend Team", organization=self.org)
        # Assign team as project member
        ProjectMemberService.add(
            project=self.project,
            actor=self.admin,
            validated_data={"team": team, "allocation_percentage": 50},
        )
        url = f"/api/v1/projects/{self.project.id}/teams/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        team_names = [t["name"] for t in response.data]
        self.assertIn("Backend Team", team_names)

    def test_project_list_has_status_display(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/projects/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        if results:
            self.assertIn("status_display", results[0])

    # -- Permission tests --------------------------------------------------

    def test_unauthenticated_user_cannot_list_projects(self):
        response = self.client.get("/api/v1/projects/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_org_admin_cannot_create_project(self):
        self.client.force_authenticate(user=self.outside_user)
        payload = {
            "name": "Blocked Project",
            "organization_id": str(self.org.id),
            "status": "draft",
        }
        response = self.client.post("/api/v1/projects/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_owner_cannot_delete_project(self):
        self.client.force_authenticate(user=self.member_user)
        response = self.client.delete(f"/api/v1/projects/{self.project.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # -- Soft-delete exclusion tests ---------------------------------------

    def test_soft_deleted_project_not_in_list(self):
        self.client.force_authenticate(user=self.admin)
        ProjectService.delete(project=self.project, actor=self.admin)
        response = self.client.get("/api/v1/projects/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        project_ids = [p["id"] for p in results]
        self.assertNotIn(str(self.project.id), project_ids)

    # -- Re-add soft-deleted member test -----------------------------------

    def test_readd_soft_deleted_member_reactivates(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/members/"

        # Add member
        payload = {"user_id": str(self.member_user.id), "allocation_percentage": 100}
        resp1 = self.client.post(url, payload, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        member_id = resp1.data["id"]

        # Remove (soft-delete)
        del_resp = self.client.delete(f"{url}{member_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

        # Re-add same user — should succeed (reactivation)
        payload2 = {"user_id": str(self.member_user.id), "allocation_percentage": 50}
        resp2 = self.client.post(url, payload2, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp2.data["allocation_percentage"], 50)

    # -- Filter tests ------------------------------------------------------

    def test_my_projects_filter(self):
        self.client.force_authenticate(user=self.member_user)
        # member_user is in Madaar Org but has no projects explicitly assigned.
        # Create a project where member_user is the owner
        ProjectService.create(
            actor=self.member_user,
            validated_data={
                "name": "My Proj",
                "organization": self.org,
                "owner": self.member_user,
            },
        )
        # Create another project in org, but member_user is not an owner or direct member
        # (Though they can access it via org membership, it shouldn't show in my_projects)
        ProjectService.create(
            actor=self.admin,
            validated_data={
                "name": "Admin Proj",
                "organization": self.org,
                "owner": self.admin,
            },
        )

        response = self.client.get("/api/v1/projects/?my_projects=true")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "My Proj")

    def test_upcoming_milestones_filter(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/v1/projects/{self.project.id}/milestones/"

        # Upcoming milestone (3 days from now)
        today = datetime.date.today()
        self.client.post(
            url,
            {
                "title": "Upcoming",
                "target_date": str(today + datetime.timedelta(days=3)),
            },
            format="json",
        )

        # Future milestone (15 days from now)
        self.client.post(
            url,
            {
                "title": "Future",
                "target_date": str(today + datetime.timedelta(days=15)),
            },
            format="json",
        )

        response = self.client.get(f"{url}?upcoming=true")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Upcoming")

    def test_org_member_cannot_see_projects_they_are_not_member_of(self):
        """
        Test that organization members can only see projects they are explicitly
        members of, not all projects in the organization.
        """
        self.client.force_authenticate(user=self.member_user)

        # member_user is an org member but NOT a member of self.project
        # They should NOT see self.project in their list
        response = self.client.get("/api/v1/projects/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )

        # member_user should not see "Madaar Core" project since they're not a member
        project_names = [p["name"] for p in results]
        self.assertNotIn("Madaar Core", project_names)

        # Now add member_user as a project member
        ProjectMemberService.add(
            project=self.project,
            actor=self.admin,
            validated_data={"user": self.member_user, "allocation_percentage": 100},
        )

        # Now they should see it
        response2 = self.client.get("/api/v1/projects/")
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        results2 = (
            response2.data.get("results", response2.data)
            if isinstance(response2.data, dict)
            else response2.data
        )
        project_names2 = [p["name"] for p in results2]
        self.assertIn("Madaar Core", project_names2)

    def test_nested_project_reads_require_project_access(self):
        member = ProjectMemberService.add(
            project=self.project,
            actor=self.admin,
            validated_data={"user": self.member_user, "allocation_percentage": 100},
        )
        milestone = Milestone.objects.create(
            project=self.project,
            title="Private milestone",
            target_date=datetime.date.today(),
        )
        members_url = f"/api/v1/projects/{self.project.id}/members/"
        milestones_url = f"/api/v1/projects/{self.project.id}/milestones/"

        self.client.force_authenticate(user=self.outside_user)
        self.assertEqual(self.client.get(members_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(f"{members_url}{member.id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(self.client.get(milestones_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(f"{milestones_url}{milestone.id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(user=self.member_user)
        self.assertEqual(self.client.get(members_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(milestones_url).status_code, status.HTTP_200_OK)
