import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { CATEGORIES } from "../utils/storage";
import { formatRupiah } from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import "./TransactionForm.css";

const KATEGORI_PRODUK = "Penjualan Produk";

const CATEGORY_EMOJI = {
  "makan": "🍔", "makanan": "🍔", "transportasi": "🚗", "transport": "🚗",
  "belanja": "🛍️", "hiburan": "🎮", "kesehatan": "💊", "pendidikan": "📚",
  "tagihan": "🧾", "listrik": "💡", "air": "🚰", "internet": "🌐",
  "pulsa": "📱", "gaji": "💰", "freelance": "💼", "investasi": "📈",
  "tabungan": "🏦", "hadiah": "🎁", "lainnya": "🗂️",
  "penjualan produk": "🛒",
};
function getCategoryEmoji(cat) {
  if (!cat) return "🗂️";
  return CATEGORY_EMOJI[cat.toLowerCase().trim()] || "🗂️";
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function TransactionForm({ mode, onAdd, onEdit, onClose, editData = null }) {
  const { user } = useAuth();
  const accent = mode === "umkm" ? "umkm" : "personal";
  const isEdit = !!editData;
  const catInputRef = useRef(null);
  const catDropdownRef = useRef(null);

  const [form, setForm] = useState({
    type:        editData?.type        || "pemasukan",
    amount:      editData?.amount      || "",
    category:    editData?.category    || "",
    description: editData?.description || "",
    date:        editData?.date        || new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  // Smart category state
  const [catQuery,      setCatQuery]      = useState(editData?.category || "");
  const [catOpen,       setCatOpen]       = useState(false);
  const [usedCategories, setUsedCategories] = useState([]);

  const [produkList,  setProdukList]  = useState([]);
  const [selProdukId, setSelProdukId] = useState(editData?.produkId || "");
  const [jumlahUnit,  setJumlahUnit]  = useState(editData?.jumlahUnit ? String(editData.jumlahUnit) : "1");
  const [selItems,    setSelItems]    = useState(editData?.items || null);

  const showProdukPicker = mode === "umkm" && form.type === "pemasukan";

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem("finsight_token");
      fetch(`/api/transactions?mode=${mode}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(r => {
        if (r.success) {
          const cats = [...new Set(r.data.map(tx => tx.category).filter(Boolean))];
          setUsedCategories(cats);
        }
      });
    }
  }, [user, mode]);

  // Tutup dropdown kalau klik di luar
  useEffect(() => {
    const handler = (e) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target) &&
          catInputRef.current && !catInputRef.current.contains(e.target)) {
        setCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (user && mode === "umkm") {
      apiFetch(`/api/umkm?table=produk`).then(r => { if (r.success) setProdukList(r.data); });
    }
  }, [user, mode]);

  // Refresh produk kalau ada update dari KalkulatorHarga
  useEffect(() => {
    const refresh = () => {
      if (user && mode === "umkm") {
        apiFetch(`/api/umkm?table=produk`).then(r => { if (r.success) setProdukList(r.data); });
      }
    };
    window.addEventListener("produkUpdated", refresh);
    return () => window.removeEventListener("produkUpdated", refresh);
  }, [user, mode]);

  const categories = (() => {
    const base = CATEGORIES[mode]?.[form.type] || [];
    const combined = [...new Set([...base, ...usedCategories])];
    if (showProdukPicker && !combined.includes(KATEGORI_PRODUK)) return [...combined, KATEGORI_PRODUK];
    return combined;
  })();

  // Filtered suggestions berdasarkan query
  const catSuggestions = catQuery.trim() === ""
    ? categories
    : categories.filter(c => c.toLowerCase().includes(catQuery.toLowerCase()));
  const isExistingCat = categories.some(c => c.toLowerCase() === catQuery.toLowerCase().trim());
  const isCustomInput = catQuery.trim() !== "" && !isExistingCat;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value, ...(name === "type" ? { category: "" } : {}) }));
    if (name === "type") { setCatQuery(""); setCatOpen(false); }
    setError("");
    if (name === "type" && value !== "pemasukan") { setSelProdukId(""); setSelItems(null); setJumlahUnit("1"); }
    if (["amount", "category", "description"].includes(name)) { setSelProdukId(""); setSelItems(null); }
  };

  const handleAmountChange = (val) => {
    setForm(prev => ({ ...prev, amount: val }));
    setError("");
    setSelProdukId(""); setSelItems(null);
  };

  const handleCatSelect = (cat) => {
    setForm(prev => ({ ...prev, category: cat }));
    setCatQuery(cat);
    setCatOpen(false);
    setError("");
  };

  const handleCatInput = (e) => {
    const val = e.target.value;
    setCatQuery(val);
    setForm(prev => ({ ...prev, category: val }));
    setCatOpen(true);
    setError("");
    setSelProdukId(""); setSelItems(null);
  };

  const handleSelectProduk = (produkId) => {
    setSelProdukId(produkId);
    if (!produkId) { setSelItems(null); return; }
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) return;
    const qty = parseInt(jumlahUnit, 10) || 1;
    setSelItems(produk.items);
    // Math.round jaga-jaga kalau hargaJual tersimpan desimal (dari hasil bagi/kali
    // di Kalkulator Harga) — desimal bikin titik ribuan salah kalkulasi kalau lolos mentah.
    setForm(prev => ({ ...prev, amount: String(Math.round(produk.hargaJual * qty)), category: KATEGORI_PRODUK, description: produk.nama }));
    setCatQuery(KATEGORI_PRODUK);
    setError("");
  };

  const handleJumlahUnitChange = (val) => {
    setJumlahUnit(val);
    if (!selProdukId) return;
    const produk = produkList.find(p => p.id === selProdukId);
    if (!produk) return;
    const qty = parseInt(val, 10) || 0;
    setForm(prev => ({ ...prev, amount: String(Math.round(produk.hargaJual * qty)) }));
  };

  const handleSubmit = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) { setError("Masukkan nominal yang valid."); return; }
    if (!form.category) { setError("Pilih kategori terlebih dahulu."); return; }
    if (selProdukId && (!jumlahUnit || isNaN(jumlahUnit) || Number(jumlahUnit) <= 0)) { setError("Masukkan jumlah unit yang valid."); return; }

    const data = {
      ...form,
      amount: Number(form.amount),
      ...(selProdukId
        ? { produkId: selProdukId, items: selItems || [], jumlahUnit: Number(jumlahUnit) || 1 }
        : { produkId: null, items: [], jumlahUnit: null }),
    };

    if (isEdit) { onEdit({ ...editData, ...data }); } else { onAdd(data); }
    onClose();
  };

  return (
    <div className="txform__overlay" onClick={onClose}>
      <div className="txform animate-fadeUp" onClick={e => e.stopPropagation()}>
        <div className="txform__header">
          <h3 className="txform__title">{isEdit ? "✏️ Edit Transaksi" : "Catat Transaksi"}</h3>
          <button className="txform__close" onClick={onClose}>✕</button>
        </div>

        <div className="txform__type-toggle">
          {["pemasukan", "pengeluaran"].map(t => (
            <button key={t}
              className={`txform__type-btn ${form.type === t ? "txform__type-btn--active txform__type-btn--" + t : ""}`}
              onClick={() => { setForm(p => ({ ...p, type: t, category: "" })); if (t !== "pemasukan") { setSelProdukId(""); setSelItems(null); setJumlahUnit("1"); } }}
            >
              {t === "pemasukan" ? "⬆ Pemasukan" : "⬇ Pengeluaran"}
            </button>
          ))}
        </div>

        <div className="txform__fields">
          {showProdukPicker && (
            <div className="txform__field">
              <label className="txform__label">Pilih dari Produk (opsional)</label>
              {produkList.length === 0 ? (
                <p className="txform__hint">Belum ada produk dihitung. Buat dulu di tab <strong>Kalkulator Harga Jual</strong>.</p>
              ) : (
                <select className={"txform__input txform__input--" + accent} value={selProdukId} onChange={e => handleSelectProduk(e.target.value)}>
                  <option value="">-- Pilih produk --</option>
                  {produkList.map(p => <option key={p.id} value={p.id}>{p.nama} ({formatRupiah(p.hargaJual)})</option>)}
                </select>
              )}
            </div>
          )}

          {showProdukPicker && selProdukId && (
            <div className="txform__field">
              <label className="txform__label">Jumlah Unit Terjual</label>
              <input className={"txform__input txform__input--" + accent} type="number" min="1"
                value={jumlahUnit} onChange={e => handleJumlahUnitChange(e.target.value)} />
              <p className="txform__hint txform__hint--tight">Stok bahan baku akan otomatis berkurang sesuai resep × jumlah unit ini.</p>
            </div>
          )}

          <div className="txform__field">
            <label className="txform__label">Nominal (Rp)</label>
            <RupiahInput className={"txform__input txform__input--" + accent}
              placeholder="Contoh: 150.000" value={form.amount} onChange={handleAmountChange} />
          </div>

          <div className="txform__field">
            <label className="txform__label">Kategori</label>
            <div className="txform__cat-wrap" style={{ position: "relative" }}>
              <input
                ref={catInputRef}
                className={"txform__input txform__input--" + accent + (isCustomInput ? " txform__input--custom-cat" : "")}
                type="text"
                placeholder="Ketik atau pilih kategori..."
                value={catQuery}
                onChange={handleCatInput}
                onFocus={() => setCatOpen(true)}
                autoComplete="off"
              />
              {catQuery && (
                <button className="txform__cat-clear" onClick={() => { setCatQuery(""); setForm(p => ({ ...p, category: "" })); setCatOpen(true); }}>✕</button>
              )}
              {isCustomInput && (
                <span className="txform__cat-badge txform__cat-badge--new">Baru</span>
              )}
              {isExistingCat && catQuery.trim() !== "" && (
                <span className="txform__cat-badge txform__cat-badge--exists">✓ Ada</span>
              )}
              {catOpen && catSuggestions.length > 0 && (
                <div ref={catDropdownRef} className="txform__cat-dropdown">
                  {isCustomInput && (
                    <div
                      className="txform__cat-option txform__cat-option--create"
                      onMouseDown={() => handleCatSelect(catQuery.trim())}
                    >
                      <span>➕</span> Buat "<strong>{catQuery.trim()}</strong>"
                    </div>
                  )}
                  {catSuggestions.map(c => (
                    <div
                      key={c}
                      className={"txform__cat-option " + (c === form.category ? "txform__cat-option--active" : "")}
                      onMouseDown={() => handleCatSelect(c)}
                    >
                      <span>{getCategoryEmoji ? getCategoryEmoji(c) : "🗂️"}</span> {c}
                      {usedCategories.includes(c) && !CATEGORIES[mode]?.[form.type]?.includes(c) && (
                        <span className="txform__cat-used">Pernah dipakai</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="txform__field">
            <label className="txform__label">Tanggal</label>
            <input className={"txform__input txform__input--" + accent} type="date" name="date" value={form.date} onChange={handleChange} />
          </div>

          <div className="txform__field">
            <label className="txform__label">Keterangan (opsional)</label>
            <input className={"txform__input txform__input--" + accent} type="text" name="description"
              placeholder={mode === "umkm" ? "Misal: Penjualan Senin pagi" : "Misal: Makan siang"}
              value={form.description} onChange={handleChange} />
          </div>

          {error && <div className="txform__error">⚠️ {error}</div>}

          <button className={"txform__submit txform__submit--" + accent} onClick={handleSubmit}>
            {isEdit ? "Simpan Perubahan" : "Simpan Transaksi"}
          </button>
        </div>
      </div>
    </div>
  );
}
