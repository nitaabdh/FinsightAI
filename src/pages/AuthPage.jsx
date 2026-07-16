import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function AuthPage() {
  const { mode } = useParams();
  const { register, login, checkEmailExists, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]         = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  // Show/hide password states
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Lupa password
  const [forgotMode, setForgotMode]   = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep]   = useState(1); // 1=email, 2=new password
  const [newPass, setNewPass]         = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  const isUMKM   = mode === "umkm";
  const accent   = isUMKM ? "umkm" : "personal";
  const modeLabel = isUMKM ? "UMKM" : "Pribadi";
  const modeEmoji = isUMKM ? "" : "";

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    if (tab === "register") {
      if (!form.name || !form.email || !form.password || !form.confirmPassword) {
        setError("Semua field wajib diisi."); setLoading(false); return;
      }
      if (form.password !== form.confirmPassword) {
        setError("Password tidak cocok."); setLoading(false); return;
      }
      if (form.password.length < 6) {
        setError("Password minimal 6 karakter."); setLoading(false); return;
      }
      const result = await register({ name: form.name, email: form.email, password: form.password, mode });
      if (!result.success) { setError(result.message); setLoading(false); return; }
    } else {
      if (!form.email || !form.password) {
        setError("Email dan password wajib diisi."); setLoading(false); return;
      }
      const result = await login({ email: form.email, password: form.password, mode });
      if (!result.success) { setError(result.message); setLoading(false); return; }
    }

    navigate(`/dashboard/${mode}`, { replace: true });
    setLoading(false);
  };

  // ── Lupa Password Logic ───────────────────
  const handleForgotStep1 = async () => {
    if (!forgotEmail) { setError("Masukkan email kamu."); return; }
    setError("");
    setLoading(true);
    const result = await checkEmailExists(forgotEmail.trim(), mode);
    setLoading(false);
    if (!result.success) { setError(result.message); return; }
    setForgotStep(2);
  };

 const handleForgotStep2 = async () => {
  if (!newPass || newPass.length < 6) { setError("Password minimal 6 karakter."); return; }
  if (newPass !== newPassConfirm) { setError("Password tidak cocok."); return; }
  const result = await resetPassword(forgotEmail, mode, newPass);
  if (!result.success) { setError(result.message); return; }
  setSuccess("Password berhasil diubah! Silakan login.");
  setForgotMode(false);
  setForgotStep(1);
  setForgotEmail("");
  setNewPass("");
  setNewPassConfirm("");
  setTab("login");
  setError("");
};

  // ── Render Lupa Password ──────────────────
  if (forgotMode) {
    return (
      <div className="auth">
        <div className="auth__bg">
          <div className={"auth__orb auth__orb--" + accent} />
          <div className="auth__grid" />
        </div>
        <button className="auth__back" onClick={() => { setForgotMode(false); setForgotStep(1); setError(""); }}>
          ← Kembali
        </button>
        <div className="auth__card animate-fadeUp">
          <div className="auth__header">
            <div className={"auth__mode-badge auth__mode-badge--" + accent}>{modeEmoji} Mode {modeLabel}</div>
            <div className="auth__logo"><span className="auth__logo-icon">◈</span><span>FinSight AI</span></div>
            <p className="auth__tagline">Reset Password</p>
          </div>

          {/* Step indicator */}
          <div className="auth__steps">
            <div className={"auth__step " + (forgotStep >= 1 ? "auth__step--active auth__step--" + accent : "")}>1</div>
            <div className="auth__step-line" />
            <div className={"auth__step " + (forgotStep >= 2 ? "auth__step--active auth__step--" + accent : "")}>2</div>
          </div>

          <div className="auth__form">
            {forgotStep === 1 ? (
              <>
                <p className="auth__forgot-hint">Masukkan email yang terdaftar di Mode {modeLabel}.</p>
                <div className="auth__field">
                  <label className="auth__label">Email</label>
                  <input
                    className={"auth__input auth__input--" + accent}
                    type="email"
                    placeholder="email@kamu.com"
                    value={forgotEmail}
                    onChange={(e) => { setForgotEmail(e.target.value); setError(""); }}
                  />
                </div>
                {error && <div className="auth__error animate-fadeIn">{error}</div>}
                <button className={"auth__submit auth__submit--" + accent} onClick={handleForgotStep1} disabled={loading}>
                  {loading ? "Mengecek..." : "Cek Email →"}
                </button>
              </>
            ) : (
              <>
                <p className="auth__forgot-hint">Buat password baru untuk <strong>{forgotEmail}</strong>.</p>
                <div className="auth__field">
                  <label className="auth__label">Password Baru</label>
                  <div className="auth__input-wrap">
                    <input
                      className={"auth__input auth__input--" + accent}
                      type={showPass ? "text" : "password"}
                      placeholder="Minimal 6 karakter"
                      value={newPass}
                      onChange={(e) => { setNewPass(e.target.value); setError(""); }}
                    />
                    <button className="auth__eye" onClick={() => setShowPass((p) => !p)} type="button">
                      {showPass ? "" : ""}
                    </button>
                  </div>
                </div>
                <div className="auth__field">
                  <label className="auth__label">Konfirmasi Password Baru</label>
                  <div className="auth__input-wrap">
                    <input
                      className={"auth__input auth__input--" + accent}
                      type={showConfirm ? "text" : "password"}
                      placeholder="Ulangi password baru"
                      value={newPassConfirm}
                      onChange={(e) => { setNewPassConfirm(e.target.value); setError(""); }}
                    />
                    <button className="auth__eye" onClick={() => setShowConfirm((p) => !p)} type="button">
                      {showConfirm ? "" : ""}
                    </button>
                  </div>
                </div>
                {error && <div className="auth__error animate-fadeIn">{error}</div>}
                <button className={"auth__submit auth__submit--" + accent} onClick={handleForgotStep2}>
                  Simpan Password Baru
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render Login / Register ───────────────
  return (
    <div className="auth">
      <div className="auth__bg">
        <div className={"auth__orb auth__orb--" + accent} />
        <div className="auth__grid" />
      </div>
      <button className="auth__back" onClick={() => navigate("/")}>← Kembali</button>

      <div className="auth__card animate-fadeUp">
        <div className="auth__header">
          <div className={"auth__mode-badge auth__mode-badge--" + accent}>{modeEmoji} Mode {modeLabel}</div>
          <div className="auth__logo"><span className="auth__logo-icon">◈</span><span>FinSight AI</span></div>
          <p className="auth__tagline">
            {isUMKM ? "Kelola keuangan usahamu dengan cerdas" : "Atur keuangan pribadimu bersama AI"}
          </p>
        </div>

        <div className="auth__tabs">
          <button
            className={`auth__tab ${tab === "login" ? "auth__tab--active auth__tab--" + accent : ""}`}
            onClick={() => { setTab("login"); setError(""); setSuccess(""); }}
          >Masuk</button>
          <button
            className={`auth__tab ${tab === "register" ? "auth__tab--active auth__tab--" + accent : ""}`}
            onClick={() => { setTab("register"); setError(""); setSuccess(""); }}
          >Daftar</button>
        </div>

        <div className="auth__form">
          {tab === "register" && (
            <div className="auth__field animate-fadeIn">
              <label className="auth__label">Nama Lengkap</label>
              <input className={"auth__input auth__input--" + accent} type="text" name="name" placeholder="Contoh: Budi Santoso" value={form.name} onChange={handleChange} />
            </div>
          )}

          <div className="auth__field">
            <label className="auth__label">Email</label>
            <input className={"auth__input auth__input--" + accent} type="email" name="email" placeholder="email@kamu.com" value={form.email} onChange={handleChange} />
          </div>

          <div className="auth__field">
            <label className="auth__label">Password</label>
            <div className="auth__input-wrap">
              <input
                className={"auth__input auth__input--" + accent}
                type={showPass ? "text" : "password"}
                name="password"
                placeholder="Minimal 6 karakter"
                value={form.password}
                onChange={handleChange}
              />
              <button className="auth__eye" onClick={() => setShowPass((p) => !p)} type="button">
                {showPass ? "" : ""}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <div className="auth__field animate-fadeIn">
              <label className="auth__label">Konfirmasi Password</label>
              <div className="auth__input-wrap">
                <input
                  className={"auth__input auth__input--" + accent}
                  type={showConfirm ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Ulangi password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                />
                <button className="auth__eye" onClick={() => setShowConfirm((p) => !p)} type="button">
                  {showConfirm ? "" : ""}
                </button>
              </div>
            </div>
          )}

          {error   && <div className="auth__error animate-fadeIn">{error}</div>}
          {success && <div className="auth__success animate-fadeIn">{success}</div>}

          <button className={"auth__submit auth__submit--" + accent} onClick={handleSubmit} disabled={loading}>
            {loading ? "Memproses..." : tab === "login" ? "Masuk ke Dashboard" : "Buat Akun"}
          </button>

          {tab === "login" && (
            <button className={"auth__forgot auth__forgot--" + accent} onClick={() => { setForgotMode(true); setError(""); }}>
              Lupa password?
            </button>
          )}
        </div>

        <p className="auth__footer">
          {tab === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
          <button className={"auth__switch auth__switch--" + accent} onClick={() => { setTab(tab === "login" ? "register" : "login"); setError(""); setSuccess(""); }}>
            {tab === "login" ? "Daftar sekarang" : "Masuk"}
          </button>
        </p>
      </div>
    </div>
  );
}
