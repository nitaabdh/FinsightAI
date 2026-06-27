import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { CATEGORIES } from "../utils/storage";
import { PRODUK_KEY, loadData, formatRupiah } from "../utils/umkmCalc";
import "./TransactionForm.css";

const KATEGORI_PRODUK = "Penjualan Produk";

// Mode edit: kalau ada prop `editData`, form diisi dengan data lama
export default function TransactionForm({ mode, onAdd, onEdit, onClose, editData = null }) {
  const { user } = useAuth();
  const accent   = mode === "umkm" ? "umkm" : "personal";
  const isEdit   = !!editData;

  const [form, setForm] = useState({
    type:        editData?.type        || "pemasukan",
    amount:      editData?.amount      || "",
    category:    editData?.category    || "",
    description: editData?.description || "",
    date:        editData?.date        || new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  // ── Pilih dari Produk (khusus UMKM, pemasukan) ───────────────────────────────
  const [produkList, setProdukList]   = useState([]);
  const [selProdukId, setSelProdukId] = useState(editData?.produkId || "");
  const [jumlahUnit, setJumlahUnit]   = useState(editData?.jumlahUnit ? String(editData.jumlahUnit) : "1");
  // Snapshot resep produk yang sedang dipilih (bahanId, jumlahPakai, satuanPakai) — dikirim ke parent saat submit
  const [selItems, setSelItems] = useState(editData?.items || null);

  const showProdukPicker = mode === "umkm" && form.type === "pemasukan";

  useEffect(() => {
    if (user && mode === "umkm") setProdukList(loadData(PRODUK_KEY(user.id)));
  }, [user, mode]);

  const categories = (() => {
    const base = CATEGORIES[mode]?.[form.type] || [];
    if (showProdukPicker && !base.includes(KATEGORI_PRODUK)) return [...base, KATEGORI_PRODUK];
    return base;
  })();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "type" ? { category: "" } : {}),
    }));
    setError("");
    // Kalau type diganti dari pemasukan, lepaskan keterikatan produk
    if (name === "type" && value !== "pemasukan") {
      setSelProdukId(""); setSelItems(null); setJumlahUnit("1");
    }
    // Kalau user mengubah manual amount/category/description, lepaskan keterikatan dari produk
    if (["amount", "category", "description"].includes(name)) {
      setSelProdukId(""); setSelItems(null);
    }
  };

  const handleSelectProduk = (produkId) => {
    setSelProdukId(produkId);
    if (!produkId) { setSelItems(null); return; }
    const produk = produkList.find((p) => p.id === produkId);
    if (!produk) return;
    const qty = parseInt(jumlahUnit, 10) || 1;
    setSelItems(produk.items);
    setForm((prev) => ({
      ...prev,
      amount: String(produk.hargaJual * qty),
      category: KATEGORI_PRODUK,
      description: produk.nama,
    }));
    setError("");
  };

  const handleJumlahUnitChange = (val) => {
    setJumlahUnit(val);
    if (!selProdukId) return;
    const produk = produkList.find((p) => p.id === selProdukId);
    if (!produk) return;
    const qty = parseInt(val, 10) || 0;
    setForm((prev) => ({ ...prev, amount: String(produk.hargaJual * qty) }));
  };

  const handleSubmit = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      setError("Masukkan nominal yang valid."); return;
    }
    if (!form.category) {
      setError("Pilih kategori terlebih dahulu."); return;
    }
    if (selProdukId && (!jumlahUnit || isNaN(jumlahUnit) || Number(jumlahUnit) <= 0)) {
      setError("Masukkan jumlah unit yang valid."); return;
    }

    const data = {
      ...form,
      amount: Number(form.amount),
      // Snapshot resep & qty disertakan HANYA kalau transaksi ini berasal dari produk.
      // Ini dipakai TransaksiPage untuk memotong/mengembalikan stok bahan baku.
      ...(selProdukId ? {
        produkId: selProdukId,
        items: selItems || [],
        jumlahUnit: Number(jumlahUnit) || 1,
      } : {
        produkId: null,
        items: [],
        jumlahUnit: null,
      }),
    };

    if (isEdit) {
      onEdit({ ...editData, ...data });
    } else {
      onAdd(data);
    }
    onClose();
  };

  return (
    <div className="txform__overlay" onClick={onClose}>
      <div className="txform animate-fadeUp" onClick={(e) => e.stopPropagation()}>
        <div className="txform__header">
          <h3 className="txform__title">
            {isEdit ? "✏️ Edit Transaksi" : "Catat Transaksi"}
          </h3>
          <button className="txform__close" onClick={onClose}>✕</button>
        </div>

        {/* Type Toggle */}
        <div className="txform__type-toggle">
          {["pemasukan", "pengeluaran"].map((t) => (
            <button
              key={t}
              className={`txform__type-btn ${form.type === t ? "txform__type-btn--active txform__type-btn--" + t : ""}`}
              onClick={() => {
                setForm((p) => ({ ...p, type: t, category: "" }));
                if (t !== "pemasukan") { setSelProdukId(""); setSelItems(null); setJumlahUnit("1"); }
              }}
            >
              {t === "pemasukan" ? "⬆ Pemasukan" : "⬇ Pengeluaran"}
            </button>
          ))}
        </div>

        <div className="txform__fields">
          {/* Pilih dari Produk — khusus UMKM & tipe pemasukan */}
          {showProdukPicker && (
            <div className="txform__field">
              <label className="txform__label">Pilih dari Produk (opsional)</label>
              {produkList.length === 0 ? (
                <p className="txform__hint">
                  Belum ada produk dihitung. Buat dulu di tab <strong>Kalkulator Harga Jual</strong>.
                </p>
              ) : (
                <select
                  className={"txform__input txform__input--" + accent}
                  value={selProdukId}
                  onChange={(e) => handleSelectProduk(e.target.value)}
                >
                  <option value="">-- Pilih produk --</option>
                  {produkList.map((p) => (
                    <option key={p.id} value={p.id}>{p.nama} ({formatRupiah(p.hargaJual)})</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Jumlah Unit — muncul hanya kalau produk dipilih */}
          {showProdukPicker && selProdukId && (
            <div className="txform__field">
              <label className="txform__label">Jumlah Unit Terjual</label>
              <input
                className={"txform__input txform__input--" + accent}
                type="number"
                min="1"
                value={jumlahUnit}
                onChange={(e) => handleJumlahUnitChange(e.target.value)}
              />
              <p className="txform__hint txform__hint--tight">
                Stok bahan baku akan otomatis berkurang sesuai resep × jumlah unit ini.
              </p>
            </div>
          )}

          <div className="txform__field">
            <label className="txform__label">Nominal (Rp)</label>
            <input
              className={"txform__input txform__input--" + accent}
              type="number"
              name="amount"
              placeholder="Contoh: 150000"
              value={form.amount}
              onChange={handleChange}
              min="0"
            />
          </div>

          <div className="txform__field">
            <label className="txform__label">Kategori</label>
            <select
              className={"txform__input txform__input--" + accent}
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              <option value="">-- Pilih kategori --</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="txform__field">
            <label className="txform__label">Tanggal</label>
            <input
              className={"txform__input txform__input--" + accent}
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
            />
          </div>

          <div className="txform__field">
            <label className="txform__label">Keterangan (opsional)</label>
            <input
              className={"txform__input txform__input--" + accent}
              type="text"
              name="description"
              placeholder={mode === "umkm" ? "Misal: Penjualan Senin pagi" : "Misal: Makan siang"}
              value={form.description}
              onChange={handleChange}
            />
          </div>

          {error && <div className="txform__error">⚠️ {error}</div>}

          <button
            className={"txform__submit txform__submit--" + accent}
            onClick={handleSubmit}
          >
            {isEdit ? "Simpan Perubahan" : "Simpan Transaksi"}
          </button>
        </div>
      </div>
    </div>
  );
}
