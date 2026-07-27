import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId, formatRupiah, biayaItem, totalBiayaBahan, validUsageUnits,
  biayaOpsItem, totalBiayaOperasional, cekKecukupanStok, applyStokDelta, baseUnitLabel,
} from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import CountUp from "./CountUp";
import "./KalkulatorHarga.css";

import { Pencil, Search, Trash2, X, Factory, PackagePlus } from "lucide-react";
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
  const [pilihTipeDulu, setPilihTipeDulu] = useState(true); // true = lagi milih tipe produk dulu (cuma buat produk BARU)
  const [search,   setSearch]   = useState("");

  // ── Produksi (racikan+pakaiStok) & Restock (jadi_stok) — dua-duanya nambah stok_jadi,
  // bedanya Produksi NGURANGIN bahan baku dulu (sesuai resep), Restock nggak.
  const [produksiTarget, setProduksiTarget] = useState(null); // produk yang lagi diproduksi
  const [produksiJumlah, setProduksiJumlah] = useState("1");
  const [produksiError, setProduksiError] = useState("");
  const [produksiSubmitting, setProduksiSubmitting] = useState(false);

  const [restockTarget, setRestockTarget] = useState(null); // produk yang lagi di-restock
  const [restockJumlah, setRestockJumlah] = useState("1");
  const [restockError, setRestockError] = useState("");
  const [restockSubmitting, setRestockSubmitting] = useState(false);

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
  // "racikan" -> biaya dihitung dari resep bahan baku + biaya operasional (kayak sebelumnya).
  // "jadi_stok"/"jadi_dropship" -> nggak ada resep, biaya modal diisi manual per unit.
  const isRacikan   = form.tipeProduk === "racikan";
  const biayaBahan  = isRacikan ? totalBiayaBahan(form.items, bahanMap) : (+form.hargaModalManual || 0);
  const biayaOpsNum = isRacikan ? totalBiayaOperasional(form.biayaOperasionalItems, opsMap) : 0;
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
    setForm(emptyForm); setEditId(null); setError(""); setPilihTipeDulu(true);
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setSelOps(""); setSelOpsJumlah("1");
    setShowForm(false);
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
    });
    setEditId(p.id); setError(""); setPilihTipeDulu(false);
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

  // ── Produksi: konsumsi bahan baku sesuai resep × jumlah, nambah stok_jadi produk ──
  const handleProduksi = async () => {
    if (produksiSubmitting || !produksiTarget) return;
    const jumlah = +produksiJumlah || 0;
    if (jumlah <= 0) return setProduksiError("Jumlah produksi tidak valid.");

    setProduksiSubmitting(true);
    setProduksiError("");
    try {
      // Ambil bahan baku TERBARU dari server (bukan cache lokal) biar validasinya akurat
      const bahanRes = await apiFetch(`/api/umkm?table=bahan_baku`);
      if (!bahanRes.success) { setProduksiError("Gagal ambil data bahan baku."); return; }

      const cek = cekKecukupanStok(produksiTarget.items, bahanRes.data, jumlah);
      const kurang = cek.filter(c => !c.cukup);
      if (kurang.length > 0) {
        setProduksiError(`Stok nggak cukup: ${kurang.map(k => `${k.nama} (butuh ${k.butuh}, sisa ${k.stokAda})`).join(", ")}`);
        return;
      }

      const updated = applyStokDelta(bahanRes.data, produksiTarget.items, jumlah, -1);
      const changed = updated
        .map((b, i) => ({ b, before: bahanRes.data[i] }))
        .filter(({ b, before }) => b.stok !== before?.stok);

      await Promise.all(changed.map(({ b }) => apiFetch(`/api/umkm?table=bahan_baku`, { method: "PUT", body: JSON.stringify(b) })));
      await Promise.all(changed.map(({ b, before }) => {
        const delta = Math.abs((parseFloat(b.stok) || 0) - (parseFloat(before?.stok) || 0));
        return apiFetch(`/api/umkm?table=stok_history`, {
          method: "POST",
          body: JSON.stringify({
            id: genId(), bahanId: b.id, tipe: "kurang", sumber: "produksi",
            jumlah: delta, satuanLabel: baseUnitLabel(b),
          }),
        });
      }));

      const stokJadiBaru = (produksiTarget.stokJadi || 0) + jumlah;
      const r = await apiFetch(`/api/umkm?table=produk`, {
        method: "PUT",
        body: JSON.stringify({ id: produksiTarget.id, ...produksiTarget, stokJadi: stokJadiBaru }),
      });
      if (r.success) {
        setProdukList(p => p.map(x => x.id === produksiTarget.id ? r.data : x));
        window.dispatchEvent(new CustomEvent("produkUpdated"));
      }
      await apiFetch(`/api/umkm?table=stok_history`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), produkId: produksiTarget.id, tipe: "tambah", sumber: "produksi", jumlah, satuanLabel: "unit" }),
      });

      setProduksiTarget(null);
      setProduksiJumlah("1");
    } catch {
      setProduksiError("Gagal menghubungi server, coba lagi ya.");
    } finally {
      setProduksiSubmitting(false);
    }
  };

  // ── Restock: langsung nambah stok_jadi (nggak ngutak-atik bahan baku, karena beli jadi) ──
  const handleRestock = async () => {
    if (restockSubmitting || !restockTarget) return;
    const jumlah = +restockJumlah || 0;
    if (jumlah <= 0) return setRestockError("Jumlah restock tidak valid.");

    setRestockSubmitting(true);
    setRestockError("");
    try {
      const stokJadiBaru = (restockTarget.stokJadi || 0) + jumlah;
      const r = await apiFetch(`/api/umkm?table=produk`, {
        method: "PUT",
        body: JSON.stringify({ id: restockTarget.id, ...restockTarget, stokJadi: stokJadiBaru }),
      });
      if (r.success) {
        setProdukList(p => p.map(x => x.id === restockTarget.id ? r.data : x));
        window.dispatchEvent(new CustomEvent("produkUpdated"));
      }
      await apiFetch(`/api/umkm?table=stok_history`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), produkId: restockTarget.id, tipe: "tambah", sumber: "manual_tambah_jadi", jumlah, satuanLabel: "unit" }),
      });

      setRestockTarget(null);
      setRestockJumlah("1");
    } catch {
      setRestockError("Gagal menghubungi server, coba lagi ya.");
    } finally {
      setRestockSubmitting(false);
    }
  };

  // ── AI Saran Harga ─────────────────────────────────────────────────────────
  const handleAiAnalisis = async (produk) => {
    setAiProduk(produk);
    setAiOpen(true);
    setAiResult("");
    setAiError("");
    setAiLoading(true);

    const bahan = produk.items.length > 0
      ? produk.items.map(it => {
          const b = bahanMap[it.bahanId];
          return `${b?.nama || "bahan"} (${it.jumlahPakai} ${it.satuanPakai})`;
        }).join(", ")
      : (produk.tipeProduk === "jadi_dropship" ? "beli dari supplier dropship, nggak nyetok" : "beli jadi dari supplier, nyetok stok fisik");

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
                <div className="kalkharga__produk-resep">
                  {p.tipeProduk === "jadi_dropship" ? "🚚 Dropship — modal bisa diubah pas jual"
                    : p.tipeProduk === "jadi_stok" ? `📦 Beli Jadi — Stok: ${p.stokJadi || 0}`
                    : p.pakaiStok ? `📖 Racikan — Stok Jadi: ${p.stokJadi || 0}`
                    : `📖 Racikan — ${p.items.length} bahan dalam resep (dibikin pas ada pesanan)`}
                </div>
                {p.tipeProduk === "racikan" && p.pakaiStok && (
                  <button className="kalkharga__ai-btn" onClick={() => { setProduksiTarget(p); setProduksiJumlah("1"); setProduksiError(""); }}>
                    <Factory size={13} /> + Produksi
                  </button>
                )}
                {p.tipeProduk === "jadi_stok" && (
                  <button className="kalkharga__ai-btn" onClick={() => { setRestockTarget(p); setRestockJumlah("1"); setRestockError(""); }}>
                    <PackagePlus size={13} /> + Restock
                  </button>
                )}
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

      {/* Modal Produksi — konsumsi bahan baku sesuai resep, nambah stok jadi */}
      {produksiTarget && (
        <div className="kalkharga__modal-overlay" onClick={() => !produksiSubmitting && setProduksiTarget(null)}>
          <div className="kalkharga__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kalkharga__modal-title">+ Produksi: {produksiTarget.nama}</h4>
            <p className="kalkharga__modal-sub">Bahan baku sesuai resep bakal dikurangin otomatis, stok jadi produk ini nambah.</p>
            <div className="kalkharga__field">
              <label className="kalkharga__label">Mau produksi berapa unit?</label>
              <input className="kalkharga__input" type="number" min="1" value={produksiJumlah}
                onChange={e => { setProduksiJumlah(e.target.value); setProduksiError(""); }} />
            </div>
            {produksiError && <p className="kalkharga__error">{produksiError}</p>}
            <div className="kalkharga__modal-actions">
              <button className="kalkharga__btn-sec" onClick={() => setProduksiTarget(null)} disabled={produksiSubmitting}>Batal</button>
              <button className="kalkharga__btn-primary" onClick={handleProduksi} disabled={produksiSubmitting}>
                {produksiSubmitting ? "Memproses..." : "Produksi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Restock — langsung nambah stok jadi, nggak nyentuh bahan baku */}
      {restockTarget && (
        <div className="kalkharga__modal-overlay" onClick={() => !restockSubmitting && setRestockTarget(null)}>
          <div className="kalkharga__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kalkharga__modal-title">+ Restock: {restockTarget.nama}</h4>
            <p className="kalkharga__modal-sub">Nambah stok fisik yang baru dibeli dari supplier.</p>
            <div className="kalkharga__field">
              <label className="kalkharga__label">Nambah berapa unit?</label>
              <input className="kalkharga__input" type="number" min="1" value={restockJumlah}
                onChange={e => { setRestockJumlah(e.target.value); setRestockError(""); }} />
            </div>
            {restockError && <p className="kalkharga__error">{restockError}</p>}
            <div className="kalkharga__modal-actions">
              <button className="kalkharga__btn-sec" onClick={() => setRestockTarget(null)} disabled={restockSubmitting}>Batal</button>
              <button className="kalkharga__btn-primary" onClick={handleRestock} disabled={restockSubmitting}>
                {restockSubmitting ? "Memproses..." : "Restock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
