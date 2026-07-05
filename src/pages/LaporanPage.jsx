import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { getTransactions, calcSummary, formatRupiah, groupByMonth, groupByCategory, monthLabel, isModalUsaha } from "../utils/storage";
import BreakEvenPoint from "../components/BreakEvenPoint";
import UtangPiutang from "../components/UtangPiutang";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./LaporanPage.css";
import "./DashboardSkeleton.css";

export default function LaporanPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("labarugi");
  const [transactions, setTransactions] = useState([]);
  const [asetUsaha, setAsetUsaha]       = useState([]);
  const [filterMonth, setFilterMonth]   = useState("semua");
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("finsight_token");
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(`/api/transactions?mode=umkm`, { headers: h }).then(r => r.json()),
      fetch(`/api/umkm?table=aset_usaha`, { headers: h }).then(r => r.json()),
    ]).then(([txRes, asetRes]) => {
      if (txRes.success)   setTransactions(txRes.data);
      if (asetRes.success) setAsetUsaha(asetRes.data);
    }).finally(() => setLoading(false));
  }, [user]);

  const usahaTx = transactions.filter(t => !isModalUsaha(t)); // Omzet/Laba murni, tanpa modal
  const modalTx = transactions.filter(isModalUsaha);

  const months = [...new Set(usahaTx.map((t) => (t.date || t.createdAt || "").slice(0, 7)).filter(Boolean))].sort().reverse();

  const filtered = filterMonth === "semua"
    ? usahaTx
    : usahaTx.filter((t) => (t.date || t.createdAt || "").slice(0, 7) === filterMonth);

  const modalFiltered = filterMonth === "semua"
    ? modalTx
    : modalTx.filter((t) => (t.date || t.createdAt || "").slice(0, 7) === filterMonth);
  const totalModal    = modalFiltered.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalNilaiAset = asetUsaha.reduce((s, it) => s + Number(it.hargaBeli || 0), 0);

  const summary    = calcSummary(filtered);
  const byMonth    = groupByMonth(usahaTx);
  const byCategory = groupByCategory(filtered);
  const margin     = summary.pemasukan > 0 ? ((summary.saldo / summary.pemasukan) * 100).toFixed(1) : 0;

  const monthKeyLocal = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthKeyOf = (monthKey) => {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 - 1, 1);
    return monthKeyLocal(d);
  };

  let comparison = null;
  if (filterMonth !== "semua") {
    const prevKey  = prevMonthKeyOf(filterMonth);
    const prevTx   = usahaTx.filter((t) => (t.date || t.createdAt || "").slice(0, 7) === prevKey);
    const prevSummary    = calcSummary(prevTx);
    const prevByCategory = groupByCategory(prevTx);
    const hasPrevData    = prevTx.length > 0;

    const pctDelta = (curr, prev) => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    comparison = {
      prevKey, hasPrevData, prevSummary, prevByCategory,
      deltaPemasukan:   pctDelta(summary.pemasukan, prevSummary.pemasukan),
      deltaPengeluaran: pctDelta(summary.pengeluaran, prevSummary.pengeluaran),
      deltaSaldo:       pctDelta(summary.saldo, prevSummary.saldo),
    };
  }

  const formatDelta = (delta) => {
    if (delta === null) return { text: "Baru", arah: "tetap" };
    if (delta === 0) return { text: "0%", arah: "tetap" };
    return { text: `${Math.abs(delta).toFixed(1)}%`, arah: delta > 0 ? "naik" : "turun" };
  };

  const opCategoryNames = comparison
    ? [...new Set([...byCategory.map(([c]) => c), ...comparison.prevByCategory.map(([c]) => c)])]
    : [];
  const currCategoryMap = Object.fromEntries(byCategory);
  const prevCategoryMap = comparison ? Object.fromEntries(comparison.prevByCategory) : {};

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const AMBER = [217, 119, 6];
    const periodeLabel = filterMonth === "semua" ? "Semua Periode" : monthLabel(filterMonth);
    const tanggalCetak = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    let y = 18;

    // ── Header ──
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.setTextColor(...AMBER);
    doc.text("LAPORAN KEUANGAN USAHA", 14, y);
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(90);
    y += 6;
    doc.text(`Periode: ${periodeLabel}`, 14, y);
    doc.text(`Dicetak: ${tanggalCetak}`, pageW - 14, y, { align: "right" });
    y += 3;
    doc.setDrawColor(...AMBER); doc.setLineWidth(0.5); doc.line(14, y, pageW - 14, y);
    y += 8;

    // ── Ringkasan ──
    autoTable(doc, {
      startY: y,
      head: [["Ringkasan", "Nominal"]],
      body: [
        ["Total Omzet", formatRupiah(summary.pemasukan)],
        ["Total Pengeluaran", formatRupiah(summary.pengeluaran)],
        ["Laba Bersih", formatRupiah(summary.saldo)],
        ["Margin Laba", `${margin}%`],
        ["Modal Usaha" + (filterMonth === "semua" ? " (total)" : " (periode ini)"), formatRupiah(totalModal)],
        ["Total Aset Usaha (per hari ini)", formatRupiah(totalNilaiAset)],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ── Pengeluaran per Kategori ──
    if (byCategory.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Kategori Pengeluaran", "Nominal", "% dari total"]],
        body: byCategory.map(([cat, amt]) => [
          cat,
          formatRupiah(amt),
          `${summary.pengeluaran > 0 ? ((amt / summary.pengeluaran) * 100).toFixed(0) : 0}%`,
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Tren Bulanan ──
    if (byMonth.length > 0) {
      if (y > 240) { doc.addPage(); y = 18; }
      autoTable(doc, {
        startY: y,
        head: [["Bulan", "Pendapatan", "Pengeluaran", "Laba Bersih"]],
        body: byMonth.map(([m, val]) => [
          monthLabel(m), formatRupiah(val.pemasukan), formatRupiah(val.pengeluaran),
          formatRupiah(val.pemasukan - val.pengeluaran),
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Ringkasan Otomatis ──
    if (filtered.length > 0) {
      if (y > 250) { doc.addPage(); y = 18; }
      doc.setFontSize(10); doc.setFont(undefined, "bold"); doc.setTextColor(30);
      doc.text("Ringkasan Otomatis", 14, y);
      y += 6;
      const narasi = `Pada periode ini, usaha mencatat omzet sebesar ${formatRupiah(summary.pemasukan)} dengan pengeluaran ${formatRupiah(summary.pengeluaran)}, menghasilkan laba bersih ${formatRupiah(summary.saldo)} (margin ${margin}%).`;
      doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(70);
      const lines = doc.splitTextToSize(narasi, pageW - 28);
      doc.text(lines, 14, y);
    }

    // ── Footer ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Halaman ${i} dari ${pageCount} · Dibuat otomatis oleh FinSight AI`, pageW / 2, 290, { align: "center" });
    }

    doc.save(`laporan-keuangan-${filterMonth === "semua" ? "semua" : filterMonth}.pdf`);
  };

  return (
    <DashboardLayout>
      <div className="laporanpage">
        <PageHeader
          title="Laporan Keuangan"
          subtitle="Ringkasan lengkap keuangan usahamu"
        />

        {/* ── Skeleton ── */}
        {loading ? (
          <div className="dashboard__skeleton" style={{ padding: "0 2rem" }}>
            <div className="dashboard__skeleton-block skel" style={{ height: "44px" }} />
            <div className="dashboard__skeleton-metrics">
              {[1,2,3,4].map(i => <div key={i} className="dashboard__skeleton-card skel" />)}
            </div>
            <div className="dashboard__skeleton-block skel" style={{ height: "220px" }} />
            <div className="dashboard__skeleton-block skel" style={{ height: "180px" }} />
          </div>
        ) : (
          /* ── Konten utama (semua tab) ── */
          <div className="laporanpage__content">

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
              <div className="laporanpage__labarugi">

            {/* Filter + Export */}
                <div className="laporanpage__header-actions">
                  <select
                    className="laporanpage__select"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                  >
                    <option value="semua">Semua Periode</option>
                    {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <button className="laporanpage__export-btn" onClick={handleExportPDF}>
                    📄 Export PDF
                  </button>
                </div>

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

                {/* Modal & Aset — dipisah dari Omzet/Laba karena beda sifat (bukan hasil usaha) */}
                <div className="laporanpage__section">
                  <h3 className="laporanpage__section-title">Modal &amp; Aset Usaha</h3>
                  <div className="laporanpage__submetrics">
                    <div className="laporanpage__sum-card laporanpage__sum-card--modal">
                      <span className="laporanpage__sum-label">🏦 Modal Usaha</span>
                      <span className="laporanpage__sum-value">{formatRupiah(totalModal)}</span>
                      <span className="laporanpage__sum-sub">{filterMonth === "semua" ? "Total keseluruhan" : `Periode ${monthLabel(filterMonth)}`} · tidak dihitung sebagai omzet</span>
                    </div>
                    <div className="laporanpage__sum-card laporanpage__sum-card--aset">
                      <span className="laporanpage__sum-label">💎 Total Aset Usaha</span>
                      <span className="laporanpage__sum-value">{formatRupiah(totalNilaiAset)}</span>
                      <span className="laporanpage__sum-sub">{asetUsaha.length} item peralatan · nilai per hari ini</span>
                    </div>
                  </div>
                </div>

                {/* Tren + Kategori */}
                <div className="laporanpage__row">
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
                      Pilih periode tertentu pada filter di atas untuk melihat perbandingan dengan periode sebelumnya.
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

                  {byMonth.length > 0 && (
                    <div className="laporanpage__pl-table-wrap">
                      <table className="laporanpage__pl-table">
                        <thead>
                          <tr>
                            <th>Bulan</th><th>Pendapatan</th><th>Biaya Operasional</th><th>Laba Bersih</th>
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

                {/* Narasi AI */}
                <div className="laporanpage__narasi">
                  <div className="laporanpage__narasi-header">
                    <span>🤖</span>
                    <span>Ringkasan Otomatis</span>
                  </div>
                  <p>
                    {filtered.length === 0
                      ? "Belum ada transaksi untuk periode ini."
                      : `Pada periode ini, usahamu mencatat omzet sebesar ${formatRupiah(summary.pemasukan)} dengan pengeluaran ${formatRupiah(summary.pengeluaran)}, menghasilkan laba bersih ${formatRupiah(summary.saldo)} (margin ${margin}%). ${Number(margin) >= 30 ? "Margin yang sehat! Pertahankan efisiensi ini." : Number(margin) >= 10 ? "Margin cukup baik. Coba tingkatkan omzet atau kurangi pengeluaran." : "Margin masih rendah. Evaluasi struktur biaya usahamu."} ${totalModal > 0 ? `Selain itu, ada setoran modal sebesar ${formatRupiah(totalModal)} pada periode ini yang tidak dihitung sebagai omzet.` : ""} Saat ini total nilai aset usaha (peralatan) tercatat ${formatRupiah(totalNilaiAset)}.`
                    }
                  </p>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
