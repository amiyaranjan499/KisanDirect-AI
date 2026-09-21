import { useEffect, useState } from "react";
import { loginUser, registerUser } from "../services/api";
import { languageOptions } from "../i18n/stateLanguages";

export default function AuthPanel({ onAuthenticated, language, setLanguage, t = (key) => key }) {
  const [role, setRole] = useState("CONSUMER");
  const [phone, setPhone] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slides = [
    {
      image: "/assets/images/image.png",
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
      if (!phone.trim()) {
        setError("Enter your mobile number to continue.");
        return;
      }

      const fallbackEmail = `${phone.replace(/\D/g, "")}@kisan.direct`;
      const password = "Welcome123";
      let token;
      try {
        token = await loginUser({ email: fallbackEmail, password });
      } catch (requestError) {
        if (!/Invalid email or password/i.test(requestError.message)) throw requestError;
        await registerUser({ email: fallbackEmail, password, role });
        token = await loginUser({ email: fallbackEmail, password });
      }
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
        <p className="reference-card-subtitle">Choose your role and continue</p>

        <div className="reference-role-grid">
          <button type="button" className={`reference-role ${role === "CONSUMER" ? "active" : ""}`} onClick={() => setRole("CONSUMER")}>
            <span className="reference-role-icon"><i className="bi bi-basket2-fill" aria-hidden="true"></i></span>
            <strong>Consumer</strong>
            <small>Buy fresh produce</small>
          </button>
          <button type="button" className={`reference-role ${role === "FARMER" ? "active" : ""}`} onClick={() => setRole("FARMER")}>
            <span className="reference-role-icon"><i className="bi bi-person-badge-fill" aria-hidden="true"></i></span>
            <strong>Farmer</strong>
            <small>Sell your crops</small>
          </button>
        </div>

        <form className="reference-login-form" onSubmit={submit}>
          <label htmlFor="reference-phone">Enter your mobile number</label>
          <div className="reference-phone-input">
            <span>🇮🇳 +91</span>
            <input id="reference-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Enter mobile number" autoComplete="tel" />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="reference-submit" disabled={loading}>
            {loading ? "Working..." : <><span>Continue with OTP</span> <i className="bi bi-arrow-right" aria-hidden="true"></i></>}
          </button>
        </form>

        <p className="reference-terms">By continuing, you agree to our <a href="#terms">Terms of Use</a> and <a href="#privacy">Privacy Policy</a>.</p>
        <div className="reference-sustainability"><strong>🌿 Together for a Sustainable Future</strong><small>Better Farmers&nbsp; | &nbsp;Healthier Food&nbsp; | &nbsp;Stronger Communities</small></div>
        <a className="reference-admin-link" href="/admin/login">Admin Login</a>
      </section>
    </main>
  );
}