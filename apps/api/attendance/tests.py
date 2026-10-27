from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied

from attendance.models import (
    Attendance,
    AttendanceSetting,
    Holiday,
    TimeLog,
    TimeOffRequest,
)
from attendance.permissions import (
    IsTimeLogOwnerOrAdmin,
    IsTimeOffRequestPermission,
)
from attendance.services import (
    AttendanceService,
    TimeLogService,
    TimeOffRequestService,
    TimesheetService,
)
from organizations.models import (
    Organization,
    OrganizationMembership,
    Team,
    TeamMembership,
)
from projects.models import Project
from tasks.models import Board, Task, TaskStatus

User = get_user_model()

from rest_framework.test import APITestCase


class AttendanceBaseTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Create users
        cls.owner = User.objects.create_user(
            username="owner", email="owner@example.com", password="password"
        )
        cls.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password"
        )
        cls.lead = User.objects.create_user(
            username="lead", email="lead@example.com", password="password"
        )
        cls.employee = User.objects.create_user(
            username="employee", email="employee@example.com", password="password"
        )
        cls.other_employee = User.objects.create_user(
            username="other", email="other@example.com", password="password"
        )

        # Create Organization
        cls.org = Organization.objects.create(name="Test Org", slug="test-org")
        cls.other_org = Organization.objects.create(name="Other Org", slug="other-org")

        # Memberships
        OrganizationMembership.objects.create(
            user=cls.owner,
            organization=cls.org,
            role=OrganizationMembership.Role.OWNER,
        )
        OrganizationMembership.objects.create(
            user=cls.admin,
            organization=cls.org,
            role=OrganizationMembership.Role.OWNER,
        )
        OrganizationMembership.objects.create(
            user=cls.lead,
            organization=cls.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )
        OrganizationMembership.objects.create(
            user=cls.employee,
            organization=cls.org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )
        OrganizationMembership.objects.create(
            user=cls.other_employee,
            organization=cls.other_org,
            role=OrganizationMembership.Role.EMPLOYEE,
        )

        # Teams
        cls.team = Team.objects.create(name="Dev Team", organization=cls.org, leader=cls.lead)
        TeamMembership.objects.create(user=cls.lead, team=cls.team)
        TeamMembership.objects.create(user=cls.employee, team=cls.team)

        # Projects and Tasks
        cls.project = Project.objects.create(
            name="Test Project", organization=cls.org, owner=cls.owner
        )
        board = Board.objects.create(project=cls.project, title="Test Board")
        status = TaskStatus.objects.create(board=board, name="To Do")
        cls.task = Task.objects.create(
            title="Test Task",
            project=cls.project,
            assignee=cls.employee,
            reporter=cls.lead,
            status=status,
        )


class AttendanceTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.employee)

    def test_attendance_creation(self):
        att = Attendance.objects.create(
            user=self.employee,
            organization=self.org,
            date=timezone.localdate(),
            check_in=timezone.now(),
            is_remote=False,
        )
        self.assertEqual(att.user, self.employee)
        self.assertEqual(att.organization, self.org)

    def test_attendance_service_check_in_out(self):
        att, created = AttendanceService.check_in(self.employee, self.org)
        self.assertTrue(created)
        self.assertIsNotNone(att.check_in)

        att_out = AttendanceService.check_out(self.employee)
        self.assertIsNotNone(att_out.check_out)

    def test_attendance_viewset_list(self):
        Attendance.objects.create(
            user=self.employee, organization=self.org, date=timezone.localdate()
        )
        url = reverse("attendances-list")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)

    def test_attendance_viewset_check_in_and_out(self):
        url = reverse("attendances-check-in")
        res = self.client.post(url, {"organization": self.org.id})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Calling check_in again should return 200 OK
        res_dup = self.client.post(url, {"organization": self.org.id})
        self.assertEqual(res_dup.status_code, status.HTTP_200_OK)

        url_out = reverse("attendances-check-out")
        res_out = self.client.post(url_out)
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)

        attendance = Attendance.objects.get(user=self.employee, date=timezone.localdate())
        self.assertIsNotNone(attendance.check_out)

    def test_my_today_endpoint(self):
        url = reverse("attendances-my-today")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        checkin_url = reverse("attendances-check-in")
        self.client.post(checkin_url, {"organization": self.org.id})

        res2 = self.client.get(url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["user"]["id"], str(self.employee.id))


class HolidayTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.employee)

    def test_holiday_unique_constraint(self):
        date = timezone.localdate()
        Holiday.objects.create(name="Holiday 1", date=date, organization=self.org)

        from django.db import transaction

        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Holiday.objects.create(name="Holiday 2", date=date, organization=self.org)

        # This shouldn't fail:
        Holiday.objects.create(name="Holiday 3", date=date, organization=self.other_org)

    def test_holiday_viewset_list_org_isolation(self):
        Holiday.objects.create(name="Global", date=timezone.localdate())
        Holiday.objects.create(
            name="Org Holiday",
            date=timezone.localdate() + timedelta(days=1),
            organization=self.org,
        )
        Holiday.objects.create(
            name="Other Holiday",
            date=timezone.localdate() + timedelta(days=2),
            organization=self.other_org,
        )

        url = reverse("holidays-list")
        res = self.client.get(url, {"organization": self.org.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Should only see Global and Org Holiday
        self.assertEqual(len(res.data["results"]), 2)
        names = [h["name"] for h in res.data["results"]]
        self.assertIn("Global", names)
        self.assertIn("Org Holiday", names)
        self.assertNotIn("Other Holiday", names)


class AttendanceSettingTests(AttendanceBaseTestCase):
    def test_attendance_setting_creation(self):
        setting = AttendanceSetting.objects.create(organization=self.org, expected_daily_hours=8.0)
        self.assertEqual(setting.expected_daily_hours, 8.0)


class PermissionTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.factory = RequestFactory()

    def test_timelog_owner_permission(self):
        request = self.factory.get("/")
        request.user = self.employee

        class MockView:
            action = "retrieve"

        timelog = TimeLog.objects.create(
            user=self.employee,
            task=self.task,
            duration_seconds=10,
            is_active=False,
            date=timezone.localdate(),
            start_time=timezone.now(),
            end_time=timezone.now(),
        )

        permission = IsTimeLogOwnerOrAdmin()
        self.assertTrue(permission.has_object_permission(request, MockView(), timelog))

        request.user = self.other_employee
        if hasattr(request, "_user_org_roles_cache"):
            del request._user_org_roles_cache
        self.assertFalse(permission.has_object_permission(request, MockView(), timelog))

        request.user = self.admin
        if hasattr(request, "_user_org_roles_cache"):
            del request._user_org_roles_cache
        self.assertTrue(permission.has_object_permission(request, MockView(), timelog))

    def test_timelog_fallback_org(self):
        request = self.factory.get("/")
        request.user = self.admin

        class MockView:
            action = "retrieve"

        # Timelog without project, just task
        timelog = TimeLog.objects.create(
            user=self.employee,
            task=self.task,
            project=None,
            duration_seconds=10,
            is_active=False,
            date=timezone.localdate(),
            start_time=timezone.now(),
            end_time=timezone.now(),
        )

        permission = IsTimeLogOwnerOrAdmin()
        # Admin should still have permission because it falls back to task.project
        self.assertTrue(permission.has_object_permission(request, MockView(), timelog))

    def test_timeoff_request_permission(self):
        request = self.factory.get("/")
        request.user = self.employee

        class MockView:
            action = "retrieve"

        from datetime import timedelta

        from django.utils import timezone

        req = TimeOffRequest.objects.create(
            user=self.employee,
            organization=self.org,
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timedelta(days=1),
            request_type="vacation",
        )

        permission = IsTimeOffRequestPermission()
        self.assertTrue(permission.has_object_permission(request, MockView(), req))

        # Lead (team_lead) should NOT see/read others' time-off (private data)
        request.user = self.lead
        if hasattr(request, "_user_org_roles_cache"):
            del request._user_org_roles_cache
        self.assertFalse(permission.has_object_permission(request, MockView(), req))

        # Owner/Admin should have read/update permission
        request.user = self.admin
        if hasattr(request, "_user_org_roles_cache"):
            del request._user_org_roles_cache
        self.assertTrue(permission.has_object_permission(request, MockView(), req))

        # Other employee in different org should not
        request.user = self.other_employee
        if hasattr(request, "_user_org_roles_cache"):
            del request._user_org_roles_cache
        self.assertFalse(permission.has_object_permission(request, MockView(), req))


class TimeLogTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.employee)

    def test_timelog_duration(self):
        start = timezone.now()
        end = start + timedelta(hours=2)
        log = TimeLog.objects.create(
            user=self.employee,
            task=self.task,
            start_time=start,
            end_time=end,
            duration_seconds=7200,
            is_active=False,
            date=timezone.localdate(),
        )
        self.assertIn(str(self.employee), str(log))
        self.assertEqual(log.duration_seconds, 7200)

    def test_timelog_service_start_stop(self):
        timer = TimeLogService.start_timer(self.employee, self.task)
        self.assertTrue(timer.is_active)
        self.assertEqual(timer.user, self.employee)

        active = TimeLogService.get_active_timers(self.employee).first()
        self.assertEqual(active.id, timer.id)

        stopped = TimeLogService.stop_timer(self.employee, timer.id)
        self.assertFalse(stopped.is_active)
        self.assertIsNotNone(stopped.end_time)
        self.assertTrue(stopped.duration_seconds >= 0)

    def test_timelog_service_cancel(self):
        timer = TimeLogService.start_timer(self.employee, self.task)
        canceled = TimeLogService.cancel_timer(self.employee, timer.id)
        self.assertFalse(canceled.is_active)
        self.assertTrue(canceled.is_deleted)

    def test_timelog_viewset_create_is_active(self):
        url = reverse("time-logs-list")
        start = timezone.now()

        res = self.client.post(
            url,
            {
                "task": self.task.id,
                "date": timezone.localdate().isoformat(),
                "start_time": start.isoformat(),
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        log = TimeLog.objects.get(id=res.data["id"])
        self.assertTrue(log.is_active)

    def test_timelog_viewset_start_stop(self):
        url_start = reverse("time-logs-start-timer")
        res_start = self.client.post(url_start, {"task": self.task.id})
        self.assertEqual(res_start.status_code, status.HTTP_200_OK)
        timer_id = res_start.data["id"]

        url_stop = reverse("time-logs-stop-timer", kwargs={"pk": timer_id})
        res_stop = self.client.post(url_stop)
        self.assertEqual(res_stop.status_code, status.HTTP_200_OK)

        timer = TimeLog.objects.get(id=timer_id)
        self.assertFalse(timer.is_active)
        self.assertIsNotNone(timer.end_time)


class TimeOffRequestTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.req = TimeOffRequest.objects.create(
            user=self.employee,
            organization=self.org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timedelta(days=2),
            reason="Vacation",
        )
        self.client.force_authenticate(user=self.employee)

    def test_timeoffrequest_model_creation(self):
        self.assertEqual(self.req.status, TimeOffRequest.Status.PENDING)
        self.assertEqual(str(self.req), f"{self.employee} - {TimeOffRequest.Type.VACATION}")

    def test_timeoffrequest_service_approve(self):
        approved = TimeOffRequestService.approve(self.req.id, self.owner)
        self.assertEqual(approved.status, TimeOffRequest.Status.APPROVED)
        self.assertEqual(approved.approved_by, self.owner)

    def test_timeoffrequest_service_custom_role_approve(self):
        from organizations.models import Permission, Role

        # Create a custom role with leave.approve permission
        perm_leave_approve = Permission.objects.get(code="leave.approve")
        custom_role = Role.objects.create(
            organization=self.org,
            name="HR Specialist",
            description="Can approve leaves",
        )
        custom_role.permissions.add(perm_leave_approve)

        # Create an HR user and assign custom role
        hr_user = User.objects.create_user(
            username="hr_specialist", email="hr_specialist@example.com", password="password"
        )
        membership = OrganizationMembership.objects.create(
            user=hr_user,
            organization=self.org,
            role="employee",
        )
        membership.dynamic_roles.add(custom_role)

        # Approve using user with custom role
        approved = TimeOffRequestService.approve(self.req.id, hr_user)
        self.assertEqual(approved.status, TimeOffRequest.Status.APPROVED)
        self.assertEqual(approved.approved_by, hr_user)

    def test_timeoffrequest_service_reject(self):
        rejected = TimeOffRequestService.reject(self.req.id, self.admin, "No capacity")
        self.assertEqual(rejected.status, TimeOffRequest.Status.REJECTED)
        self.assertEqual(rejected.manager_note, "No capacity")

    def test_timeoffrequest_service_permission_denied(self):
        # User without leave.approve permission is denied
        with self.assertRaises(PermissionDenied):
            TimeOffRequestService.approve(self.req.id, self.employee)

    def test_timeoffrequest_viewset_workflow(self):
        url = reverse("timeoff-requests-list")
        start = timezone.now() + timedelta(days=1)
        end = start + timedelta(days=2)

        # Test creation as employee
        res = self.client.post(
            url,
            {
                "organization": self.org.id,
                "request_type": "sick",
                "start_datetime": start.isoformat(),
                "end_datetime": end.isoformat(),
                "reason": "Sick leave",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        req_id = res.data["id"]

        # Test manager_note is read_only
        res_hack = self.client.post(
            url,
            {
                "organization": self.org.id,
                "request_type": "sick",
                "start_datetime": start.isoformat(),
                "end_datetime": end.isoformat(),
                "reason": "Test",
                "manager_note": "Hack attempt",
            },
        )
        self.assertEqual(res_hack.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(res_hack.data.get("manager_note"), "Hack attempt")

        # Approve as manager
        self.client.force_authenticate(user=self.admin)
        url_approve = reverse("timeoff-requests-approve", kwargs={"pk": req_id})
        res_approve = self.client.post(url_approve)
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)

        req = TimeOffRequest.objects.get(id=req_id)
        self.assertEqual(req.status, TimeOffRequest.Status.APPROVED)

    def test_list_user_filter_keeps_personal_visibility(self):
        TimeOffRequest.objects.create(
            user=self.lead,
            organization=self.org,
            request_type=TimeOffRequest.Type.VACATION,
            start_datetime=timezone.now() + timedelta(days=1),
            end_datetime=timezone.now() + timedelta(days=2),
        )
        url = reverse("timeoff-requests-list")
        own = self.client.get(url, {"user": str(self.employee.id)})
        self.assertEqual(own.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in own.data["results"]], [str(self.req.id)])

        someone_else = self.client.get(url, {"user": str(self.lead.id)})
        self.assertEqual(someone_else.status_code, status.HTTP_200_OK)
        self.assertEqual(someone_else.data["results"], [])

    def test_cancel_endpoint(self):
        url_cancel = reverse("timeoff-requests-cancel-request", kwargs={"pk": self.req.id})
        res = self.client.post(url_cancel)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        req = TimeOffRequest.all_objects.get(id=self.req.id)
        self.assertTrue(req.is_deleted)

    def test_cancel_other_users_request_fails(self):
        self.client.force_authenticate(user=self.other_employee)
        url_cancel = reverse("timeoff-requests-cancel-request", kwargs={"pk": self.req.id})
        res = self.client.post(url_cancel)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class TimesheetTests(AttendanceBaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.employee)
        TimeLog.objects.create(
            user=self.employee,
            task=self.task,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now(),
            duration_seconds=7200,
            is_active=False,
            date=timezone.localdate(),
        )

    def test_timesheet_service_get_timesheets(self):
        daily = TimesheetService.get_daily(self.employee, timezone.localdate())
        self.assertEqual(daily["total_seconds"], 7200)

        team_ts = TimesheetService.get_team_timesheet(
            self.lead, self.org, timezone.localdate(), timezone.localdate()
        )
        self.assertEqual(team_ts.count(), 1)
        self.assertEqual(team_ts.first()["total_seconds"], 7200)

    def test_timesheet_viewset_weekly(self):
        url = reverse("timesheets-weekly")
        res = self.client.get(url, {"week_start": timezone.localdate().isoformat()})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data["results"]) > 0)

    def test_timesheet_viewset_daily(self):
        url = reverse("timesheets-daily")
        res = self.client.get(url, {"date": timezone.localdate().isoformat()})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_seconds"], 7200)

    def test_timesheet_viewset_monthly(self):
        today = timezone.localdate()
        url = reverse("timesheets-monthly")
        res = self.client.get(url, {"year": today.year, "month": today.month})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data["results"]) > 0)

    def test_timesheet_viewset_project(self):
        self.client.force_authenticate(user=self.admin)
        TimeLog.objects.create(
            user=self.employee,
            task=self.task,
            project=self.project,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now(),
            duration_seconds=3600,
            is_active=False,
            date=timezone.localdate(),
        )
        url = reverse("timesheets-project")
        res = self.client.get(
            url,
            {
                "project": self.project.id,
                "start_date": (timezone.localdate() - timedelta(days=1)).isoformat(),
                "end_date": timezone.localdate().isoformat(),
            },
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data["results"]) > 0)


class AttendanceAuthorizationRegressionTests(AttendanceBaseTestCase):
    def test_employee_cannot_create_attendance_for_self_without_view_all(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post(
            reverse("attendances-list"),
            {
                "organization": str(self.org.id),
                "date": timezone.localdate().isoformat(),
                "check_in": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_organization_cannot_view_project_timesheet(self):
        other_project = Project.objects.create(
            name="Other project", organization=self.other_org, owner=self.other_employee
        )
        self.client.force_authenticate(user=self.employee)
        response = self.client.get(
            reverse("timesheets-project"),
            {
                "project": str(other_project.id),
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_can_view_personal_timesheet(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.get(reverse("timesheets-daily"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
