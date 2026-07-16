import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import TransactionForm from "../components/TransactionForm";
import { getTransactions, addTransaction, deleteTransaction, editTransaction, calcSummary, formatRupiah, formatDate } from "../utils/storage";
import CountUp from "../components/CountUp";
import { applyStokDelta, genId, baseUnitLabel } from "../utils/umkmCalc";
import "./TransaksiPage.css";

import { MailX, Pencil, Trash2 } from "lucide-react";
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function TransaksiPage() {
  const { user } = useAuth();
  const mode   = user?.mode;
  const accent = mode === "umkm" ? "umkm" : "personal";

  const [transactions,   setTransactions]   = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [editData,       setEditData]       = useState(null);
  const [filterType,     setFilterType]     = useState("semua");
  const [filterCat,      setFilterCat]      = useState("semua");
  const [filterMonth,    setFilterMonth]    = useState("semua");
  const [search,         setSearch]         = useState("");
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);

  const load = async (showSkeleton = false) => {
    if (!user) return;
    if (showSkeleton) setLoading(true);
    const data = await getTransactions(user.id, mode);
    setTransactions(data);
    setLoading(false);
  };

  useEffect(() => { load(true); }, [user]);

  // ── Stok: kurangi/kembalikan berdasarkan resep produk yang di-snapshot di transaksi ──
  // Sekalian catat histori otomatis per bahan yang berubah, biar kelihatan di halaman
  // Detail Bahan Baku ("Otomatis dari penjualan produk").
  const applyStokUntukTransaksi = async (tx, arah) => {
    if (mode !== "umkm" || !tx?.items?.length) return;
    // Ambil bahan terbaru dari Supabase
    const r = await apiFetch(`/api/umkm?table=bahan_baku`);
    if (!r.success) return;
    const updated = applyStokDelta(r.data, tx.items, tx.jumlahUnit || 1, arah);

    // Cari bahan yang beneran berubah stoknya
    const changed = updated
      .map((b, i) => ({ b, before: r.data[i] }))
      .filter(({ b, before }) => b.stok !== before?.stok);

    // Update stok bahan di Supabase
    await Promise.all(
      changed.map(({ b }) => apiFetch(`/api/umkm?table=bahan_baku`, {
        method: "PUT",
        body: JSON.stringify(b),
      }))
    );

    // Catat histori otomatis per bahan yang berubah
    await Promise.all(
      changed.map(({ b, before }) => {
        const delta = Math.abs((parseFloat(b.stok) || 0) - (parseFloat(before?.stok) || 0));
        return apiFetch(`/api/umkm?table=stok_history`, {
          method: "POST",
          body: JSON.stringify({
            id: genId(),
            bahanId: b.id,
            tipe: arah < 0 ? "kurang" : "tambah",
            sumber: "transaksi",
            jumlah: delta,
            satuanLabel: baseUnitLabel(b),
            alasan: arah < 0
              ? `Terjual: ${tx.description || "Produk"} (${tx.jumlahUnit || 1}x)`
              : `Dikembalikan — transaksi "${tx.description || "Produk"}" diedit/dihapus`,
            transaksiId: tx.id || null,
            createdAt: Date.now(),
          }),
        });
      })
    );

    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  const handleAdd = async (data) => {
    const { _adminFee, ...txData } = data;
    await addTransaction(user.id, mode, txData);
    // Penjualan online: bikin transaksi pengeluaran terpisah buat potongan admin
    // marketplace, pakai dompet yang SAMA biar saldo dompet itu otomatis kepotong
    // (persis kayak kenyataannya — uang yang cair emang udah bersih dari platform).
    if (_adminFee && _adminFee.amount > 0) {
      await addTransaction(user.id, mode, {
        type: "pengeluaran",
        amount: _adminFee.amount,
        category: "Biaya Admin Marketplace",
        description: _adminFee.description,
        date: txData.date,
        kas: txData.kas,
        items: [],
        jumlahUnit: null,
        produkId: null,
      });
    }
    if (data.items?.length) await applyStokUntukTransaksi(data, -1);
    load(false);
  };

  const handleEdit = async (updatedTx) => {
    if (editData?.items?.length) await applyStokUntukTransaksi(editData, +1);
    await editTransaction(user.id, mode, updatedTx);
    if (updatedTx.items?.length) await applyStokUntukTransaksi(updatedTx, -1);
    load(false);
  };

  const handleDelete = async (id) => {
    const tx = transactions.find(t => t.id === id);
    if (tx?.items?.length) await applyStokUntukTransaksi(tx, +1);
    await deleteTransaction(user.id, mode, id);
    setDeleteConfirm(null);
    load(false);
  };

  const openEdit = (tx) => { setEditData(tx); setShowForm(true); };
  const openAdd  = ()   => { setEditData(null); setShowForm(true); };

  const months = useMemo(() => {
    const set = new Set(transactions.map(t => (t.date || t.createdAt || "").slice(0, 7)).filter(Boolean));
    return [...set].sort().reverse();
  }, [transactions]);

  const categories = useMemo(() => {
    const set = new Set(transactions.map(t => t.category).filter(Boolean));
    return [...set].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter(t => filterType  === "semua" || t.type     === filterType)
      .filter(t => filterCat   === "semua" || t.category === filterCat)
      .filter(t => filterMonth === "semua" || (t.date || t.createdAt || "").slice(0, 7) === filterMonth)
      .filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (t.description || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q);
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

        <div className="txpage__summary stagger-list">
          <div className="txpage__summary-item txpage__summary-item--income">
            <span>⬆ Pemasukan</span>
            <strong><CountUp value={summary.pemasukan} format={formatRupiah} /></strong>
          </div>
          <div className="txpage__summary-divider" />
          <div className="txpage__summary-item txpage__summary-item--expense">
            <span>⬇ Pengeluaran</span>
            <strong><CountUp value={summary.pengeluaran} format={formatRupiah} /></strong>
          </div>
          <div className="txpage__summary-divider" />
          <div className={"txpage__summary-item " + (summary.saldo >= 0 ? "txpage__summary-item--income" : "txpage__summary-item--expense")}>
            <span>💰 Saldo</span>
            <strong><CountUp value={summary.saldo} format={formatRupiah} /></strong>
          </div>
        </div>

        <div className="txpage__filters">
          <input className={"txpage__search txpage__search--" + accent} type="text"
            placeholder="Cari transaksi..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="txpage__select" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="semua">Semua Tipe</option>
            <option value="pemasukan">Pemasukan</option>
            <option value="pengeluaran">Pengeluaran</option>
            <option value="transfer">Transfer Antar Dompet</option>
          </select>
          <select className="txpage__select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="semua">Semua Kategori</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="txpage__select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="semua">Semua Bulan</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="txpage__list stagger-list">
          {loading ? (
            <div className="txpage__skeleton-wrap">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="txpage__skeleton-item">
                  <div className="txpage__skeleton-dot skel" />
                  <div className="txpage__skeleton-info">
                    <div className="txpage__skeleton-line skel" style={{ width: `${55 + (i % 3) * 15}%` }} />
                    <div className="txpage__skeleton-line skel" style={{ width: "35%", marginTop: "6px", height: "10px" }} />
                  </div>
                  <div className="txpage__skeleton-amount skel" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="txpage__empty">
              <p><MailX size={24} /></p>
              <p>Tidak ada transaksi ditemukan.</p>
              {transactions.length === 0 && (
                <button className={"txpage__add-btn txpage__add-btn--" + accent} onClick={openAdd} style={{ marginTop: "1rem" }}>
                  + Catat Transaksi Pertama
                </button>
              )}
            </div>
          ) : (
            filtered.map(tx => (
              <div key={tx.id} className="txpage__item">
                <div className={"txpage__item-dot txpage__item-dot--" + (tx.type === "pemasukan" ? "income" : tx.type === "transfer" ? "transfer" : "expense")} />
                <div className="txpage__item-info">
                  <p className="txpage__item-desc">
                    {tx.type === "transfer"
                      ? `${tx.kas} → ${tx.kasTujuan}`
                      : (tx.description || tx.category || "-")}
                  </p>
                  <div className="txpage__item-meta">
                    <span className={"txpage__item-cat txpage__item-cat--" + accent}>{tx.category}</span>
                    <span>·</span>
                    <span>{formatDate(tx.date || tx.createdAt)}</span>
                    {tx.items?.length > 0 && (
                      <><span>·</span><span className="txpage__item-produk-tag">📦 {tx.jumlahUnit || 1}x produk</span></>
                    )}
                  </div>
                </div>
                <span className={"txpage__item-amount " + (tx.type === "pemasukan" ? "txpage__item-amount--income" : tx.type === "transfer" ? "txpage__item-amount--transfer" : "txpage__item-amount--expense")}>
                  {tx.type === "pemasukan" ? "+" : tx.type === "transfer" ? "🔄 " : "-"}{formatRupiah(tx.amount)}
                </span>
                <div className="txpage__item-actions">
                  <button className="txpage__item-edit" onClick={() => openEdit(tx)} title="Edit"><Pencil size={14} /></button>
                  <button className="txpage__item-delete" onClick={() => setDeleteConfirm(tx.id)} title="Hapus"><Trash2 size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {deleteConfirm && (
          <div className="txpage__confirm-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="txpage__confirm" onClick={e => e.stopPropagation()}>
              <p className="txpage__confirm-title">Hapus transaksi ini?</p>
              <p className="txpage__confirm-sub">
                {(() => {
                  const tx = transactions.find(t => t.id === deleteConfirm);
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
