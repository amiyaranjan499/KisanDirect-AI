import { Navigate, Outlet } from "react-router-dom";

export default function RoleGuard({ user, roles }) {
  return roles.includes(user?.role) ? <Outlet /> : <Navigate to="/" replace />;
}
