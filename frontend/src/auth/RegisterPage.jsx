import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../services/api";
import { languageOptions } from "../i18n/stateLanguages";

export default function RegisterPage({ language, setLanguage, t = (key) => key }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("CONSUMER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await registerUser({ email, password, role });
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (requestError) {
      setError(requestError.message || "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-reference-shell auth-register-shell">
      <header className="auth-reference-header">
        <Link to="/login" className="reference-logo" aria-label="KisanDirect AI home">
          <img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
        </Link>
        <label className="reference-language" htmlFor="register-language">
          <span aria-hidden="true"><i className="bi bi-translate" /></span>
          <select id="register-language" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language.label")}>
            {Object.entries(languageOptions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
      </header>
      <section className="auth-reference-card">
        <div className="reference-card-logo"><img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" /></div>
        <h2>{t("auth.createAccount")}</h2>
        <p className="reference-card-subtitle">{t("auth.joinRoles")}</p>
        <form className="reference-login-form" onSubmit={submit}>
          <label htmlFor="register-email">{t("auth.email")}</label>
          <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="register-password">{t("auth.password")}</label>
          <input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required />
          <label htmlFor="register-role">{t("auth.accountType")}</label>
          <select id="register-role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="CONSUMER">Consumer</option>
            <option value="FARMER">Farmer</option>
            <option value="RIDER">{t("auth.rider")}</option>
          </select>
          {error && <div className="error" role="alert">{error}</div>}
          <button type="submit" className="reference-submit" disabled={loading}>
            {loading ? "Working..." : <><span>{t("auth.register")}</span> <i className="bi bi-arrow-right" aria-hidden="true" /></>}
          </button>
        </form>
        <p className="reference-card-subtitle"><Link to="/login">{t("auth.backToLogin")}</Link></p>
      </section>
    </main>
  );
}
