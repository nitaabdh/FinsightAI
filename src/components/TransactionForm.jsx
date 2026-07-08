import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { CATEGORIES } from "../utils/storage";
import { formatRupiah } from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import "./TransactionForm.css";
import "./TransactionForm.smartcat.css";

const KATEGORI_PRODUK = "Penjualan Produk";
// Kategori khusus: bikin produk buat sample/contoh marketing — stok bahan tetap kepakai
// sesuai resep, TAPI ini pengeluaran (biaya), BUKAN pemasukan penjualan.
const KATEGORI_SAMPLE = "Sample & Marketing";
// Kategori tetap buat transfer antar dompet — bukan pemasukan/pengeluaran beneran,
// cuma perpindahan uang antar kas (misal saldo QRIS dicairkan ke rekening bank).
const KATEGORI_TRANSFER = "Transfer Antar Dompet";

// Preset kas/wadah uang bawaan — selalu muncul di dropdown, bisa ditambah custom sendiri
const KAS_PRESET = ["Kas Tunai", "Rekening Bank", "E-Wallet"];

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

const KAS_EMOJI = { "kas tunai": "💵", "rekening bank": "🏦", "e-wallet": "📱" };
function getKasEmoji(k) {
  if (!k) return "💳";
  return KAS_EMOJI[k.toLowerCase().trim()] || "💳";
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
  const kasInputRef = useRef(null);
  const kasDropdownRef = useRef(null);
  const kasTujuanInputRef = useRef(null);
  const kasTujuanDropdownRef = useRef(null);

  const showKas = mode === "umkm";

  const [form, setForm] = useState({
    type:        editData?.type        || "pemasukan",
    amount:      editData?.amount      || "",
    category:    editData?.category    || "",
    description: editData?.description || "",
    date:        editData?.date        || new Date().toISOString().slice(0, 10),
    ...(showKas ? { kas: editData?.kas || "Kas Tunai", kasTujuan: editData?.kasTujuan || "" } : {}),
  });
  const [error, setError] = useState("");

  // Smart category state
  const [catQuery,      setCatQuery]      = useState(editData?.category || "");
  const [catOpen,       setCatOpen]       = useState(false);
  const [usedCategories, setUsedCategories] = useState([]);

  // Smart kas/wadah state (mirip pola kategori)
  const [kasQuery, setKasQuery] = useState(editData?.kas || (showKas ? "Kas Tunai" : ""));
  const [kasOpen,  setKasOpen]  = useState(false);
  const [usedKas,  setUsedKas]  = useState([]);

  // Smart dompet TUJUAN — cuma dipakai kalau type === "transfer"
  const [kasTujuanQuery, setKasTujuanQuery] = useState(editData?.kasTujuan || "");
  const [kasTujuanOpen,  setKasTujuanOpen]  = useState(false);

  const [produkList,  setProdukList]  = useState([]);
  const [selProdukId, setSelProdukId] = useState(editData?.produkId || "");
  const [jumlahUnit,  setJumlahUnit]  = useState(editData?.jumlahUnit ? String(editData.jumlahUnit) : "1");
  const [selItems,    setSelItems]    = useState(editData?.items || null);

  const showProdukPicker = mode === "umkm" && (form.type === "pemasukan" || (form.type === "pengeluaran" && form.category === KATEGORI_SAMPLE));
  const isSampleFlow = form.type === "pengeluaran" && form.category === KATEGORI_SAMPLE;
  const isTransferFlow = form.type === "transfer";

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem("finsight_token");
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      Promise.all([
        fetch(`/api/transactions?mode=${mode}`, { headers }).then(r => r.json()),
        // Dompet yang udah didaftarin manual di halaman Laporan > Dompet — biar dompet baru
        // (misal "QRIS" yang saldonya masih 0) tetap muncul di sini walau belum pernah dipakai transaksi.
        showKas ? fetch(`/api/umkm?table=dompet`, { headers }).then(r => r.json()) : Promise.resolve({ success: false }),
      ]).then(([txRes, dompetRes]) => {
        if (txRes.success) {
          const cats = [...new Set(txRes.data.map(tx => tx.category).filter(Boolean))];
          setUsedCategories(cats);
          if (showKas) {
            const kasHist = txRes.data.map(tx => tx.kas).filter(Boolean);
            const dompetTerdaftar = dompetRes.success ? dompetRes.data.map(d => d.nama) : [];
            setUsedKas([...new Set([...kasHist, ...dompetTerdaftar])]);
          }
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
      if (kasDropdownRef.current && !kasDropdownRef.current.contains(e.target) &&
          kasInputRef.current && !kasInputRef.current.contains(e.target)) {
        setKasOpen(false);
      }
      if (kasTujuanDropdownRef.current && !kasTujuanDropdownRef.current.contains(e.target) &&
          kasTujuanInputRef.current && !kasTujuanInputRef.current.contains(e.target)) {
        setKasTujuanOpen(false);
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

  // Kalau produk-picker jadi disembunyikan (ganti tipe atau kategori menjauh dari
  // Penjualan Produk / Sample & Marketing), produk yg kepilih sebelumnya harus direset —
  // biar nggak ada items/jumlahUnit "hantu" ikut kesave pas submit.
  useEffect(() => {
    if (!showProdukPicker && selProdukId) { setSelProdukId(""); setSelItems(null); }
  }, [showProdukPicker]);

  const categories = (() => {
    const base = CATEGORIES[mode]?.[form.type] || [];
    const combined = [...new Set([...base, ...usedCategories])];
    if (showProdukPicker && form.type === "pemasukan" && !combined.includes(KATEGORI_PRODUK)) return [...combined, KATEGORI_PRODUK];
    return combined;
  })();

  // Filtered suggestions berdasarkan query
  const catSuggestions = catQuery.trim() === ""
    ? categories
    : categories.filter(c => c.toLowerCase().includes(catQuery.toLowerCase()));
  const isExistingCat = categories.some(c => c.toLowerCase() === catQuery.toLowerCase().trim());
  const isCustomInput = catQuery.trim() !== "" && !isExistingCat;

  // Kas: preset + histori pemakaian sebelumnya, dedup case-insensitive
  // ("BCA" & "bca" dianggap sama, yang dipakai casing yang pertama kali muncul)
  const kasOptions = (() => {
    const map = {};
    [...KAS_PRESET, ...usedKas].forEach(k => {
      const key = k.toLowerCase().trim();
      if (!(key in map)) map[key] = k;
    });
    return Object.values(map);
  })();
  const kasSuggestions = kasQuery.trim() === ""
    ? kasOptions
    : kasOptions.filter(k => k.toLowerCase().includes(kasQuery.toLowerCase()));
  const isExistingKas = kasOptions.some(k => k.toLowerCase() === kasQuery.toLowerCase().trim());
  const isCustomKasInput = kasQuery.trim() !== "" && !isExistingKas;

  // Dompet tujuan (transfer) — pakai daftar kasOptions yang sama, cuma query beda
  const kasTujuanSuggestions = kasTujuanQuery.trim() === ""
    ? kasOptions
    : kasOptions.filter(k => k.toLowerCase().includes(kasTujuanQuery.toLowerCase()));
  const isExistingKasTujuan = kasOptions.some(k => k.toLowerCase() === kasTujuanQuery.toLowerCase().trim());
  const isCustomKasTujuanInput = kasTujuanQuery.trim() !== "" && !isExistingKasTujuan;

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

  // Handler kas — pola sama persis dengan kategori
  const handleKasSelect = (kas) => {
    setForm(prev => ({ ...prev, kas }));
    setKasQuery(kas);
    setKasOpen(false);
    setError("");
  };

  const handleKasInput = (e) => {
    const val = e.target.value;
    setKasQuery(val);
    setForm(prev => ({ ...prev, kas: val }));
    setKasOpen(true);
    setError("");
  };

  // Handler dompet tujuan — pola sama persis dengan kas asal
  const handleKasTujuanSelect = (kas) => {
    setForm(prev => ({ ...prev, kasTujuan: kas }));
    setKasTujuanQuery(kas);
    setKasTujuanOpen(false);
    setError("");
  };

  const handleKasTujuanInput = (e) => {
    const val = e.target.value;
    setKasTujuanQuery(val);
    setForm(prev => ({ ...prev, kasTujuan: val }));
    setKasTujuanOpen(true);
    setError("");
  };

  const handleSelectProduk = (produkId) => {
    setSelProdukId(produkId);
    if (!produkId) { setSelItems(null); return; }
    const produk = produkList.find(p => p.id === produkId);
    if (!produk) return;
    const qty = parseInt(jumlahUnit, 10) || 1;
    setSelItems(produk.items);
    // Sample/marketing: nominal yang kecatat = biaya produksi (HPP), bukan harga jual —
    // karena ini pengeluaran/biaya, bukan pemasukan penjualan. Kategori juga TIDAK ditimpa
    // (biar tetap "Sample & Marketing", bukan berubah jadi "Penjualan Produk").
    const nilai = isSampleFlow ? (produk.totalBiaya || 0) : produk.hargaJual;
    // Math.round jaga-jaga kalau hargaJual/totalBiaya tersimpan desimal (dari hasil bagi/kali
    // di Kalkulator Harga) — desimal bikin titik ribuan salah kalkulasi kalau lolos mentah.
    setForm(prev => ({
      ...prev,
      amount: String(Math.round(nilai * qty)),
      description: produk.nama,
      ...(isSampleFlow ? {} : { category: KATEGORI_PRODUK }),
    }));
    if (!isSampleFlow) setCatQuery(KATEGORI_PRODUK);
    setError("");
  };

  const handleJumlahUnitChange = (val) => {
    setJumlahUnit(val);
    if (!selProdukId) return;
    const produk = produkList.find(p => p.id === selProdukId);
    if (!produk) return;
    const qty = parseInt(val, 10) || 0;
    const nilai = isSampleFlow ? (produk.totalBiaya || 0) : produk.hargaJual;
    setForm(prev => ({ ...prev, amount: String(Math.round(nilai * qty)) }));
  };

  const handleSubmit = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) { setError("Masukkan nominal yang valid."); return; }

    if (isTransferFlow) {
      if (!form.kas?.trim())        { setError("Pilih dompet asal (uang keluar dari mana)."); return; }
      if (!form.kasTujuan?.trim())  { setError("Pilih dompet tujuan (uang masuk ke mana)."); return; }
      if (form.kas.trim().toLowerCase() === form.kasTujuan.trim().toLowerCase()) {
        setError("Dompet asal dan tujuan nggak boleh sama."); return;
      }
    } else {
      if (!form.category) { setError("Pilih kategori terlebih dahulu."); return; }
      if (showKas && !form.kas?.trim()) { setError("Pilih atau isi kas/wadah uangnya terlebih dahulu."); return; }
    }
    if (selProdukId && (!jumlahUnit || isNaN(jumlahUnit) || Number(jumlahUnit) <= 0)) { setError("Masukkan jumlah unit yang valid."); return; }

    // Kalau kas yang diketik cocok (case-insensitive) sama yang udah ada, pakai casing yang lama
    // biar nggak nyipta variasi baru (misal ketik "bca" padahal udah ada "BCA").
    let kasFinal = form.kas?.trim();
    if (showKas && kasFinal) {
      const match = kasOptions.find(k => k.toLowerCase() === kasFinal.toLowerCase());
      if (match) kasFinal = match;
    }
    let kasTujuanFinal = form.kasTujuan?.trim();
    if (isTransferFlow && kasTujuanFinal) {
      const match = kasOptions.find(k => k.toLowerCase() === kasTujuanFinal.toLowerCase());
      if (match) kasTujuanFinal = match;
    }

    const data = {
      ...form,
      amount: Number(form.amount),
      ...(showKas ? { kas: kasFinal } : {}),
      ...(isTransferFlow ? { kasTujuan: kasTujuanFinal, category: KATEGORI_TRANSFER } : {}),
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

        <div className="txform__type-toggle" style={!showKas ? { gridTemplateColumns: "1fr 1fr" } : undefined}>
          {(showKas ? ["pemasukan", "pengeluaran", "transfer"] : ["pemasukan", "pengeluaran"]).map(t => (
            <button key={t}
              className={`txform__type-btn ${form.type === t ? "txform__type-btn--active txform__type-btn--" + t : ""}`}
              onClick={() => {
                setForm(p => ({ ...p, type: t, category: t === "transfer" ? KATEGORI_TRANSFER : "" }));
                setCatQuery(t === "transfer" ? KATEGORI_TRANSFER : "");
                if (t !== "pemasukan") { setSelProdukId(""); setSelItems(null); setJumlahUnit("1"); }
              }}
            >
              {t === "pemasukan" ? "⬆ Pemasukan" : t === "pengeluaran" ? "⬇ Pengeluaran" : "🔄 Transfer"}
            </button>
          ))}
        </div>

        <div className="txform__fields">
          {!isTransferFlow && (
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
            {isSampleFlow && (
              <p className="txform__hint txform__hint--tight">
                🧪 Mode Sample/Marketing: pilih produk di bawah, stok bahan bakunya otomatis kepakai sesuai resep, tapi nominalnya dihitung dari biaya produksi (HPP) — BUKAN harga jual, dan tidak dianggap sebagai penjualan.
              </p>
            )}
          </div>
          )}

          {showProdukPicker && (
            <div className="txform__field">
              <label className="txform__label">Pilih dari Produk (opsional)</label>
              {produkList.length === 0 ? (
                <p className="txform__hint">Belum ada produk dihitung. Buat dulu di tab <strong>Kalkulator Harga Jual</strong>.</p>
              ) : (
                <select className={"txform__input txform__input--" + accent} value={selProdukId} onChange={e => handleSelectProduk(e.target.value)}>
                  <option value="">-- Pilih produk --</option>
                  {produkList.map(p => <option key={p.id} value={p.id}>{p.nama} ({formatRupiah(isSampleFlow ? (p.totalBiaya || 0) : p.hargaJual)})</option>)}
                </select>
              )}
            </div>
          )}

          {showProdukPicker && selProdukId && (
            <div className="txform__field">
              <label className="txform__label">{isSampleFlow ? "Jumlah Unit Dipakai" : "Jumlah Unit Terjual"}</label>
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

          {isTransferFlow && (
            <p className="txform__hint txform__hint--tight">
              🔄 Transfer nggak dihitung sebagai omzet/pengeluaran baru — cuma mindahin saldo antar dompet (misal saldo QRIS yang dicairkan ke rekening bank).
            </p>
          )}

          {/* Kas / Wadah Uang — cuma tampil di mode UMKM */}
          {showKas && (
            <div className="txform__field">
              <label className="txform__label">{isTransferFlow ? "Dari Dompet" : form.type === "pemasukan" ? "Uang Masuk ke Kas" : "Uang Keluar dari Kas"}</label>
              <div className="txform__cat-wrap" style={{ position: "relative" }}>
                <input
                  ref={kasInputRef}
                  className={"txform__input txform__input--" + accent + (isCustomKasInput ? " txform__input--custom-cat" : "")}
                  type="text"
                  placeholder="Ketik atau pilih kas..."
                  value={kasQuery}
                  onChange={handleKasInput}
                  onFocus={() => setKasOpen(true)}
                  autoComplete="off"
                />
                {isCustomKasInput && (
                  <span className="txform__cat-badge txform__cat-badge--new">Baru</span>
                )}
                {isExistingKas && kasQuery.trim() !== "" && (
                  <span className="txform__cat-badge txform__cat-badge--exists">✓ Ada</span>
                )}
                {kasOpen && kasSuggestions.length > 0 && (
                  <div ref={kasDropdownRef} className="txform__cat-dropdown">
                    {isCustomKasInput && (
                      <div
                        className="txform__cat-option txform__cat-option--create"
                        onMouseDown={() => handleKasSelect(kasQuery.trim())}
                      >
                        <span>➕</span> Buat "<strong>{kasQuery.trim()}</strong>"
                      </div>
                    )}
                    {kasSuggestions.map(k => (
                      <div
                        key={k}
                        className={"txform__cat-option " + (k === form.kas ? "txform__cat-option--active" : "")}
                        onMouseDown={() => handleKasSelect(k)}
                      >
                        <span>{getKasEmoji(k)}</span> {k}
                        {!KAS_PRESET.includes(k) && (
                          <span className="txform__cat-used">Pernah dipakai</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {showKas && isTransferFlow && (
            <div className="txform__field">
              <label className="txform__label">Ke Dompet</label>
              <div className="txform__cat-wrap" style={{ position: "relative" }}>
                <input
                  ref={kasTujuanInputRef}
                  className={"txform__input txform__input--" + accent + (isCustomKasTujuanInput ? " txform__input--custom-cat" : "")}
                  type="text"
                  placeholder="Ketik atau pilih dompet tujuan..."
                  value={kasTujuanQuery}
                  onChange={handleKasTujuanInput}
                  onFocus={() => setKasTujuanOpen(true)}
                  autoComplete="off"
                />
                {isCustomKasTujuanInput && (
                  <span className="txform__cat-badge txform__cat-badge--new">Baru</span>
                )}
                {isExistingKasTujuan && kasTujuanQuery.trim() !== "" && (
                  <span className="txform__cat-badge txform__cat-badge--exists">✓ Ada</span>
                )}
                {kasTujuanOpen && kasTujuanSuggestions.length > 0 && (
                  <div ref={kasTujuanDropdownRef} className="txform__cat-dropdown">
                    {isCustomKasTujuanInput && (
                      <div
                        className="txform__cat-option txform__cat-option--create"
                        onMouseDown={() => handleKasTujuanSelect(kasTujuanQuery.trim())}
                      >
                        <span>➕</span> Buat "<strong>{kasTujuanQuery.trim()}</strong>"
                      </div>
                    )}
                    {kasTujuanSuggestions.map(k => (
                      <div
                        key={k}
                        className={"txform__cat-option " + (k === form.kasTujuan ? "txform__cat-option--active" : "")}
                        onMouseDown={() => handleKasTujuanSelect(k)}
                      >
                        <span>{getKasEmoji(k)}</span> {k}
                        {!KAS_PRESET.includes(k) && (
                          <span className="txform__cat-used">Pernah dipakai</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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
