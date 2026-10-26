import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store/authStore";

interface StaffRouteProps {
  children: React.ReactNode;
}

export const StaffRoute = ({ children }: StaffRouteProps) => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);

  if (user?.is_superuser === true) {
    return children;
  }

  return <Navigate to="/dashboard" replace state={{ from: location }} />;
};
