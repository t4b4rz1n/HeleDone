from django.test import TestCase


class OrganizationPermissionTests(TestCase):
    """Test organization creation permissions."""

    def setUp(self):
        from accounts.models import User

        # Regular employee user
        self.employee = User.objects.create_user(
            username="employee", email="employee@test.com", password="pass123"
        )

        self.staff = User.objects.create_user(
            username="staff", email="staff@test.com", password="pass123", is_staff=True
        )

        from organizations.models import Organization, OrganizationMembership

        self.org = Organization.objects.create(name="Test Org", slug="test-org", owner=self.staff)
        OrganizationMembership.objects.create(
            user=self.employee, organization=self.org, role=OrganizationMembership.Role.EMPLOYEE
        )

    def test_employee_cannot_create_organization(self):
        """Regular employees should NOT be able to create organizations."""
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.employee)

        response = client.post(
            "/api/v1/organizations/",
            {"name": "Test Org 2", "slug": "test-org-2", "description": "Test"},
            format="json",
        )

        # Should be denied
        self.assertEqual(response.status_code, 403)
        self.assertIn("permission", str(response.data).lower())

    def test_staff_can_create_organization(self):
        """Staff users should be able to create organizations."""
        from rest_framework.test import APIClient

        from accounts.models import User

        new_staff = User.objects.create_user(
            username="newstaff", email="newstaff@test.com", password="pass123", is_staff=True
        )

        client = APIClient()
        client.force_authenticate(user=new_staff)

        response = client.post(
            "/api/v1/organizations/",
            {"name": "Test Org 3", "slug": "test-org-3", "description": "Test"},
            format="json",
        )

        # Should succeed
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Test Org 3")

    def test_new_organization_creator_gets_owner_membership_and_role(self):
        from rest_framework.test import APIClient

        from accounts.models import User
        from organizations.models import OrganizationMembership

        creator = User.objects.create_user(
            username="creator", email="creator@test.com", password="pass123"
        )
        client = APIClient()
        client.force_authenticate(user=creator)
        response = client.post(
            "/api/v1/organizations/",
            {"name": "Creator Org", "slug": "creator-org"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["member_count"], 1)
        membership = OrganizationMembership.objects.get(
            user=creator, organization_id=response.data["id"]
        )
        self.assertEqual(membership.role, OrganizationMembership.Role.OWNER)
        self.assertEqual(list(membership.dynamic_roles.values_list("name", flat=True)), ["Owner"])

    def test_superuser_creator_is_visible_as_owner_member(self):
        from rest_framework.test import APIClient

        from accounts.models import User
        from organizations.models import OrganizationMembership

        creator = User.objects.create_superuser(
            username="super-creator", email="super-creator@test.com", password="pass123"
        )
        client = APIClient()
        client.force_authenticate(user=creator)

        for slug in ("super-org-a", "super-org-b"):
            response = client.post(
                "/api/v1/organizations/", {"name": slug, "slug": slug}, format="json"
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.data["member_count"], 1)
            membership = OrganizationMembership.objects.get(
                user=creator, organization_id=response.data["id"], is_deleted=False
            )
            self.assertEqual(membership.role, OrganizationMembership.Role.OWNER)
            self.assertEqual(list(membership.dynamic_roles.values_list("name", flat=True)), ["Owner"])
            members = client.get(f"/api/v1/organizations/{response.data['id']}/members/")
            self.assertEqual(members.status_code, 200)
            self.assertTrue(
                any(
                    str(member["user_id"]) == str(creator.id)
                    and member["role_display"] == "Owner"
                    for member in members.data
                )
            )

    def test_backfill_restores_missing_superuser_membership(self):
        from importlib import import_module
        from types import SimpleNamespace

        from django.apps import apps
        from django.db import connection

        from accounts.models import User
        from organizations.models import Organization, OrganizationMembership

        creator = User.objects.create_superuser(
            username="legacy-super", email="legacy-super@test.com", password="pass123"
        )
        org = Organization.objects.create(name="Legacy Super Org", slug="legacy-super-org", owner=creator)
        OrganizationMembership.all_objects.filter(user=creator, organization=org).update(is_deleted=True)

        migration = import_module("organizations.migrations.0021_backfill_owner_memberships")
        migration.backfill_owner_memberships(apps, SimpleNamespace(connection=connection))

        membership = OrganizationMembership.objects.get(user=creator, organization=org)
        self.assertEqual(membership.role, OrganizationMembership.Role.OWNER)
        self.assertEqual(list(membership.dynamic_roles.values_list("name", flat=True)), ["Owner"])



class StaticRoleCleanupMigrationTests(TestCase):
    def test_migration_defines_only_owner_and_employee_and_cleans_data(self):
        from importlib import import_module

        migration = import_module(
            "organizations.migrations.0020_remove_fixed_admin_roles"
        )
        operations = migration.Migration.operations
        self.assertEqual(operations[0].__class__.__name__, "RunPython")
        alter_field = operations[1].field
        self.assertEqual(
            dict(alter_field.choices), {"owner": "Owner", "employee": "Employee"}
        )
