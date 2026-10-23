import { Navigate } from "react-router-dom";

const RoleBasedRedirect = () => {
  return <Navigate to="/tasks" replace />;
};

export default RoleBasedRedirect;
