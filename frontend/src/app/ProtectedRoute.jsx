import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute({ user }) {
  const location = useLocation();
  const loginPath = location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
  return user ? <Outlet /> : <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
}
