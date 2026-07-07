// =============================================
// FINSIGHT AI — Storage Utility
// Semua operasi transaksi lewat Supabase API.
// =============================================

export const CATEGORIES = {
  umkm: {
    pemasukan: ["Modal Usaha", "Penjualan Produk", "Jasa", "Komisi", "Investasi", "Lainnya"],
    pengeluaran: ["Bahan Baku / HPP", "Operasional", "Gaji Karyawan", "Marketing", "Pembelian Aset Usaha", "Kerugian Stok (Rusak/Gagal)", "Sample & Marketing", "Utilitas", "Lainnya"],
  },
  personal: {
    pemasukan: ["Gaji", "Freelance", "Bisnis Sampingan", "Hadiah", "Lainnya"],
    pengeluaran: ["Makan & Minum", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"],
  },
};

// ── API helper ────────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem("finsight_token");

const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  return res.json();
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

// Ambil semua transaksi — return array
export const getTransactions = async (userId, mode) => {
  const result = await apiFetch(`/api/transactions?mode=${mode}`);
  if (!result.success) return [];
  // Normalisasi field dari Supabase ke format yang sudah dipakai komponen
  return result.data.map(normalizeTransaction);
};

// Tambah transaksi baru — return transaksi yang disimpan
export const addTransaction = async (userId, mode, data) => {
  const result = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      mode,
      type: data.type,
      amount: data.amount,
      category: data.category,
      description: data.description,
      date: data.date,
      items: data.items || [],
      jumlah_unit: data.jumlahUnit || 1,
      produk_id: data.produkId || null,
      kas: data.kas || null,
    }),
  });
  if (!result.success) throw new Error(result.message);
  return normalizeTransaction(result.data);
};

// Edit transaksi
export const editTransaction = async (userId, mode, updatedTx) => {
  const result = await apiFetch("/api/transactions", {
    method: "PUT",
    body: JSON.stringify({
      id: updatedTx.id,
      type: updatedTx.type,
      amount: updatedTx.amount,
      category: updatedTx.category,
      description: updatedTx.description,
      date: updatedTx.date,
      items: updatedTx.items || [],
      jumlah_unit: updatedTx.jumlahUnit || 1,
      produk_id: updatedTx.produkId || null,
      kas: updatedTx.kas || null,
    }),
  });
  if (!result.success) throw new Error(result.message);
  return normalizeTransaction(result.data);
};

// Hapus transaksi
export const deleteTransaction = async (userId, mode, txId) => {
  const result = await apiFetch(`/api/transactions?id=${txId}`, {
    method: "DELETE",
  });
  if (!result.success) throw new Error(result.message);
};

// ── Normalisasi field Supabase → format komponen ─────────────────────────────
// Supabase pakai snake_case, komponen pakai camelCase
function normalizeTransaction(tx) {
  return {
    id:          tx.id,
    userId:      tx.user_id,
    mode:        tx.mode,
    type:        tx.type,
    amount:      tx.amount,
    category:    tx.category,
    description: tx.description,
    date:        tx.date,
    items:       tx.items || [],
    jumlahUnit:  tx.jumlah_unit || 1,
    produkId:    tx.produk_id || null,
    kas:         tx.kas || null,
    createdAt:   tx.created_at,
  };
}

// ── Modal Usaha ───────────────────────────────────────────────────────────────
// Transaksi kategori "Modal Usaha" adalah setoran modal, bukan pendapatan usaha,
// jadi harus dikeluarkan dari perhitungan Omzet/Laba supaya laporan keuangan akurat.
export const isModalUsaha = (t) => t.type === "pemasukan" && t.category === "Modal Usaha";

// ── Kalkulasi (tidak berubah, pure function) ──────────────────────────────────
export const calcSummary = (transactions) => {
  const pemasukan   = transactions.filter((t) => t.type === "pemasukan").reduce((s, t) => s + t.amount, 0);
  const pengeluaran = transactions.filter((t) => t.type === "pengeluaran").reduce((s, t) => s + t.amount, 0);
  return { pemasukan, pengeluaran, saldo: pemasukan - pengeluaran };
};

export const groupByMonth = (transactions) => {
  const months = {};
  transactions.forEach((t) => {
    const key = (t.date || t.createdAt || "").slice(0, 7);
    if (!key) return;
    if (!months[key]) months[key] = { pemasukan: 0, pengeluaran: 0 };
    if (t.type === "pemasukan") months[key].pemasukan += t.amount;
    else months[key].pengeluaran += t.amount;
  });
  return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
};

export const groupByCategory = (transactions) => {
  const cats = {};
  transactions
    .filter((t) => t.type === "pengeluaran")
    .forEach((t) => { cats[t.category || "Lainnya"] = (cats[t.category || "Lainnya"] || 0) + t.amount; });
  return Object.entries(cats).sort(([, a], [, b]) => b - a);
};

// Generalisasi groupByCategory — bisa buat "pemasukan" atau "pengeluaran".
// Dipakai di Laporan Arus Kas (butuh breakdown kategori pemasukan juga, bukan cuma pengeluaran).
export const groupByCategoryType = (transactions, type) => {
  const cats = {};
  transactions
    .filter((t) => t.type === type)
    .forEach((t) => { cats[t.category || "Lainnya"] = (cats[t.category || "Lainnya"] || 0) + t.amount; });
  return Object.entries(cats).sort(([, a], [, b]) => b - a);
};

// Kas non-fisik — dipakai buat catat kerugian nilai stok (rusak/sample) yang BUKAN
// uang keluar beneran, jadi harus dikecualikan dari perhitungan Arus Kas & Saldo Kas.
export const NON_KAS_LABEL = "Non-Kas (Kerugian Stok)";
export const isRealKasTx = (t) => (t.kas || "Kas Tunai") !== NON_KAS_LABEL;

// ── Format ────────────────────────────────────────────────────────────────────
export const formatRupiah = (amount) => {
  if (!amount && amount !== 0) return "Rp 0";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

export const monthLabel = (yyyyMM) => {
  const [y, m] = yyyyMM.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
  return `${names[parseInt(m) - 1]} ${y.slice(2)}`;
};
