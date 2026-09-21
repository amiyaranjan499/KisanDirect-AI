import { BrowserRouter, useNavigate } from "react-router-dom";
import RouterApp from "./RouterApp";
import useSession from "../hooks/useSession";

function AppShell() {
  const navigate = useNavigate();
  const session = useSession();
  if (session.loading) return <main className="auth-shell"><div className="loading">Checking your session...</div></main>;
  const onAuthenticated = (token, nextPath = "/") => { session.authenticate(token); navigate(nextPath); };
  return <RouterApp user={session.user} logout={session.logout} onAuthenticated={onAuthenticated} />;
}

export default function App() {
  return <BrowserRouter><AppShell /></BrowserRouter>;
}
