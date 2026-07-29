import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId, formatRupiah, biayaItem, totalBiayaBahan, validUsageUnits,
  biayaOpsItem, totalBiayaOperasional, colorFromName,
} from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import CountUp from "./CountUp";
import "./KalkulatorHarga.css";

import { X } from "lucide-react";
const TIPE_PRODUK_OPTIONS = [
  { value: "racikan",       label: "Racikan Sendiri",  desc: "Dibikin dari resep bahan baku" },
  { value: "jadi_stok",     label: "Beli Jadi (Nyetok)", desc: "Beli dari supplier, nyetok fisik" },
  { value: "jadi_dropship", label: "Dropship",          desc: "Nggak nyetok, modal dicatet pas jual" },
];
const emptyForm = {
  nama: "", items: [],
  biayaOperasionalItems: [],
  targetUntung: "", targetUntungPct: "",
  tipeProduk: "racikan", pakaiStok: false, hargaModalManual: "",
  tampilDiKasir: true,
};

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function KalkulatorHarga({ editRequestProduk, onEditRequestConsumed }) {
  const { user } = useAuth();
  const formRef = useRef(null);

  const [bahanList,  setBahanList]  = useState([]);
  const [form,    setForm]    = useState(emptyForm);
  const [editId,  setEditId]  = useState(null);
  const [error,   setError]   = useState("");
  const [selBahan,  setSelBahan]  = useState("");
  const [selJumlah, setSelJumlah] = useState("");
  const [selSatuan, setSelSatuan] = useState("");

  // Dropdown tambah biaya operasional ke resep produk (master datanya dikelola di tab Biaya Operasional)
  const [selOps,       setSelOps]       = useState("");
  const [selOpsJumlah, setSelOpsJumlah] = useState("1");
  const [opsList,       setOpsList]       = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [pilihTipeDulu, setPilihTipeDulu] = useState(true); // true = lagi milih tipe produk dulu (cuma buat produk BARU)

  // ── Foto produk ──────────────────────────────────────────────────────────
  const [fotoFile,      setFotoFile]      = useState(null); // File yang lagi nunggu di-upload (belum ke-submit)
  const [fotoPreview,   setFotoPreview]   = useState(null); // URL buat preview (bisa foto lama, bisa hasil pilih baru)
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoError,     setFotoError]     = useState("");
  const fotoInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
    apiFetch(`/api/umkm?table=biaya_operasional`).then(r => { if (r.success) setOpsList(r.data); });
  }, [user]);

  useEffect(() => {
    const refresh = () => {
      if (user) apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
    };
    window.addEventListener("bahanBakuUpdated", refresh);
    return () => window.removeEventListener("bahanBakuUpdated", refresh);
  }, [user]);

  useEffect(() => {
    const refresh = () => {
      if (user) apiFetch(`/api/umkm?table=biaya_operasional`).then(r => { if (r.success) setOpsList(r.data); });
    };
    window.addEventListener("biayaOperasionalUpdated", refresh);
    return () => window.removeEventListener("biayaOperasionalUpdated", refresh);
  }, [user]);

  // Dipicu dari tab "Daftar Produk" pas tombol Edit produk ditekan — buka form
  // ini dan langsung isi datanya, sekalian pindah tab (itu diatur di ProduksiPage).
  useEffect(() => {
    if (editRequestProduk) {
      openEdit(editRequestProduk);
      onEditRequestConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequestProduk]);

  const bahanMap = Object.fromEntries(bahanList.map(b => [b.id, b]));
  const opsMap   = Object.fromEntries(opsList.map(o => [o.id, o]));

  // ── Kalkulasi biaya ────────────────────────────────────────────────────────
  // "racikan" -> biaya dihitung dari resep bahan baku + biaya operasional (kayak sebelumnya).
  // "jadi_stok"/"jadi_dropship" -> nggak ada resep, biaya modal diisi manual per unit.
  const isRacikan   = form.tipeProduk === "racikan";
  const biayaBahan  = isRacikan ? totalBiayaBahan(form.items, bahanMap) : (+form.hargaModalManual || 0);
  const biayaOpsNum = isRacikan ? totalBiayaOperasional(form.biayaOperasionalItems, opsMap) : 0;
  const targetNum   = +form.targetUntung || 0;
  const totalBiaya  = biayaBahan + biayaOpsNum;
  const hargaJual   = totalBiaya + targetNum;

  const targetPct   = totalBiaya > 0 ? ((targetNum / totalBiaya) * 100).toFixed(1) : "";

  // ── Handler field Rp/% target untung ──────────────────────────────────────
  const handleTargetRp = (val) => {
    const rp  = +val || 0;
    const pct = totalBiaya > 0 ? ((rp / totalBiaya) * 100).toFixed(1) : "";
    setForm(p => ({ ...p, targetUntung: val, targetUntungPct: pct }));
    setError("");
  };
  const handleTargetPct = (val) => {
    const pct = +val || 0;
    const rp  = Math.round((pct / 100) * totalBiaya);
    setForm(p => ({ ...p, targetUntungPct: val, targetUntung: rp > 0 ? String(rp) : "" }));
    setError("");
  };

  const resetForm = () => {
    setForm(emptyForm); setEditId(null); setError(""); setPilihTipeDulu(true);
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setSelOps(""); setSelOpsJumlah("1");
    setShowForm(false);
    setFotoFile(null); setFotoPreview(null); setFotoError("");
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  };

  const openEdit = (p) => {
    const tipe     = p.tipeProduk || "racikan";
    const biayaB   = tipe === "racikan" ? totalBiayaBahan(p.items, bahanMap) : (p.hargaModal || 0);
    const opsItems = tipe === "racikan" ? (p.biayaOperasionalItems || []) : [];
    const biayaO   = tipe === "racikan" ? totalBiayaOperasional(opsItems, opsMap) : 0;
    const totalB   = biayaB + biayaO;
    const untPct   = totalB   > 0 ? ((p.targetUntung    / totalB)  * 100).toFixed(1) : "";
    setForm({
      nama: p.nama, items: p.items,
      biayaOperasionalItems: opsItems,
      targetUntung: String(p.targetUntung),
      targetUntungPct: untPct,
      tipeProduk: tipe,
      pakaiStok: p.pakaiStok || false,
      hargaModalManual: tipe !== "racikan" ? String(p.hargaModal || "") : "",
      tampilDiKasir: p.tampilDiKasir !== false,
    });
    setEditId(p.id); setError(""); setPilihTipeDulu(false);
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setSelOps(""); setSelOpsJumlah("1");
    setFotoFile(null); setFotoPreview(p.fotoUrl || null); setFotoError("");
    if (fotoInputRef.current) fotoInputRef.current.value = "";
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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

  // Foto baru cuma DIPILIH dulu di sini (preview lokal) — beneran ke-upload
  // belakangan pas handleSubmit (butuh produk ID dulu, yang buat produk BARU
  // baru kebentuk setelah baris resep/harganya berhasil disimpen).
  const handleFotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoError("");
    if (file.size > 5 * 1024 * 1024) { setFotoError("Ukuran foto maksimal 5MB."); return; }
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  // Hapus foto yang UDAH kesimpen (produk lama) — langsung ke server, beda sama
  // batalin pilihan foto yang baru dipilih (itu cukup di-clear state lokal aja).
  const handleHapusFotoTersimpan = async () => {
    if (!editId) { setFotoFile(null); setFotoPreview(null); if (fotoInputRef.current) fotoInputRef.current.value = ""; return; }
    await apiFetch(`/api/upload-image?target=produk&id=${editId}`, { method: "DELETE" });
    setFotoFile(null); setFotoPreview(null);
    if (fotoInputRef.current) fotoInputRef.current.value = "";
    window.dispatchEvent(new CustomEvent("produkUpdated"));
  };

  // Dipanggil SETELAH produk berhasil disimpen (create/update) — upload foto yang
  // masih nunggu di state, kalau ada.
  const uploadPendingFoto = async (produkId) => {
    if (!fotoFile) return null;
    setFotoUploading(true);
    try {
      const compressed = await compressImage(fotoFile, 500);
      const formData = new FormData();
      formData.append("file", compressed, "produk.jpg");
      const token = localStorage.getItem("finsight_token");
      const res = await fetch(`/api/upload-image?target=produk&id=${produkId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const r = await res.json();
      if (r.success) return r.fotoUrl;
      setFotoError(r.message || "Produk tersimpan, tapi foto gagal ke-upload.");
      return null;
    } catch {
      setFotoError("Produk tersimpan, tapi foto gagal ke-upload (koneksi bermasalah).");
      return null;
    } finally {
      setFotoUploading(false);
      setFotoFile(null);
    }
  };


  const handlePilihBahan = (id) => {
    setSelBahan(id);
    const b = bahanMap[id];
    setSelSatuan(b ? validUsageUnits(b.satuanBeli, b.satuanUnit, b.hasilPerUnit, b.hasilLabel)[0] : "");
  };

  const handleTambahItem = () => {
    if (!selBahan)                                          return setError("Pilih bahan terlebih dahulu.");
    if (!selJumlah || isNaN(selJumlah) || +selJumlah <= 0) return setError("Masukkan jumlah pakai yang valid.");
    setForm(p => ({ ...p, items: [...p.items, { bahanId: selBahan, jumlahPakai: +selJumlah, satuanPakai: selSatuan }] }));
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setError("");
  };

  const handleHapusItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  // ── Tambah/hapus item Biaya Operasional dari master ke resep produk ───────
  const handleTambahOpsItem = () => {
    if (!selOps)                                                 return setError("Pilih biaya operasional terlebih dahulu.");
    if (!selOpsJumlah || isNaN(selOpsJumlah) || +selOpsJumlah <= 0) return setError("Masukkan jumlah yang valid.");
    setForm(p => ({ ...p, biayaOperasionalItems: [...p.biayaOperasionalItems, { opsId: selOps, jumlah: +selOpsJumlah }] }));
    setSelOps(""); setSelOpsJumlah("1");
    setError("");
  };

  const handleHapusOpsItem = (idx) =>
    setForm(p => ({ ...p, biayaOperasionalItems: p.biayaOperasionalItems.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    if (!form.nama.trim()) return setError("Nama produk tidak boleh kosong.");
    if (isRacikan) {
      if (form.items.length === 0) return setError("Tambahkan minimal satu bahan ke resep.");
    } else {
      if (!form.hargaModalManual || +form.hargaModalManual <= 0) return setError("Isi harga modal per unit yang valid.");
    }

    const payload = {
      nama: form.nama.trim(),
      items: isRacikan ? form.items : [],
      biayaOperasional: isRacikan ? Math.round(biayaOpsNum) : 0,
      biayaOperasionalItems: isRacikan ? form.biayaOperasionalItems : [],
      targetUntung: Math.round(targetNum),
      biayaBahan: Math.round(biayaBahan),
      totalBiaya: Math.round(totalBiaya),
      hargaJual: Math.round(hargaJual),
      hargaModal: Math.round(isRacikan ? 0 : biayaBahan),
      tampilDiKasir: form.tampilDiKasir,
    };
    if (!editId) {
      // tipeProduk cuma dikirim pas BIKIN BARU — nggak bisa diganti pas edit (lihat
      // catatan di backend: ganti tipe produk yang udah ada bisa bikin data nggak konsisten)
      payload.tipeProduk = form.tipeProduk;
    }
    if (isRacikan) {
      // pakaiStok boleh diubah kapan aja (nyalain/matiin tracking stok jadi nggak merusak data)
      payload.pakaiStok = form.pakaiStok;
    }

    try {
      if (editId) {
        const r = await apiFetch(`/api/umkm?table=produk`, {
          method: "PUT",
          body: JSON.stringify({ id: editId, ...payload }),
        });
        if (r.success) {
          const fotoUrl = await uploadPendingFoto(editId);
          window.dispatchEvent(new CustomEvent("produkUpdated"));
        } else {
          return setError(r.message || "Gagal menyimpan perubahan produk. Coba lagi.");
        }
      } else {
        const newId = genId();
        const r = await apiFetch(`/api/umkm?table=produk`, {
          method: "POST",
          body: JSON.stringify({ id: newId, ...payload, createdAt: Date.now() }),
        });
        if (r.success) {
          await uploadPendingFoto(newId);
          window.dispatchEvent(new CustomEvent("produkUpdated"));
        } else {
          return setError(r.message || "Gagal menyimpan produk. Coba lagi.");
        }
      }
    } catch (err) {
      return setError("Gagal menghubungi server: " + (err.message || "Coba lagi."));
    }
    resetForm();
  };

  return (
    <div className="kalkharga">
      {!showForm ? (
        <button className="kalkharga__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Hitung Harga Jual Produk
        </button>
      ) : (
      <div className="kalkharga__form" ref={formRef}>
        <h3 className="kalkharga__form-title">{editId ? "Edit Produk" : "+ Hitung Harga Jual Produk"}</h3>

        {pilihTipeDulu && !editId ? (
          <>
            <p className="kalkharga__hint" style={{ marginBottom: "0.75rem" }}>Produk ini jenisnya apa?</p>
            <div className="stagger-list" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {TIPE_PRODUK_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className="kalkharga__addbtn"
                  style={{ textAlign: "left", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}
                  onClick={() => { setForm(p => ({ ...p, tipeProduk: opt.value })); setPilihTipeDulu(false); }}
                >
                  <strong>{opt.label}</strong>
                  <span style={{ fontWeight: 400, fontSize: "12px", opacity: 0.8 }}>{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="kalkharga__form-actions">
              <button className="kalkharga__btn-sec" onClick={resetForm}>Batal</button>
            </div>
          </>
        ) : (
        <>
        {!editId && (
          <p className="kalkharga__hint" style={{ marginBottom: "0.75rem" }}>
            Tipe: <strong>{TIPE_PRODUK_OPTIONS.find(o => o.value === form.tipeProduk)?.label}</strong>{" "}
            <button className="kalkharga__item-remove" style={{ display: "inline" }} onClick={() => setPilihTipeDulu(true)}>(ganti)</button>
          </p>
        )}
        {editId && (
          <p className="kalkharga__hint" style={{ marginBottom: "0.75rem" }}>
            Tipe: <strong>{TIPE_PRODUK_OPTIONS.find(o => o.value === form.tipeProduk)?.label}</strong> (nggak bisa diganti setelah dibuat)
          </p>
        )}

        <div className="kalkharga__field">
          <label className="kalkharga__label">Nama Produk</label>
          <input className="kalkharga__input" type="text" placeholder="Misal: Roti Coklat"
            value={form.nama} onChange={e => { setForm(p => ({ ...p, nama: e.target.value })); setError(""); }} />
        </div>

        <div className="kalkharga__field">
          <label className="kalkharga__label">Foto Produk <span className="kalkharga__hint">(opsional, biar keliatan di grid Kasir)</span></label>
          <div className="kalkharga__foto-row">
            <div className="kalkharga__foto-preview" style={!fotoPreview ? { background: colorFromName(form.nama || "?") } : undefined}>
              {fotoUploading ? (
                <span className="kalkharga__foto-loading">⏳</span>
              ) : fotoPreview ? (
                <img src={fotoPreview} alt="Preview produk" />
              ) : (
                <span className="kalkharga__foto-initial">{(form.nama || "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="kalkharga__foto-actions">
              <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleFotoPick} className="kalkharga__foto-input" />
              {fotoPreview && (
                <button type="button" className="kalkharga__foto-remove" onClick={handleHapusFotoTersimpan}>Hapus foto</button>
              )}
              {fotoError && <p className="kalkharga__foto-error">{fotoError}</p>}
            </div>
          </div>
        </div>

        {isRacikan ? (
        <>
        <div className="kalkharga__addbahan">
          <label className="kalkharga__label">Tambah Bahan dari Master Data</label>
          {bahanList.length === 0 ? (
            <p className="kalkharga__hint">Belum ada bahan baku. Tambahkan dulu di tab <strong>Bahan Baku</strong>.</p>
          ) : (
            <div className="kalkharga__addbahan-row">
              <select className="kalkharga__input" value={selBahan} onChange={e => handlePilihBahan(e.target.value)}>
                <option value="">-- Pilih bahan --</option>
                {bahanList.map(b => <option key={b.id} value={b.id}>{b.nama}</option>)}
              </select>
              <input className="kalkharga__input kalkharga__input--qty" type="number" placeholder="Jumlah"
                value={selJumlah} onChange={e => setSelJumlah(e.target.value)} min="0" />
              <select className="kalkharga__input kalkharga__input--unit" value={selSatuan}
                onChange={e => setSelSatuan(e.target.value)} disabled={!selBahan}>
                {selBahan && validUsageUnits(
                  bahanMap[selBahan]?.satuanBeli,
                  bahanMap[selBahan]?.satuanUnit,
                  bahanMap[selBahan]?.hasilPerUnit,
                  bahanMap[selBahan]?.hasilLabel
                ).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button className="kalkharga__addbtn" onClick={handleTambahItem}>+ Tambah</button>
            </div>
          )}
        </div>

        {form.items.length > 0 && (
          <div className="kalkharga__items stagger-list">
            {form.items.map((it, idx) => {
              const b = bahanMap[it.bahanId];
              const biaya = b ? biayaItem(b, it.jumlahPakai, it.satuanPakai) : 0;
              return (
                <div key={idx} className="kalkharga__item-row">
                  <span className="kalkharga__item-nama">{b ? b.nama : "(bahan dihapus)"}</span>
                  <span className="kalkharga__item-qty">{it.jumlahPakai} {it.satuanPakai}</span>
                  <span className="kalkharga__item-biaya">{formatRupiah(biaya)}</span>
                  <button className="kalkharga__item-remove" onClick={() => handleHapusItem(idx)}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* Biaya Operasional — dropdown dari master data, sama pola dengan Tambah Bahan */}
        <div className="kalkharga__addbahan">
          <label className="kalkharga__label">Tambah Biaya Operasional dari Master Data</label>
          {opsList.length === 0 ? (
            <p className="kalkharga__hint">Belum ada biaya operasional. Tambahkan dulu di tab <strong>Biaya Operasional</strong>.</p>
          ) : (
            <div className="kalkharga__addbahan-row" style={{ gridTemplateColumns: "2fr 1fr auto" }}>
              <select className="kalkharga__input" value={selOps} onChange={e => setSelOps(e.target.value)}>
                <option value="">-- Pilih biaya operasional --</option>
                {opsList.map(o => <option key={o.id} value={o.id}>{o.nama} ({formatRupiah(o.biaya)})</option>)}
              </select>
              <input className="kalkharga__input kalkharga__input--qty" type="number" placeholder="Jumlah"
                value={selOpsJumlah} onChange={e => setSelOpsJumlah(e.target.value)} min="0" />
              <button className="kalkharga__addbtn" onClick={handleTambahOpsItem}>+ Tambah</button>
            </div>
          )}
        </div>

        {form.biayaOperasionalItems.length > 0 && (
          <div className="kalkharga__items stagger-list">
            {form.biayaOperasionalItems.map((it, idx) => {
              const o = opsMap[it.opsId];
              const biaya = o ? biayaOpsItem(o, it.jumlah) : 0;
              return (
                <div key={idx} className="kalkharga__item-row">
                  <span className="kalkharga__item-nama">{o ? o.nama : "(dihapus)"}</span>
                  <span className="kalkharga__item-qty">x{it.jumlah}</span>
                  <span className="kalkharga__item-biaya">{formatRupiah(biaya)}</span>
                  <button className="kalkharga__item-remove" onClick={() => handleHapusOpsItem(idx)}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        <div className="kalkharga__field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", display: "flex" }}>
          <input type="checkbox" id="pakaiStok" checked={form.pakaiStok}
            onChange={e => setForm(p => ({ ...p, pakaiStok: e.target.checked }))} />
          <label htmlFor="pakaiStok" className="kalkharga__label" style={{ margin: 0 }}>
            Nyetok produk jadi? (produksi dulu sebelum bisa dijual dari stok — kalau nggak dicentang, dianggap selalu dibikin pas ada pesanan)
          </label>
        </div>
        </>
        ) : (
        <div className="kalkharga__field">
          <label className="kalkharga__label">Harga Modal per Unit</label>
          <RupiahInput className="kalkharga__input" placeholder="0"
            value={form.hargaModalManual}
            onChange={v => { setForm(p => ({ ...p, hargaModalManual: v })); setError(""); }} />
          <p className="kalkharga__hint">
            {form.tipeProduk === "jadi_stok"
              ? "Harga beli per unit dari supplier. Stok fisiknya dicatet lewat tombol \"+ Restock\" di kartu produk nanti."
              : "Harga modal per unit dari supplier dropship. Nggak ada stok yang dilacak — angka ini bisa diubah lagi pas jualan beneran (harga dropship suka berubah-ubah)."}
          </p>
        </div>
        )}

        <div className="kalkharga__field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", display: "flex" }}>
          <input type="checkbox" id="tampilDiKasir" checked={form.tampilDiKasir}
            onChange={e => setForm(p => ({ ...p, tampilDiKasir: e.target.checked }))} />
          <label htmlFor="tampilDiKasir" className="kalkharga__label" style={{ margin: 0 }}>
            Tampilkan produk ini di Kasir
          </label>
        </div>

        {/* Target Untung — Rp + % berdampingan */}
        <div className="kalkharga__costs">
          <div className="kalkharga__field">
            <label className="kalkharga__label">Target Untung</label>
            <div className="kalkharga__dual-input">
              <div className="kalkharga__dual-wrap">
                <span className="kalkharga__dual-prefix">Rp</span>
                <RupiahInput className="kalkharga__input kalkharga__input--dual"
                  value={form.targetUntung}
                  onChange={v => handleTargetRp(v)} />
              </div>
              <div className="kalkharga__dual-wrap">
                <input className="kalkharga__input kalkharga__input--dual kalkharga__input--pct" type="number"
                  placeholder="0" min="0" max="100" step="0.1"
                  value={form.targetUntungPct}
                  onChange={e => handleTargetPct(e.target.value)} />
                <span className="kalkharga__dual-suffix">%</span>
              </div>
            </div>
            {totalBiaya > 0 && targetNum > 0 && (
              <p className="kalkharga__dual-hint">dari total biaya · {formatRupiah(targetNum)}</p>
            )}
          </div>
        </div>

        <div className="kalkharga__summary">
          <div className="kalkharga__sum-row"><span>{isRacikan ? "Biaya Bahan" : "Harga Modal"}</span><span>{formatRupiah(biayaBahan)}</span></div>
          {isRacikan && <div className="kalkharga__sum-row"><span>Biaya Operasional</span><span>{formatRupiah(biayaOpsNum)}</span></div>}
          <div className="kalkharga__sum-row kalkharga__sum-row--sub"><span>Total Biaya</span><span>{formatRupiah(totalBiaya)}</span></div>
          <div className="kalkharga__sum-row"><span>Target Untung</span><span>{formatRupiah(targetNum)}</span></div>
          <div className="kalkharga__sum-row kalkharga__sum-row--final"><span>Harga Jual</span><span><CountUp value={hargaJual} format={formatRupiah} /></span></div>
        </div>

        {error && <p className="kalkharga__error">{error}</p>}

        <div className="kalkharga__form-actions">
          <button className="kalkharga__btn-sec" onClick={resetForm}>Batal</button>
          <button className="kalkharga__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "Simpan Produk"}
          </button>
        </div>
        </>
        )}
      </div>
      )}

    </div>
  );
}
