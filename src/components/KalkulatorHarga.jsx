import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId, formatRupiah, biayaItem, totalBiayaBahan, validUsageUnits,
  biayaOpsItem, totalBiayaOperasional,
} from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import CountUp from "./CountUp";
import "./KalkulatorHarga.css";

import { Pencil, Search, Trash2, X } from "lucide-react";
const emptyForm = {
  nama: "", items: [],
  biayaOperasionalItems: [],
  targetUntung: "", targetUntungPct: "",
};

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function KalkulatorHarga() {
  const { user } = useAuth();
  const formRef = useRef(null);

  const [bahanList,  setBahanList]  = useState([]);
  const [produkList, setProdukList] = useState([]);
  const [form,    setForm]    = useState(emptyForm);
  const [editId,  setEditId]  = useState(null);
  const [error,   setError]   = useState("");
  const [delId,   setDelId]   = useState(null);
  const [selBahan,  setSelBahan]  = useState("");
  const [selJumlah, setSelJumlah] = useState("");
  const [selSatuan, setSelSatuan] = useState("");

  // Dropdown tambah biaya operasional ke resep produk (master datanya dikelola di tab Biaya Operasional)
  const [selOps,       setSelOps]       = useState("");
  const [selOpsJumlah, setSelOpsJumlah] = useState("1");
  const [opsList,       setOpsList]       = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");

  // AI Saran Harga
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState("");
  const [aiError,   setAiError]   = useState("");
  const [aiProduk,  setAiProduk]  = useState(null); // produk yang sedang dianalisis

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
    apiFetch(`/api/umkm?table=produk`).then(r => { if (r.success) setProdukList(r.data); });
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

  const bahanMap = Object.fromEntries(bahanList.map(b => [b.id, b]));
  const opsMap   = Object.fromEntries(opsList.map(o => [o.id, o]));

  // ── Kalkulasi biaya ────────────────────────────────────────────────────────
  const biayaBahan  = totalBiayaBahan(form.items, bahanMap);
  const biayaOpsNum = totalBiayaOperasional(form.biayaOperasionalItems, opsMap);
  const targetNum   = +form.targetUntung || 0;
  const totalBiaya  = biayaBahan + biayaOpsNum;
  const hargaJual   = totalBiaya + targetNum;

  const targetPct   = totalBiaya > 0 ? ((targetNum / totalBiaya) * 100).toFixed(1) : "";

  const filteredProdukList = produkList.filter(p =>
    p.nama.toLowerCase().includes(search.trim().toLowerCase())
  );

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
    setForm(emptyForm); setEditId(null); setError("");
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setSelOps(""); setSelOpsJumlah("1");
    setShowForm(false);
  };

  const openEdit = (p) => {
    const biayaB   = totalBiayaBahan(p.items, bahanMap);
    const opsItems = p.biayaOperasionalItems || [];
    const biayaO   = totalBiayaOperasional(opsItems, opsMap);
    const totalB   = biayaB + biayaO;
    const untPct   = totalB   > 0 ? ((p.targetUntung    / totalB)  * 100).toFixed(1) : "";
    setForm({
      nama: p.nama, items: p.items,
      biayaOperasionalItems: opsItems,
      targetUntung: String(p.targetUntung),
      targetUntungPct: untPct,
    });
    setEditId(p.id); setError("");
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setSelOps(""); setSelOpsJumlah("1");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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
    if (!form.nama.trim())       return setError("Nama produk tidak boleh kosong.");
    if (form.items.length === 0) return setError("Tambahkan minimal satu bahan ke resep.");

    const payload = {
      nama: form.nama.trim(),
      items: form.items,
      biayaOperasional: Math.round(biayaOpsNum),
      biayaOperasionalItems: form.biayaOperasionalItems,
      targetUntung: Math.round(targetNum),
      biayaBahan: Math.round(biayaBahan),
      totalBiaya: Math.round(totalBiaya),
      hargaJual: Math.round(hargaJual),
    };

    try {
      if (editId) {
        const r = await apiFetch(`/api/umkm?table=produk`, {
          method: "PUT",
          body: JSON.stringify({ id: editId, ...payload }),
        });
        if (r.success) {
          setProdukList(p => p.map(x => x.id === editId ? r.data : x));
          window.dispatchEvent(new CustomEvent("produkUpdated"));
        } else {
          return setError(r.message || "Gagal menyimpan perubahan produk. Coba lagi.");
        }
      } else {
        const r = await apiFetch(`/api/umkm?table=produk`, {
          method: "POST",
          body: JSON.stringify({ id: genId(), ...payload, createdAt: Date.now() }),
        });
        if (r.success) {
          setProdukList(p => [r.data, ...p]);
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

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=produk&id=${id}`, { method: "DELETE" });
    setProdukList(p => p.filter(x => x.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("produkUpdated"));
  };

  // ── AI Saran Harga ─────────────────────────────────────────────────────────
  const handleAiAnalisis = async (produk) => {
    setAiProduk(produk);
    setAiOpen(true);
    setAiResult("");
    setAiError("");
    setAiLoading(true);

    const bahan = produk.items.map(it => {
      const b = bahanMap[it.bahanId];
      return `${b?.nama || "bahan"} (${it.jumlahPakai} ${it.satuanPakai})`;
    }).join(", ");

    const prompt = `Kamu adalah konsultan bisnis UMKM Indonesia yang berpengalaman.

Saya memiliki produk bernama "${produk.nama}" dengan detail biaya:
- Bahan baku: ${formatRupiah(produk.biayaBahan)} (${bahan})
- Biaya operasional: ${formatRupiah(produk.biayaOperasional)}
- Total modal per unit: ${formatRupiah(produk.totalBiaya)}
- Harga jual saya saat ini: ${formatRupiah(produk.hargaJual)} (target untung ${formatRupiah(produk.targetUntung)})

Tolong analisis:
1. Apakah harga jual saya kompetitif untuk produk sejenis di pasaran Indonesia?
2. Berapa kisaran harga produk serupa yang biasa dijual UMKM/warung/online shop?
3. Apakah margin keuntungan saya (${totalBiaya > 0 ? ((produk.targetUntung/produk.totalBiaya)*100).toFixed(0) : 0}%) sudah wajar untuk UMKM?
4. Saran konkret untuk strategi penetapan harga yang lebih optimal.

Berikan jawaban dalam Bahasa Indonesia yang singkat, praktis, dan langsung ke poin. Format dengan poin-poin yang jelas.`;

    try {
      // Lewat backend (/api/ai-chat) — key Groq diambil server-side dari Supabase,
      // konsisten sama arsitektur AI Agent (nggak ada lagi key di localStorage browser).
      const r = await apiFetch(`/api/ai-chat`, {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          mode: "umkm",
          summary: { pemasukan: 0, pengeluaran: 0, saldo: 0 },
        }),
      });

      if (!r.success) {
        if (r.needsApiKey) {
          setAiError("API Key Groq belum diset. Isi dulu di halaman AI Agent.");
        } else {
          throw new Error(r.message || "Gagal menghubungi AI.");
        }
        return;
      }

      setAiResult(r.data?.content || "");
    } catch (err) {
      setAiError("Gagal menghubungi AI: " + (err.message || "Coba lagi."));
    } finally {
      setAiLoading(false);
    }
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

        <div className="kalkharga__field">
          <label className="kalkharga__label">Nama Produk</label>
          <input className="kalkharga__input" type="text" placeholder="Misal: Roti Coklat"
            value={form.nama} onChange={e => { setForm(p => ({ ...p, nama: e.target.value })); setError(""); }} />
        </div>

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
          <div className="kalkharga__sum-row"><span>Biaya Bahan</span><span>{formatRupiah(biayaBahan)}</span></div>
          <div className="kalkharga__sum-row"><span>Biaya Operasional</span><span>{formatRupiah(biayaOpsNum)}</span></div>
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
      </div>
      )}

      {/* Daftar Produk */}
      <div className="kalkharga__list">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <h3 className="kalkharga__list-title stagger-list" style={{ margin: 0 }}>Daftar Produk</h3>
          {produkList.length > 0 && (
            <input className="kalkharga__input" type="text" placeholder="Cari produk..."
              style={{ maxWidth: "240px" }}
              value={search} onChange={e => setSearch(e.target.value)} />
          )}
        </div>
        {produkList.length === 0 ? (
          <div className="kalkharga__empty">
            <p></p>
            <p>Belum ada produk dihitung.</p>
            <p>Gunakan form di atas untuk menghitung harga jual pertama kamu.</p>
          </div>
        ) : filteredProdukList.length === 0 ? (
          <div className="kalkharga__empty"><p><Search size={15} /></p><p>Tidak ada produk yang cocok dengan pencarian.</p></div>
        ) : (
          <div className="kalkharga__produk-grid stagger-list">
            {filteredProdukList.map(p => (
              <div key={p.id} className="kalkharga__produk-card">
                <div className="kalkharga__produk-header">
                  <span className="kalkharga__produk-nama">{p.nama}</span>
                  <div className="kalkharga__produk-actions">
                    <button className="kalkharga__produk-edit" onClick={() => openEdit(p)} title="Edit"><Pencil size={14} /></button>
                    <button className="kalkharga__produk-del" onClick={() => setDelId(p.id)} title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="kalkharga__produk-body">
                  <span className="kalkharga__produk-label">Harga Jual</span>
                  <span className="kalkharga__produk-harga">{formatRupiah(p.hargaJual)}</span>
                </div>
                <div className="kalkharga__produk-detail">
                  <span>Modal: {formatRupiah(p.totalBiaya)}</span>
                  <span>Untung: {formatRupiah(p.targetUntung)}</span>
                </div>
                <div className="kalkharga__produk-margin">
                  Margin: {p.totalBiaya > 0 ? ((p.targetUntung / p.totalBiaya) * 100).toFixed(0) : 0}%
                </div>
                <div className="kalkharga__produk-resep">{p.items.length} bahan dalam resep</div>
                {/* Tombol AI Analisis */}
                <button className="kalkharga__ai-btn" onClick={() => handleAiAnalisis(p)}>
                  Analisis Harga AI
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal AI Saran Harga */}
      {aiOpen && (
        <div className="kalkharga__modal-overlay" onClick={() => { setAiOpen(false); setAiResult(""); }}>
          <div className="kalkharga__modal kalkharga__modal--ai" onClick={e => e.stopPropagation()}>
            <div className="kalkharga__ai-header">
              <div>
                <h4 className="kalkharga__modal-title">Analisis Harga AI</h4>
                {aiProduk && <p className="kalkharga__ai-produk-name">{aiProduk.nama} · {formatRupiah(aiProduk.hargaJual)}</p>}
              </div>
              <button className="kalkharga__ai-close" onClick={() => { setAiOpen(false); setAiResult(""); }}><X size={14} /></button>
            </div>

            {aiLoading && (
              <div className="kalkharga__ai-loading">
                <div className="kalkharga__ai-spinner" />
                <p>AI sedang menganalisis produk serupa di pasaran...</p>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="kalkharga__ai-error">
                <p>{aiError}</p>
                {aiError.includes("API Key") && (
                  <p className="kalkharga__ai-hint">Isi API Key Groq di halaman <strong>AI Agent</strong> terlebih dahulu.</p>
                )}
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="kalkharga__ai-result">
                {aiResult.split("\n").map((line, i) => (
                  line.trim() ? <p key={i} className={line.startsWith("#") ? "kalkharga__ai-heading" : "kalkharga__ai-line"}>{line.replace(/^#+\s*/, "")}</p> : null
                ))}
              </div>
            )}

            <div className="kalkharga__modal-actions">
              <button className="kalkharga__btn-sec" onClick={() => { setAiOpen(false); setAiResult(""); }}>Tutup</button>
              {!aiLoading && aiProduk && (
                <button className="kalkharga__btn-primary" onClick={() => handleAiAnalisis(aiProduk)}>
                  Analisis Ulang
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Hapus Produk */}
      {delId && (
        <div className="kalkharga__modal-overlay" onClick={() => setDelId(null)}>
          <div className="kalkharga__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kalkharga__modal-title">Hapus produk ini?</h4>
            <p className="kalkharga__modal-sub">Produk tidak akan lagi muncul sebagai pilihan saat mencatat transaksi pemasukan.</p>
            <div className="kalkharga__modal-actions">
              <button className="kalkharga__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="kalkharga__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
