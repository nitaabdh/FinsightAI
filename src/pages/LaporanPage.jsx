import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { getTransactions, calcSummary, formatRupiah, groupByMonth, groupByCategory, groupByCategoryType, monthLabel, isModalUsaha, isRealKasTx, computeKasStats, getKasEmoji } from "../utils/storage";
import { nilaiStok } from "../utils/umkmCalc";
import BreakEvenPoint from "../components/BreakEvenPoint";
import UtangPiutang from "../components/UtangPiutang";
import Dompet from "../components/Dompet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CountUp from "../components/CountUp";
import "./LaporanPage.css";
import "./DashboardSkeleton.css";

export default function LaporanPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("labarugi");
  const [transactions, setTransactions] = useState([]);
  const [asetUsaha, setAsetUsaha]       = useState([]);
  const [bahanBaku, setBahanBaku]       = useState([]);
  const [utangPiutang, setUtangPiutang] = useState([]);
  const [filterMonth, setFilterMonth]   = useState("semua");
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("finsight_token");
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      // Pakai getTransactions (bukan fetch mentah) — biar field kasTujuan ke-normalize
      // dengan benar. Fetch mentah bikin computeKasStats & transferPeriodeIni salah
      // hitung buat transaksi Transfer Antar Dompet.
      getTransactions(user.id, "umkm"),
      fetch(`/api/umkm?table=aset_usaha`, { headers: h }).then(r => r.json()),
      fetch(`/api/umkm?table=bahan_baku`, { headers: h }).then(r => r.json()),
      fetch(`/api/umkm?table=utang_piutang`, { headers: h }).then(r => r.json()),
    ]).then(([txData, asetRes, bahanRes, upRes]) => {
      setTransactions(txData);
      if (asetRes.success)  setAsetUsaha(asetRes.data);
      if (bahanRes.success) setBahanBaku(bahanRes.data);
      if (upRes.success)    setUtangPiutang(upRes.data);
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

  // ── Saldo per Kas — posisi kas SAAT INI, sengaja TIDAK ikut filter periode ───
  // (sama prinsipnya kayak Total Aset Usaha: ini snapshot hari ini, bukan pergerakan per bulan)
  // Logic dipusatkan di storage.js (computeKasStats) biar konsisten dengan Dashboard.
  const kasStats = computeKasStats(transactions);

  const summary    = calcSummary(filtered);
  const byMonth    = groupByMonth(usahaTx);
  const byCategory = groupByCategory(filtered);
  const margin     = summary.pemasukan > 0 ? ((summary.saldo / summary.pemasukan) * 100).toFixed(1) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // NERACA (posisi keuangan hari ini — snapshot, TIDAK ikut filter periode,
  // sama prinsipnya kayak Saldo per Kas & Total Aset Usaha di atas)
  // ─────────────────────────────────────────────────────────────────────────
  // Kas & Setara Kas — kas REAL aja, kerugian stok (non-kas) dikecualikan
  const totalKasReal = kasStats.filter(k => k.nama !== "Non-Kas (Kerugian Stok)").reduce((s, k) => s + k.saldo, 0);
  const totalPiutang = utangPiutang.filter(u => u.jenis === "piutang" && !u.lunas).reduce((s, u) => s + Number(u.nominal || 0), 0);
  const totalUtang   = utangPiutang.filter(u => u.jenis === "utang"   && !u.lunas).reduce((s, u) => s + Number(u.nominal || 0), 0);
  const totalPersediaan = bahanBaku.reduce((s, b) => s + nilaiStok(b), 0);
  // Modal Disetor & Laba Ditahan dihitung ALL-TIME (bukan per filter bulan), karena
  // Neraca itu snapshot "per hari ini", bukan pergerakan 1 periode kayak Laba-Rugi.
  const totalModalAllTime = modalTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const labaDitahanAllTime = calcSummary(usahaTx).saldo;

  const totalHarta      = totalKasReal + totalPiutang + totalPersediaan + totalNilaiAset;
  const totalKewajiban  = totalUtang;
  const totalEkuitas    = totalModalAllTime + labaDitahanAllTime;
  // Selisih pencatatan: bisa muncul karena bahan baku dicatat cash-basis (jadi biaya
  // pas dibeli), bukan akrual penuh (biaya baru diakui pas kepake) — bukan bug,
  // tapi keterbatasan sistem pencatatan sederhana yang ditampilkan apa adanya.
  const selisihNeraca = totalHarta - totalKewajiban - totalEkuitas;

  // ─────────────────────────────────────────────────────────────────────────
  // ARUS KAS (pergerakan kas beneran — ikut filter periode yang sama kayak Laba-Rugi,
  // TAPI beda dari Laba-Rugi: Modal Usaha DIHITUNG di sini karena itu duit asli masuk,
  // dan kerugian stok non-kas DIKECUALIKAN karena bukan duit asli keluar)
  // ─────────────────────────────────────────────────────────────────────────
  const kasTxFiltered = filterMonth === "semua"
    ? transactions.filter(isRealKasTx)
    : transactions.filter(t => isRealKasTx(t) && (t.date || t.createdAt || "").slice(0, 7) === filterMonth);
  const kasMasukByKategori  = groupByCategoryType(kasTxFiltered, "pemasukan");
  const kasKeluarByKategori = groupByCategoryType(kasTxFiltered, "pengeluaran");
  const totalKasMasuk  = kasMasukByKategori.reduce((s, [, v]) => s + v, 0);
  const totalKasKeluar = kasKeluarByKategori.reduce((s, [, v]) => s + v, 0);
  const kenaikanKasBersih = totalKasMasuk - totalKasKeluar;
  // Transfer antar dompet — TIDAK dihitung ke kas masuk/keluar (bukan uang baru),
  // tapi tetap ditampilkan terpisah biar kelihatan riwayat mutasinya.
  const transferPeriodeIni = kasTxFiltered.filter(t => t.type === "transfer" && t.kasTujuan);

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

    // ── Saldo per Kas (posisi saat ini, bukan pergerakan periode) ──
    if (kasStats.length > 0) {
      if (y > 240) { doc.addPage(); y = 18; }
      autoTable(doc, {
        startY: y,
        head: [["Kas / Wadah Uang", "Saldo Saat Ini"]],
        body: kasStats.map(k => [k.nama, formatRupiah(k.saldo)]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

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

    // ── Neraca (snapshot hari ini) ──
    if (y > 230) { doc.addPage(); y = 18; }
    autoTable(doc, {
      startY: y,
      head: [["Neraca (posisi hari ini)", "Nominal"]],
      body: [
        ["Kas & Setara Kas", formatRupiah(totalKasReal)],
        ["Piutang Usaha", formatRupiah(totalPiutang)],
        ["Persediaan Bahan Baku", formatRupiah(totalPersediaan)],
        ["Aset Usaha", formatRupiah(totalNilaiAset)],
        ["Total Harta", formatRupiah(totalHarta)],
        ["Utang Usaha (Kewajiban)", formatRupiah(totalKewajiban)],
        ["Modal Disetor + Laba Ditahan", formatRupiah(totalEkuitas)],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;

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
                { id: "neraca",       icon: "⚖️", label: "Neraca" },
                { id: "aruskas",      icon: "💵", label: "Arus Kas" },
                { id: "dompet",       icon: "👛", label: "Dompet" },
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

            {/* Tab: Dompet */}
            {activeTab === "dompet" && <Dompet />}

            {/* Tab: BEP */}
            {activeTab === "bep" && <BreakEvenPoint />}

            {/* Tab: Neraca */}
            {activeTab === "neraca" && (
              <div className="laporanpage__formal">
                <div className="laporanpage__formal-head">
                  <h2>{user?.name ? `Usaha ${user.name}` : "Laporan Usaha"}</h2>
                  <h3>NERACA</h3>
                  <p>Per hari ini, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>

                <table className="laporanpage__formal-table">
                  <tbody>
                    <tr className="laporanpage__formal-group"><td colSpan={2}>HARTA</td></tr>
                    <tr><td>Kas &amp; Setara Kas</td><td>{formatRupiah(totalKasReal)}</td></tr>
                    <tr><td>Piutang Usaha (belum lunas)</td><td>{formatRupiah(totalPiutang)}</td></tr>
                    <tr><td>Persediaan Bahan Baku</td><td>{formatRupiah(totalPersediaan)}</td></tr>
                    <tr><td>Aset Usaha (nilai perolehan)</td><td>{formatRupiah(totalNilaiAset)}</td></tr>
                    <tr className="laporanpage__formal-total"><td>Total Harta</td><td>{formatRupiah(totalHarta)}</td></tr>

                    <tr className="laporanpage__formal-group"><td colSpan={2}>KEWAJIBAN</td></tr>
                    <tr><td>Utang Usaha (belum lunas)</td><td>{formatRupiah(totalUtang)}</td></tr>
                    <tr className="laporanpage__formal-total"><td>Total Kewajiban</td><td>{formatRupiah(totalKewajiban)}</td></tr>

                    <tr className="laporanpage__formal-group"><td colSpan={2}>MODAL</td></tr>
                    <tr><td>Modal Disetor (total keseluruhan)</td><td>{formatRupiah(totalModalAllTime)}</td></tr>
                    <tr><td>Laba Ditahan (akumulasi laba usaha)</td><td>{formatRupiah(labaDitahanAllTime)}</td></tr>
                    <tr className="laporanpage__formal-total"><td>Total Modal</td><td>{formatRupiah(totalEkuitas)}</td></tr>

                    <tr className="laporanpage__formal-grand"><td>Total Kewajiban &amp; Modal</td><td>{formatRupiah(totalKewajiban + totalEkuitas)}</td></tr>
                  </tbody>
                </table>

                {Math.abs(selisihNeraca) > 1 && (
                  <p className="laporanpage__formal-note">
                    ⚠️ Ada selisih pencatatan {formatRupiah(Math.abs(selisihNeraca))} antara Total Harta dan Total Kewajiban+Modal.
                    Ini wajar terjadi karena bahan baku dicatat sebagai biaya saat DIBELI (bukan saat dipakai), jadi bukan berarti ada data yang salah/hilang —
                    cuma keterbatasan pencatatan kas sederhana, bukan pembukuan akuntansi penuh.
                  </p>
                )}
              </div>
            )}

            {/* Tab: Arus Kas */}
            {activeTab === "aruskas" && (
              <div className="laporanpage__formal">
                <div className="laporanpage__formal-head">
                  <h2>{user?.name ? `Usaha ${user.name}` : "Laporan Usaha"}</h2>
                  <h3>ARUS KAS</h3>
                  <p>Periode: {filterMonth === "semua" ? "Semua Periode" : monthLabel(filterMonth)}</p>
                </div>

                <div className="laporanpage__header-actions">
                  <select className="laporanpage__select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                    <option value="semua">Semua Periode</option>
                    {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </div>

                <table className="laporanpage__formal-table">
                  <tbody>
                    <tr className="laporanpage__formal-group"><td colSpan={2}>KAS MASUK</td></tr>
                    {kasMasukByKategori.length === 0
                      ? <tr><td colSpan={2} className="laporanpage__formal-empty">Belum ada kas masuk periode ini</td></tr>
                      : kasMasukByKategori.map(([cat, amt]) => <tr key={cat}><td>{cat}</td><td>{formatRupiah(amt)}</td></tr>)}
                    <tr className="laporanpage__formal-total"><td>Total Kas Masuk</td><td>{formatRupiah(totalKasMasuk)}</td></tr>

                    <tr className="laporanpage__formal-group"><td colSpan={2}>KAS KELUAR</td></tr>
                    {kasKeluarByKategori.length === 0
                      ? <tr><td colSpan={2} className="laporanpage__formal-empty">Belum ada kas keluar periode ini</td></tr>
                      : kasKeluarByKategori.map(([cat, amt]) => <tr key={cat}><td>{cat}</td><td>{formatRupiah(amt)}</td></tr>)}
                    <tr className="laporanpage__formal-total"><td>Total Kas Keluar</td><td>{formatRupiah(totalKasKeluar)}</td></tr>

                    <tr className={"laporanpage__formal-grand" + (kenaikanKasBersih < 0 ? " laporanpage__formal-grand--neg" : "")}>
                      <td>{kenaikanKasBersih >= 0 ? "Kenaikan" : "Penurunan"} Kas Bersih Periode Ini</td>
                      <td>{formatRupiah(kenaikanKasBersih)}</td>
                    </tr>
                  </tbody>
                </table>

                <p className="laporanpage__formal-note">
                  Kerugian nilai stok (rusak/gagal/sample) tidak dihitung di sini karena bukan uang keluar beneran — lihat tab Laba-Rugi buat pengaruhnya ke laba usaha.
                </p>

                {transferPeriodeIni.length > 0 && (
                  <>
                    <h3 className="laporanpage__section-title" style={{ marginTop: "1.5rem" }}>🔄 Transfer Antar Dompet (tidak dihitung kas masuk/keluar)</h3>
                    <table className="laporanpage__formal-table">
                      <tbody>
                        {transferPeriodeIni.map(t => (
                          <tr key={t.id}>
                            <td>{getKasEmoji(t.kas)} {t.kas} → {getKasEmoji(t.kasTujuan)} {t.kasTujuan}</td>
                            <td>{formatRupiah(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {kasStats.filter(k => k.nama !== "Non-Kas (Kerugian Stok)").length > 0 && (
                  <>
                    <h3 className="laporanpage__section-title" style={{ marginTop: "1.5rem" }}>Saldo Kas Saat Ini (per hari ini)</h3>
                    <table className="laporanpage__formal-table">
                      <tbody>
                        {kasStats.filter(k => k.nama !== "Non-Kas (Kerugian Stok)").map(k => (
                          <tr key={k.nama}><td>{getKasEmoji(k.nama)} {k.nama}</td><td>{formatRupiah(k.saldo)}</td></tr>
                        ))}
                        <tr className="laporanpage__formal-total"><td>Total Kas</td><td>{formatRupiah(totalKasReal)}</td></tr>
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

            {/* Tab: Laba-Rugi */}
            {activeTab === "labarugi" && (
              <div className="laporanpage__labarugi">

                {/* Laba-Rugi format standar (gaya dokumen formal) */}
                <div className="laporanpage__formal">
                  <div className="laporanpage__formal-head">
                    <h2>{user?.name ? `Usaha ${user.name}` : "Laporan Usaha"}</h2>
                    <h3>LABA RUGI - STANDAR</h3>
                    <p>Periode: {filterMonth === "semua" ? "Semua Periode" : monthLabel(filterMonth)}</p>
                  </div>
                  <table className="laporanpage__formal-table">
                    <tbody>
                      <tr className="laporanpage__formal-group"><td colSpan={2}>PENDAPATAN USAHA</td></tr>
                      {groupByCategoryType(filtered, "pemasukan").map(([cat, amt]) => (
                        <tr key={cat}><td>{cat}</td><td>{formatRupiah(amt)}</td></tr>
                      ))}
                      <tr className="laporanpage__formal-total"><td>Total Pendapatan Usaha</td><td>{formatRupiah(summary.pemasukan)}</td></tr>

                      <tr className="laporanpage__formal-group"><td colSpan={2}>BEBAN USAHA</td></tr>
                      {byCategory.length === 0
                        ? <tr><td colSpan={2} className="laporanpage__formal-empty">Belum ada beban periode ini</td></tr>
                        : byCategory.map(([cat, amt]) => <tr key={cat}><td>{cat}</td><td>{formatRupiah(amt)}</td></tr>)}
                      <tr className="laporanpage__formal-total"><td>Total Beban Usaha</td><td>{formatRupiah(summary.pengeluaran)}</td></tr>

                      <tr className={"laporanpage__formal-grand" + (summary.saldo < 0 ? " laporanpage__formal-grand--neg" : "")}>
                        <td>Laba/Rugi Bersih</td><td>{formatRupiah(summary.saldo)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

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
                <div className="laporanpage__summary stagger-list">
                  <div className="laporanpage__sum-card laporanpage__sum-card--income">
                    <span className="laporanpage__sum-label">📈 Total Omzet</span>
                    <span className="laporanpage__sum-value"><CountUp value={summary.pemasukan} format={formatRupiah} /></span>
                  </div>
                  <div className="laporanpage__sum-card laporanpage__sum-card--expense">
                    <span className="laporanpage__sum-label">📉 Total Pengeluaran</span>
                    <span className="laporanpage__sum-value"><CountUp value={summary.pengeluaran} format={formatRupiah} /></span>
                  </div>
                  <div className={"laporanpage__sum-card " + (summary.saldo >= 0 ? "laporanpage__sum-card--profit" : "laporanpage__sum-card--loss")}>
                    <span className="laporanpage__sum-label">💰 Laba Bersih</span>
                    <span className="laporanpage__sum-value"><CountUp value={summary.saldo} format={formatRupiah} /></span>
                    <span className="laporanpage__sum-sub">Margin {margin}%</span>
                  </div>
                  <div className="laporanpage__sum-card laporanpage__sum-card--neutral">
                    <span className="laporanpage__sum-label">🧾 Transaksi</span>
                    <span className="laporanpage__sum-value"><CountUp value={filtered.length} /></span>
                    <span className="laporanpage__sum-sub">entri tercatat</span>
                  </div>
                </div>

                {/* Modal & Aset — dipisah dari Omzet/Laba karena beda sifat (bukan hasil usaha) */}
                <div className="laporanpage__section">
                  <h3 className="laporanpage__section-title">Modal &amp; Aset Usaha</h3>
                  <div className="laporanpage__submetrics stagger-list">
                    <div className="laporanpage__sum-card laporanpage__sum-card--modal">
                      <span className="laporanpage__sum-label">🏦 Modal Usaha</span>
                      <span className="laporanpage__sum-value"><CountUp value={totalModal} format={formatRupiah} /></span>
                      <span className="laporanpage__sum-sub">{filterMonth === "semua" ? "Total keseluruhan" : `Periode ${monthLabel(filterMonth)}`} · tidak dihitung sebagai omzet</span>
                    </div>
                    <div className="laporanpage__sum-card laporanpage__sum-card--aset">
                      <span className="laporanpage__sum-label">💎 Total Aset Usaha</span>
                      <span className="laporanpage__sum-value"><CountUp value={totalNilaiAset} format={formatRupiah} /></span>
                      <span className="laporanpage__sum-sub">{asetUsaha.length} item peralatan · nilai per hari ini</span>
                    </div>
                  </div>
                </div>

                {/* Saldo per Kas — posisi saat ini, tidak ikut filter periode di atas */}
                {kasStats.length > 0 && (
                  <div className="laporanpage__section">
                    <h3 className="laporanpage__section-title">Saldo per Kas</h3>
                    <p className="laporanpage__pl-hint" style={{ marginBottom: "0.75rem" }}>
                      Posisi kas saat ini — angka ini tidak berubah walau kamu ganti filter periode di atas.
                    </p>
                    <div className="laporanpage__submetrics laporanpage__submetrics--wrap">
                      {kasStats.map(k => (
                        <div key={k.nama} className={"laporanpage__sum-card " + (k.saldo < 0 ? "laporanpage__sum-card--loss" : "laporanpage__sum-card--neutral")}>
                          <span className="laporanpage__sum-label">{getKasEmoji(k.nama)} {k.nama}</span>
                          <span className="laporanpage__sum-value">{formatRupiah(k.saldo)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
