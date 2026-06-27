// =============================================
// TRANSACTION STORAGE UTILITY
// Semua operasi data transaksi ada di sini.
// Kalau nanti migrasi ke Firebase, cukup
// ganti fungsi-fungsi di file ini saja.
// =============================================

const KEYS = {
  umkm: "finsight_transactions_umkm",
  personal: "finsight_transactions_personal",
};

// Kategori transaksi per mode
export const CATEGORIES = {
  umkm: {
    income: ["Penjualan Produk", "Jasa", "Investasi", "Lainnya"],
    expense: ["Bahan Baku/HPP", "Operasional", "Gaji Karyawan", "Marketing", "Utilitas", "Lainnya"],
  },
  personal: {
    income: ["Gaji", "Freelance", "Bisnis", "Hadiah", "Lainnya"],
    expense: ["Makan & Minum", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"],
  },
};

// Ambil semua transaksi user tertentu
export const getTransactions = (userId, mode) => {
  try {
    const raw = localStorage.getItem(`${KEYS[mode]}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

// Simpan transaksi baru
export const addTransaction = (userId, mode, transaction) => {
  const transactions = getTransactions(userId, mode);
  const newTransaction = {
    id: Date.now().toString(),
    ...transaction,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(
    `${KEYS[mode]}_${userId}`,
    JSON.stringify([newTransaction, ...transactions])
  );
  return newTransaction;
};

// Hapus transaksi
export const deleteTransaction = (userId, mode, transactionId) => {
  const transactions = getTransactions(userId, mode);
  const filtered = transactions.filter((t) => t.id !== transactionId);
  localStorage.setItem(`${KEYS[mode]}_${userId}`, JSON.stringify(filtered));
};

// Hitung ringkasan keuangan
export const getSummary = (transactions) => {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
};

// Filter transaksi berdasarkan bulan/tahun
export const filterByMonth = (transactions, year, month) => {
  return transactions.filter((t) => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
};

// Data grafik: omzet/pengeluaran 6 bulan terakhir
export const getLast6MonthsData = (transactions) => {
  const months = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("id-ID", { month: "short" });
    const filtered = filterByMonth(transactions, d.getFullYear(), d.getMonth());
    const { totalIncome, totalExpense } = getSummary(filtered);
    months.push({ label, income: totalIncome, expense: totalExpense });
  }

  return months;
};

// Format angka ke Rupiah
export const formatRupiah = (amount) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Format tanggal
export const formatDate = (isoString) => {
  return new Date(isoString).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
};
