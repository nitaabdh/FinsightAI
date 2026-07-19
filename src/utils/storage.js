// =============================================
// FINSIGHT AI — Storage Utility
// Semua operasi transaksi lewat Supabase API.
// =============================================

export const CATEGORIES = {
  umkm: {
    pemasukan: ["Modal Usaha", "Penjualan Produk", "Penjualan Aset Usaha", "Jasa", "Komisi", "Investasi", "Lainnya"],
    pengeluaran: ["Bahan Baku / HPP", "Operasional", "Gaji Karyawan", "Marketing", "Pembelian Aset Usaha", "Kerugian Stok (Rusak/Gagal)", "Sample & Marketing", "Utilitas", "Prive Pemilik", "Lainnya"],
  },
  personal: {
    pemasukan: ["Gaji", "Freelance", "Bisnis Sampingan", "Hadiah", "Tarik dari Usaha", "Lainnya"],
    pengeluaran: ["Makan & Minum", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Setor Modal ke Usaha", "Lainnya"],
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
      kas_tujuan: data.kasTujuan || null,
      ref_id: data.refId || null,
      ref_type: data.refType || null,
    }),
  });
  if (!result.success) throw new Error(result.message);
  return normalizeTransaction(result.data);
};

// Ambil transaksi yang nempel ke satu record tertentu (bahan baku/aset usaha) —
// dipakai buat cek/hapus transaksi terkait pas record itu dihapus.
export const getTransactionsByRef = async (mode, refType, refId) => {
  const result = await apiFetch(`/api/transactions?mode=${mode}&refType=${refType}&refId=${refId}`);
  if (!result.success) return [];
  return result.data.map(normalizeTransaction);
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
      kas_tujuan: updatedTx.kasTujuan || null,
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
    kasTujuan:   tx.kas_tujuan || null,
    refId:       tx.ref_id || null,
    refType:     tx.ref_type || null,
    createdAt:   tx.created_at,
  };
}

// ── Modal Usaha ───────────────────────────────────────────────────────────────
// Transaksi kategori "Modal Usaha" adalah setoran modal, bukan pendapatan usaha,
// jadi harus dikeluarkan dari perhitungan Omzet/Laba supaya laporan keuangan akurat.
export const isModalUsaha = (t) => t.type === "pemasukan" && t.category === "Modal Usaha";

// ── Prive Pemilik ────────────────────────────────────────────────────────────
// Kebalikan dari Modal Usaha: pemilik AMBIL uang usaha buat kebutuhan pribadi.
// Ini bukan biaya operasional usaha, jadi sama kayak Modal Usaha harus dikeluarkan
// dari perhitungan Omzet/Laba (tapi tetap ngurangin saldo kas & ekuitas di Neraca).
export const isPriveUsaha = (t) => t.type === "pengeluaran" && t.category === "Prive Pemilik";

// Emoji per nama kas/dompet — dipakai bareng computeKasStats di beberapa halaman
const KAS_EMOJI = { "kas tunai": "💵", "rekening bank": "🏦", "e-wallet": "📱", "qris": "🇮🇩" };
export const getKasEmoji = (k) => KAS_EMOJI[(k || "").toLowerCase().trim()] || "💳";

// ── Saldo per Kas/Dompet (dipakai di Dashboard UMKM & Laporan) ────────────────
// Dipusatkan di sini biar nggak ada logic ganda yang bisa saling beda kalau salah
// satu diedit tapi yang lain kelewat (pernah kejadian sebelumnya).
// - pemasukan  → nambah saldo kas
// - pengeluaran → ngurangin saldo kas
// - transfer    → ngurangin saldo kas ASAL, nambah saldo kas TUJUAN (bukan pemasukan/
//   pengeluaran baru, cuma pindah antar dompet — misal saldo QRIS dicairkan ke bank)
// Grouping case-insensitive ("BCA" & "bca" dianggap kas yang sama, pakai nama pertama muncul).
export const computeKasStats = (transactions) => {
  const map = {};
  const touch = (nama) => {
    const key = (nama || "Kas Tunai").toLowerCase().trim();
    if (!(key in map)) map[key] = { nama: nama || "Kas Tunai", saldo: 0, count: 0 };
    return map[key];
  };
  transactions.forEach((tx) => {
    const amount = Number(tx.amount || 0);
    if (tx.type === "transfer" && tx.kasTujuan) {
      touch(tx.kas).saldo -= amount;
      touch(tx.kas).count += 1;
      touch(tx.kasTujuan).saldo += amount;
      touch(tx.kasTujuan).count += 1;
      return;
    }
    const entry = touch(tx.kas);
    entry.saldo += tx.type === "pemasukan" ? amount : -amount;
    entry.count += 1;
  });
  // Urutan: paling sering dipakai dulu, kalau seri baru dilihat dari saldo terbesar (absolut)
  return Object.values(map).sort((a, b) => b.count - a.count || Math.abs(b.saldo) - Math.abs(a.saldo));
};

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
