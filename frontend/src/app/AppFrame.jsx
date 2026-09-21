import { Link, Outlet, useNavigate } from "react-router-dom";
import { useI18n, languageOptions } from "../i18n";

export default function AppFrame({ user, logout }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const home = user?.role === "FARMER" ? "/farmer/dashboard" : user?.role === "ADMIN" ? "/admin/dashboard" : "/";
  const links = user?.role === "FARMER" ? [["Dashboard", "/farmer/dashboard"], ["Crops", "/farmer/crops"], ["Orders", "/farmer/orders"], ["Sales", "/farmer/sales"], ["Reviews", "/farmer/reviews"], ["Notifications", "/farmer/notifications"]] : user?.role === "ADMIN" ? [["Dashboard", "/admin/dashboard"]] : [["Marketplace", "/"], ["Cart", "/cart"], ["Orders", "/orders"], ["Notifications", "/notifications"], ["Profile", "/profile"]];
  return <main className={user?.role === "FARMER" ? "farmer-app" : ""}><header className="topbar"><div className="topbar-row"><Link className="brand" to={home}><img className="brand-logo" src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" /><span><b>KisanDirect</b><small>Farm to table, with clarity.</small></span></Link><div className="topbar-actions"><span className="session-user">{user?.email}</span><label className="header-language"><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language.label")}>{Object.entries(languageOptions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className="secondary-button" onClick={() => { logout(); navigate("/login"); }}>Sign out</button></div></div><nav className="header-nav" aria-label="Main navigation">{links.map(([label, path]) => <Link className="nav-item" key={path} to={path}>{label}</Link>)}</nav></header><div className="page-shell"><Outlet /></div></main>;
}
