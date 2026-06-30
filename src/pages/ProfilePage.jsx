import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
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

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function ProfilePage() {
  const { user } = useAuth();
  const mode   = user?.mode;
  const accent = mode === "umkm" ? "umkm" : "personal";

  const [form, setForm] = useState({ displayName: "", profesi: "", deskripsi: "", pendapatan: "", tanggungan: "", tujuan: "" });
  const [photoUrl, setPhotoUrl]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError]   = useState("");
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/api/profile`).then(r => {
      if (r.success && r.data) {
        setForm({
          displayName: r.data.display_name || user.name || "",
          profesi:     r.data.profesi      || "",
          deskripsi:   r.data.deskripsi    || "",
          pendapatan:  r.data.pendapatan   || "",
          tanggungan:  r.data.tanggungan   || "",
          tujuan:      r.data.tujuan       || "",
        });
        setPhotoUrl(r.data.avatar_url || null);
      } else {
        setForm(p => ({ ...p, displayName: user.name || "" }));
      }
    }).finally(() => setLoading(false));
  }, [user]);

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setSaved(false);
  };

  // ── Upload Foto ke Supabase Storage ──────────────
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Ukuran foto maksimal 2MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      // Compress dulu pakai canvas sebelum upload
      const compressedBlob = await compressImage(file, 300);
      const formData = new FormData();
      formData.append("file", compressedBlob, "avatar.jpg");

      const token = localStorage.getItem("finsight_token");
      const res = await fetch("/api/profile?action=upload-avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const r = await res.json();
      if (r.success) {
        setPhotoUrl(r.data.avatar_url);
      } else {
        setPhotoError(r.message || "Gagal upload foto.");
      }
    } catch (err) {
      setPhotoError("Terjadi kesalahan saat upload foto.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  function compressImage(file, maxSize) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ratio  = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width  = img.width  * ratio;
          canvas.height = img.height * ratio;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const handleDeletePhoto = async () => {
    const r = await apiFetch(`/api/profile?action=delete-avatar`, { method: "POST" });
    if (r.success) {
      setPhotoUrl(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Save Profil ke Supabase ──────────────────────
  const handleSave = async () => {
    setSaving(true);
    const r = await apiFetch(`/api/profile`, {
      method: "PUT",
      body: JSON.stringify({
        display_name: form.displayName,
        profesi:      form.profesi,
        deskripsi:    form.deskripsi,
        pendapatan:   form.pendapatan,
        tanggungan:   form.tanggungan,
        tujuan:       form.tujuan,
      }),
    });
    setSaving(false);
    if (r.success) {
      setSaved(true);
      setEditingName(false);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const displayName = form.displayName || user?.name || "User";
  const initial      = displayName.charAt(0).toUpperCase();

  return (
    <DashboardLayout>
      <div className="profilepage">
        <PageHeader
          title="Profil Saya"
          subtitle="Kelola informasi & preferensi akunmu"
        />

        {loading ? (
          <div className="profilepage__skeleton">
            <div className="skel" style={{ width: "100px", height: "100px", borderRadius: "50%" }} />
            <div className="skel" style={{ width: "160px", height: "20px", borderRadius: "6px", marginTop: "0.75rem" }} />
            <div className="skel" style={{ width: "100%", height: "200px", borderRadius: "12px", marginTop: "1.5rem" }} />
          </div>
        ) : (<>

        {/* ── Header Profil ── */}
        <div className="profilepage__header">
          <div className="profilepage__photo-wrap">
            <div className={"profilepage__avatar profilepage__avatar--" + accent}>
              {uploadingPhoto ? (
                <span className="profilepage__avatar-loading">⏳</span>
              ) : photoUrl ? (
                <img src={photoUrl} alt="Foto profil" className="profilepage__avatar-img" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="profilepage__photo-actions">
              <button
                className={"profilepage__photo-btn profilepage__photo-btn--" + accent}
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
              >
                📷 {photoUrl ? "Ganti Foto" : "Upload Foto"}
              </button>
              {photoUrl && (
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
                <button className="profilepage__name-edit-btn" onClick={() => setEditingName(true)} title="Edit nama">
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

        {/* Banner info — gaya sama seperti aipage__context */}
        <div className="profilepage__banner">
          <span className="profilepage__banner-icon">🤖</span>
          <p>
            Isi profil ini agar AI Agent bisa memberikan saran yang lebih <strong>personal dan relevan</strong>.
            Foto & nama akan muncul di chat AI Agent.
          </p>
        </div>

        {/* Form */}
        <div className="profilepage__form">

          <div className="profilepage__field">
            <label className="profilepage__label">
              💼 Profesi / Status
              <span className="profilepage__hint">Pilih yang paling sesuai</span>
            </label>
            <div className="profilepage__chips">
              {(PROFESI_OPTIONS[mode] || PROFESI_OPTIONS.personal).map(p => (
                <button
                  key={p}
                  className={"profilepage__chip " + (form.profesi === p ? "profilepage__chip--active profilepage__chip--" + accent : "")}
                  onClick={() => { setForm(prev => ({ ...prev, profesi: p })); setSaved(false); }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

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

          <div className="profilepage__field">
            <label className="profilepage__label">
              💰 {mode === "umkm" ? "Kisaran Omzet per Bulan" : "Kisaran Pendapatan per Bulan"}
            </label>
            <select className={"profilepage__select profilepage__select--" + accent} name="pendapatan" value={form.pendapatan} onChange={handleChange}>
              <option value="">-- Pilih kisaran --</option>
              {PENDAPATAN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="profilepage__field">
            <label className="profilepage__label">👨‍👩‍👧 Tanggungan</label>
            <select className={"profilepage__select profilepage__select--" + accent} name="tanggungan" value={form.tanggungan} onChange={handleChange}>
              <option value="">-- Pilih --</option>
              {TANGGUNGAN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

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

          <div className="profilepage__field">
            <label className="profilepage__label">
              🎨 Tema Tampilan
              <span className="profilepage__hint">Pilih sesuai selera</span>
            </label>
            <ThemeToggle accent={accent} />
          </div>

          <div className="profilepage__actions">
            <button className={"profilepage__save profilepage__save--" + accent} onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : saved ? "✅ Tersimpan!" : "Simpan Profil"}
            </button>
            {saved && (
              <p className="profilepage__saved-note animate-fadeIn">
                AI Agent sekarang akan memberikan saran yang lebih personal untukmu 🎉
              </p>
            )}
          </div>
        </div>
        </>)}
      </div>
    </DashboardLayout>
  );
}
