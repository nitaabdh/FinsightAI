import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import "./AuthPage.css";

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  return res.json();
}

// Login Mode Kasir — email akun UMKM + PIN 6 digit (di-setup owner lewat Profil).
// Sengaja pakai loginKasir() yang terpisah dari login() biasa (lihat AuthContext.jsx).
export default function KasirLoginPage() {
  const navigate = useNavigate();
  const { loginKasir } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !/^\d{6}$/.test(pin)) {
      setError("Isi email dan PIN 6 digit dengan benar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch("/api/auth/kasir-login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), pin }),
      });
      if (!r.success) { setError(r.message || "Login gagal."); return; }
      loginKasir(r.token);
      navigate("/dashboard/umkm/kasir", { replace: true });
    } catch {
      setError("Gagal menghubungi server, coba lagi ya.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__bg">
        <div className="auth__orb auth__orb--umkm" />
        <div className="auth__grid" />
      </div>

      <button className="auth__back" onClick={() => navigate("/")}>
        <ArrowLeft size={16} /> Kembali
      </button>

      <div className="auth__card">
        <div className="auth__header">
          <div className="auth__mode-badge auth__mode-badge--umkm">
            <ShoppingCart size={14} /> Mode Kasir
          </div>
          <div className="auth__logo">
            <span className="auth__logo-icon">◈</span> FinSight
          </div>
          <p className="auth__tagline">Login pakai email &amp; PIN yang di-setup owner</p>
        </div>

        <form className="auth__form" onSubmit={handleSubmit}>
          <div className="auth__field">
            <label className="auth__label">Email Akun UMKM</label>
            <input className="auth__input auth__input--umkm" type="email" placeholder="email@toko.com"
              value={email} onChange={e => { setEmail(e.target.value); setError(""); }} autoComplete="username" />
          </div>
          <div className="auth__field">
            <label className="auth__label">PIN (6 digit)</label>
            <input className="auth__input auth__input--umkm" type="password" inputMode="numeric" maxLength={6}
              placeholder="••••••" value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
              autoComplete="off" />
          </div>
          {error && <p className="auth__error">{error}</p>}
          <button className="auth__submit auth__submit--umkm" type="submit" disabled={loading}>
            {loading ? "Masuk..." : "Masuk sebagai Kasir"}
          </button>
        </form>

        <p className="auth__forgot-hint" style={{ marginTop: "1rem" }}>
          Belum punya PIN? Minta owner buat setup dulu lewat halaman Profil.
        </p>
      </div>
    </div>
  );
}
