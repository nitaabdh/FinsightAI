import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { getProfile, saveProfile, getPhoto, savePhoto, deletePhoto } from "../utils/profile";
import ThemeToggle from "../components/ThemeToggle";
import "./ProfilePage.css";

const PROFESI_OPTIONS = {
  personal: ["Mahasiswa","Mahasiswa Rantau / Ngekos","Fresh Graduate","Karyawan Swasta","PNS / ASN","Freelancer","Ibu Rumah Tangga","Lainnya"],
  umkm:     ["Pemilik Warung / Toko","Pedagang Pasar","Penjual Online","Usaha Kuliner","Usaha Jasa","Distributor / Reseller","Lainnya"],
};

const PENDAPATAN_OPTIONS = [
  "Di bawah Rp 500 ribu/bulan","Rp 500 ribu – Rp 1 juta/bulan","Rp 1 juta – Rp 3 juta/bulan",
  "Rp 3 juta – Rp 5 juta/bulan","Rp 5 juta – Rp 10 juta/bulan","Di atas Rp 10 juta/bulan",
];

const TANGGUNGAN_OPTIONS = [
  "Tidak ada (hanya untuk diri sendiri)","1 orang","2-3 orang","4-5 orang","Lebih dari 5 orang",
];

export default function ProfilePage() {
  const { user } = useAuth();
  const mode   = user?.mode;
  const accent = mode === "umkm" ? "umkm" : "personal";

  const [form, setForm]           = useState({ displayName: "", profesi: "", deskripsi: "", pendapatan: "", tanggungan: "", tujuan: "" });
  const [photo, setPhoto]         = useState(null);
  const [saved, setSaved]         = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const profile = getProfile(user.id);
    if (profile) {
      setForm({
        displayName: profile.displayName || user.name || "",
        profesi:     profile.profesi     || "",
        deskripsi:   profile.deskripsi   || "",
        pendapatan:  profile.pendapatan  || "",
        tanggungan:  profile.tanggungan  || "",
        tujuan:      profile.tujuan      || "",
      });
    } else {
      setForm((p) => ({ ...p, displayName: user.name || "" }));
    }
    setPhoto(getPhoto(user.id));
  }, [user]);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setSaved(false);
  };

  // ── Upload Foto ───────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Ukuran foto maksimal 2MB."); return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Compress/resize pakai canvas
      const img = new Image();
      img.onload = () => {
        const canvas  = document.createElement("canvas");
        const maxSize = 200;
        const ratio   = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width  = img.width  * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        const ok = savePhoto(user.id, compressed);
        if (!ok) { setPhotoError("Penyimpanan penuh. Coba hapus foto dulu."); return; }
        setPhoto(compressed);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = () => {
    deletePhoto(user.id);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Save Profil ───────────────────────────────
  const handleSave = () => {
    saveProfile(user.id, form);
    setSaved(true);
    setEditingName(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const displayName = form.displayName || user?.name || "User";
  const initial     = displayName.charAt(0).toUpperCase();

  return (
    <DashboardLayout>
      <div className="profilepage">

        {/* ── Header Profil ── */}
        <div className="profilepage__header">
          {/* Foto + upload */}
          <div className="profilepage__photo-wrap">
            <div className={"profilepage__avatar profilepage__avatar--" + accent}>
              {photo
                ? <img src={photo} alt="Foto profil" className="profilepage__avatar-img" />
                : <span>{initial}</span>
              }
            </div>
            <div className="profilepage__photo-actions">
              <button
                className={"profilepage__photo-btn profilepage__photo-btn--" + accent}
                onClick={() => fileRef.current?.click()}
              >
                📷 {photo ? "Ganti Foto" : "Upload Foto"}
              </button>
              {photo && (
                <button className="profilepage__photo-delete" onClick={handleDeletePhoto}>
                  🗑 Hapus
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePhotoChange}
              />
              {photoError && <p className="profilepage__photo-error">⚠️ {photoError}</p>}
              <p className="profilepage__photo-hint">JPG/PNG, maks 2MB</p>
            </div>
          </div>

          {/* Nama yang bisa diedit */}
          <div className="profilepage__name-wrap">
            {editingName ? (
              <div className="profilepage__name-edit">
                <input
                  className={"profilepage__name-input profilepage__name-input--" + accent}
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                  placeholder="Nama tampilan"
                  autoFocus
                />
                <button
                  className={"profilepage__name-save profilepage__name-save--" + accent}
                  onClick={() => setEditingName(false)}
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="profilepage__name-display">
                <h1 className="profilepage__name">{displayName}</h1>
                <button
                  className="profilepage__name-edit-btn"
                  onClick={() => setEditingName(true)}
                  title="Edit nama"
                >
                  ✏️
                </button>
              </div>
            )}
            <p className="profilepage__email">{user?.email}</p>
            <span className={"profilepage__mode profilepage__mode--" + accent}>
              {mode === "umkm" ? "🏪 Mode UMKM" : "👤 Mode Pribadi"}
            </span>
          </div>
        </div>

        {/* Banner info */}
        <div className="profilepage__banner">
          <span>🤖</span>
          <p>
            Isi profil ini agar AI Agent bisa memberikan saran yang lebih <strong>personal dan relevan</strong>.
            Foto & nama akan muncul di chat AI Agent.
          </p>
        </div>

        {/* Form */}
        <div className="profilepage__form">

          {/* Profesi chips */}
          <div className="profilepage__field">
            <label className="profilepage__label">
              💼 Profesi / Status
              <span className="profilepage__hint">Pilih yang paling sesuai</span>
            </label>
            <div className="profilepage__chips">
              {(PROFESI_OPTIONS[mode] || PROFESI_OPTIONS.personal).map((p) => (
                <button
                  key={p}
                  className={"profilepage__chip " + (form.profesi === p ? "profilepage__chip--active profilepage__chip--" + accent : "")}
                  onClick={() => { setForm((prev) => ({ ...prev, profesi: p })); setSaved(false); }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Deskripsi */}
          <div className="profilepage__field">
            <label className="profilepage__label">
              📝 Ceritakan situasimu
              <span className="profilepage__hint">Semakin detail, semakin relevan saran AI-nya</span>
            </label>
            <textarea
              className={"profilepage__textarea profilepage__textarea--" + accent}
              name="deskripsi"
              placeholder={mode === "umkm"
                ? "Contoh: Saya punya warung makan di Surabaya, buka dari jam 7 pagi, pelanggan rata-rata mahasiswa..."
                : "Contoh: Saya mahasiswa semester 5 ngekos di Surabaya, uang bulanan Rp 1,5 juta dari orang tua..."}
              value={form.deskripsi}
              onChange={handleChange}
              rows={4}
            />
          </div>

          {/* Pendapatan */}
          <div className="profilepage__field">
            <label className="profilepage__label">
              💰 {mode === "umkm" ? "Kisaran Omzet per Bulan" : "Kisaran Pendapatan per Bulan"}
            </label>
            <select className={"profilepage__select profilepage__select--" + accent} name="pendapatan" value={form.pendapatan} onChange={handleChange}>
              <option value="">-- Pilih kisaran --</option>
              {PENDAPATAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Tanggungan */}
          <div className="profilepage__field">
            <label className="profilepage__label">👨‍👩‍👧 Tanggungan</label>
            <select className={"profilepage__select profilepage__select--" + accent} name="tanggungan" value={form.tanggungan} onChange={handleChange}>
              <option value="">-- Pilih --</option>
              {TANGGUNGAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Tujuan */}
          <div className="profilepage__field">
            <label className="profilepage__label">🎯 Tujuan Keuangan Utama</label>
            <input
              className={"profilepage__input profilepage__input--" + accent}
              type="text"
              name="tujuan"
              placeholder={mode === "umkm"
                ? "Contoh: Buka cabang baru, lunasi hutang modal..."
                : "Contoh: Nabung buat laptop, punya dana darurat..."}
              value={form.tujuan}
              onChange={handleChange}
            />
          </div>

          {/* Tema */}
          <div className="profilepage__field">
            <label className="profilepage__label">
              🎨 Tema Tampilan
              <span className="profilepage__hint">Pilih sesuai selera</span>
            </label>
            <ThemeToggle accent={accent} />
          </div>

          {/* Save */}
          <div className="profilepage__actions">
            <button className={"profilepage__save profilepage__save--" + accent} onClick={handleSave}>
              {saved ? "✅ Tersimpan!" : "Simpan Profil"}
            </button>
            {saved && (
              <p className="profilepage__saved-note animate-fadeIn">
                AI Agent sekarang akan memberikan saran yang lebih personal untukmu 🎉
              </p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
