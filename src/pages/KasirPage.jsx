import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import RupiahInput from "../components/RupiahInput";
import { formatRupiah, colorFromName } from "../utils/umkmCalc";
import { buildReceiptData } from "../utils/thermalPrint";
import StrukModal from "../components/StrukModal";
import "./KasirPage.css";

import { ShoppingCart, Plus, Minus, Trash2, Search, X } from "lucide-react";

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

// Halaman Kasir — buat jualan harian. Grid produk (dari Kalkulator Harga) di kiri,
// keranjang di kanan/bawah. Checkout ngirim ke /api/kasir-checkout yang ngurusin
// validasi stok, ngurangin bahan baku/stok jadi, dan nyatet transaksi otomatis —
// jadi nggak perlu dicatet manual dua kali di Transaksi.
export default function KasirPage() {
  const { user } = useAuth();
  const [produkList, setProdukList] = useState([]);
  const [dompetList, setDompetList] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [cart, setCart]             = useState([]); // [{produkId, nama, tipeProduk, qty, hargaSatuan, hargaModalAktual?}]
  const [showCheckout, setShowCheckout] = useState(false);
  const [kasTujuan, setKasTujuan]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [successInfo, setSuccessInfo] = useState(null); // { totalPemasukan, itemCount }
  const [receipt, setReceipt] = useState(null); // data struk siap-print, dari response checkout
  const [showStruk, setShowStruk] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/umkm?table=produk`),
      apiFetch(`/api/umkm?table=dompet`),
    ]).then(([produkRes, dompetRes]) => {
      if (produkRes.success) setProdukList(produkRes.data);
      if (dompetRes.success) setDompetList(dompetRes.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const filteredProduk = useMemo(() => {
    const q = search.toLowerCase().trim();
    return produkList.filter(p => !q || p.nama.toLowerCase().includes(q));
  }, [produkList, search]);

  // Stok yang tersisa buat produk ini, dikurangin sama yang UDAH ada di keranjang —
  // biar nggak bisa nambahin lebih dari stok beneran walau belum checkout.
  const stokTersisa = (produk) => {
    if (produk.tipeProduk === "jadi_dropship") return Infinity; // nggak dilacak
    if (produk.tipeProduk === "racikan" && !produk.pakaiStok) return Infinity; // dibikin pas ada pesanan
    const diKeranjang = cart.find(c => c.produkId === produk.id)?.qty || 0;
    return (produk.stokJadi || 0) - diKeranjang;
  };

  const addToCart = (produk) => {
    if (stokTersisa(produk) <= 0) return;
    setCart(prev => {
      const existing = prev.find(c => c.produkId === produk.id);
      if (existing) {
        return prev.map(c => c.produkId === produk.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, {
        produkId: produk.id, nama: produk.nama, tipeProduk: produk.tipeProduk,
        qty: 1, hargaSatuan: produk.hargaJual,
        hargaModalAktual: produk.tipeProduk === "jadi_dropship" ? produk.hargaModal : undefined,
      }];
    });
  };

  const updateQty = (produkId, delta) => {
    setCart(prev => prev.map(c => {
      if (c.produkId !== produkId) return c;
      const produk = produkList.find(p => p.id === produkId);
      const maxQty = produk ? (stokTersisa(produk) + c.qty) : Infinity; // stokTersisa udah ngurangin qty ini, jadi tambahin balik buat dapet batas maksimal
      const next = c.qty + delta;
      if (next <= 0) return null;
      if (next > maxQty) return c;
      return { ...c, qty: next };
    }).filter(Boolean));
  };

  const removeFromCart = (produkId) => setCart(prev => prev.filter(c => c.produkId !== produkId));

  const updateModalDropship = (produkId, value) => {
    setCart(prev => prev.map(c => c.produkId === produkId ? { ...c, hargaModalAktual: value } : c));
  };

  const totalBelanja = cart.reduce((s, c) => s + (c.hargaSatuan * c.qty), 0);
  const totalItem = cart.reduce((s, c) => s + c.qty, 0);

  const handleCheckout = async () => {
    if (submitting) return;
    if (!kasTujuan) return setCheckoutError("Pilih dompet tujuan dulu ya.");
    setSubmitting(true);
    setCheckoutError("");
    try {
      const r = await apiFetch(`/api/kasir-checkout`, {
        method: "POST",
        body: JSON.stringify({
          items: cart.map(c => ({ produkId: c.produkId, qty: c.qty, hargaModalAktual: c.hargaModalAktual })),
          kas: kasTujuan,
        }),
      });
      if (!r.success) { setCheckoutError(r.message || "Gagal memproses checkout."); return; }
      setSuccessInfo({ totalPemasukan: r.totalPemasukan, itemCount: totalItem });
      setReceipt(buildReceiptData({
        strukSettings: r.strukSettings,
        items: r.items,
        totalPemasukan: r.totalPemasukan,
        tanggal: r.tanggal,
        refId: r.refId,
      }));
      setCart([]);
      setShowCheckout(false);
      setKasTujuan("");
      loadData(); // refresh stok terbaru
    } catch {
      setCheckoutError("Gagal menghubungi server, coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="kasir">
        <PageHeader title="Kasir" subtitle="Tap produk buat nambahin ke keranjang, checkout kalau udah selesai" />

        <div className="kasir__searchbar">
          <Search size={16} />
          <input type="text" placeholder="Cari produk..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="kasir__layout">
          <div className="kasir__grid stagger-list">
            {loading ? (
              <div className="kasir__empty"><p>⏳ Memuat produk...</p></div>
            ) : filteredProduk.length === 0 ? (
              <div className="kasir__empty">
                <p>Belum ada produk. Bikin dulu di halaman Produksi &amp; Stok → Kalkulator Harga.</p>
              </div>
            ) : (
              filteredProduk.map(p => {
                const sisa = stokTersisa(p);
                const habis = sisa <= 0 && sisa !== Infinity;
                return (
                  <button key={p.id} className={"kasir__card" + (habis ? " kasir__card--habis" : "")}
                    disabled={habis} onClick={() => addToCart(p)}>
                    <div className="kasir__card-thumb">
                      {p.fotoUrl ? (
                        <img src={p.fotoUrl} alt={p.nama} className="kasir__card-img" loading="lazy" />
                      ) : (
                        <div className="kasir__card-initial" style={{ background: colorFromName(p.nama) }}>
                          {p.nama.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {sisa !== Infinity && (
                        <span className={"kasir__card-stok-badge" + (habis ? " kasir__card-stok-badge--habis" : "")}>
                          {habis ? "Habis" : sisa}
                        </span>
                      )}
                    </div>
                    <div className="kasir__card-info">
                      <span className="kasir__card-nama">{p.nama}</span>
                      <span className="kasir__card-harga">{formatRupiah(p.hargaJual)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="kasir__cart">
            <h3 className="kasir__cart-title"><ShoppingCart size={16} /> Keranjang ({totalItem})</h3>
            {cart.length === 0 ? (
              <p className="kasir__cart-empty">Belum ada item. Tap produk di sebelah buat nambahin.</p>
            ) : (
              <div className="kasir__cart-items stagger-list">
                {cart.map(c => (
                  <div key={c.produkId} className="kasir__cart-item">
                    <div className="kasir__cart-item-top">
                      <span className="kasir__cart-item-nama">{c.nama}</span>
                      <button className="kasir__cart-item-remove" onClick={() => removeFromCart(c.produkId)}><Trash2 size={13} /></button>
                    </div>
                    <div className="kasir__cart-item-row">
                      <div className="kasir__qty-control">
                        <button onClick={() => updateQty(c.produkId, -1)}><Minus size={12} /></button>
                        <span>{c.qty}</span>
                        <button onClick={() => updateQty(c.produkId, 1)}><Plus size={12} /></button>
                      </div>
                      <span className="kasir__cart-item-subtotal">{formatRupiah(c.hargaSatuan * c.qty)}</span>
                    </div>
                    {c.tipeProduk === "jadi_dropship" && (
                      <div className="kasir__cart-item-modal">
                        <label>Modal dropship/unit:</label>
                        <RupiahInput placeholder="0" value={c.hargaModalAktual ?? ""} onChange={v => updateModalDropship(c.produkId, v)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                <div className="kasir__cart-total">
                  <span>Total</span>
                  <span>{formatRupiah(totalBelanja)}</span>
                </div>
                <button className="kasir__checkout-btn" onClick={() => setShowCheckout(true)}>
                  Checkout
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showCheckout && (
        <div className="kasir__modal-overlay" onClick={() => !submitting && setShowCheckout(false)}>
          <div className="kasir__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kasir__modal-title">Checkout — {formatRupiah(totalBelanja)}</h4>
            <div className="kasir__field">
              <label>Uang masuk ke dompet mana?</label>
              <select value={kasTujuan} onChange={e => { setKasTujuan(e.target.value); setCheckoutError(""); }}>
                <option value="">Pilih dompet...</option>
                {dompetList.map(d => <option key={d.id} value={d.nama}>{d.nama}</option>)}
              </select>
            </div>
            {checkoutError && <p className="kasir__error">{checkoutError}</p>}
            <div className="kasir__modal-actions">
              <button className="kasir__btn-sec" onClick={() => setShowCheckout(false)} disabled={submitting}>Batal</button>
              <button className="kasir__btn-primary" onClick={handleCheckout} disabled={submitting}>
                {submitting ? "Memproses..." : "Selesaikan Transaksi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successInfo && (
        <div className="kasir__modal-overlay" onClick={() => setSuccessInfo(null)}>
          <div className="kasir__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kasir__modal-title">✅ Transaksi Berhasil</h4>
            <p className="kasir__modal-sub">
              {successInfo.itemCount} item terjual, total {formatRupiah(successInfo.totalPemasukan)}.
              Transaksinya udah otomatis kecatet di Transaksi &amp; Laporan.
            </p>
            <div className="kasir__modal-actions">
              <button className="kasir__btn-sec" onClick={() => setSuccessInfo(null)}>Tutup</button>
              {receipt && (
                <button className="kasir__btn-primary" onClick={() => { setSuccessInfo(null); setShowStruk(true); }}>
                  🧾 Lihat &amp; Cetak Struk
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showStruk && receipt && (
        <StrukModal receipt={receipt} onClose={() => setShowStruk(false)} />
      )}
    </DashboardLayout>
  );
}
