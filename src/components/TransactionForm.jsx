import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { CATEGORIES } from "../utils/storage";
import { formatRupiah } from "../utils/umkmCalc";
import { PLATFORM_PRESETS, buatFeeRowsDariPreset, genFeeId, hitungDanaBersih } from "../utils/marketplaceCalc";
import RupiahInput from "./RupiahInput";
import "./TransactionForm.css";
import "./TransactionForm.smartcat.css";

import { X } from "lucide-react";
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

  // Kas/dompet sekarang dipakai di kedua mode (UMKM & Personal) — biar saldo per
  // dompet & halaman Dompet personal bisa ngitung dari histori transaksi juga.
  const showKas = true;

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

  // ── Penjualan Online / Marketplace — cuma relevan pas mode UMKM & tipe Pemasukan ──
  const [isOnlineSale, setIsOnlineSale]   = useState(false);
  const [onlinePlatform, setOnlinePlatform] = useState("shopee");
  const [onlineFeeRows, setOnlineFeeRows] = useState(buatFeeRowsDariPreset("shopee"));

  const handlePilihOnlinePlatform = (key) => {
    setOnlinePlatform(key);
    setOnlineFeeRows(buatFeeRowsDariPreset(key));
  };
  const updateOnlineFeeRow = (id, field, value) =>
    setOnlineFeeRows(rows => rows.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  const addOnlineFeeRow = () => setOnlineFeeRows(rows => [...rows, { id: genFeeId(), nama: "", tipe: "persen", nilai: 0 }]);
  const removeOnlineFeeRow = (id) => setOnlineFeeRows(rows => rows.filter(r => r.id !== id));

  const onlineCalc = isOnlineSale ? hitungDanaBersih(form.amount, onlineFeeRows) : null;

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
        setKasQuery(form.kas || "Kas Tunai"); // buang teks pencarian yang belum dipilih
      }
      if (kasTujuanDropdownRef.current && !kasTujuanDropdownRef.current.contains(e.target) &&
          kasTujuanInputRef.current && !kasTujuanInputRef.current.contains(e.target)) {
        setKasTujuanOpen(false);
        setKasTujuanQuery(form.kasTujuan || ""); // buang teks pencarian yang belum dipilih
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [form.kas, form.kasTujuan]);

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

  // Dompet tujuan (transfer) — pakai daftar kasOptions yang sama, cuma query beda
  const kasTujuanSuggestions = kasTujuanQuery.trim() === ""
    ? kasOptions
    : kasOptions.filter(k => k.toLowerCase().includes(kasTujuanQuery.toLowerCase()));

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

  // Handler kas — SEKARANG BUKAN combobox-bisa-bikin-baru lagi. Ngetik cuma buat nyari/filter
  // di antara dompet yang udah ada; nambah dompet baru cuma bisa lewat halaman Dompet.
  // form.kas cuma keupdate pas user beneran KLIK salah satu opsi, bukan tiap ngetik.
  const handleKasSelect = (kas) => {
    setForm(prev => ({ ...prev, kas }));
    setKasQuery(kas);
    setKasOpen(false);
    setError("");
  };

  const handleKasInput = (e) => {
    setKasQuery(e.target.value);
    setKasOpen(true);
  };

  // Handler dompet tujuan — pola sama persis dengan kas asal
  const handleKasTujuanSelect = (kas) => {
    setForm(prev => ({ ...prev, kasTujuan: kas }));
    setKasTujuanQuery(kas);
    setKasTujuanOpen(false);
    setError("");
  };

  const handleKasTujuanInput = (e) => {
    setKasTujuanQuery(e.target.value);
    setKasTujuanOpen(true);
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
    // Penjualan online: kalau produk ini udah punya harga jual online yang kesimpen
    // (di tab Kalkulator Online), pakai itu — bukan harga jual normal — karena harga
    // listing di marketplace biasanya beda (udah dimarkup buat nutup potongan admin).
    const nilai = isSampleFlow
      ? (produk.totalBiaya || 0)
      : (isOnlineSale && produk.hargaOnline ? produk.hargaOnline : produk.hargaJual);
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
    const nilai = isSampleFlow
      ? (produk.totalBiaya || 0)
      : (isOnlineSale && produk.hargaOnline ? produk.hargaOnline : produk.hargaJual);
    setForm(prev => ({ ...prev, amount: String(Math.round(nilai * qty)) }));
  };

  const [submitted, setSubmitted] = useState(false); // guard biar onAdd/onEdit nggak ke-fire dobel pas diklik cepat

  const handleSubmit = () => {
    if (submitted) return;
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
      ...(isOnlineSale && onlineCalc && onlineCalc.totalPotongan > 0
        ? { _adminFee: {
              amount: Math.round(onlineCalc.totalPotongan),
              description: `Potongan ${PLATFORM_PRESETS[onlinePlatform]?.label || "Marketplace"} - ${form.description || "penjualan online"}`,
            } }
        : {}),
    };

    setSubmitted(true);
    if (isEdit) { onEdit({ ...editData, ...data }); } else { onAdd(data); }
    onClose();
  };

  return (
    <div className="txform__overlay" onClick={onClose}>
      <div className="txform animate-fadeUp" onClick={e => e.stopPropagation()}>
        <div className="txform__header">
          <h3 className="txform__title">{isEdit ? "✏️ Edit Transaksi" : "Catat Transaksi"}</h3>
          <button className="txform__close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="txform__type-toggle" style={!showKas ? { gridTemplateColumns: "1fr 1fr" } : undefined}>
          {(showKas ? ["pemasukan", "pengeluaran", "transfer"] : ["pemasukan", "pengeluaran"]).map(t => (
            <button key={t}
              className={`txform__type-btn ${form.type === t ? "txform__type-btn--active txform__type-btn--" + t : ""}`}
              onClick={() => {
                setForm(p => ({ ...p, type: t, category: t === "transfer" ? KATEGORI_TRANSFER : "" }));
                setCatQuery(t === "transfer" ? KATEGORI_TRANSFER : "");
                if (t !== "pemasukan") { setSelProdukId(""); setSelItems(null); setJumlahUnit("1"); setIsOnlineSale(false); }
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
                <button className="txform__cat-clear" onClick={() => { setCatQuery(""); setForm(p => ({ ...p, category: "" })); setCatOpen(true); }}><X size={14} /></button>
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
                  {produkList.map(p => {
                    const hargaTampil = isSampleFlow
                      ? (p.totalBiaya || 0)
                      : (isOnlineSale && p.hargaOnline ? p.hargaOnline : p.hargaJual);
                    return <option key={p.id} value={p.id}>{p.nama} ({formatRupiah(hargaTampil)}{isOnlineSale && p.hargaOnline ? " · online" : ""})</option>;
                  })}
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

          {showKas && mode === "umkm" && form.type === "pemasukan" && (
            <div className="txform__field">
              <label className="txform__online-toggle">
                <input type="checkbox" checked={isOnlineSale} onChange={e => {
                  const checked = e.target.checked;
                  setIsOnlineSale(checked);
                  // Kalau produk udah kepilih duluan, harga jualnya perlu di-refresh:
                  // ganti ke harga listing online yang tersimpan (atau balik ke harga normal
                  // kalau toggle dimatikan lagi).
                  if (selProdukId) {
                    const produk = produkList.find(p => p.id === selProdukId);
                    if (produk) {
                      const qty = parseInt(jumlahUnit, 10) || 1;
                      const nilai = isSampleFlow
                        ? (produk.totalBiaya || 0)
                        : (checked && produk.hargaOnline ? produk.hargaOnline : produk.hargaJual);
                      setForm(prev => ({ ...prev, amount: String(Math.round(nilai * qty)) }));
                    }
                  }
                }} />
                🛒 Ini penjualan online/marketplace (ada potongan admin)?
              </label>
            </div>
          )}

          {isOnlineSale && (
            <div className="txform__online-box">
              <p className="txform__hint txform__hint--tight">
                Nominal di atas tetap dicatat PENUH sebagai Penjualan (Omzet nggak keliru berkurang).
                Potongan di bawah ini otomatis kecatat sebagai pengeluaran terpisah kategori "Biaya Admin Marketplace",
                pakai dompet yang sama kayak yang kamu pilih di bawah.
              </p>
              {showProdukPicker && selProdukId && produkList.find(p => p.id === selProdukId)?.hargaOnline > 0 && (
                <p className="txform__hint txform__hint--tight">
                  💾 Nominal otomatis dipakein harga jual online yang udah kesimpen buat produk ini
                  (dari tab Kalkulator Online). Boleh diedit lagi kalau beda.
                </p>
              )}
              <div className="txform__online-platform">
                {Object.entries(PLATFORM_PRESETS).map(([key, p]) => (
                  <button key={key} type="button"
                    className={"txform__online-platform-btn" + (onlinePlatform === key ? " txform__online-platform-btn--active" : "")}
                    onClick={() => handlePilihOnlinePlatform(key)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {onlineFeeRows.map(row => (
                <div key={row.id} className="txform__online-fee-row">
                  <input className="txform__input" type="text" placeholder="Nama potongan"
                    value={row.nama} onChange={e => updateOnlineFeeRow(row.id, "nama", e.target.value)} />
                  <select className="txform__input" value={row.tipe} onChange={e => updateOnlineFeeRow(row.id, "tipe", e.target.value)}>
                    <option value="persen">%</option>
                    <option value="nominal">Rp</option>
                  </select>
                  <input className="txform__input" type="number" placeholder="0"
                    value={row.nilai} onChange={e => updateOnlineFeeRow(row.id, "nilai", e.target.value)} />
                  <button type="button" className="txform__online-fee-remove" onClick={() => removeOnlineFeeRow(row.id)}><X size={14} /></button>
                </div>
              ))}
              <button type="button" className="txform__online-addfee" onClick={addOnlineFeeRow}>+ Tambah Potongan</button>

              {onlineCalc && (
                <div className="txform__online-summary">
                  <div className="txform__online-sum-row"><span>Total Potongan</span><span>− {formatRupiah(onlineCalc.totalPotongan)}</span></div>
                  <div className="txform__online-sum-row txform__online-sum-row--final"><span>Dana Bersih (masuk ke dompet)</span><span>{formatRupiah(onlineCalc.danaBersih)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Kas / Wadah Uang — cuma tampil di mode UMKM. Sengaja BUKAN combobox-bisa-bikin-baru:
              ngetik cuma buat nyari di antara dompet yang udah didaftarin di halaman Dompet. */}
          {showKas && (
            <div className="txform__field">
              <label className="txform__label">{isTransferFlow ? "Dari Dompet" : form.type === "pemasukan" ? "Uang Masuk ke Kas" : "Uang Keluar dari Kas"}</label>
              <div className="txform__cat-wrap" style={{ position: "relative" }}>
                <input
                  ref={kasInputRef}
                  className={"txform__input txform__input--" + accent}
                  type="text"
                  placeholder="Cari dompet..."
                  value={kasQuery}
                  onChange={handleKasInput}
                  onFocus={() => setKasOpen(true)}
                  autoComplete="off"
                />
                {kasOpen && (
                  <div ref={kasDropdownRef} className="txform__cat-dropdown">
                    {kasSuggestions.length > 0 ? kasSuggestions.map(k => (
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
                    )) : (
                      <div className="txform__cat-empty">
                        Nggak ada dompet yang cocok. Tambah dompet baru dulu di halaman Dompet.
                      </div>
                    )}
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
                  className={"txform__input txform__input--" + accent}
                  type="text"
                  placeholder="Cari dompet tujuan..."
                  value={kasTujuanQuery}
                  onChange={handleKasTujuanInput}
                  onFocus={() => setKasTujuanOpen(true)}
                  autoComplete="off"
                />
                {kasTujuanOpen && (
                  <div ref={kasTujuanDropdownRef} className="txform__cat-dropdown">
                    {kasTujuanSuggestions.length > 0 ? kasTujuanSuggestions.map(k => (
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
                    )) : (
                      <div className="txform__cat-empty">
                        Nggak ada dompet yang cocok. Tambah dompet baru dulu di halaman Dompet.
                      </div>
                    )}
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

          <button className={"txform__submit txform__submit--" + accent} onClick={handleSubmit} disabled={submitted}>
            {submitted ? "Menyimpan..." : (isEdit ? "Simpan Perubahan" : "Simpan Transaksi")}
          </button>
        </div>
      </div>
    </div>
  );
}
