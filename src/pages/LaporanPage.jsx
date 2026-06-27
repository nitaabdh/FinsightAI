import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { getTransactions, calcSummary, formatRupiah, groupByMonth, groupByCategory, monthLabel } from "../utils/storage";
import BreakEvenPoint from "../components/BreakEvenPoint";
import UtangPiutang from "../components/UtangPiutang";
import "./LaporanPage.css";

export default function LaporanPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("labarugi"); // "labarugi" | "bep" | "utangpiutang"
  const [transactions, setTransactions] = useState([]);
  const [filterMonth, setFilterMonth]   = useState("semua");

  useEffect(() => {
  if (!user) return;
  const token = localStorage.getItem("finsight_token");
  fetch(`/api/transactions?mode=umkm`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  }).then(r => r.json()).then(r => { if (r.success) setTransactions(r.data); });
}, [user]);

  const months = [...new Set(transactions.map((t) => (t.date || t.createdAt || "").slice(0, 7)).filter(Boolean))].sort().reverse();

  const filtered = filterMonth === "semua"
    ? transactions
    : transactions.filter((t) => (t.date || t.createdAt || "").slice(0, 7) === filterMonth);

  const summary    = calcSummary(filtered);
  const byMonth    = groupByMonth(transactions);
  const byCategory = groupByCategory(filtered);
  const margin     = summary.pemasukan > 0 ? ((summary.saldo / summary.pemasukan) * 100).toFixed(1) : 0;

  // ── Perbandingan Periode (hanya saat filterMonth bukan "semua") ──────────────
  const monthKeyLocal = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthKeyOf = (monthKey) => {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 - 1, 1); // m sudah 1-indexed, mundur 1 bulan lagi
    return monthKeyLocal(d);
  };

  let comparison = null;
  if (filterMonth !== "semua") {
    const prevKey = prevMonthKeyOf(filterMonth);
    const prevTx  = transactions.filter((t) => (t.date || t.createdAt || "").slice(0, 7) === prevKey);
    const prevSummary    = calcSummary(prevTx);
    const prevByCategory = groupByCategory(prevTx);
    const hasPrevData    = prevTx.length > 0;

    const pctDelta = (curr, prev) => {
      if (prev === 0) return curr === 0 ? 0 : null; // null = tidak terhingga, tampilkan "Baru"
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    comparison = {
      prevKey,
      hasPrevData,
      prevSummary,
      prevByCategory,
      deltaPemasukan:   pctDelta(summary.pemasukan, prevSummary.pemasukan),
      deltaPengeluaran: pctDelta(summary.pengeluaran, prevSummary.pengeluaran),
      deltaSaldo:       pctDelta(summary.saldo, prevSummary.saldo),
    };
  }

  const formatDelta = (delta) => {
    if (delta === null) return { text: "Baru", arah: "tetap" };
    if (delta === 0) return { text: "0%", arah: "tetap" };
    return {
      text: `${Math.abs(delta).toFixed(1)}%`,
      arah: delta > 0 ? "naik" : "turun",
    };
  };

  // Gabung kategori biaya operasional periode ini & sebelumnya jadi satu daftar nama
  const opCategoryNames = comparison
    ? [...new Set([...byCategory.map(([c]) => c), ...comparison.prevByCategory.map(([c]) => c)])]
    : [];
  const currCategoryMap = Object.fromEntries(byCategory);
  const prevCategoryMap = comparison ? Object.fromEntries(comparison.prevByCategory) : {};

  const handleExport = () => {
    const rows = [
      ["Tanggal", "Tipe", "Kategori", "Keterangan", "Nominal"],
      ...filtered.map((t) => [
        (t.date || t.createdAt || "").slice(0, 10),
        t.type,
        t.category || "-",
        t.description || "-",
        t.amount,
      ]),
      [],
      ["", "", "", "Total Pemasukan", summary.pemasukan],
      ["", "", "", "Total Pengeluaran", summary.pengeluaran],
      ["", "", "", "Laba Bersih", summary.saldo],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `laporan-${filterMonth === "semua" ? "semua" : filterMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="laporanpage">
        <PageHeader
          title="Laporan Keuangan"
          subtitle="Ringkasan lengkap keuangan usahamu"
        />

        {/* Filter + Export — hanya di tab Laba Rugi */}
        {activeTab === "labarugi" && (
          <div className="laporanpage__header-actions">
            <select
              className="laporanpage__select"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="semua">Semua Periode</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button className="laporanpage__export-btn" onClick={handleExport}>
              ⬇ Export CSV
            </button>
          </div>
        )}
        </div>

        {/* Tab switcher */}
        <div className="laporanpage__tabs">
          {[
            { id: "labarugi",     icon: "📊", label: "Laba-Rugi" },
            { id: "bep",          icon: "📐", label: "Break-Even Point" },
            { id: "utangpiutang", icon: "🤝", label: "Utang-Piutang" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={"laporanpage__tab" + (activeTab === tab.id ? " laporanpage__tab--active" : "")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Utang-Piutang */}
        {activeTab === "utangpiutang" && <UtangPiutang />}

        {/* Tab: BEP */}
        {activeTab === "bep" && <BreakEvenPoint />}

        {/* Tab: Laba-Rugi */}
        {activeTab === "labarugi" && (
        <>
        {/* Summary Cards */}
        <div className="laporanpage__summary">
          <div className="laporanpage__sum-card laporanpage__sum-card--income">
            <span className="laporanpage__sum-label">📈 Total Omzet</span>
            <span className="laporanpage__sum-value">{formatRupiah(summary.pemasukan)}</span>
          </div>
          <div className="laporanpage__sum-card laporanpage__sum-card--expense">
            <span className="laporanpage__sum-label">📉 Total Pengeluaran</span>
            <span className="laporanpage__sum-value">{formatRupiah(summary.pengeluaran)}</span>
          </div>
          <div className={"laporanpage__sum-card " + (summary.saldo >= 0 ? "laporanpage__sum-card--profit" : "laporanpage__sum-card--loss")}>
            <span className="laporanpage__sum-label">💰 Laba Bersih</span>
            <span className="laporanpage__sum-value">{formatRupiah(summary.saldo)}</span>
            <span className="laporanpage__sum-sub">Margin {margin}%</span>
          </div>
          <div className="laporanpage__sum-card laporanpage__sum-card--neutral">
            <span className="laporanpage__sum-label">🧾 Transaksi</span>
            <span className="laporanpage__sum-value">{filtered.length}</span>
            <span className="laporanpage__sum-sub">entri tercatat</span>
          </div>
        </div>

        {/* Tren + Kategori */}
        <div className="laporanpage__row">
          {/* Tren bar chart */}
          <div className="laporanpage__section">
            <h3 className="laporanpage__section-title">Tren Bulanan</h3>
            {byMonth.length === 0 ? (
              <p className="laporanpage__empty">Belum ada data</p>
            ) : (
              <div className="laporanpage__chart">
                {byMonth.map(([m, val]) => {
                  const maxVal = Math.max(...byMonth.flatMap(([, v]) => [v.pemasukan, v.pengeluaran]), 1);
                  return (
                    <div key={m} className="laporanpage__chart-group">
                      <div className="laporanpage__chart-pair">
                        <div className="laporanpage__chart-bar laporanpage__chart-bar--income" style={{ height: `${(val.pemasukan / maxVal) * 100}%` }} title={formatRupiah(val.pemasukan)} />
                        <div className="laporanpage__chart-bar laporanpage__chart-bar--expense" style={{ height: `${(val.pengeluaran / maxVal) * 100}%` }} title={formatRupiah(val.pengeluaran)} />
                      </div>
                      <span className="laporanpage__chart-label">{monthLabel(m)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="laporanpage__chart-legend">
              <span className="laporanpage__legend-dot laporanpage__legend-dot--income" /> Omzet
              <span className="laporanpage__legend-dot laporanpage__legend-dot--expense" /> Pengeluaran
            </div>
          </div>

          {/* Pengeluaran per Kategori */}
          <div className="laporanpage__section">
            <h3 className="laporanpage__section-title">Pengeluaran per Kategori</h3>
            {byCategory.length === 0 ? (
              <p className="laporanpage__empty">Belum ada pengeluaran</p>
            ) : (
              <div className="laporanpage__categories">
                {byCategory.map(([cat, amount]) => {
                  const persen = summary.pengeluaran > 0 ? ((amount / summary.pengeluaran) * 100).toFixed(0) : 0;
                  return (
                    <div key={cat} className="laporanpage__cat-item">
                      <div className="laporanpage__cat-top">
                        <span className="laporanpage__cat-name">{cat}</span>
                        <span className="laporanpage__cat-amount">{formatRupiah(amount)}</span>
                      </div>
                      <div className="laporanpage__cat-bar">
                        <div className="laporanpage__cat-fill" style={{ width: persen + "%" }} />
                      </div>
                      <span className="laporanpage__cat-persen">{persen}% dari total pengeluaran</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail Laba-Rugi */}
        <div className="laporanpage__section laporanpage__plsection">
          <h3 className="laporanpage__section-title">Detail Laba-Rugi</h3>

          {filterMonth === "semua" ? (
            <p className="laporanpage__pl-hint">
              Pilih periode tertentu pada filter di atas untuk melihat perbandingan dengan periode sebelumnya. Di bawah ini tetap tersedia rincian laba-rugi per bulan.
            </p>
          ) : !comparison.hasPrevData ? (
            <p className="laporanpage__pl-hint">
              Belum ada data pada periode sebelumnya ({monthLabel(comparison.prevKey)}) untuk dibandingkan dengan {monthLabel(filterMonth)}.
            </p>
          ) : (
            <div className="laporanpage__pl-compare">
              <div className="laporanpage__pl-row laporanpage__pl-row--head">
                <span></span>
                <span>{monthLabel(comparison.prevKey)}</span>
                <span>{monthLabel(filterMonth)}</span>
                <span>Perubahan</span>
              </div>

              <div className="laporanpage__pl-row">
                <span className="laporanpage__pl-label">Pendapatan</span>
                <span>{formatRupiah(comparison.prevSummary.pemasukan)}</span>
                <span className="laporanpage__pl-strong">{formatRupiah(summary.pemasukan)}</span>
                <span className={`laporanpage__pl-delta laporanpage__pl-delta--${formatDelta(comparison.deltaPemasukan).arah}`}>
                  {formatDelta(comparison.deltaPemasukan).arah === "naik" ? "▲" : formatDelta(comparison.deltaPemasukan).arah === "turun" ? "▼" : ""} {formatDelta(comparison.deltaPemasukan).text}
                </span>
              </div>

              {opCategoryNames.length > 0 && (
                <div className="laporanpage__pl-subgroup">
                  <span className="laporanpage__pl-subgroup-title">Biaya Operasional per Kategori</span>
                  {opCategoryNames.map((cat) => {
                    const currAmt = currCategoryMap[cat] || 0;
                    const prevAmt = prevCategoryMap[cat] || 0;
                    const delta   = prevAmt === 0 ? (currAmt === 0 ? 0 : null) : ((currAmt - prevAmt) / Math.abs(prevAmt)) * 100;
                    const fd      = formatDelta(delta);
                    return (
                      <div key={cat} className="laporanpage__pl-row laporanpage__pl-row--sub">
                        <span className="laporanpage__pl-label">{cat}</span>
                        <span>{formatRupiah(prevAmt)}</span>
                        <span>{formatRupiah(currAmt)}</span>
                        <span className={`laporanpage__pl-delta laporanpage__pl-delta--${fd.arah}`}>
                          {fd.arah === "naik" ? "▲" : fd.arah === "turun" ? "▼" : ""} {fd.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="laporanpage__pl-row">
                <span className="laporanpage__pl-label">Total Biaya Operasional</span>
                <span>{formatRupiah(comparison.prevSummary.pengeluaran)}</span>
                <span className="laporanpage__pl-strong">{formatRupiah(summary.pengeluaran)}</span>
                <span className={`laporanpage__pl-delta laporanpage__pl-delta--${formatDelta(comparison.deltaPengeluaran).arah}`}>
                  {formatDelta(comparison.deltaPengeluaran).arah === "naik" ? "▲" : formatDelta(comparison.deltaPengeluaran).arah === "turun" ? "▼" : ""} {formatDelta(comparison.deltaPengeluaran).text}
                </span>
              </div>

              <div className="laporanpage__pl-row laporanpage__pl-row--total">
                <span className="laporanpage__pl-label">Laba Bersih</span>
                <span>{formatRupiah(comparison.prevSummary.saldo)}</span>
                <span className="laporanpage__pl-strong">{formatRupiah(summary.saldo)}</span>
                <span className={`laporanpage__pl-delta laporanpage__pl-delta--${formatDelta(comparison.deltaSaldo).arah}`}>
                  {formatDelta(comparison.deltaSaldo).arah === "naik" ? "▲" : formatDelta(comparison.deltaSaldo).arah === "turun" ? "▼" : ""} {formatDelta(comparison.deltaSaldo).text}
                </span>
              </div>
            </div>
          )}

          {/* Tabel laba-rugi per bulan */}
          {byMonth.length > 0 && (
            <div className="laporanpage__pl-table-wrap">
              <table className="laporanpage__pl-table">
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th>Pendapatan</th>
                    <th>Biaya Operasional</th>
                    <th>Laba Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(([m, val]) => {
                    const labaBulan = val.pemasukan - val.pengeluaran;
                    return (
                      <tr key={m}>
                        <td>{monthLabel(m)}</td>
                        <td>{formatRupiah(val.pemasukan)}</td>
                        <td>{formatRupiah(val.pengeluaran)}</td>
                        <td className={labaBulan >= 0 ? "laporanpage__pl-table-pos" : "laporanpage__pl-table-neg"}>
                          {formatRupiah(labaBulan)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Break-Even Point dipindah ke tab BEP di atas */}

        {/* Narasi AI (statis) */}
        <div className="laporanpage__narasi">
          <div className="laporanpage__narasi-header">
            <span>🤖</span>
            <span>Ringkasan Otomatis</span>
          </div>
          <p>
            {filtered.length === 0
              ? "Belum ada transaksi untuk periode ini."
              : `Pada periode ini, usahamu mencatat omzet sebesar ${formatRupiah(summary.pemasukan)} dengan pengeluaran ${formatRupiah(summary.pengeluaran)}, menghasilkan laba bersih ${formatRupiah(summary.saldo)} (margin ${margin}%). ${Number(margin) >= 30 ? "Margin yang sehat! Pertahankan efisiensi ini." : Number(margin) >= 10 ? "Margin cukup baik. Coba tingkatkan omzet atau kurangi pengeluaran." : "Margin masih rendah. Evaluasi struktur biaya usahamu."}`
            }
          </p>
        </div>
        </>
        )}
    </DashboardLayout>
  );
}
