from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import WorkStyleProfile
from automations.catalog import AUTOMATION_EVENT_CATALOG, Recipient
from automations.models import AutomationRule
from automations.rules import process_rules_for_event
from organizations.models import Organization
from projects.models import Project

User = get_user_model()


class AutomationCatalogApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            first_name="Project",
            last_name="Owner",
            password="password123",
        )
        self.organization = Organization.objects.create(
            name="Automation Org", slug="automation-org", owner=self.owner
        )
        self.project = Project.objects.create(
            name="Automation Project", organization=self.organization, owner=self.owner
        )
        self.client.force_authenticate(self.owner)

    def test_catalog_exposes_all_supported_events_with_defaults(self):
        response = self.client.get(
            f"/api/v1/automations/catalog/?organization={self.organization.id}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data.get("data", response.data)
        self.assertEqual(len(payload["events"]), len(AUTOMATION_EVENT_CATALOG))
        self.assertEqual(
            {event["code"] for event in payload["events"]},
            {event["code"] for event in AUTOMATION_EVENT_CATALOG},
        )
        self.assertTrue(payload["events"][0]["default_recipients"])

    def test_rule_creation_is_limited_to_a_single_event_per_organization(self):
        rule = {
            "organization": str(self.organization.id),
            "event_type": "task_assigned",
            "action_type": "email",
            "message_template": "{{task_title}}",
            "recipients": [Recipient.ASSIGNEE],
            "is_active": True,
        }
        self.assertEqual(
            self.client.post("/api/v1/automations/rules/", rule, format="json").status_code,
            status.HTTP_201_CREATED,
        )
        duplicate = self.client.post("/api/v1/automations/rules/", rule, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)


class AutomationRuleProcessingTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner2@example.com", username="owner2", first_name="Owner", last_name="Two"
        )
        self.assignee = User.objects.create_user(
            email="assignee@example.com",
            username="assignee",
            first_name="Assigned",
            last_name="User",
        )
        self.organization = Organization.objects.create(
            name="Rules Org", slug="rules-org", owner=self.owner
        )
        self.project = Project.objects.create(
            name="Rules Project", organization=self.organization, owner=self.owner
        )
        WorkStyleProfile.objects.create(user=self.owner, notify_via_email=True)
        WorkStyleProfile.objects.create(user=self.assignee, notify_via_email=True)

    @patch("automations.rules.send_email_notification")
    def test_organization_rule_overrides_catalog_recipients_and_template(self, send_email):
        AutomationRule.objects.create(
            organization=self.organization,
            event_type="task_assigned",
            action_type=AutomationRule.ActionType.EMAIL,
            message_template="Assigned: {{task_title}}",
            recipients=[Recipient.PROJECT_OWNER],
        )

        process_rules_for_event(
            "task_assigned",
            {
                "project_id": str(self.project.id),
                "assignee_id": str(self.assignee.id),
                "task_title": "Implement workflow",
            },
        )

        send_email.delay.assert_called_once()
        self.assertEqual(send_email.delay.call_args.args[0], self.owner.email)
        self.assertEqual(send_email.delay.call_args.args[2], "Assigned: Implement workflow")

    @patch("automations.rules.send_email_notification")
    def test_disabled_rule_suppresses_catalog_default(self, send_email):
        AutomationRule.objects.create(
            organization=self.organization,
            event_type="task_assigned",
            action_type=AutomationRule.ActionType.EMAIL,
            message_template="{{task_title}}",
            recipients=[Recipient.ASSIGNEE],
            is_active=False,
        )

        process_rules_for_event(
            "task_assigned",
            {
                "project_id": str(self.project.id),
                "assignee_id": str(self.assignee.id),
                "task_title": "Implement workflow",
            },
        )

        send_email.delay.assert_not_called()


class InAppNotificationLocalizationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            email="notifications@example.com", username="notification-admin"
        )
        self.client.force_authenticate(self.user)

    @patch("automations.rules.send_telegram_notification")
    @patch("automations.rules.send_email_notification")
    @patch("automations.rules._determine_target_users")
    def test_event_data_preserves_display_values_and_is_exposed_by_api(
        self, targets, send_email, send_telegram
    ):
        from panel.Notification.models import Notification

        targets.return_value = {str(self.user.id)}
        title = "Task with {braces} " * 30
        process_rules_for_event(
            "task_created",
            {
                "task_title": title,
                "project_name": "Launch",
                "budget": "private unrelated value",
                "internal_token": "private unrelated value",
            },
        )
        notification = Notification.objects.get(user=self.user)
        self.assertLessEqual(len(notification.text), 255)
        self.assertEqual(
            notification.message_data,
            {
                "event": "task_created",
                "values": {"task_title": title, "project_name": "Launch"},
            },
        )
        for language in ("fa", "en"):
            response = self.client.get(
                f"/api/v1/dashboard/notifications/{notification.id}/",
                HTTP_ACCEPT_LANGUAGE=language,
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            body = response.data.get("data", response.data)
            self.assertEqual(body["message_data"], notification.message_data)


    def test_standup_notification_exposes_submitters_current_avatar(self):
        from panel.Notification.models import Notification

        submitter = User.objects.create_user(
            email="submitter@example.com", username="standup-submitter"
        )
        submitter.avatar.name = "avatars/submitter.jpg"
        submitter.save(update_fields=["avatar"])
        notification = Notification.objects.create(
            user=self.user,
            text="A colleague shared their daily update.",
            message_data={
                "event": "standup_submitted",
                "values": {
                    "user_id": str(submitter.id),
                    "user_name": submitter.username,
                },
            },
        )

        response = self.client.get(
            f"/api/v1/dashboard/notifications/{notification.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.data.get("data", response.data)
        self.assertEqual(
            body["sender_avatar_url"],
            f"http://testserver/media/{submitter.avatar.name}",
        )
    def test_broadcasts_and_existing_records_have_no_event_data(self):
        from dashboard.Notification.serializers import NotificationSerializer
        from panel.Notification.models import Notification

        notification = Notification.objects.create(user=self.user, text="Team lunch at noon")
        body = NotificationSerializer(notification).data
        self.assertEqual(body["text"], "Team lunch at noon")
        self.assertEqual(body["message_data"], {})


class TelegramBotLocalizationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            first_name="Admin",
            last_name="User",
            password="password123",
        )
        self.wsp = WorkStyleProfile.objects.create(
            user=self.user,
            telegram_chat_id="999999",
            telegram_language="fa",
            has_set_language_manually=True,
            notify_via_telegram=True,
            notify_via_email=True,
        )
        self.org = Organization.objects.create(
            name="Tabarzin",
            slug="tabarzin",
            owner=self.user,
        )

    @patch("automations.services.TelegramBotService._send_or_edit")
    def test_telegram_bot_handlers_english_localization(self, mock_send_or_edit):
        from automations.services import TelegramBotService

        self.wsp.telegram_language = "en"
        self.wsp.save(update_fields=["telegram_language"])

        # 1. Main Menu
        TelegramBotService._handle_main_menu("999999", "en")
        args, kwargs = mock_send_or_edit.call_args
        msg = args[1]
        markup = kwargs.get("reply_markup") or (args[2] if len(args) > 2 else {})
        self.assertIn("Madaar Bot Main Menu", msg)
        btn_texts = [btn["text"] for row in markup["inline_keyboard"] for btn in row]
        self.assertIn(" My Projects", btn_texts)

        # 2. Status
        TelegramBotService._handle_status("999999", "en")
        msg = mock_send_or_edit.call_args[0][1]
        self.assertIn("User Account Status", msg)
        self.assertIn("Active", msg)

        # 3. Help
        TelegramBotService._handle_help("999999", "en")
        msg = mock_send_or_edit.call_args[0][1]
        self.assertIn("Madaar Bot Help", msg)

        # 4. My Projects
        TelegramBotService._handle_my_projects("999999", "en")
        msg = mock_send_or_edit.call_args[0][1]
        self.assertIn("My Projects", msg)
        self.assertIn("You are currently not a member of any active project", msg)

    # TODO: i18n tests removed temporarily - will be fixed in Phase 2
