import uuid
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organizations.models import Organization, OrganizationMembership, Team, TeamMembership
from projects.models import Milestone, Project, ProjectMember
from tasks.models import Board, Task, TaskStatus

User = get_user_model()


class TeamLeadAccessRestrictionTestCase(APITestCase):
    def setUp(self):
        # 1. Organization & Owner
        self.owner = User.objects.create_user(
            username="org_owner",
            email="owner@example.com",
            password="Password123!",
        )
        self.org = Organization.objects.create(name="Acme Corp", slug="acme-corp", owner=self.owner)

        # 2. Team Lead User & Regular Members
        self.lead_user = User.objects.create_user(
            username="team_lead",
            email="lead@example.com",
            password="Password123!",
        )
        self.lead_membership = OrganizationMembership.objects.create(
            user=self.lead_user,
            organization=self.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        self.dev_user = User.objects.create_user(
            username="dev_member",
            email="dev@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=self.dev_user,
            organization=self.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        self.other_lead_user = User.objects.create_user(
            username="other_lead",
            email="otherlead@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=self.other_lead_user,
            organization=self.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        # 3. Teams: Team A (led by self.lead_user) and Team B (led by other_lead_user)
        self.team_a = Team.objects.create(
            name="Alpha Team",
            organization=self.org,
            leader=self.lead_user,
        )
        TeamMembership.objects.create(team=self.team_a, user=self.lead_user)
        TeamMembership.objects.create(team=self.team_a, user=self.dev_user)

        self.team_b = Team.objects.create(
            name="Beta Team",
            organization=self.org,
            leader=self.other_lead_user,
        )
        TeamMembership.objects.create(team=self.team_b, user=self.other_lead_user)

        # 4. Projects: Project Alpha (has Team A) and Project Beta (has Team B)
        self.project_alpha = Project.objects.create(
            name="Alpha Project",
            organization=self.org,
            owner=self.owner,
        )
        ProjectMember.objects.create(
            project=self.project_alpha,
            team=self.team_a,
            allocation_percentage=100,
        )
        ProjectMember.objects.create(
            project=self.project_alpha,
            user=self.dev_user,
            allocation_percentage=100,
        )

        self.project_beta = Project.objects.create(
            name="Beta Project",
            organization=self.org,
            owner=self.owner,
        )
        ProjectMember.objects.create(
            project=self.project_beta,
            team=self.team_b,
            allocation_percentage=100,
        )

        # 5. Boards, Statuses, and Tasks
        self.board_alpha = Board.objects.create(
            title="Alpha Kanban",
            project=self.project_alpha,
            created_by=self.owner,
        )
        self.status_todo = TaskStatus.objects.create(
            board=self.board_alpha,
            name="To Do",
            code="todo",
            order=0,
        )
        self.status_done = TaskStatus.objects.create(
            board=self.board_alpha,
            name="Done",
            code="done",
            order=1,
        )
        self.task_alpha = Task.objects.create(
            project=self.project_alpha,
            title="Alpha Feature",
            status=self.status_todo,
            reporter=self.owner,
        )

        self.board_beta = Board.objects.create(
            title="Beta Kanban",
            project=self.project_beta,
            created_by=self.owner,
        )
        self.status_beta_todo = TaskStatus.objects.create(
            board=self.board_beta,
            name="Beta To Do",
            code="todo",
            order=0,
        )
        self.task_beta = Task.objects.create(
            project=self.project_beta,
            title="Beta Feature",
            status=self.status_beta_todo,
            reporter=self.owner,
        )

    # --- TEAM ACCESS ---

    def test_team_lead_sees_only_own_team(self):
        """Team lead must see only the team they lead, not other teams."""
        self.client.force_authenticate(user=self.lead_user)
        url = reverse("staff-teams-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        team_ids = [str(t["id"]) for t in response.data.get("results", response.data)]
        self.assertIn(str(self.team_a.id), team_ids)
        self.assertNotIn(str(self.team_b.id), team_ids)

    def test_team_lead_can_manage_own_team_details_but_not_create_or_delete(self):
        """Team lead can update their team details, but cannot create or delete teams."""
        self.client.force_authenticate(user=self.lead_user)

        # Update own team
        update_url = reverse("staff-teams-detail", kwargs={"pk": self.team_a.id})
        resp = self.client.patch(update_url, {"description": "Updated by lead"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.team_a.refresh_from_db()
        self.assertEqual(self.team_a.description, "Updated by lead")

        # Attempt to update other team
        other_url = reverse("staff-teams-detail", kwargs={"pk": self.team_b.id})
        resp = self.client.patch(other_url, {"description": "Hacked"})
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # Attempt to create new team
        create_url = reverse("staff-teams-list")
        resp = self.client.post(create_url, {"name": "Unauthorized Team", "organization": str(self.org.id)})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to delete own team
        del_url = reverse("staff-teams-detail", kwargs={"pk": self.team_a.id})
        resp = self.client.delete(del_url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_team_lead_can_add_and_remove_members_in_own_team(self):
        """Team lead can add and remove members from their team, but not from other teams."""
        self.client.force_authenticate(user=self.lead_user)
        new_user = User.objects.create_user(username="newbie", email="newbie@example.com")
        OrganizationMembership.objects.create(
            user=new_user, organization=self.org, role=OrganizationMembership.Role.EMPLOYEE
        )

        # Add to own team
        add_url = reverse("staff-team-memberships-list")
        resp = self.client.post(
            add_url,
            {"team": str(self.team_a.id), "user": str(new_user.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        membership_id = resp.data["id"]

        # Attempt to add to other team
        resp_bad = self.client.post(
            add_url,
            {"team": str(self.team_b.id), "user": str(new_user.id)},
            format="json",
        )
        self.assertEqual(resp_bad.status_code, status.HTTP_403_FORBIDDEN)

        # Remove from own team
        del_url = reverse("staff-team-memberships-detail", kwargs={"pk": membership_id})
        resp_del = self.client.delete(del_url)
        self.assertEqual(resp_del.status_code, status.HTTP_204_NO_CONTENT)

    # --- PROJECT ACCESS ---

    def test_team_lead_sees_only_assigned_project(self):
        """Team lead can view assigned project, but cannot see other projects."""
        self.client.force_authenticate(user=self.lead_user)
        url = reverse("project-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        project_ids = [str(p["id"]) for p in results]
        self.assertIn(str(self.project_alpha.id), project_ids)
        self.assertNotIn(str(self.project_beta.id), project_ids)

    def test_team_lead_cannot_modify_or_delete_assigned_project(self):
        """Team lead has read-only access to the project object itself."""
        self.client.force_authenticate(user=self.lead_user)
        detail_url = reverse("project-detail", kwargs={"pk": self.project_alpha.id})

        # View assigned project succeeds
        get_resp = self.client.get(detail_url)
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)

        # Patch project fails
        patch_resp = self.client.patch(detail_url, {"name": "Renamed Alpha"})
        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Delete project fails
        del_resp = self.client.delete(detail_url)
        self.assertEqual(del_resp.status_code, status.HTTP_403_FORBIDDEN)

    # --- MILESTONE ACCESS ---

    def test_team_lead_can_create_and_edit_milestones_on_assigned_project(self):
        """Team lead can view, create, and edit milestones for assigned project, but cannot delete."""
        self.client.force_authenticate(user=self.lead_user)

        # Create milestone
        create_url = f"/api/v1/projects/{self.project_alpha.id}/milestones/"
        payload = {
            "title": "Phase 1 Launch",
            "target_date": "2026-12-01",
            "status": "pending",
            "weight": 2,
        }
        resp = self.client.post(create_url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        milestone_id = resp.data["id"]

        # Edit milestone
        edit_url = f"/api/v1/projects/{self.project_alpha.id}/milestones/{milestone_id}/"
        resp_edit = self.client.patch(edit_url, {"status": "in_progress"}, format="json")
        self.assertEqual(resp_edit.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_edit.data["status"], "in_progress")

        # Delete milestone fails for team lead
        resp_del = self.client.delete(edit_url)
        self.assertEqual(resp_del.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to create milestone on other project fails
        other_create_url = f"/api/v1/projects/{self.project_beta.id}/milestones/"
        resp_other = self.client.post(other_create_url, payload, format="json")
        self.assertEqual(resp_other.status_code, status.HTTP_403_FORBIDDEN)

    # --- BOARD & KANBAN ACCESS ---

    def test_team_lead_can_create_boards_and_has_full_kanban_access(self):
        """Team lead can create boards on assigned project, move tasks, mark done, and assign users."""
        self.client.force_authenticate(user=self.lead_user)

        # 1. Create board on assigned project
        boards_url = reverse("task-board-list")
        resp_board = self.client.post(
            boards_url,
            {"title": "Sprint 1", "project": str(self.project_alpha.id)},
            format="json",
        )
        self.assertEqual(resp_board.status_code, status.HTTP_201_CREATED)

        # Attempt to create board on other project fails
        resp_other_board = self.client.post(
            boards_url,
            {"title": "Sprint Beta", "project": str(self.project_beta.id)},
            format="json",
        )
        self.assertEqual(resp_other_board.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Mark task as complete on assigned project
        mark_done_url = reverse("task-mark-done", kwargs={"pk": self.task_alpha.id})
        resp_done = self.client.post(mark_done_url)
        self.assertEqual(resp_done.status_code, status.HTTP_200_OK)
        self.task_alpha.refresh_from_db()
        self.assertEqual(self.task_alpha.status.code, "done")

        # 3. Assign task to dev_user on assigned project
        task_edit_url = reverse("task-detail", kwargs={"pk": self.task_alpha.id})
        resp_assign = self.client.patch(
            task_edit_url,
            {"assignees": [str(self.dev_user.id)]},
            format="json",
        )
        self.assertEqual(resp_assign.status_code, status.HTTP_200_OK)
        self.assertIn(self.dev_user, self.task_alpha.assignees.all())

        # 4. Attempt to modify task on other project fails
        other_task_url = reverse("task-detail", kwargs={"pk": self.task_beta.id})
        resp_other_task = self.client.patch(
            other_task_url,
            {"title": "Tampered"},
            format="json",
        )
        self.assertIn(resp_other_task.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
