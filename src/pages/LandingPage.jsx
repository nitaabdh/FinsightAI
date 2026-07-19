import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useEffect } from "react";
import "./LandingPage.css";

import { Store, User, Moon, Sun } from "lucide-react";
export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Kalau sudah login, redirect langsung ke dashboard
  useEffect(() => {
    if (user) navigate(`/dashboard/${user.mode}`, { replace: true });
  }, [user, navigate]);

  return (
    <div className="landing">
      {/* Background decorations */}
      <div className="landing__bg">
        <div className="landing__orb landing__orb--1" />
        <div className="landing__orb landing__orb--2" />
        <div className="landing__grid" />
      </div>

      {/* Navbar */}
      <nav className="landing__nav">
        <div className="landing__logo">
          <span className="landing__logo-icon">◈</span>
          <span>FinSight</span>
          <span className="landing__logo-ai">AI</span>
        </div>

        <button
          className="landing__theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Ganti ke Light Mode" : "Ganti ke Dark Mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </nav>

      {/* Hero */}
      <main className="landing__hero">
        <div className="landing__badge animate-fadeUp">
          <span className="landing__badge-dot" />
          Didukung Claude AI · Gratis
        </div>

        <h1 className="landing__title animate-fadeUp" style={{ animationDelay: "0.1s" }}>
          Keuangan Lebih Cerdas<br />
          <span className="landing__title-gradient">Bersama AI Agent</span>
        </h1>

        <p className="landing__subtitle animate-fadeUp" style={{ animationDelay: "0.2s" }}>
          Platform manajemen keuangan dengan AI yang memahami konteksmu —
          untuk usaha UMKM maupun keuangan pribadimu.
        </p>

        {/* Mode Selection Cards */}
        <div className="landing__modes animate-fadeUp" style={{ animationDelay: "0.3s" }}>
          <button
            className="landing__mode-card landing__mode-card--umkm"
            onClick={() => navigate("/auth/umkm")}
          >
            <div className="landing__mode-icon"><Store size={20} /></div>
            <div className="landing__mode-content">
              <h3>Mode UMKM</h3>
              <p>Catat omzet, analisa laba rugi, dan dapatkan saran bisnis dari AI</p>
            </div>
            <div className="landing__mode-arrow">→</div>
          </button>

          <button
            className="landing__mode-card landing__mode-card--personal"
            onClick={() => navigate("/auth/personal")}
          >
            <div className="landing__mode-icon"><User size={20} /></div>
            <div className="landing__mode-content">
              <h3>Mode Pribadi</h3>
              <p>Kelola budget, tabungan, dan dapatkan saran keuangan personal dari AI</p>
            </div>
            <div className="landing__mode-arrow">→</div>
          </button>
        </div>

        {/* Feature Pills */}
        <div className="landing__features animate-fadeUp" style={{ animationDelay: "0.4s" }}>
          {["AI Agent Pintar", "Function Calling", "Telegram Bot", "Gratis 100%"].map((f) => (
            <span key={f} className="landing__feature-pill">{f}</span>
          ))}
        </div>
      </main>
    </div>
  );
}
