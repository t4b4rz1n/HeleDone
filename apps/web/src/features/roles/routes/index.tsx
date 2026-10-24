import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { PermissionGuard } from "../../auth/components/PermissionGuard";

const RolesListPage = lazy(() => import("../pages/RolesListPage"));

export const rolesRoutes: RouteObject[] = [
  {
    path: "roles",
    element: (
      <PermissionGuard
        permissions={["org.manage_roles", "org.manage_settings"]}
        fallback={<Navigate to="/dashboard" replace />}
      >
        <RolesListPage />
      </PermissionGuard>
    ),
  },
];
