import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { PermissionGuard } from "../../auth/components/PermissionGuard";

const TeamsListPage = lazy(() => import("../pages/TeamsListPage"));

export const teamsRoutes = [
  {
    path: "teams",
    element: (
      <PermissionGuard
        permissions={["user.view", "org.manage_members", "report.view_team_lead"]}
        fallback={<Navigate to="/dashboard" replace />}
      >
        <TeamsListPage />
      </PermissionGuard>
    ),
  },
];
