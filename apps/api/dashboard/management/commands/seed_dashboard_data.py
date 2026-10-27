import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from attendance.models import TimeLog
from organizations.models import Organization, OrganizationMembership, Team, TeamMembership
from projects.models import Project, ProjectMember
from tasks.models import AsyncStandup, Board, Task, TaskStatus

User = get_user_model()


class Command(BaseCommand):
    help = "Seed sample dashboard data for development and testing."

    def handle(self, *args, **options):
        self.stdout.write("Seeding dashboard data...")

        with transaction.atomic():
            self._seed_organization_and_team()
            self._seed_users()
            self._seed_project_and_board()
            self._seed_tasks()
            self._seed_time_logs()
            self._seed_standups()

        self.stdout.write(self.style.SUCCESS("Dashboard data seeded successfully."))

    # ── helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _now():
        return timezone.now()

    # ── organization & team ──────────────────────────────────────────

    def _seed_organization_and_team(self):
        org, _ = Organization.objects.get_or_create(
            slug="madaar",
            defaults={"name": "Madaar Corp", "description": "Main organization for Madaar"},
        )
        self._org = org

        team, _ = Team.objects.get_or_create(
            name="Core Team",
            organization=org,
            defaults={"description": "Core development team"},
        )
        self._team = team

    # ── users ────────────────────────────────────────────────────────

    def _seed_users(self):
        org = self._org

        ali, _ = User.objects.get_or_create(
            username="ali",
            defaults={
                "email": "ali@madaar.dev",
                "first_name": "Ali",
                "last_name": "Rezaei",
                "is_staff": True,
            },
        )
        ali.set_password("password123")
        ali.save()

        hamed, _ = User.objects.get_or_create(
            username="hamed",
            defaults={
                "email": "hamed@madaar.dev",
                "first_name": "Hamed",
                "last_name": "Mohammadi",
                "is_staff": True,
            },
        )
        hamed.set_password("password123")
        hamed.save()

        manager, _ = User.objects.get_or_create(
            username="manager",
            defaults={
                "email": "manager@madaar.dev",
                "first_name": "Manager",
                "last_name": "Ahmadi",
                "is_staff": True,
            },
        )
        manager.set_password("password123")
        manager.save()

        self._ali = ali
        self._hamed = hamed
        self._manager = manager

        # Organization memberships
        for user, role in [
            (ali, OrganizationMembership.Role.OWNER),
            (hamed, OrganizationMembership.Role.EMPLOYEE),
            (manager, OrganizationMembership.Role.EMPLOYEE),
        ]:
            OrganizationMembership.objects.get_or_create(
                user=user, organization=org, defaults={"role": role}
            )

        self._team.leader = manager
        self._team.save(update_fields=["leader"])

        # Team memberships
        for user in [ali, hamed, manager]:
            TeamMembership.objects.get_or_create(user=user, team=self._team)

    # ── project & board ──────────────────────────────────────────────

    def _seed_project_and_board(self):
        project, _ = Project.objects.get_or_create(
            name="Core Project",
            organization=self._org,
            defaults={
                "owner": self._manager,
                "description": "Primary project for dashboard seeding",
                "status": Project.Status.ACTIVE,
                "start_date": self._now().date() - timezone.timedelta(days=30),
                "deadline": self._now().date() + timezone.timedelta(days=60),
            },
        )
        self._project = project

        # Project members
        for user, specialty in [
            (self._ali, "Backend / DevOps"),
            (self._hamed, "Frontend / UI"),
            (self._manager, "Full Stack / Lead"),
        ]:
            ProjectMember.objects.get_or_create(
                project=project,
                user=user,
                defaults={
                    "specialty": specialty,
                    "allocation_percentage": 100,
                    "allocation_start_date": project.start_date,
                },
            )

        board, _ = Board.objects.get_or_create(
            title="Main Board",
            project=project,
            defaults={
                "description": "Default Kanban board",
                "created_by": self._manager,
                "order": 0,
            },
        )
        self._board = board

        # Ensure default statuses exist
        status_defs = [
            ("to_do", "To Do", 0),
            ("in_progress", "In Progress", 1),
            ("done", "Done", 2),
        ]
        self._status_map = {}
        for code, name, order in status_defs:
            status, _ = TaskStatus.objects.get_or_create(
                board=board, code=code, defaults={"name": name, "order": order}
            )
            self._status_map[code] = status

    # ── tasks ────────────────────────────────────────────────────────

    def _seed_tasks(self):
        project = self._project
        now = self._now()
        yesterday = now - timezone.timedelta(days=1)
        last_week = now - timezone.timedelta(days=7)

        tasks_data = [
            # (title, status_code, priority, assignee, due_date, is_blocked, is_finished, estimated_hours)
            (
                "Set up CI/CD pipeline",
                "done",
                Task.Priority.HIGH,
                self._ali,
                yesterday,
                False,
                True,
                8,
            ),
            (
                "Design landing page mockups",
                "done",
                Task.Priority.MEDIUM,
                self._hamed,
                yesterday - timezone.timedelta(days=2),
                False,
                True,
                12,
            ),
            (
                "Implement user authentication",
                "in_progress",
                Task.Priority.CRITICAL,
                self._ali,
                now + timezone.timedelta(days=5),
                False,
                False,
                24,
            ),
            (
                "Build reporting dashboard",
                "in_progress",
                Task.Priority.HIGH,
                self._hamed,
                now + timezone.timedelta(days=10),
                False,
                False,
                16,
            ),
            (
                "Write API documentation",
                "in_progress",
                Task.Priority.MEDIUM,
                self._manager,
                now + timezone.timedelta(days=3),
                False,
                False,
                6,
            ),
            (
                "Fix payment gateway timeout",
                "to_do",
                Task.Priority.CRITICAL,
                self._ali,
                now + timezone.timedelta(days=1),
                True,
                False,
                4,
            ),
            (
                "Refactor database queries",
                "to_do",
                Task.Priority.LOW,
                self._hamed,
                now + timezone.timedelta(days=14),
                False,
                False,
                10,
            ),
            (
                "Deploy staging environment",
                "to_do",
                Task.Priority.HIGH,
                self._manager,
                last_week,  # overdue
                True,
                False,
                6,
            ),
            (
                "Prepare weekly progress report",
                "done",
                Task.Priority.MEDIUM,
                self._manager,
                yesterday,
                False,
                True,
                3,
            ),
            (
                "Fix login page CSS bug",
                "in_progress",
                Task.Priority.LOW,
                self._hamed,
                now + timezone.timedelta(days=2),
                False,
                False,
                2,
            ),
        ]

        for idx, (
            title,
            status_code,
            priority,
            assignee,
            due_date,
            is_blocked,
            is_finished,
            estimated_hours,
        ) in enumerate(tasks_data):
            status = self._status_map[status_code]
            Task.objects.get_or_create(
                title=title,
                project=project,
                defaults={
                    "status": status,
                    "priority": priority,
                    "assignee": assignee,
                    "reporter": self._manager,
                    "due_date": due_date,
                    "is_blocked": is_blocked,
                    "is_finished": is_finished,
                    "estimated_hours": estimated_hours,
                    "order": idx,
                    "description": f"Seed task: {title}",
                },
            )

    # ── time logs ────────────────────────────────────────────────────

    def _seed_time_logs(self):
        now = self._now()
        today = now.date()
        # active week: Monday through Friday of the current week
        weekday = today.weekday()  # Monday=0
        monday = today - timezone.timedelta(days=weekday)

        project = self._project
        ali_tasks = list(Task.objects.filter(assignee=self._ali, project=project)[:3])
        hamed_tasks = list(Task.objects.filter(assignee=self._hamed, project=project)[:3])
        manager_tasks = list(Task.objects.filter(assignee=self._manager, project=project)[:2])

        user_logs = [
            (self._ali, ali_tasks, 6.5),
            (self._hamed, hamed_tasks, 5.0),
            (self._manager, manager_tasks, 4.0),
        ]

        for user, tasks, daily_hours in user_logs:
            for day_offset in range(5):  # Mon–Fri
                log_date = monday + timezone.timedelta(days=day_offset)
                if log_date > today:
                    continue
                if not tasks:
                    continue
                task = tasks[day_offset % len(tasks)]
                hours_today = daily_hours + (0.5 if day_offset % 2 == 0 else -0.5)
                duration = int(hours_today * 3600)
                start = timezone.make_aware(
                    timezone.datetime.combine(log_date, datetime.time(hour=9))
                )
                end = start + timezone.timedelta(seconds=duration)

                TimeLog.objects.get_or_create(
                    user=user,
                    task=task,
                    date=log_date,
                    start_time=start,
                    defaults={
                        "end_time": end,
                        "duration_seconds": duration,
                        "is_active": False,
                        "description": f"Work on {task.title}",
                        "project": project,
                    },
                )

    # ── standups ─────────────────────────────────────────────────────

    def _seed_standups(self):
        today = timezone.localdate()

        standups_data = [
            (
                self._ali,
                6,
                "Completed CI/CD pipeline setup, reviewed PRs",
                "Working on user authentication module",
                "Waiting for design approval on auth pages",
            ),
            (
                self._hamed,
                5,
                "Finished landing page mockups, started dashboard UI",
                "Continue with reporting dashboard implementation",
                "No blockers",
            ),
            (
                self._manager,
                4,
                "Reviewed API docs, prepared weekly report",
                "Deploy staging environment, unblock payment gateway task",
                "Blocked by DevOps team for staging access",
            ),
        ]

        for user, hours_worked, today_work, tomorrow_plan, blockers in standups_data:
            combined_today = f"{today_work}\n\nTomorrow:\n{tomorrow_plan}"
            AsyncStandup.objects.get_or_create(
                project=self._project,
                user=user,
                date=today,
                defaults={
                    "hours_worked": hours_worked,
                    "today_work": combined_today,
                    "blockers": blockers,
                },
            )
