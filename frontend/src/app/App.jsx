import { BrowserRouter, useNavigate } from "react-router-dom";
import RouterApp from "./RouterApp";
import useSession from "../hooks/useSession";

function AppShell() {
  const navigate = useNavigate();
  const session = useSession();
  if (session.loading) return <main className="auth-shell"><div className="loading">Checking your session...</div></main>;
  const onAuthenticated = async (token, nextPath = "/") => {
    const loggedUser = await session.authenticate(token);
    if (loggedUser?.role === "ADMIN") {
      navigate("/admin/dashboard");
    } else if (loggedUser?.role === "HUB_STAFF") {
      navigate("/hub-staff/dashboard", { state: { loginSuccess: true } });
    } else {
      navigate(nextPath);
    }
  };
  return <RouterApp user={session.user} logout={session.logout} onAuthenticated={onAuthenticated} />;
}

export default function App() {
  return <BrowserRouter><AppShell /></BrowserRouter>;
}
