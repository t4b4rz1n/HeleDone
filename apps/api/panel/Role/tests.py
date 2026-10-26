from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from organizations.models import Organization, OrganizationMembership, Permission, Role


class RoleGrantTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="role-owner", email="role-owner@test.com", password="pass123"
        )
        self.staff = User.objects.create_user(
            username="role-staff", email="role-staff@test.com", password="pass123", is_staff=True
        )
        self.org = Organization.objects.create(name="Role Org", slug="role-org", owner=self.owner)
        self.other_org = Organization.objects.create(name="Other Org", slug="other-role-org")
        OrganizationMembership.objects.get_or_create(
            user=self.owner,
            organization=self.org,
            defaults={"role": OrganizationMembership.Role.OWNER},
        )
        self.manage_roles = Permission.objects.get(code="org.manage_roles")
        self.manage_members = Permission.objects.get(code="org.manage_members")
        self.project_create = Permission.objects.get(code="project.create")
        self.org_permissions = [
            "org.view",
            "org.manage_settings",
            "org.manage_roles",
            "org.manage_members",
            "user.view",
            "role.view",
        ]
        self.owner_role = Role.objects.get(organization=self.org, name="Owner")
        self.owner_role.permissions.add(self.manage_roles)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.url = "/api/v1/panel/roles/"

    def test_owner_can_grant_held_organization_permissions_only(self):
        create = self.client.post(
            self.url,
            {
                "name": "Escalation",
                "organization_id": str(self.org.id),
                "permissions": ["org.manage_members", "org.manage_roles", "org.manage_settings"],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        self.assertEqual(
            set(
                Role.objects.get(organization=self.org, name="Escalation").permissions.values_list(
                    "code", flat=True
                )
            ),
            {"org.manage_members", "org.manage_roles", "org.manage_settings"},
        )

        role = Role.objects.create(organization=self.org, name="Worker")
        role.permissions.add(self.project_create)
        forbidden = Permission.objects.create(
            code="platform.secret", name="Secret", module="platform"
        )
        for method in ("put", "patch"):
            response = getattr(self.client, method)(
                f"{self.url}{role.id}/",
                {"permissions": [self.project_create.code, forbidden.code]},
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                set(role.permissions.values_list("code", flat=True)), {self.project_create.code}
            )

        protected = self.client.patch(
            f"{self.url}{self.owner_role.id}/", {"name": "Changed"}, format="json"
        )
        self.assertEqual(protected.status_code, 403)

        staff = APIClient()
        staff.force_authenticate(user=self.staff)
        elevated = staff.post(
            self.url,
            {
                "name": "Staff Role",
                "organization_id": str(self.org.id),
                "permissions": [self.manage_members.code],
            },
            format="json",
        )
        self.assertEqual(elevated.status_code, 403)

        superuser = User.objects.create_superuser(
            username="role-super", email="role-super@test.com", password="pass123"
        )
        staff.force_authenticate(user=superuser)
        elevated = staff.post(
            self.url,
            {
                "name": "Superuser Role",
                "organization_id": str(self.org.id),
                "permissions": [forbidden.code],
            },
            format="json",
        )
        self.assertEqual(elevated.status_code, 201)

    def test_role_mutation_checks_real_organization(self):
        other = Role.objects.create(organization=self.other_org, name="Other Role")
        response = self.client.patch(
            f"{self.url}{other.id}/?organization_id={self.org.id}",
            {"name": "Hijacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        other.refresh_from_db()
        self.assertEqual(other.name, "Other Role")

        response = self.client.post(
            f"{self.url}?organization_id={self.org.id}",
            {"name": "Other Create", "organization_id": str(self.other_org.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Role.objects.filter(organization=self.other_org, name="Other Create").exists()
        )

    def test_owner_cannot_promote_staff_or_edit_superuser(self):
        target = User.objects.create_user(
            username="role-target", email="role-target@test.com", password="pass123"
        )
        OrganizationMembership.objects.create(user=target, organization=self.org, role="employee")
        response = self.client.patch(
            f"/api/v1/panel/users/{target.id}/",
            {"is_staff": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        target.refresh_from_db()
        self.assertFalse(target.is_staff)

        other_superuser = User.objects.create_superuser(
            username="other-super", email="other-super@test.com", password="pass123"
        )
        OrganizationMembership.objects.create(
            user=other_superuser, organization=self.org, role="employee"
        )
        response = self.client.patch(
            f"/api/v1/panel/users/{other_superuser.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        other_superuser.refresh_from_db()
        self.assertTrue(other_superuser.is_active)

        first_superuser = User.objects.create_superuser(
            username="first-super", email="first-super@test.com", password="pass123"
        )
        self.client.force_authenticate(user=first_superuser)
        response = self.client.patch(
            f"/api/v1/panel/users/{other_superuser.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
