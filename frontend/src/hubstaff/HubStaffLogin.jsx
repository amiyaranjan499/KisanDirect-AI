import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loginUser, getCurrentUser } from "../services/api";
import { languageOptions } from "../i18n/stateLanguages";

export default function HubStaffLogin({ onAuthenticated, language = "en", setLanguage = () => {} }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      image: "/assets/images/sunlight.png",
      title: "Kisan Hub Operations",
      accent: "Fast & Fresh Handling",
      caption: "From farm produce intake to rapid sorting and packaging.",
    },
    {
      image: "/assets/images/img.png",
      title: "Direct Hub Pipeline",
      accent: "Farm-Fresh Quality",
      caption: "Ensuring zero-delay produce delivery to urban consumers.",
    },
    {
      image: "/assets/images/image2.png",
      title: "Rider Handover",
      accent: "Intelligent Dispatch",
      caption: "Geospatial assignment for 45-90 min doorstep delivery.",
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
    setLoading(true);
    setError("");
    try {
      const token = await loginUser(form);
      const user = await getCurrentUser(token.access_token);
      if (user.role !== "HUB_STAFF" && user.role !== "ADMIN") {
        setError("This portal is reserved for Kisan Hub Staff. Please use public login.");
        return;
      }
      onAuthenticated(token.access_token);
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in to Hub Staff portal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-reference-shell hub-staff-auth-shell">
      <div className="auth-reference-carousel" aria-label="KisanDirect AI hub operations">
        <div className="carousel-indicators">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              className={activeSlide === index ? "active" : ""}
              aria-label={`Show ${slide.title}`}
              onClick={() => setActiveSlide(index)}
            />
          ))}
        </div>
        <div className="carousel-inner">
          {slides.map((slide, index) => (
            <div key={slide.title} className={`carousel-item ${activeSlide === index ? "active" : ""}`}>
              <img src={slide.image} className="auth-carousel-image" alt="Kisan Hub Facility operations" />
              <div className="auth-carousel-shade" />
              <div className="auth-carousel-message">
                <p>KisanDirect AI · Hub Network</p>
                <h1>{slide.title}<br /><span>{slide.accent}</span></h1>
                <small>{slide.caption}</small>
              </div>
            </div>
          ))}
        </div>
        <button
          className="carousel-control-prev"
          type="button"
          onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)}
          aria-label="Previous slide"
        >
          <span className="carousel-control-prev-icon" />
        </button>
        <button
          className="carousel-control-next"
          type="button"
          onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}
          aria-label="Next slide"
        >
          <span className="carousel-control-next-icon" />
        </button>
      </div>

      <header className="auth-reference-header">
        <Link to="/" className="reference-logo" aria-label="KisanDirect AI home">
          <img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
        </Link>
        <label className="reference-language" htmlFor="hub-language">
          <span aria-hidden="true"><i className="bi bi-translate" /></span>
          <select
            id="hub-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Language"
          >
            {Object.entries(languageOptions).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </label>
      </header>

      <form className="auth-reference-card hub-staff-reference-card" onSubmit={submit}>
        <div className="reference-card-logo">
          <img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
        </div>
        <span className="eyebrow">
          <i className="bi bi-building me-1" /> Kisan Hub Operations
        </span>
        <h2>Hub Staff Login</h2>
        <p className="reference-card-subtitle">
          Sign in to manage farmer orders, packaging checklist, and rider handover.
        </p>

        <div className="reference-login-form">
          <label htmlFor="hub-email">Staff Email</label>
          <input
            id="hub-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="staff@kisandirect.ai"
            autoComplete="email"
            required
          />

          <label htmlFor="hub-password">Password</label>
          <div className="password-field">
            <input
              id="hub-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
            </button>
          </div>

          {error && <div className="error" role="alert">{error}</div>}

          <button type="submit" className="reference-submit" disabled={loading}>
            {loading ? "Signing in..." : (
              <>
                <span>Sign in to Hub Console</span>
                <i className="bi bi-arrow-right" aria-hidden="true" />
              </>
            )}
          </button>
        </div>

        <div className="hub-auth-info-card">
          <div className="d-flex align-items-start gap-2">
            <i className="bi bi-shield-check text-success mt-1" />
            <small className="text-muted">
              Hub staff accounts are provisioned and assigned by Facility Managers or Platform Admins.
            </small>
          </div>
        </div>

        <div className="auth-portal-links mt-3">
          <Link className="reference-back-link" to="/login">
            <i className="bi bi-arrow-left me-1" /> Public Login
          </Link>
          <span className="auth-portal-sep">|</span>
          <Link className="reference-back-link" to="/admin/login">
            Admin Login
          </Link>
        </div>
      </form>
    </main>
  );
}
