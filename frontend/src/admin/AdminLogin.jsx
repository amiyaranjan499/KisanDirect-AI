import { useEffect, useState } from "react";
import { loginUser } from "../services/api";
import { languageOptions } from "../i18n/stateLanguages";

export default function AdminLogin({ onAuthenticated, language = "en", setLanguage = () => {} }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    { image: "/assets/images/img.png", title: "Fresh Food", accent: "Brighter Tomorrows", caption: "Direct from farmers to families." },
    { image: "/assets/images/image1.png", title: "Stronger Farmers", accent: "Healthier Families", caption: "Every basket carries a better future." },
    { image: "/assets/images/image2.png", title: "Good Food", accent: "Good Communities", caption: "Fair prices, trusted quality, real impact." },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 5500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const token = await loginUser(form);
      onAuthenticated(token.access_token);
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in as administrator.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-reference-shell admin-auth-shell">
    <div className="auth-reference-carousel" aria-label="KisanDirect AI agricultural stories">
      <div className="carousel-indicators">{slides.map((slide, index) => <button key={slide.title} type="button" className={activeSlide === index ? "active" : ""} aria-label={`Show ${slide.title}`} onClick={() => setActiveSlide(index)} />)}</div>
      <div className="carousel-inner">{slides.map((slide, index) => <div key={slide.image} className={`carousel-item ${activeSlide === index ? "active" : ""}`}><img src={slide.image} className="auth-carousel-image" alt="Farmer sharing fresh vegetables with a family" /><div className="auth-carousel-shade" /><div className="auth-carousel-message"><p>KisanDirect AI</p><h1>{slide.title}<br /><span>{slide.accent}</span></h1><small>{slide.caption}</small></div></div>)}</div>
      <button className="carousel-control-prev" type="button" onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)} aria-label="Previous farmer image"><span className="carousel-control-prev-icon" /></button>
      <button className="carousel-control-next" type="button" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)} aria-label="Next farmer image"><span className="carousel-control-next-icon" /></button>
    </div>
    <header className="auth-reference-header"><a href="/" className="reference-logo" aria-label="KisanDirect AI home"><img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" /></a><label className="reference-language" htmlFor="admin-language"><span aria-hidden="true"><i className="bi bi-translate" /></span><select id="admin-language" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Language">{Object.entries(languageOptions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label></header>
    <form className="auth-reference-card admin-reference-card" onSubmit={submit}>
      <div className="reference-card-logo"><img src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" /></div>
      <span className="eyebrow">KisanDirect AI</span><h2>Admin Login</h2><p className="reference-card-subtitle">Access platform operations and management tools.</p>
      <div className="reference-login-form"><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><label htmlFor="admin-password">Password</label><div className="password-field"><input id="admin-password" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div>{error && <div className="error">{error}</div>}<button className="reference-submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button></div>
      <a className="admin-back-link" href="/">Back to public login</a>
    </form>
  </main>;
}
