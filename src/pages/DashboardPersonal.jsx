import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import CountUp from "../components/CountUp";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Eye, EyeOff, Wallet, ShoppingCart, PieChart as PieChartIcon,
  TrendingUp, Target, Calendar, Sparkles, Landmark, CreditCard,
  UtensilsCrossed, Car, ShoppingBag, Gamepad2, Pill, BookOpen,
  Receipt, Lightbulb, Droplet, Wifi, Smartphone, Briefcase, Gift, FolderClosed, BarChart3,
} from "lucide-react";
import { getTransactions, calcSummary, formatRupiah, groupByCategory, computeKasStats, getKasEmoji } from "../utils/storage";
import "./Dashboard.css";
import "./DashboardPersonal.css";

const CATEGORY_EMOJI = {
  "makan": "🍔", "makanan": "🍔", "transportasi": "🚗", "transport": "🚗",
  "belanja": "🛍️", "hiburan": "🎮", "kesehatan": "💊", "pendidikan": "📚",
  "tagihan": "🧾", "listrik": "💡", "air": "🚰", "internet": "🌐",
  "pulsa": "📱", "gaji": "💰", "freelance": "💼", "investasi": "📈",
  "tabungan": "🏦", "hadiah": "🎁", "lainnya": "🗂️",
};
function getCategoryEmoji(cat) {
  if (!cat) return "🗂️";
  return CATEGORY_EMOJI[String(cat).toLowerCase().trim()] || "🗂️";
}

// Versi ikon (lucide) buat konteks JSX — dipakai gantiin emoji di UI,
// getCategoryEmoji tetap ada buat konteks teks polos (insight AI, <option>).
const CATEGORY_ICON = {
  "makan": UtensilsCrossed, "makanan": UtensilsCrossed, "transportasi": Car, "transport": Car,
  "belanja": ShoppingBag, "hiburan": Gamepad2, "kesehatan": Pill, "pendidikan": BookOpen,
  "tagihan": Receipt, "listrik": Lightbulb, "air": Droplet, "internet": Wifi,
  "pulsa": Smartphone, "gaji": Wallet, "freelance": Briefcase, "investasi": TrendingUp,
  "tabungan": Landmark, "hadiah": Gift, "lainnya": FolderClosed,
};
function getCategoryIcon(cat, size = 15) {
  const Icon = CATEGORY_ICON[String(cat || "").toLowerCase().trim()] || FolderClosed;
  return <Icon size={size} strokeWidth={2} />;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const t = new Date(dateStr); t.setHours(0,0,0,0);
  return Math.round((t - today) / 86400000);
}
function countdownLabel(diff) {
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff > 1) return `${diff} hari lagi`;
  return `${Math.abs(diff)} hari lalu`;
}

// Warna donut chart per index
const PIE_COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

// Mini sparkbar dari transaksi 7 hari terakhir
function buildSparkData(transactions, type) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const label = d.toLocaleDateString("id-ID", { weekday: "short" });
    const total = transactions
      .filter(tx => {
        const td = new Date(tx.date || tx.createdAt); td.setHours(0,0,0,0);
        return tx.type === type && td.getTime() === d.getTime();
      })
      .reduce((s, tx) => s + Number(tx.amount || 0), 0);
    days.push({ label, total });
  }
  return days;
}

export default function DashboardPersonal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [targets,      setTargets]      = useState([]);
  const [events,       setEvents]       = useState([]);
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [showSaldo,    setShowSaldo]    = useState(true);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [walletFilter, setWalletFilter] = useState("semua"); // "semua" | nama dompet spesifik
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("finsight_token");
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      // Pakai getTransactions (bukan fetch mentah) — biar field kasTujuan ke-normalize
      // dengan benar buat transaksi Transfer Antar Dompet.
      getTransactions(user.id, "personal"),
      fetch(`/api/targets`, { headers: h }).then(r => r.json()).catch(() => ({ success: false, data: [] })),
      fetch(`/api/notes?table=cal_notes&mode=personal`, { headers: h }).then(r => r.json()).catch(() => ({ success: false, data: [] })),
      fetch(`/api/profile`, { headers: h }).then(r => r.json()).catch(() => ({ success: false, data: null })),
    ]).then(([txData, targetRes, evRes, profRes]) => {
      setTransactions(txData);
      if (targetRes.success) setTargets(targetRes.data);
      if (evRes.success)     setEvents(evRes.data.map(ev => ({ id: ev.id, tanggal: ev.date, judul: ev.title || "Acara" })));
      if (profRes.success)   setProfile(profRes.data);
    }).finally(() => setLoading(false));
  }, [user]);

  const summary           = calcSummary(transactions);
  // Saldo per dompet (kas tunai, rekening bank, e-wallet, dll) — dihitung dari
  // histori transaksi mode personal, pakai logic yang sama kayak Dompet UMKM biar konsisten.
  const kasStats           = computeKasStats(transactions);
  const displaySaldoLabel  = walletFilter === "semua" ? "Semua Saldo" : `${getKasEmoji(walletFilter)} ${walletFilter}`;
  const displaySaldo       = walletFilter === "semua"
    ? summary.saldo
    : (kasStats.find(k => k.nama.toLowerCase().trim() === walletFilter.toLowerCase().trim())?.saldo || 0);
  const topCategories     = groupByCategory(transactions.filter(tx => tx.type === "pengeluaran")).slice(0, 5);
  const recentTx          = [...transactions].sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt)).slice(0, 5);
  const budgetPersen      = summary.pemasukan > 0 ? Math.min((summary.pengeluaran / summary.pemasukan) * 100, 100) : 0;
  const budgetPersenLabel = budgetPersen.toFixed(0);
  const budgetStatus      = budgetPersen >= 100 ? "danger" : budgetPersen >= 80 ? "warning" : "safe";
  const activeTargets     = targets.filter(t => t.terkumpul < t.target).slice(0, 2);
  const totalTarget       = targets.reduce((s, t) => s + Number(t.target || 0), 0);
  const totalTerkumpul    = targets.reduce((s, t) => s + Number(t.terkumpul || 0), 0);
  const targetPersen      = totalTarget > 0 ? Math.min((totalTerkumpul / totalTarget) * 100, 100) : 0;

  // Spark data
  const sparkPemasukan   = buildSparkData(transactions, "pemasukan");
  const sparkPengeluaran = buildSparkData(transactions, "pengeluaran");

  // Income tracker
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const txPemasukanIni = transactions.filter(tx => {
    const d = new Date(tx.date || tx.createdAt);
    return tx.type === "pemasukan" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const txPemasukanLalu = transactions.filter(tx => {
    const d = new Date(tx.date || tx.createdAt);
    return tx.type === "pemasukan" && d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
  });
  const incomeByCategory = {};
  txPemasukanIni.forEach(tx => { const c = tx.category||"Lainnya"; incomeByCategory[c] = (incomeByCategory[c]||0) + Number(tx.amount||0); });
  const incomeLastMonth  = {};
  txPemasukanLalu.forEach(tx => { const c = tx.category||"Lainnya"; incomeLastMonth[c] = (incomeLastMonth[c]||0) + Number(tx.amount||0); });
  const incomeSorted        = Object.entries(incomeByCategory).sort((a,b) => b[1]-a[1]);
  const totalPemasukanIni   = txPemasukanIni.reduce((s,tx) => s + Number(tx.amount||0), 0);
  const totalPemasukanLalu  = txPemasukanLalu.reduce((s,tx) => s + Number(tx.amount||0), 0);
  const incomeDelta         = totalPemasukanLalu > 0 ? ((totalPemasukanIni - totalPemasukanLalu) / totalPemasukanLalu) * 100 : null;

  // Insight
  const txBulanIni = transactions.filter(tx => {
    const d = new Date(tx.date || tx.createdAt);
    return tx.type === "pengeluaran" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalPengeluaranBulanIni = txBulanIni.reduce((s,tx) => s + Number(tx.amount||0), 0);
  const catBulanIni = {};
  txBulanIni.forEach(tx => { const c = tx.category||"Lainnya"; catBulanIni[c] = (catBulanIni[c]||0) + Number(tx.amount||0); });
  const topCatBulanIni = Object.entries(catBulanIni).sort((a,b) => b[1]-a[1])[0];
  const insightText = topCatBulanIni && totalPengeluaranBulanIni > 0
    ? `${getCategoryEmoji(topCatBulanIni[0])} Pengeluaran terbesar bulan ini: ${topCatBulanIni[0]} (${((topCatBulanIni[1]/totalPengeluaranBulanIni)*100).toFixed(0)}%)`
    : null;

  // Acara H-7
  const upcomingEvents = events
    .map(ev => ({ ...ev, diff: daysUntil(ev.tanggal) }))
    .filter(ev => ev.diff >= 0 && ev.diff <= 7)
    .sort((a,b) => a.diff - b.diff)
    .slice(0, 2);

  // Avatar
  const avatarUrl = profile?.avatar_url || null;
  const namaUser  = profile?.name || user?.name || user?.email?.split("@")[0] || "Kamu";
  const inisial   = namaUser.charAt(0).toUpperCase();

  // Pie chart data
  const pieData = topCategories.map(([cat, amount]) => ({ name: cat, value: amount }));

  // Tren 6 bulan
  const tren6Bulan = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
    const pemasukan   = transactions.filter(tx => { const td = new Date(tx.date||tx.createdAt); return tx.type==="pemasukan"   && td.getMonth()===d.getMonth() && td.getFullYear()===d.getFullYear(); }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    const pengeluaran = transactions.filter(tx => { const td = new Date(tx.date||tx.createdAt); return tx.type==="pengeluaran" && td.getMonth()===d.getMonth() && td.getFullYear()===d.getFullYear(); }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    tren6Bulan.push({ label, pemasukan, pengeluaran });
  }

  if (loading) return (
    <DashboardLayout>
      <div className="dp2__skeleton">
        {[1,2,3,4,5].map(i => <div key={i} className="dp2__skel-block skel" />)}
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="dp2">

        {/* ── HEADER ── */}
        <div className="dp2__header">
          <div>
            <h1 className="dp2__greeting">Halo, {namaUser}! 👋</h1>
            <p className="dp2__greeting-sub">Kelola keuanganmu dengan mudah</p>
          </div>
          <div className="dp2__header-right">
            {budgetStatus !== "safe" && (
              <span className={"dp2__alert-dot dp2__alert-dot--" + budgetStatus} title={budgetStatus === "danger" ? "Pengeluaran melebihi pemasukan!" : "Pengeluaran hampir melebihi pemasukan"} />
            )}
            <div className="dp2__avatar-wrap dp2__avatar-wrap--mobile-only" ref={menuRef}>
              <div className="dp2__avatar" onClick={() => setMenuOpen(v => !v)}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="dp2__avatar-img" />
                  : <span className="dp2__avatar-initials">{inisial}</span>
                }
              </div>
              {menuOpen && (
                <div className="dp2__avatar-dropdown">
                  <div className="dp2__avatar-dropdown-user">
                    <div className="dp2__avatar-dropdown-avatar">
                      {avatarUrl
                        ? <img src={avatarUrl} alt="avatar" className="dp2__avatar-img" />
                        : <span className="dp2__avatar-initials">{inisial}</span>
                      }
                    </div>
                    <div>
                      <p className="dp2__avatar-dropdown-name">{namaUser}</p>
                      <p className="dp2__avatar-dropdown-email">{user?.email}</p>
                    </div>
                  </div>
                  <div className="dp2__avatar-dropdown-divider" />
                  <button className="dp2__avatar-dropdown-item" onClick={() => { setMenuOpen(false); navigate(`/dashboard/${user?.mode}/profile`); }}>
                    <span>✏️</span><span>Edit Profil</span>
                  </button>
                  <button className="dp2__avatar-dropdown-item dp2__avatar-dropdown-item--danger" onClick={() => { setMenuOpen(false); logout(); navigate("/", { replace: true }); }}>
                    <span>🚪</span><span>Keluar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── HERO CARD SALDO ── */}
        <div className="dp2__hero">
          <div className="dp2__hero-left">
            <div className="dp2__hero-label-row">
              <p className="dp2__hero-label">Saldo</p>
              <select
                className="dp2__wallet-select"
                value={walletFilter}
                onChange={e => setWalletFilter(e.target.value)}
                title="Filter dompet"
              >
                <option value="semua">Semua Saldo</option>
                {kasStats.map(k => (
                  <option key={k.nama} value={k.nama}>{getKasEmoji(k.nama)} {k.nama}</option>
                ))}
              </select>
            </div>
            <div className="dp2__hero-saldo-row">
              <h2 className="dp2__hero-saldo">
                {showSaldo ? <CountUp value={displaySaldo} format={formatRupiah} /> : "Rp ••••••"}
              </h2>
              <button className="dp2__hero-toggle" onClick={() => setShowSaldo(p => !p)}>
                {showSaldo ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <div className="dp2__hero-meta">
              <span className="dp2__hero-type">{displaySaldoLabel}</span>
              <span className="dp2__hero-type">Digital Card</span>
            </div>
            <label className="dp2__hero-nominal-toggle ticket-tear">
              <span>Tampilkan Nominal</span>
              <div className={"dp2__toggle " + (showSaldo ? "dp2__toggle--on" : "")} onClick={() => setShowSaldo(p => !p)}>
                <div className="dp2__toggle-knob" />
              </div>
            </label>
          </div>
          <div className="dp2__card-visual">
            <div className="dp2__card">
              <div className="dp2__card-top">
                <span className="dp2__card-brand">FINSIGHT</span>
                <span className="dp2__card-logo">✦</span>
              </div>
              <div className="dp2__card-chip">
                <div className="dp2__chip" />
              </div>
              <div className="dp2__card-bottom">
                <span className="dp2__card-number">•••• •••• •••• 5678</span>
                <span className="dp2__card-visa">VISA</span>
              </div>
            </div>
            <div className="dp2__card-actions">
              <button className="dp2__card-action-btn" onClick={() => navigate("/dashboard/personal/transaksi")}>
                + Catat Transaksi
              </button>
              <button className="dp2__card-action-btn dp2__card-action-btn--sec" onClick={() => navigate("/dashboard/personal/dompet")}>
                👛 Dompet
              </button>
            </div>
          </div>
        </div>

        {/* ── 3 CARDS: Pemasukan | Pengeluaran | Budget ── */}
        <div className="dp2__metrics dp2__metrics--3col stagger-list">
          <div className="dp2__metric dp2__metric--income">
            <div className="dp2__metric-icon dp2__metric-icon--income"><Wallet size={17} /></div>
            <p className="dp2__metric-label">Total Pemasukan</p>
            <p className="dp2__metric-value"><CountUp value={summary.pemasukan} format={formatRupiah} /></p>
            <p className="dp2__metric-sub">Gaji, freelance, dll</p>
          </div>
          <div className="dp2__metric dp2__metric--expense">
            <div className="dp2__metric-icon dp2__metric-icon--expense"><ShoppingCart size={17} /></div>
            <p className="dp2__metric-label">Total Pengeluaran</p>
            <p className="dp2__metric-value"><CountUp value={summary.pengeluaran} format={formatRupiah} /></p>
            <p className="dp2__metric-sub">{budgetPersenLabel}% dari pemasukan</p>
          </div>
          <div className={"dp2__metric dp2__metric--budget dp2__metric--budget-" + budgetStatus}>
            <div className={"dp2__metric-icon dp2__metric-icon--budget-" + budgetStatus}><PieChartIcon size={17} /></div>
            <p className="dp2__metric-label">Budget Bulan Ini</p>
            <p className="dp2__metric-value dp2__metric-value--budget">{budgetPersenLabel}%</p>
            <div className="dp2__budget-bar dp2__budget-bar--mini">
              <div className={"dp2__budget-fill dp2__budget-fill--" + budgetStatus} style={{ width: budgetPersenLabel + "%" }} />
            </div>
            <p className="dp2__metric-sub">{formatRupiah(summary.pengeluaran)} dari {formatRupiah(summary.pemasukan)}</p>
          </div>
        </div>

        {/* ── INCOME TRACKER + TARGET TABUNGAN AKTIF sebelahan ── */}
        <div className="dp2__row2 dp2__row2--stretch">
          {/* Income Tracker */}
          <div className="dp2__income">
            <div className="dp2__section-header">
              <span className="dp2__section-title"><TrendingUp size={14} /> Income Tracker</span>
              {incomeDelta !== null && (
                <span className={"dp2__delta " + (incomeDelta >= 0 ? "dp2__delta--up" : "dp2__delta--down")}>
                  {incomeDelta >= 0 ? "▲" : "▼"} {Math.abs(incomeDelta).toFixed(0)}% vs lalu
                </span>
              )}
            </div>
            <div className="dp2__income-summary">
              <div className="dp2__income-summary-item">
                <span className="dp2__income-summary-label">Bulan Ini</span>
                <span className="dp2__income-summary-value dp2__income-summary-value--current">{formatRupiah(totalPemasukanIni)}</span>
              </div>
              <div className="dp2__income-summary-div" />
              <div className="dp2__income-summary-item">
                <span className="dp2__income-summary-label">Bulan Lalu</span>
                <span className="dp2__income-summary-value">{totalPemasukanLalu > 0 ? formatRupiah(totalPemasukanLalu) : "—"}</span>
              </div>
            </div>
            {incomeSorted.length === 0 ? (
              <p className="dp2__empty">Belum ada pemasukan bulan ini</p>
            ) : (
              <div className="dp2__income-list stagger-list">
                {incomeSorted.map(([cat, amount]) => {
                  const persen  = totalPemasukanIni > 0 ? (amount / totalPemasukanIni) * 100 : 0;
                  const lastAmt = incomeLastMonth[cat] || 0;
                  const delta   = lastAmt > 0 ? ((amount - lastAmt) / lastAmt) * 100 : null;
                  return (
                    <div key={cat} className="dp2__income-row">
                      <div className="dp2__income-row-top">
                        <span className="dp2__income-cat">{getCategoryIcon(cat)} {cat}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.4rem" }}>
                          {delta !== null && (
                            <span className={"dp2__delta " + (delta >= 0 ? "dp2__delta--up" : "dp2__delta--down")}>
                              {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%
                            </span>
                          )}
                          <span className="dp2__income-amount">{formatRupiah(amount)}</span>
                        </div>
                      </div>
                      <div className="dp2__income-bar"><div className="dp2__income-bar-fill" style={{ width: persen+"%" }} /></div>
                      <div className="dp2__income-meta">
                        <span>{persen.toFixed(0)}% dari total</span>
                        {lastAmt > 0 && <span>Lalu: {formatRupiah(lastAmt)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Target Tabungan Aktif */}
          <div className="dp2__card-section">
            <div className="dp2__section-header">
              <span className="dp2__section-title"><Target size={14} /> Target Tabungan</span>
            </div>
            {activeTargets.length === 0 ? (
              <p className="dp2__empty">Belum ada target aktif</p>
            ) : (
              activeTargets.map(t => {
                const persen = Math.min((t.terkumpul / t.target) * 100, 100);
                return (
                  <div key={t.id} className="dp2__target-item">
                    <div className="dp2__target-top">
                      <div>
                        <p className="dp2__target-nama">{t.nama}</p>
                        {t.penempatan && <p className="dp2__target-penempatan"><Landmark size={11} style={{verticalAlign:"-1px"}} /> {t.penempatan}</p>}
                      </div>
                      <span className="dp2__target-pct">{persen.toFixed(0)}%</span>
                    </div>
                    <div className="dp2__target-bar"><div className="dp2__target-fill" style={{ width: persen+"%" }} /></div>
                    <div className="dp2__target-info">
                      <span>{formatRupiah(t.terkumpul)}</span>
                      <span>dari {formatRupiah(t.target)}</span>
                    </div>
                  </div>
                );
              })
            )}
            <button className="dp2__see-all" onClick={() => navigate("/dashboard/personal/target")}>
              Lihat semua target →
            </button>
          </div>
        </div>

        {/* ── ACARA MENDATANG (sendiri, full width) ── */}
        <div className="dp2__card-section">
          <div className="dp2__section-header">
            <span className="dp2__section-title"><Calendar size={14} /> Acara Mendatang (7 Hari)</span>
            <button className="dp2__see-all-sm" onClick={() => navigate("/dashboard/personal/catatan")}>Lihat semua →</button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="dp2__empty">Tidak ada acara dalam 7 hari ke depan</p>
          ) : (
            <div className="dp2__acara-grid stagger-list">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="dp2__event-item">
                  <div className="dp2__event-date">
                    <span className="dp2__event-day">{new Date(ev.tanggal).getDate()}</span>
                    <span className="dp2__event-month">{new Date(ev.tanggal).toLocaleDateString("id-ID",{month:"short"})}</span>
                  </div>
                  <div className="dp2__event-info">
                    <p className="dp2__event-title">{ev.judul}</p>
                    <span className={"dp2__event-countdown " + (ev.diff===0?"dp2__event-countdown--today":"")}>{countdownLabel(ev.diff)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── TREN 6 BULAN ── */}
        <div className="dp2__tren">
          <div className="dp2__section-header">
            <span className="dp2__section-title">Tren Keuangan (6 Bulan)</span>
            <div style={{ display:"flex", gap:"0.75rem", fontSize:"11px", color:"var(--text-muted)" }}>
              <span><span style={{color:"#10b981"}}>■</span> Pemasukan</span>
              <span><span style={{color:"#ef4444"}}>■</span> Pengeluaran</span>
            </div>
          </div>

          {tren6Bulan.every(d => d.pemasukan === 0 && d.pengeluaran === 0) ? (
            <div className="dp2__tren-empty">
              <span className="dp2__tren-empty-icon"><BarChart3 size={28} /></span>
              <p>Belum ada data transaksi untuk ditampilkan.</p>
              <p>Mulai catat transaksi agar tren keuanganmu terlihat di sini.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tren6Bulan} barSize={14} barGap={3} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}jt` : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v}
                    tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    formatter={(val, name) => [formatRupiah(val), name === "pemasukan" ? "Pemasukan" : "Pengeluaran"]}
                    contentStyle={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"8px", fontSize:"12px" }}
                    labelStyle={{ color:"var(--text-muted)", marginBottom:"4px" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="pemasukan"   fill="#10b981" radius={[3,3,0,0]} name="pemasukan" />
                  <Bar dataKey="pengeluaran" fill="#ef4444" radius={[3,3,0,0]} name="pengeluaran" />
                </BarChart>
              </ResponsiveContainer>
              {insightText && (
                <div className="dp2__insight">
                  <span className="dp2__insight-icon"><Sparkles size={14} /></span>
                  <span>{insightText}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── PENGELUARAN PER KATEGORI ── */}
        <div className="dp2__card-section">
          <div className="dp2__section-header">
            <span className="dp2__section-title"><PieChartIcon size={14} /> Pengeluaran per Kategori</span>
            <button className="dp2__see-all-sm" onClick={() => navigate("/dashboard/personal/transaksi")}>Lihat semua →</button>
          </div>
          {topCategories.length === 0 ? (
            <p className="dp2__empty">Belum ada data pengeluaran</p>
          ) : (
            <div className="dp2__pie-wrap">
              <div className="dp2__pie-chart">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="dp2__pie-center">
                  <span className="dp2__pie-total-label">Total</span>
                  <span className="dp2__pie-total">{formatRupiah(summary.pengeluaran)}</span>
                </div>
              </div>
              <div className="dp2__cat-list stagger-list" style={{ flex: 1, minWidth: 0 }}>
                {topCategories.map(([cat, amount], i) => {
                  const pct = summary.pengeluaran > 0 ? (amount / summary.pengeluaran) * 100 : 0;
                  return (
                    <div key={cat} className="dp2__cat-item">
                      <div className="dp2__cat-item-top">
                        <span className="dp2__cat-name">
                          <span className="dp2__cat-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {getCategoryIcon(cat)} {cat}
                        </span>
                        <div className="dp2__cat-right">
                          <span className="dp2__cat-pct">{pct.toFixed(0)}%</span>
                          <span className="dp2__cat-amt">{formatRupiah(amount)}</span>
                        </div>
                      </div>
                      <div className="dp2__cat-bar">
                        <div className="dp2__cat-bar-fill" style={{ width: pct + "%", background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── TRANSAKSI TERBARU ── */}
        <div className="dp2__card-section">
          <div className="dp2__section-header">
            <span className="dp2__section-title">Transaksi Terbaru</span>
            <button className="dp2__see-all-sm" onClick={() => navigate("/dashboard/personal/transaksi")}>Lihat semua →</button>
          </div>
          {recentTx.length === 0 ? (
            <div className="dp2__empty-state">
              <CreditCard size={26} style={{opacity:0.5}} /><p>Belum ada transaksi.</p>
              <p style={{fontSize:"12px"}}>Mulai catat dari menu <strong>Transaksi</strong>.</p>
            </div>
          ) : (
            <div className="dp2__tx-list stagger-list">
              {recentTx.map(tx => (
                <div key={tx.id} className="dp2__tx-item">
                  <div className={"dp2__tx-icon " + (tx.type==="pemasukan" ? "dp2__tx-icon--income" : "dp2__tx-icon--expense")}>
                    {getCategoryIcon(tx.category, 16)}
                  </div>
                  <div className="dp2__tx-info">
                    <p className="dp2__tx-desc">{tx.description || tx.category || "-"}</p>
                    <p className="dp2__tx-date">
                      {new Date(tx.date||tx.createdAt).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" })}
                    </p>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <span className={"dp2__tx-amount " + (tx.type==="pemasukan" ? "dp2__tx-amount--income" : "dp2__tx-amount--expense")}>
                      {tx.type==="pemasukan" ? "+" : "-"}{formatRupiah(tx.amount)}
                    </span>
                    <p className="dp2__tx-cat">{tx.category || "-"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
