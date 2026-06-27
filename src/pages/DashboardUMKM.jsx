import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import MetricCard from "../components/MetricCard";
import MiniChart from "../components/MiniChart";
import { getTransactions, calcSummary, formatRupiah, groupByCategory } from "../utils/storage";
import { labelJatuhTempo, selisihHari } from "../utils/umkmCalc";
import "./Dashboard.css";

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function DashboardUMKM() {
  const { user } = useAuth();
  const [transactions,  setTransactions]  = useState([]);
  const [utangPiutang,  setUtangPiutang]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getTransactions(user.id, "umkm"),
      apiFetch(`/api/umkm?table=utang_piutang`),
    ]).then(([txData, upRes]) => {
      setTransactions(txData || []);
      if (upRes.success) setUtangPiutang(upRes.data);
    }).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    const refresh = () => {
      if (!user) return;
      apiFetch(`/api/umkm?table=utang_piutang`).then(r => { if (r.success) setUtangPiutang(r.data); });
    };
    window.addEventListener("utangPiutangUpdated", refresh);
    return () => window.removeEventListener("utangPiutangUpdated", refresh);
  }, [user]);

  const summary      = calcSummary(transactions);
  const recentTx     = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const topCategories = groupByCategory(transactions).slice(0, 4);

  const monthKeyOf    = (tx) => (tx.date || tx.createdAt || "").slice(0, 7);
  const monthKeyLocal = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const now             = new Date();
  const currentMonthKey = monthKeyLocal(now);
  const prevMonthKey    = monthKeyLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const currentMonthTx = transactions.filter(t => monthKeyOf(t) === currentMonthKey);
  const prevMonthTx    = transactions.filter(t => monthKeyOf(t) === prevMonthKey);

  const labaBulanIni  = calcSummary(currentMonthTx).saldo;
  const labaBulanLalu = calcSummary(prevMonthTx).saldo;

  let labaTrend = null;
  if (prevMonthTx.length > 0) {
    if (labaBulanLalu !== 0) {
      const delta = ((labaBulanIni - labaBulanLalu) / Math.abs(labaBulanLalu)) * 100;
      labaTrend = { arah: delta > 0 ? "naik" : delta < 0 ? "turun" : "tetap", persen: Math.abs(delta).toFixed(1) };
    } else if (labaBulanIni !== 0) {
      labaTrend = { arah: labaBulanIni > 0 ? "naik" : "turun", persen: "100.0" };
    }
  }

  const labaSub = currentMonthTx.length === 0
    ? "Belum ada transaksi bulan ini"
    : !labaTrend
      ? "Belum ada data bulan lalu untuk dibandingkan"
      : labaTrend.arah === "tetap"
        ? "Sama seperti bulan lalu"
        : `${labaTrend.arah === "naik" ? "▲" : "▼"} ${labaTrend.persen}% dari bulan lalu`;

  const reminderJatuhTempo = utangPiutang
    .filter(it => !it.lunas)
    .map(it => ({ ...it, selisih: selisihHari(it.jatuhTempo) }))
    .filter(it => it.selisih !== null && it.selisih <= 3)
    .sort((a, b) => a.selisih - b.selisih)
    .slice(0, 5);

  const totalReminderCount = utangPiutang
    .filter(it => !it.lunas)
    .map(it => selisihHari(it.jatuhTempo))
    .filter(s => s !== null && s <= 3).length;

  return (
    <DashboardLayout>
      <div className="dashboard">
        <PageHeader
          title="Dashboard Usaha"
          subtitle="Ringkasan keuangan toko kamu hari ini"
        />

        {loading ? (
          <div className="dashboard__skeleton">
            <div className="dashboard__skeleton-metrics">
              {[1,2,3,4].map(i => <div key={i} className="dashboard__skeleton-card skel" />)}
            </div>
            <div className="dashboard__skeleton-block skel" style={{height:"120px"}} />
            <div className="dashboard__skeleton-block skel" style={{height:"200px"}} />
            <div className="dashboard__skeleton-block skel" style={{height:"180px"}} />
          </div>
        ) : (<>

        <div className="dashboard__metrics">
          <MetricCard label="Total Omzet"          value={formatRupiah(summary.pemasukan)}  sub="Total pemasukan tercatat"      icon="📈" accent="umkm" />
          <MetricCard label="Total Pengeluaran"     value={formatRupiah(summary.pengeluaran)} sub="Modal + operasional"          icon="📉" accent="negative" />
          <MetricCard label="Laba Bersih Bulan Ini" value={formatRupiah(labaBulanIni)}       sub={labaSub}                       icon="💰" accent={labaBulanIni >= 0 ? "positive" : "negative"} />
          <MetricCard label="Total Transaksi"       value={transactions.length}              sub="Semua catatan"                 icon="🧾" accent="neutral" />
        </div>

        {reminderJatuhTempo.length > 0 && (
          <div className="dashboard__jatuhtempo">
            <div className="dashboard__section-header">
              <div className="dashboard__section-title">⏰ Jatuh Tempo</div>
              {totalReminderCount > reminderJatuhTempo.length && (
                <a href="/transaksi" className="dashboard__jatuhtempo-link">Lihat Semua ({totalReminderCount}) →</a>
              )}
            </div>
            <div className="dashboard__jatuhtempo-list">
              {reminderJatuhTempo.map(it => {
                const badge = labelJatuhTempo(it.jatuhTempo);
                return (
                  <div key={it.id} className="dashboard__jatuhtempo-item">
                    <span className={"dashboard__jatuhtempo-jenis dashboard__jatuhtempo-jenis--" + it.jenis}>
                      {it.jenis === "piutang" ? "📥" : "📤"}
                    </span>
                    <div className="dashboard__jatuhtempo-info">
                      <p className="dashboard__jatuhtempo-nama">{it.nama}</p>
                      <p className="dashboard__jatuhtempo-sub">{it.jenis === "piutang" ? "Piutang" : "Utang"} · {formatRupiah(it.nominal)}</p>
                    </div>
                    <span className={"dashboard__jatuhtempo-badge dashboard__jatuhtempo-badge--" + badge.status}>{badge.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="dashboard__row">
          <div className="dashboard__chart-wrap">
            <div className="dashboard__section-title">Tren Keuangan (6 Bulan)</div>
            <MiniChart transactions={transactions} accent="umkm" />
          </div>
          <div className="dashboard__categories">
            <div className="dashboard__section-title">Pengeluaran Terbesar</div>
            {topCategories.length === 0 ? (
              <div className="dashboard__empty">Belum ada data pengeluaran</div>
            ) : (
              <div className="dashboard__cat-list">
                {topCategories.map(([cat, amount]) => (
                  <div key={cat} className="dashboard__cat-item">
                    <span className="dashboard__cat-name">{cat}</span>
                    <span className="dashboard__cat-amount">{formatRupiah(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard__recent">
          <div className="dashboard__section-header">
            <div className="dashboard__section-title">Transaksi Terbaru</div>
          </div>
          {recentTx.length === 0 ? (
            <div className="dashboard__empty-state">
              <p>🧾</p><p>Belum ada transaksi.</p><p>Mulai catat dari menu <strong>Transaksi</strong>.</p>
            </div>
          ) : (
            <div className="dashboard__tx-list">
              {recentTx.map(tx => (
                <div key={tx.id} className="dashboard__tx-item">
                  <div className={`dashboard__tx-dot dashboard__tx-dot--${tx.type === "pemasukan" ? "income" : "expense"}`} />
                  <div className="dashboard__tx-info">
                    <p className="dashboard__tx-desc">{tx.description || tx.category || "-"}</p>
                    <p className="dashboard__tx-date">{new Date(tx.createdAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  <span className={`dashboard__tx-amount ${tx.type === "pemasukan" ? "dashboard__tx-amount--income" : "dashboard__tx-amount--expense"}`}>
                    {tx.type === "pemasukan" ? "+" : "-"}{formatRupiah(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}
      </div>
    </DashboardLayout>
  );
}
