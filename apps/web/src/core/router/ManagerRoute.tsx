import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store/authStore";
import { usePermissions } from "../../features/auth/hooks/usePermissions";

interface ManagerRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that requires manager permissions or staff access.
 */
export const ManagerRoute = ({ children }: ManagerRouteProps) => {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuthStore((state) => ({
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
  }));
  const { hasAnyPermission, isStaff } = usePermissions();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isAuthorized =
    hasAnyPermission([
      "report.view",
      "attendance.view_all",
      "finance.view_reports",
      "org.manage_settings",
      "org.manage_members",
      "report.view_team_lead",
    ]) || isStaff;

  if (!isAuthorized) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
