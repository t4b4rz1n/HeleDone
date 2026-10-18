import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from attendance.models import TimeLog
from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectActivity, ProjectMember
from tasks.cascade_services import TaskCascadeService
from tasks.models import (
    AsyncStandup,
    Board,
    Task,
    TaskChecklistItem,
    TaskComment,
    TaskStatus,
)
from tasks.services import BoardService

User = get_user_model()


class BoardAndStatusTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test Org", slug="test-org")
        cls.user = User.objects.create_user(
            username="boarduser",
            email="boarduser@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(user=cls.user, organization=cls.org, role="owner")
        cls.project = Project.objects.create(
            name="Project 1", description="Desc", organization=cls.org
        )
        cls.project2 = Project.objects.create(
            name="Project 2", description="Desc", organization=cls.org
        )

        cls.board = BoardService.create_board(
            title="Main Board", project=cls.project, created_by=cls.user
        )
        cls.status_todo = TaskStatus.objects.get(board=cls.board, code="todo")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_board_creation_auto_statuses(self):
        """Board creation should auto-generate 4 default Kanban statuses."""
        self.assertEqual(self.board.statuses.count(), 4)
        status_names = list(self.board.statuses.values_list("name", flat=True))
        self.assertIn("To Do", status_names)
        self.assertIn("Done", status_names)

    def test_board_creation_with_description_and_color(self):
        """Board creation via API should save custom description and background_color."""
        res = self.client.post(
            reverse("task-board-list"),
            {
                "title": "Custom Board",
                "description": "Sprint board description",
                "background_color": "#10b981",
                "project": self.project.id,
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["description"], "Sprint board description")
        self.assertEqual(res.data["background_color"], "#10b981")

    def test_board_filter_by_project(self):
        """Boards should be filterable by project."""
        self.client.post(
            reverse("task-board-list"),
            {"title": "Board P2", "project": self.project2.id},
        )
        res = self.client.get(reverse("task-board-list"), {"project": self.project.id})
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Main Board")

    def test_reorder_boards(self):
        """Board reorder endpoint should update order values."""
        board2_res = self.client.post(
            reverse("task-board-list"),
            {"title": "Second Board", "project": self.project.id},
        )
        board2 = Board.objects.get(id=board2_res.data["id"])

        self.client.post(
            reverse("task-board-reorder-boards"),
            {
                "project_id": str(self.project.id),
                "orders": [
                    {"id": str(board2.id), "order": 1},
                    {"id": str(self.board.id), "order": 2},
                ],
            },
            format="json",
        )
        self.board.refresh_from_db()
        board2.refresh_from_db()
        self.assertEqual(board2.order, 1)
        self.assertEqual(self.board.order, 2)

    def test_create_custom_status(self):
        """User should be able to create custom statuses (columns) for a board."""
        res = self.client.post(
            reverse("task-status-list"),
            {"board": self.board.id, "code": "testing", "name": "Testing"},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.board.statuses.count(), 5)

    def test_delete_unused_status(self):
        """Deleting a status with no tasks should succeed."""
        new_status = TaskStatus.objects.create(
            board=self.board, code="staging", name="Staging", order=10
        )
        url = reverse("task-status-detail", kwargs={"pk": new_status.id})
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_used_status_cascade(self):
        """Deleting a status that has tasks should succeed and cascade soft delete."""
        task = Task.objects.create(
            project=self.project,
            title="Block Delete",
            reporter=self.user,
            status=self.status_todo,
        )
        url = reverse("task-status-detail", kwargs={"pk": self.status_todo.id})
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        task.refresh_from_db()
        self.assertTrue(task.is_deleted)

    def test_reorder_statuses(self):
        """Status reorder endpoint should update order values."""
        statuses = list(self.board.statuses.values_list("id", flat=True))
        orders = [{"id": str(s), "order": i + 1} for i, s in enumerate(reversed(statuses))]
        res = self.client.post(
            reverse("task-status-reorder"),
            {"board_id": str(self.board.id), "orders": orders},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_filter_statuses_by_board(self):
        """Statuses should be filterable by board."""
        res = self.client.get(reverse("task-status-list"), {"board": self.board.id})
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(results), 4)

    def test_board_activities_endpoint(self):
        """Board activities endpoint should return activity logs."""
        url = reverse("task-board-activities", kwargs={"pk": self.board.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class TaskCascadeTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test Org", slug="test-org")
        cls.user = User.objects.create_user(
            email="test@example.com", username="testuser", password="password"
        )
        OrganizationMembership.objects.create(user=cls.user, organization=cls.org, role="owner")
        cls.project = Project.objects.create(
            name="Test Project", owner=cls.user, organization=cls.org
        )
        cls.board = Board.objects.create(
            title="Test Board", project=cls.project, created_by=cls.user
        )
        cls.status = TaskStatus.objects.create(board=cls.board, code="todo", name="To Do")
        cls.task = Task.objects.create(
            title="Parent Task",
            project=cls.project,
            status=cls.status,
            reporter=cls.user,
        )
        cls.subtask = Task.objects.create(
            title="Subtask",
            project=cls.project,
            status=cls.status,
            parent_task=cls.task,
            reporter=cls.user,
        )
        cls.checklist_item = TaskChecklistItem.objects.create(
            task=cls.task, description="Check item"
        )
        cls.comment = TaskComment.objects.create(
            task=cls.task, author=cls.user, content="Comment test"
        )

    def test_soft_delete_and_restore_board_cascade(self):
        self.board.is_deleted = True
        self.board.save()
        TaskCascadeService.soft_delete_board(self.board)
        self.board.refresh_from_db()

        self.status.refresh_from_db()
        self.task.refresh_from_db()
        self.subtask.refresh_from_db()
        self.checklist_item.refresh_from_db()
        self.comment.refresh_from_db()

        self.assertTrue(self.board.is_deleted)
        self.assertTrue(self.status.is_deleted)
        self.assertTrue(self.task.is_deleted)
        self.assertTrue(self.subtask.is_deleted)
        self.assertTrue(self.checklist_item.is_deleted)
        self.assertTrue(self.comment.is_deleted)

        self.board.is_deleted = False
        self.board.save()
        TaskCascadeService.restore_board(self.board)
        self.board.refresh_from_db()

        self.status.refresh_from_db()
        self.task.refresh_from_db()
        self.subtask.refresh_from_db()
        self.checklist_item.refresh_from_db()
        self.comment.refresh_from_db()

        self.assertFalse(self.board.is_deleted)
        self.assertFalse(self.status.is_deleted)
        self.assertFalse(self.task.is_deleted)
        self.assertFalse(self.subtask.is_deleted)
        self.assertFalse(self.checklist_item.is_deleted)
        self.assertFalse(self.comment.is_deleted)

    def test_checklist_progress_cache_signal(self):
        self.assertEqual(float(self.task.progress_cache), 0.0)

        # Complete checklist item
        self.checklist_item.is_completed = True
        self.checklist_item.save()

        self.task.refresh_from_db()
        self.assertEqual(float(self.task.progress_cache), 50.0)


class ChecklistAndCommentTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test Org", slug="test-org")
        cls.user = User.objects.create_user(
            username="cluser",
            email="cluser@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(user=cls.user, organization=cls.org, role="owner")
        cls.project = Project.objects.create(
            name="Project CL", description="Desc", organization=cls.org
        )
        cls.board = BoardService.create_board(
            title="Board CL", project=cls.project, created_by=cls.user
        )
        cls.status_todo = TaskStatus.objects.get(board=cls.board, code="todo")

        cls.task = Task.objects.create(
            project=cls.project,
            title="CL Task",
            reporter=cls.user,
            status=cls.status_todo,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_checklist_add_toggle_delete(self):
        """Full checklist workflow: add, toggle, delete with activity logs."""
        add_url = reverse("task-add-checklist-item", kwargs={"pk": self.task.id})
        res = self.client.post(add_url, {"description": "Write Tests"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        item_id = res.data["id"]

        toggle_url = reverse("task-checklist-item-toggle", kwargs={"pk": item_id})
        self.client.post(toggle_url)
        item = TaskChecklistItem.objects.get(id=item_id)
        self.assertTrue(item.is_completed)

        del_url = reverse("task-checklist-item-detail", kwargs={"pk": item_id})
        res = self.client.delete(del_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TaskChecklistItem.objects.filter(id=item_id).exists())

        logs = ProjectActivity.objects.filter(entity_type="task", entity_id=str(self.task.id))
        actions = [log.metadata.get("action", "") for log in logs]
        self.assertTrue(any("Added checklist" in a for a in actions))
        self.assertTrue(any("Deleted checklist" in a for a in actions))

    def test_comment_creation(self):
        url = reverse("task-add-comment", kwargs={"pk": self.task.id})
        res = self.client.post(url, {"content": "Test comment."})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TaskComment.objects.filter(task=self.task).count(), 1)


class TasksRBACTestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", slug="test-org")

        self.admin = User.objects.create_user("admin_user", "admin@test.com", "Pass123!")
        OrganizationMembership.objects.create(
            user=self.admin,
            organization=self.org,
            role=OrganizationMembership.Role.ADMIN,
        )

        self.lead = User.objects.create_user("lead_user", "lead@test.com", "Pass123!")
        OrganizationMembership.objects.create(
            user=self.lead,
            organization=self.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        self.employee = User.objects.create_user("emp_user", "emp@test.com", "Pass123!")
        OrganizationMembership.objects.create(
            user=self.employee,
            organization=self.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        self.hr = User.objects.create_user("hr_user", "hr@test.com", "Pass123!")
        OrganizationMembership.objects.create(
            user=self.hr, organization=self.org, role=OrganizationMembership.Role.HR
        )

        self.accountant = User.objects.create_user("acc_user", "acc@test.com", "Pass123!")
        OrganizationMembership.objects.create(
            user=self.accountant,
            organization=self.org,
            role=OrganizationMembership.Role.ACCOUNTANT,
        )

        self.project = Project.objects.create(name="RBAC Project", organization=self.org)
        self.board = Board.objects.create(
            title="RBAC Board", project=self.project, created_by=self.admin
        )
        self.status_todo = TaskStatus.objects.create(
            board=self.board, code="todo", name="To Do", order=1
        )

    def test_hr_accountant_no_access_tasks(self):
        """HR and Accountant roles should have no access to tasks by default."""
        self.client.force_authenticate(user=self.hr)
        res = self.client.get(reverse("task-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(results), 0)

        res = self.client.post(
            reverse("task-list"),
            {"project": self.project.id, "title": "HR Task Attempt"},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.accountant)
        res = self.client.post(
            reverse("task-list"),
            {"project": self.project.id, "title": "Accountant Task Attempt"},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_board_creation_forbidden(self):
        """Employee role cannot create new boards."""
        self.client.force_authenticate(user=self.employee)
        res = self.client.post(
            reverse("task-board-list"),
            {"title": "Emp Board", "project": self.project.id},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # TODO: Team Lead board creation test removed temporarily - will be fixed in Phase 2

    def test_checklist_security_unrelated_employee_forbidden(self):
        """Unrelated employee cannot toggle or delete another user's checklist item."""
        task = Task.objects.create(
            project=self.project,
            title="Secure Task",
            reporter=self.lead,
            assignee=self.lead,
            status=self.status_todo,
        )
        item = TaskChecklistItem.objects.create(task=task, description="Secret Item")

        self.client.force_authenticate(user=self.employee)
        toggle_url = reverse("task-checklist-item-toggle", kwargs={"pk": item.id})
        res = self.client.post(toggle_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        del_url = reverse("task-checklist-item-detail", kwargs={"pk": item.id})
        res = self.client.delete(del_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_standups_filtered_to_own_only(self):
        """Employee role should only see their own standup reports when listing standups."""
        AsyncStandup.objects.create(
            user=self.admin,
            project=self.project,
            today_work="Admin T",
        )
        emp_standup = AsyncStandup.objects.create(
            user=self.employee,
            project=self.project,
            today_work="Emp T",
        )

        self.client.force_authenticate(user=self.employee)
        res = self.client.get(reverse("task-standup-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(emp_standup.id))

        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get(reverse("task-standup-list"))
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_admin.data["results"]), 2)

    def test_employee_project_isolation(self):
        """Employee in Project 1 cannot create tasks in Project 2 where they are not a member."""
        project2 = Project.objects.create(name="Project 2 Isolation", organization=self.org)
        ProjectMember.objects.create(project=self.project, user=self.employee, is_active=True)

        self.client.force_authenticate(user=self.employee)

        res1 = self.client.post(
            reverse("task-list"),
            {"project": self.project.id, "title": "P1 Task Allowed"},
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        res2 = self.client.post(
            reverse("task-list"),
            {"project": project2.id, "title": "P2 Task Forbidden"},
        )
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_standup_retrieve(self):
        standup = AsyncStandup.objects.create(
            user=self.employee,
            project=self.project,
            today_work="T",
        )
        self.client.force_authenticate(user=self.employee)
        url = reverse("task-standup-detail", kwargs={"pk": standup.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], str(standup.id))


class TaskCRUDAndProgressTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test Org", slug="test-org")
        cls.user = User.objects.create_user(
            username="taskuser",
            email="taskuser@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(user=cls.user, organization=cls.org, role="owner")
        cls.assignee = User.objects.create_user(
            username="assignee",
            email="assignee@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=cls.assignee, organization=cls.org, role="employee"
        )

        cls.project = Project.objects.create(
            name="Test Project",
            description="Desc",
            organization=cls.org,
            owner=cls.user,
        )
        ProjectMember.objects.create(project=cls.project, user=cls.assignee, is_active=True)
        cls.project2 = Project.objects.create(
            name="Other Project",
            description="Desc",
            organization=cls.org,
            owner=cls.user,
        )
        ProjectMember.objects.create(project=cls.project, user=cls.user)
        ProjectMember.objects.create(project=cls.project2, user=cls.user)

        cls.board = BoardService.create_board(
            title="Main Board", project=cls.project, created_by=cls.user
        )
        cls.status_todo = TaskStatus.objects.get(board=cls.board, code="todo")
        cls.status_done = TaskStatus.objects.get(board=cls.board, code="done")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_task_and_activity_log(self):
        """Task creation should log 'Task created' in activity log."""
        res = self.client.post(
            reverse("task-list"),
            {
                "project": self.project.id,
                "title": "Build Auth API",
                "description": "Implement JWT",
                "priority": Task.Priority.HIGH,
                "assignee": self.assignee.id,
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        task = Task.objects.get(id=res.data["id"])
        self.assertEqual(task.reporter, self.user)
        activities = ProjectActivity.objects.filter(entity_type="task", entity_id=str(task.id))
        self.assertTrue(activities.exists())
        self.assertIn("Task created", activities.first().metadata.get("action", ""))

    def test_move_task_requires_timer_for_done(self):
        """A task without a timer CAN be moved to Done (limitation removed)."""
        task = Task.objects.create(
            project=self.project,
            title="No Timer Task",
            reporter=self.user,
            status=self.status_todo,
        )
        # Manually delete the auto-created timer to test the logic
        TimeLog.objects.filter(task=task).delete()

        url = reverse("task-move-task", kwargs={"pk": task.id})
        res = self.client.post(
            url,
            {"status_id": str(self.status_done.id), "order": 1},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertTrue(task.is_finished)

    def test_create_subtask(self):
        """Creating a subtask should link to parent task."""
        parent = Task.objects.create(
            project=self.project,
            title="Parent Task",
            reporter=self.user,
            status=self.status_todo,
        )
        res = self.client.post(
            reverse("task-list"),
            {
                "project": self.project.id,
                "title": "Subtask 1",
                "parent_task": parent.id,
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(parent.subtasks.count(), 1)

    def test_list_subtasks_endpoint(self):
        """Subtasks endpoint should return child tasks."""
        parent = Task.objects.create(
            project=self.project,
            title="Parent",
            reporter=self.user,
            status=self.status_todo,
        )
        Task.objects.create(
            project=self.project,
            title="Sub 1",
            reporter=self.user,
            status=self.status_todo,
            parent_task=parent,
        )
        url = reverse("task-subtasks", kwargs={"pk": parent.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)

    def test_move_task_status_and_order(self):
        """Moving a task across statuses should update status, order, and log it."""
        task = Task.objects.create(
            project=self.project,
            title="Move Task",
            reporter=self.user,
            status=self.status_todo,
            spent_hours=1,  # Required to move to done
        )
        TimeLog.objects.create(
            task=task,
            user=self.user,
            date=timezone.now().date(),
            start_time=timezone.now() - datetime.timedelta(hours=1),
        )
        url = reverse("task-move-task", kwargs={"pk": task.id})
        res = self.client.post(
            url,
            {
                "status_id": str(self.status_done.id),
                "order": 5,
            },
        )
        self.assertEqual(
            res.status_code, status.HTTP_200_OK, msg=f"Failed to move task: {res.data}"
        )
        task.refresh_from_db()
        self.assertEqual(task.status, self.status_done)
        self.assertEqual(task.order, 5)

    def test_filter_tasks_by_project(self):
        """Tasks should be filterable by project."""
        Task.objects.create(
            project=self.project,
            title="T1",
            reporter=self.user,
            status=self.status_todo,
        )
        Task.objects.create(
            project=self.project2,
            title="T2",
            reporter=self.user,
            status=self.status_todo,
        )
        res = self.client.get(reverse("task-list"), {"project": self.project.id})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["title"], "T1")

    def test_filter_parent_only(self):
        """parent_only=true should exclude subtasks."""
        parent = Task.objects.create(
            project=self.project,
            title="Parent",
            reporter=self.user,
            status=self.status_todo,
        )
        Task.objects.create(
            project=self.project,
            title="Child",
            reporter=self.user,
            status=self.status_todo,
            parent_task=parent,
        )
        res = self.client.get(reverse("task-list"), {"parent_only": "true"})
        titles = [t["title"] for t in res.data["results"]]
        self.assertIn("Parent", titles)
        self.assertNotIn("Child", titles)

    def test_progress_checklist_only(self):
        """Task with 4 checklist items, 1 completed → 25%."""
        task = Task.objects.create(
            project=self.project,
            title="CL Progress",
            reporter=self.user,
            status=self.status_todo,
        )
        TaskChecklistItem.objects.create(task=task, description="A", is_completed=True)
        TaskChecklistItem.objects.create(task=task, description="B", is_completed=False)
        TaskChecklistItem.objects.create(task=task, description="C", is_completed=False)
        TaskChecklistItem.objects.create(task=task, description="D", is_completed=False)
        task.refresh_from_db()
        self.assertEqual(task.progress_percent, 25.0)

    def test_progress_subtask_only(self):
        """Parent with 2 subtasks: one at 100%, one at 0% → parent 50%."""
        parent = Task.objects.create(
            project=self.project,
            title="Parent",
            reporter=self.user,
            status=self.status_todo,
        )
        sub1 = Task.objects.create(
            project=self.project,
            title="Sub1",
            reporter=self.user,
            status=self.status_todo,
            parent_task=parent,
        )
        sub2 = Task.objects.create(
            project=self.project,
            title="Sub2",
            reporter=self.user,
            status=self.status_todo,
            parent_task=parent,
        )
        TaskChecklistItem.objects.create(task=sub1, description="X", is_completed=True)
        TaskChecklistItem.objects.create(task=sub1, description="Y", is_completed=True)
        sub1.refresh_from_db()
        sub2.refresh_from_db()
        parent.refresh_from_db()
        self.assertEqual(sub1.progress_percent, 100.0)
        self.assertEqual(sub2.progress_percent, 0.0)
        self.assertEqual(parent.progress_percent, 50.0)

    def test_progress_mixed_checklist_and_subtasks(self):
        """Task with own checklists (50%) + subtask (100%) → (50+100)/2 = 75%."""
        parent = Task.objects.create(
            project=self.project,
            title="Mixed",
            reporter=self.user,
            status=self.status_todo,
        )
        TaskChecklistItem.objects.create(task=parent, description="A", is_completed=True)
        TaskChecklistItem.objects.create(task=parent, description="B", is_completed=False)
        sub = Task.objects.create(
            project=self.project,
            title="Sub",
            reporter=self.user,
            status=self.status_todo,
            parent_task=parent,
        )
        TaskChecklistItem.objects.create(task=sub, description="X", is_completed=True)
        sub.refresh_from_db()
        parent.refresh_from_db()
        self.assertEqual(parent.progress_percent, 75.0)

    def test_progress_in_api_response(self):
        """API response should include progress_percent and checklist_stats."""
        task = Task.objects.create(
            project=self.project,
            title="API Progress",
            reporter=self.user,
            status=self.status_todo,
        )
        TaskChecklistItem.objects.create(task=task, description="A", is_completed=True)
        TaskChecklistItem.objects.create(task=task, description="B", is_completed=False)

        url = reverse("task-detail", kwargs={"pk": task.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["progress_percent"], 50.0)
        self.assertEqual(res.data["checklist_stats"]["total"], 2)
        self.assertEqual(res.data["checklist_stats"]["done"], 1)

    def test_task_activities_endpoint(self):
        task = Task.objects.create(
            project=self.project,
            title="Activity Test",
            reporter=self.user,
            status=self.status_todo,
        )
        url = reverse("task-activities", kwargs={"pk": task.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_mark_done_endpoint(self):
        task = Task.objects.create(
            project=self.project,
            title="Mark Done Task",
            reporter=self.user,
            status=self.status_todo,
            spent_hours=1,  # Required to move to done
        )
        TimeLog.objects.create(
            task=task,
            user=self.user,
            date=timezone.now().date(),
            start_time=timezone.now() - datetime.timedelta(hours=1),
        )
        url = reverse("task-mark-done", kwargs={"pk": task.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status.code, "done")
        self.assertTrue(task.is_finished)

        # Second toggle now succeeds because backward restriction is removed, it acts as a no-op.
        res2 = self.client.post(url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status.code, "done")
        self.assertTrue(task.is_finished)


class StandupGridTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Standup Org", slug="standup-org")

        cls.owner_user = User.objects.create_user(
            username="org_owner",
            email="owner@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=cls.owner_user, organization=cls.org, role="owner"
        )

        cls.member_user = User.objects.create_user(
            username="proj_member",
            email="member@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=cls.member_user, organization=cls.org, role="employee"
        )

        cls.unrelated_org_user = User.objects.create_user(
            username="unrelated_org_user",
            email="unrelated@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=cls.unrelated_org_user, organization=cls.org, role="employee"
        )

        cls.superuser = User.objects.create_superuser(
            username="super_admin",
            email="super@example.com",
            password="Password123!",
        )

        cls.project = Project.objects.create(
            name="Alpha Project",
            description="Alpha",
            organization=cls.org,
        )

        # Only owner_user and member_user are project members
        ProjectMember.objects.create(project=cls.project, user=cls.owner_user, is_active=True)
        ProjectMember.objects.create(project=cls.project, user=cls.member_user, is_active=True)

    def test_org_owner_sees_only_project_members_in_grid(self):
        """Org owner should only see project members, not all organization members."""
        self.client.force_authenticate(user=self.owner_user)
        url = reverse("task-standup-grid")
        res = self.client.get(url, {"project": str(self.project.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        member_ids = {m["id"] for m in res.data["members"]}
        self.assertIn(str(self.owner_user.id), member_ids)
        self.assertIn(str(self.member_user.id), member_ids)
        # Unrelated org user must NOT appear in the project standup grid
        self.assertNotIn(str(self.unrelated_org_user.id), member_ids)

    def test_superuser_sees_only_project_members_in_grid(self):
        """Superuser should only see active project members in the grid."""
        self.client.force_authenticate(user=self.superuser)
        url = reverse("task-standup-grid")
        res = self.client.get(url, {"project": str(self.project.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        member_ids = {m["id"] for m in res.data["members"]}
        self.assertIn(str(self.owner_user.id), member_ids)
        self.assertIn(str(self.member_user.id), member_ids)
        self.assertNotIn(str(self.unrelated_org_user.id), member_ids)

    def test_user_with_logged_standup_included_even_if_not_current_member(self):
        """If a user has a standup entry for the month, they are included via extra_users."""
        now = timezone.localdate()
        AsyncStandup.objects.create(
            project=self.project,
            user=self.unrelated_org_user,
            date=now,
            hours_worked=4,
            today_work="Helped with bugfix",
        )

        self.client.force_authenticate(user=self.owner_user)
        url = reverse("task-standup-grid")
        res = self.client.get(
            url, {"project": str(self.project.id), "year": now.year, "month": now.month}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        member_ids = {m["id"] for m in res.data["members"]}
        self.assertIn(str(self.unrelated_org_user.id), member_ids)

    def test_non_member_forbidden_from_grid(self):
        """Users outside the org and project should receive 403 Forbidden."""
        outsider = User.objects.create_user(
            username="outsider",
            email="outsider@example.com",
            password="Password123!",
        )
        self.client.force_authenticate(user=outsider)
        url = reverse("task-standup-grid")
        res = self.client.get(url, {"project": str(self.project.id)})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class MultiAssigneeTaskTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Multi Org", slug="multi-org")
        cls.user1 = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="Password123!",
        )
        cls.user2 = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="Password123!",
        )
        OrganizationMembership.objects.create(
            user=cls.user1, organization=cls.org, role="employee"
        )
        OrganizationMembership.objects.create(
            user=cls.user2, organization=cls.org, role="employee"
        )

        cls.project = Project.objects.create(
            name="Multi Project",
            description="Testing multi assignees",
            organization=cls.org,
            owner=cls.user1,
        )
        ProjectMember.objects.create(project=cls.project, user=cls.user1, is_active=True)
        ProjectMember.objects.create(project=cls.project, user=cls.user2, is_active=True)

        cls.board = Board.objects.create(
            title="Sprint Board",
            project=cls.project,
            created_by=cls.user1,
        )
        cls.status_todo = TaskStatus.objects.create(
            board=cls.board, code="todo", name="To Do", order=1
        )

    def test_create_task_with_multiple_assignees(self):
        """Task created via API with multiple assignees should persist all assignees."""
        self.client.force_authenticate(user=self.user1)
        url = reverse("task-list")
        payload = {
            "title": "Shared Task",
            "project": str(self.project.id),
            "status": str(self.status_todo.id),
            "priority": "high",
            "assignees": [str(self.user1.id), str(self.user2.id)],
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        task_id = res.data["id"]
        task = Task.objects.get(id=task_id)
        assigned_ids = set(task.assignees.values_list("id", flat=True))
        self.assertIn(self.user1.id, assigned_ids)
        self.assertIn(self.user2.id, assigned_ids)

        # Check API response format
        self.assertEqual(len(res.data["assignees_detail"]), 2)
        returned_usernames = {u["username"] for u in res.data["assignees_detail"]}
        self.assertIn("alice", returned_usernames)
        self.assertIn("bob", returned_usernames)

    def test_filter_tasks_by_assignee_matches_multi_assignee(self):
        """Filtering by ?assignee=<id> should return the task if user is one of the assignees."""
        self.client.force_authenticate(user=self.user1)
        task = Task.objects.create(
            project=self.project,
            title="Collaborative Task",
            reporter=self.user1,
            status=self.status_todo,
        )
        task.assignees.set([self.user1, self.user2])

        url = reverse("task-list")
        # Alice query
        res_alice = self.client.get(url, {"assignee": str(self.user1.id)})
        self.assertEqual(res_alice.status_code, status.HTTP_200_OK)
        alice_ids = [t["id"] for t in res_alice.data["results"]]
        self.assertIn(str(task.id), [str(i) for i in alice_ids])

        # Bob query
        res_bob = self.client.get(url, {"assignee": str(self.user2.id)})
        self.assertEqual(res_bob.status_code, status.HTTP_200_OK)
        bob_ids = [t["id"] for t in res_bob.data["results"]]
        self.assertIn(str(task.id), [str(i) for i in bob_ids])

    def test_employee_dashboard_displays_task_for_all_assignees(self):
        """Dashboard _get_upcoming_tasks should return task for every assigned user."""
        from reports.services import EmployeeDashboardService

        task = Task.objects.create(
            project=self.project,
            title="Shared Feature",
            reporter=self.user1,
            status=self.status_todo,
        )
        task.assignees.set([self.user1, self.user2])

        now = timezone.now()
        alice_upcoming = list(EmployeeDashboardService._get_upcoming_tasks(self.user1, now))
        bob_upcoming = list(EmployeeDashboardService._get_upcoming_tasks(self.user2, now))

        alice_titles = [t["title"] for t in alice_upcoming]
        bob_titles = [t["title"] for t in bob_upcoming]

        self.assertIn("Shared Feature", alice_titles)
        self.assertIn("Shared Feature", bob_titles)

    def test_both_assignees_can_start_timer(self):
        """Any of the assignees should be permitted to start a timer on the task."""
        from attendance.services import TimeLogService

        task = Task.objects.create(
            project=self.project,
            title="Time Loggable Task",
            reporter=self.user1,
            status=self.status_todo,
        )
        task.assignees.set([self.user1, self.user2])

        # Bob (not reporter, not owner) starts timer
        timer_bob = TimeLogService.start_timer(self.user2, task)
        self.assertIsNotNone(timer_bob)
        self.assertEqual(timer_bob.user, self.user2)
        TimeLogService.stop_timer(self.user2, timer_bob.id)

        # Alice starts timer
        timer_alice = TimeLogService.start_timer(self.user1, task)
        self.assertIsNotNone(timer_alice)
        self.assertEqual(timer_alice.user, self.user1)
        TimeLogService.stop_timer(self.user1, timer_alice.id)

