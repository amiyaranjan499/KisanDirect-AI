import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loginUser } from "../services/api";
import { languageOptions } from "../i18n/stateLanguages";

export default function AuthPanel({ onAuthenticated, language, setLanguage, t = (key) => key }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const slides = [
    {
      image: "/assets/images/img.png",
      title: "Fresh Food",
      accent: "Brighter Tomorrows",
      caption: "Direct from farmers to families.",
    },
    {
      image: "/assets/images/image1.png",
      title: "Stronger Farmers",
      accent: "Healthier Families",
      caption: "Every basket carries a better future.",
    },
    {
      image: "/assets/images/image2.png",
      title: "Good Food",
      accent: "Good Communities",
      caption: "Fair prices, trusted quality, real impact.",
    },
    {
      image: "/assets/images/image3.jpeg",
      title: "Fresh From",
      accent: "Our Farmers",
      caption: "Every harvest starts with care.",
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const token = await loginUser({ email, password });
      onAuthenticated(token.access_token);
    } catch (requestError) {
      setError(requestError.message || "Unable to authenticate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-reference-shell">
      <div id="farmer-login-carousel" className="carousel slide auth-reference-carousel" data-bs-ride="carousel">
        <div className="carousel-indicators">
          {slides.map((slide, index) => (
            <button key={slide.title} type="button" className={activeSlide === index ? "active" : ""} aria-label={`Show ${slide.title}`} onClick={() => setActiveSlide(index)} />
          ))}
        </div>

        <div className="carousel-inner">
          {slides.map((slide, index) => (
            <div key={slide.image} className={`carousel-item ${activeSlide === index ? "active" : ""}`}>
              <img src={slide.image} className="auth-carousel-image" alt="Farmer sharing fresh vegetables with a family" />
              <div className="auth-carousel-shade" />
              <div className="auth-carousel-message">
                <p>KisanDirect AI</p>
                <h1>{slide.title}<br /><span>{slide.accent}</span></h1>
                <small>{slide.caption}</small>
              </div>
            </div>
          ))}
        </div>

        <button className="carousel-control-prev" type="button" onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)} aria-label="Previous farmer image">
          <span className="carousel-control-prev-icon" />
        </button>
        <button className="carousel-control-next" type="button" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)} aria-label="Next farmer image">
          <span className="carousel-control-next-icon" />
        </button>
      </div>

      <header className="auth-reference-header">
        <a href="#login" className="reference-logo" aria-label="KisanDirect AI home">
          <img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
        </a>
        <label className="reference-language" htmlFor="reference-language">
          <span aria-hidden="true"><i className="bi bi-translate" /></span>
          <select id="reference-language" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language.label")}>
            {Object.entries(languageOptions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
      </header>

      <section className="auth-reference-card" id="login">
        <div className="reference-card-logo"><img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" /></div>
        <h2>Welcome</h2>
        <p className="reference-card-subtitle">Sign in with your email and password.</p>

        <form className="reference-login-form" onSubmit={submit}>
          <label htmlFor="reference-email">{t("auth.email")}</label>
          <input id="reference-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="reference-password">{t("auth.password")}</label>
          <div className="password-field">
            <input id="reference-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? t("auth.hidePassword") || "Hide password" : t("auth.showPassword") || "Show password"}>
              <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} aria-hidden="true" />
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="reference-submit" disabled={loading}>
            {loading ? "Working..." : <><span>{t("auth.login")}</span> <i className="bi bi-arrow-right" aria-hidden="true"></i></>}
          </button>
        </form>

        <p className="reference-card-subtitle"><Link to="/register">Create an account</Link></p>
        <p className="reference-terms">By continuing, you agree to our <a href="#terms">Terms of Use</a> and <a href="#privacy">Privacy Policy</a>.</p>
        <div className="reference-sustainability"><strong>🌿 Together for a Sustainable Future</strong><small>Better Farmers&nbsp; | &nbsp;Healthier Food&nbsp; | &nbsp;Stronger Communities</small></div>
        <a className="reference-admin-link" href="/admin/login">Admin Login</a>
      </section>
    </main>
  );
}