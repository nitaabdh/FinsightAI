import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId, formatRupiah, cekKecukupanStok, applyStokDelta, baseUnitLabel, colorFromName,
} from "../utils/umkmCalc";
import "./KalkulatorHarga.css"; // reuse style kartu produk/grid/modal yang sama persis

import { Pencil, Search, Trash2, X, Factory, PackagePlus, Truck, Package, BookOpen } from "lucide-react";

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

// ── Daftar Produk ────────────────────────────────────────────────────────────
// Tab ini KHUSUS buat nampilin & ngelola produk yang udah ada (lihat, cari,
// edit, hapus, produksi/restock, analisis AI). Bikin/hitung produk BARU tetep
// di tab "Kalkulator Harga Jual" — biar tab itu murni form hitung & simpan.
export default function DaftarProduk({ onEditProduk, onAturHargaOnline }) {
  const { user } = useAuth();
  const [produkList, setProdukList] = useState([]);
  const [bahanList,  setBahanList]  = useState([]);
  const [search, setSearch] = useState("");
  const [delId, setDelId]   = useState(null);

  const [produksiTarget, setProduksiTarget] = useState(null);
  const [produksiJumlah, setProduksiJumlah] = useState("1");
  const [produksiError, setProduksiError] = useState("");
  const [produksiSubmitting, setProduksiSubmitting] = useState(false);

  const [restockTarget, setRestockTarget] = useState(null);
  const [restockJumlah, setRestockJumlah] = useState("1");
  const [restockError, setRestockError] = useState("");
  const [restockSubmitting, setRestockSubmitting] = useState(false);

  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState("");
  const [aiError,   setAiError]   = useState("");
  const [aiProduk,  setAiProduk]  = useState(null);

  const fetchProduk = () => apiFetch(`/api/umkm?table=produk`).then(r => { if (r.success) setProdukList(r.data); });

  useEffect(() => {
    if (!user) return;
    fetchProduk();
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
  }, [user]);

  // Produk bisa berubah dari tab Kalkulator Harga (simpan/edit) atau Kalkulator
  // Online (simpan harga listing) — refetch tiap ada event ini biar selalu sinkron.
  useEffect(() => {
    const refresh = () => { if (user) fetchProduk(); };
    window.addEventListener("produkUpdated", refresh);
    return () => window.removeEventListener("produkUpdated", refresh);
  }, [user]);

  const bahanMap = Object.fromEntries(bahanList.map(b => [b.id, b]));

  const filteredProdukList = produkList.filter(p =>
    p.nama.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=produk&id=${id}`, { method: "DELETE" });
    setProdukList(p => p.filter(x => x.id !== id));
    setDelId(null);
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
3. Apakah margin keuntungan saya (${produk.totalBiaya > 0 ? ((produk.targetUntung/produk.totalBiaya)*100).toFixed(0) : 0}%) sudah wajar untuk UMKM?
4. Saran konkret untuk strategi penetapan harga yang lebih optimal.

Berikan jawaban dalam Bahasa Indonesia yang singkat, praktis, dan langsung ke poin. Format dengan poin-poin yang jelas.`;

    try {
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
            <p>Buka tab "Kalkulator Harga Jual" buat hitung produk pertama kamu.</p>
          </div>
        ) : filteredProdukList.length === 0 ? (
          <div className="kalkharga__empty"><p><Search size={15} /></p><p>Tidak ada produk yang cocok dengan pencarian.</p></div>
        ) : (
          <div className="kalkharga__produk-grid stagger-list">
            {filteredProdukList.map(p => (
              <div key={p.id} className="kalkharga__produk-card">
                <div className="kalkharga__produk-header">
                  <div className="kalkharga__produk-titlewrap">
                    <div className="kalkharga__produk-thumb" style={!p.fotoUrl ? { background: colorFromName(p.nama) } : undefined}>
                      {p.fotoUrl ? <img src={p.fotoUrl} alt={p.nama} /> : <span>{p.nama.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="kalkharga__produk-nama">{p.nama}</span>
                  </div>
                  <div className="kalkharga__produk-actions">
                    <button className="kalkharga__produk-edit" onClick={() => onEditProduk?.(p)} title="Edit"><Pencil size={14} /></button>
                    <button className="kalkharga__produk-del" onClick={() => setDelId(p.id)} title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </div>
                {p.tampilDiKasir === false && (
                  <span className="kalkharga__produk-badge" title="Produk ini nggak muncul di grid Kasir">
                    Nggak tampil di Kasir
                  </span>
                )}
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
                {p.hargaOnline > 0 && (
                  <div className="kalkharga__produk-detail">
                    <span>Harga Online: {formatRupiah(p.hargaOnline)}</span>
                  </div>
                )}
                <div className="kalkharga__produk-resep">
                  {p.tipeProduk === "jadi_dropship" ? (
                    <><Truck size={13} /> Dropship — modal bisa diubah pas jual</>
                  ) : p.tipeProduk === "jadi_stok" ? (
                    <><Package size={13} /> Beli Jadi — Stok: {p.stokJadi || 0}</>
                  ) : p.pakaiStok ? (
                    <><BookOpen size={13} /> Racikan — Stok Jadi: {p.stokJadi || 0}</>
                  ) : (
                    <><BookOpen size={13} /> Racikan — {p.items.length} bahan dalam resep (dibikin pas ada pesanan)</>
                  )}
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
                <button className="kalkharga__ai-btn" onClick={() => handleAiAnalisis(p)}>
                  Analisis Harga AI
                </button>
                <button className="kalkharga__ai-btn" onClick={() => onAturHargaOnline?.(p)}>
                  {p.hargaOnline > 0 ? "Update Harga Online" : "Atur Harga Online"}
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
