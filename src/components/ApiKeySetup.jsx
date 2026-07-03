import { useState } from "react";
import "./ApiKeySetup.css";

export default function ApiKeySetup({ onSave, accent }) {
  const [key, setKey]     = useState("");
  const [show, setShow]   = useState(false);
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!key.trim()) { setError("Masukkan API key terlebih dahulu."); return; }
    if (!key.startsWith("gsk_")) { setError("Groq API key harus diawali dengan 'gsk_'"); return; }
    onSave(key.trim());
  };

  return (
    <div className="apikey">
      <div className="apikey__icon">🔑</div>
      <h3 className="apikey__title">Masukkan Groq API Key</h3>
      <p className="apikey__desc">
        AI Agent membutuhkan Groq API Key untuk berjalan.<br />
        Key kamu disimpan aman di server (bukan cuma di browser), jadi otomatis
        tersedia walau kamu login dari HP atau laptop lain. Key ini privat —
        cuma bisa dipakai akunmu sendiri dan tidak pernah ditampilkan lagi
        setelah disimpan.
      </p>

      <div className="apikey__steps">
        <p>Cara mendapatkan key gratis:</p>
        <ol>
          <li>Buka <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a></li>
          <li>Daftar / Login</li>
          <li>Klik <strong>API Keys</strong> → <strong>Create API Key</strong></li>
          <li>Copy dan paste di bawah ini</li>
        </ol>
      </div>

      <div className="apikey__input-wrap">
        <input
          className={"apikey__input apikey__input--" + accent}
          type={show ? "text" : "password"}
          placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(""); }}
        />
        <button className="apikey__toggle" onClick={() => setShow((p) => !p)}>
          {show ? "🙈" : "👁️"}
        </button>
      </div>

      {error && <p className="apikey__error">⚠️ {error}</p>}

      <button className={"apikey__btn apikey__btn--" + accent} onClick={handleSave}>
        Simpan & Mulai Chat
      </button>
    </div>
  );
}
