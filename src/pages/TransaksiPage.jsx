import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import TransactionForm from "../components/TransactionForm";
import { getTransactions, addTransaction, deleteTransaction, editTransaction, calcSummary, formatRupiah, formatDate } from "../utils/storage";
import { BAHAN_KEY, loadData, saveData, applyStokDelta } from "../utils/umkmCalc";
import "./TransaksiPage.css";

export default function TransaksiPage() {
  const { user } = useAuth();
  const mode   = user?.mode;
  const accent = mode === "umkm" ? "umkm" : "personal";

  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm]         = useState(false);
  const [editData, setEditData]         = useState(null);
  const [filterType, setFilterType]     = useState("semua");
  const [filterCat, setFilterCat]       = useState("semua");
  const [filterMonth, setFilterMonth]   = useState("semua");
  const [search, setSearch]             = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    if (user) setTransactions(await getTransactions(user.id, mode));
  };

  useEffect(() => { load(); }, [user]);

  // ── Stok: kurangi / kembalikan berdasarkan resep produk yang tersimpan di transaksi ──
  // Transaksi yang berasal dari produk membawa snapshot: { produkId, items, jumlahUnit }
  // `items` di-snapshot saat transaksi dibuat, supaya tidak ikut berubah kalau resep produk diedit nanti.
  const applyStokUntukTransaksi = (tx, arah) => {
    // arah: -1 = kurangi stok (transaksi baru disimpan), +1 = kembalikan stok (transaksi dihapus/sebelum-edit)
    if (mode !== "umkm" || !tx?.items?.length) return;
    const bahanList = loadData(BAHAN_KEY(user.id));
    const updated   = applyStokDelta(bahanList, tx.items, tx.jumlahUnit || 1, arah);
    saveData(BAHAN_KEY(user.id), updated);
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  const handleAdd = async (data) => {
    await addTransaction(user.id, mode, data);
    // Kalau transaksi ini berasal dari produk (punya items resep), potong stok bahan terkait.
    if (data.items?.length) applyStokUntukTransaksi(data, -1);
    load();
  };

  const handleEdit = async (updatedTx) => {
    // Kembalikan dulu stok dari versi transaksi LAMA (sebelum diedit), baru potong stok versi BARU.
    // Ini supaya edit yang mengubah produk/qty tidak meninggalkan stok yang salah hitung.
    if (editData?.items?.length) applyStokUntukTransaksi(editData, +1);
    await editTransaction(user.id, mode, updatedTx);
    if (updatedTx.items?.length) applyStokUntukTransaksi(updatedTx, -1);
    load();
  };

  const handleDelete = async (id) => {
    const tx = transactions.find((t) => t.id === id);
    if (tx?.items?.length) applyStokUntukTransaksi(tx, +1);
    await deleteTransaction(user.id, mode, id);
    setDeleteConfirm(null);
    load();
  };

  const openEdit = (tx) => {
    setEditData(tx);
    setShowForm(true);
  };

  const openAdd = () => {
    setEditData(null);
    setShowForm(true);
  };

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => (t.date || t.createdAt || "").slice(0, 7)).filter(Boolean));
    return [...set].sort().reverse();
  }, [transactions]);

  const categories = useMemo(() => {
    const set = new Set(transactions.map((t) => t.category).filter(Boolean));
    return [...set].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => filterType === "semua" || t.type === filterType)
      .filter((t) => filterCat === "semua" || t.category === filterCat)
      .filter((t) => {
        if (filterMonth === "semua") return true;
        return (t.date || t.createdAt || "").slice(0, 7) === filterMonth;
      })
      .filter((t) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (t.description || "").toLowerCase().includes(q) ||
               (t.category || "").toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }, [transactions, filterType, filterCat, filterMonth, search]);

  const summary = calcSummary(filtered);

  return (
    <DashboardLayout>
      <div className="txpage">
        <div className="txpage__header">
          <div>
            <h1 className="txpage__title">Riwayat Transaksi</h1>
            <p className="txpage__subtitle">{transactions.length} transaksi tercatat</p>
          </div>
          <button className={"txpage__add-btn txpage__add-btn--" + accent} onClick={openAdd}>
            + Catat Transaksi
          </button>
        </div>

        {/* Summary strip */}
            <div className="txpage__summary">
              <div className="txpage__summary-item txpage__summary-item--income">
                <span>⬆ Pemasukan</span>
                <strong>{formatRupiah(summary.pemasukan)}</strong>
              </div>
              <div className="txpage__summary-divider" />
              <div className="txpage__summary-item txpage__summary-item--expense">
                <span>⬇ Pengeluaran</span>
                <strong>{formatRupiah(summary.pengeluaran)}</strong>
              </div>
              <div className="txpage__summary-divider" />
              <div className={"txpage__summary-item " + (summary.saldo >= 0 ? "txpage__summary-item--income" : "txpage__summary-item--expense")}>
                <span>💰 Saldo</span>
                <strong>{formatRupiah(summary.saldo)}</strong>
              </div>
            </div>

            {/* Filters */}
            <div className="txpage__filters">
              <input
                className={"txpage__search txpage__search--" + accent}
                type="text"
                placeholder="Cari transaksi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="txpage__select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="semua">Semua Tipe</option>
                <option value="pemasukan">Pemasukan</option>
                <option value="pengeluaran">Pengeluaran</option>
              </select>
              <select className="txpage__select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="semua">Semua Kategori</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="txpage__select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="semua">Semua Bulan</option>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Transaction List */}
            <div className="txpage__list">
              {filtered.length === 0 ? (
                <div className="txpage__empty">
                  <p>📭</p>
                  <p>Tidak ada transaksi ditemukan.</p>
                  {transactions.length === 0 && (
                    <button className={"txpage__add-btn txpage__add-btn--" + accent} onClick={openAdd} style={{ marginTop: "1rem" }}>
                      + Catat Transaksi Pertama
                    </button>
                  )}
                </div>
              ) : (
                filtered.map((tx) => (
                  <div key={tx.id} className="txpage__item">
                    <div className={"txpage__item-dot txpage__item-dot--" + (tx.type === "pemasukan" ? "income" : "expense")} />
                    <div className="txpage__item-info">
                      <p className="txpage__item-desc">{tx.description || tx.category || "-"}</p>
                      <div className="txpage__item-meta">
                        <span className={"txpage__item-cat txpage__item-cat--" + accent}>{tx.category}</span>
                        <span>·</span>
                        <span>{formatDate(tx.date || tx.createdAt)}</span>
                        {tx.items?.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="txpage__item-produk-tag">📦 {tx.jumlahUnit || 1}x produk</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={"txpage__item-amount " + (tx.type === "pemasukan" ? "txpage__item-amount--income" : "txpage__item-amount--expense")}>
                      {tx.type === "pemasukan" ? "+" : "-"}{formatRupiah(tx.amount)}
                    </span>
                    {/* Tombol edit & hapus */}
                    <div className="txpage__item-actions">
                      <button className="txpage__item-edit" onClick={() => openEdit(tx)} title="Edit">✏️</button>
                      <button className="txpage__item-delete" onClick={() => setDeleteConfirm(tx.id)} title="Hapus">🗑</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Delete confirm */}
            {deleteConfirm && (
              <div className="txpage__confirm-overlay" onClick={() => setDeleteConfirm(null)}>
                <div className="txpage__confirm" onClick={(e) => e.stopPropagation()}>
                  <p className="txpage__confirm-title">Hapus transaksi ini?</p>
                  <p className="txpage__confirm-sub">
                    {(() => {
                      const tx = transactions.find((t) => t.id === deleteConfirm);
                      return tx?.items?.length
                        ? "Stok bahan baku yang terpakai akan dikembalikan otomatis. Tindakan ini tidak bisa dibatalkan."
                        : "Tindakan ini tidak bisa dibatalkan.";
                    })()}
                  </p>
                  <div className="txpage__confirm-actions">
                    <button className="txpage__confirm-cancel" onClick={() => setDeleteConfirm(null)}>Batal</button>
                    <button className="txpage__confirm-ok" onClick={() => handleDelete(deleteConfirm)}>Hapus</button>
                  </div>
                </div>
              </div>
            )}

            {/* Form Modal */}
            {showForm && (
              <TransactionForm
                mode={mode}
                onAdd={handleAdd}
                onEdit={handleEdit}
                onClose={() => { setShowForm(false); setEditData(null); }}
                editData={editData}
              />
            )}
      </div>
    </DashboardLayout>
  );
}
