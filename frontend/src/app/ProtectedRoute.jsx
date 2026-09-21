import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute({ user }) {
  const location = useLocation();
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
