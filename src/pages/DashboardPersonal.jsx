import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { getTransactions, calcSummary, formatRupiah, groupByCategory } from "../utils/storage";
import "./Dashboard.css";
import "./DashboardPersonal.css";

// ─── Emoji map ────────────────────────────────────────────────────────────────
const CATEGORY_EMOJI = {
  makan:"🍔", makanan:"🍔", transportasi:"🚗", transport:"🚗",
  belanja:"🛍️", hiburan:"🎮", kesehatan:"💊", pendidikan:"📚",
  tagihan:"🧾", listrik:"💡", air:"🚰", internet:"🌐", pulsa:"📱",
  gaji:"💰", freelance:"💼", investasi:"📈", tabungan:"🏦",
  hadiah:"🎁", lainnya:"🗂️",
};
function getCategoryEmoji(cat) {
  if (!cat) return "🗂️";
  return CATEGORY_EMOJI[String(cat).toLowerCase().trim()] || "🗂️";
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const t = new Date(dateStr); t.setHours(0,0,0,0);
  return Math.round((t - today) / 86400000);
}
function countdownLabel(diff) {
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff > 1)   return `${diff} hari lagi`;
  return `${Math.abs(diff)} hari lalu`;
}

// ─── Mini SVG Bar Chart (7 hari) ──────────────────────────────────────────────
function MiniBarSVG({ data = [], color = "#10b981" }) {
  const max = Math.max(...data, 1);
  const W = 80, H = 28, gap = 2;
  const bw = (W - gap * (data.length - 1)) / data.length;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
      {data.map((v, i) => {
        const bh = Math.max(2, (v / max) * H);
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={H - bh}
            width={bw}
            height={bh}
            rx={2}
            fill={color}
            opacity={i === data.length - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

// ─── Donut colors ──────────────────────────────────────────────────────────────
const DONUT_COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

// ─── Tooltip custom Recharts ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dp-chart-tooltip">
      <p className="dp-chart-tooltip__label">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatRupiah(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ h = 80, mb = 0 }) {
  return <div className="dp-skel" style={{ height: h, marginBottom: mb }} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DashboardPersonal() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [targets,      setTargets]      = useState([]);
  const [events,       setEvents]       = useState([]);
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [showSaldo,    setShowSaldo]    = useState(true);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const token   = localStorage.getItem("finsight_token");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch("/api/transactions?mode=personal", { headers }).then(r => r.json()),
      fetch("/api/targets",                    { headers }).then(r => r.json()),
      fetch("/api/notes?table=cal_notes&mode=personal", { headers }).then(r => r.json()),
      fetch("/api/profile",                    { headers }).then(r => r.json()),
    ]).then(([txRes, targetRes, evRes, profRes]) => {
      if (txRes.success)     setTransactions(txRes.data);
      if (targetRes.success) setTargets(targetRes.data);
      if (evRes.success)     setEvents(
        evRes.data.map(ev => ({ id: ev.id, tanggal: ev.date, judul: ev.title || "Acara" }))
      );
      if (profRes.success || profRes.data) setProfile(profRes.data || profRes);
    }).finally(() => setLoading(false));
  }, [user]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const summary          = calcSummary(transactions);
  const recentTx         = [...transactions].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
  const topCategories    = groupByCategory(transactions).slice(0,6);
  const budgetPersen     = summary.pemasukan > 0 ? Math.min((summary.pengeluaran / summary.pemasukan)*100, 100) : 0;
  const budgetPersenLabel = budgetPersen.toFixed(0);
  const budgetStatus     = budgetPersen >= 100 ? "danger" : budgetPersen >= 80 ? "warning" : "safe";
  const activeTargets    = targets.filter(t => t.terkumpul < t.target).slice(0,3);

  const now = new Date();

  // Insight
  const txBulanIni = transactions.filter(tx => {
    const d = new Date(tx.date || tx.createdAt);
    return tx.type === "pengeluaran" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalBulanIni = txBulanIni.reduce((s,tx) => s + Number(tx.amount||0), 0);
  const catBulanIni   = {};
  txBulanIni.forEach(tx => { const c = tx.category||"Lainnya"; catBulanIni[c] = (catBulanIni[c]||0)+Number(tx.amount||0); });
  const topCatBulanIni = Object.entries(catBulanIni).sort((a,b)=>b[1]-a[1])[0];
  const insightText = topCatBulanIni && totalBulanIni > 0
    ? `${getCategoryEmoji(topCatBulanIni[0])} Bulan ini paling banyak keluar buat ${topCatBulanIni[0]} (${((topCatBulanIni[1]/totalBulanIni)*100).toFixed(0)}%)`
    : null;

  // Income tracker
  const prevMonth       = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const txPemasukanIni  = transactions.filter(tx => { const d=new Date(tx.date||tx.createdAt); return tx.type==="pemasukan"&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
  const txPemasukanLalu = transactions.filter(tx => { const d=new Date(tx.date||tx.createdAt); return tx.type==="pemasukan"&&d.getMonth()===prevMonth.getMonth()&&d.getFullYear()===prevMonth.getFullYear(); });
  const incomeByCategory = {}; txPemasukanIni.forEach(tx => { const c=tx.category||"Lainnya"; incomeByCategory[c]=(incomeByCategory[c]||0)+Number(tx.amount||0); });
  const incomeLastMonth  = {}; txPemasukanLalu.forEach(tx => { const c=tx.category||"Lainnya"; incomeLastMonth[c]=(incomeLastMonth[c]||0)+Number(tx.amount||0); });
  const incomeSorted        = Object.entries(incomeByCategory).sort((a,b)=>b[1]-a[1]);
  const totalPemasukanIni   = txPemasukanIni.reduce((s,tx)=>s+Number(tx.amount||0),0);
  const totalPemasukanLalu  = txPemasukanLalu.reduce((s,tx)=>s+Number(tx.amount||0),0);
  const incomeDelta         = totalPemasukanLalu > 0 ? ((totalPemasukanIni-totalPemasukanLalu)/totalPemasukanLalu)*100 : null;

  // Acara H-7
  const upcomingEvents = events
    .map(ev => ({ ...ev, diff: daysUntil(ev.tanggal) }))
    .filter(ev => ev.diff >= 0 && ev.diff <= 7)
    .sort((a,b) => a.diff-b.diff)
    .slice(0,4);

  // 7-hari mini chart data
  const last7 = Array.from({ length:7 }, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-6+i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate()+1);
    const inDay  = transactions.filter(tx => { const td=new Date(tx.date||tx.createdAt); return tx.type==="pemasukan"   && td>=d && td<next; }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    const outDay = transactions.filter(tx => { const td=new Date(tx.date||tx.createdAt); return tx.type==="pengeluaran" && td>=d && td<next; }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    return { in: inDay, out: outDay };
  });

  // 6-bulan chart
  const months6 = Array.from({ length:6 }, (_,i) => {
    const m = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const label = m.toLocaleDateString("id-ID",{month:"short"});
    const inAmt  = transactions.filter(tx=>{ const d=new Date(tx.date||tx.createdAt); return tx.type==="pemasukan"   && d.getMonth()===m.getMonth() && d.getFullYear()===m.getFullYear(); }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    const outAmt = transactions.filter(tx=>{ const d=new Date(tx.date||tx.createdAt); return tx.type==="pengeluaran" && d.getMonth()===m.getMonth() && d.getFullYear()===m.getFullYear(); }).reduce((s,tx)=>s+Number(tx.amount||0),0);
    return { label, pemasukan: inAmt, pengeluaran: outAmt };
  });
  const bulanTerbaik = [...months6].sort((a,b)=>(b.pemasukan-b.pengeluaran)-(a.pemasukan-a.pengeluaran))[0];
  const trendInsight = bulanTerbaik
    ? `📊 Surplus terbesar bulan ${bulanTerbaik.label}: ${formatRupiah(Math.max(0, bulanTerbaik.pemasukan - bulanTerbaik.pengeluaran))}`
    : null;

  // Donut data
  const donutData = topCategories.map(([cat, amt]) => ({ name: cat, value: amt }));

  // Avatar / nama
  const namaUser  = profile?.nama || profile?.name || user?.nama || user?.name || "Kamu";
  const avatarUrl = profile?.avatar_url || null;
  const initials  = namaUser.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  // 4 digit terakhir virtual card
  const virtualCard = (user?.id || "0000").toString().slice(-4).padStart(4,"0");

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="dp-page">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="dp-header">
          <div className="dp-header__left">
            <p className="dp-header__greeting">Halo, {namaUser}! 👋</p>
            <p className="dp-header__sub">Ini ringkasan keuangan kamu hari ini</p>
          </div>
          <div className="dp-header__avatar">
            {avatarUrl
              ? <img src={avatarUrl} alt={namaUser} className="dp-avatar-img" />
              : <div className="dp-avatar-fallback">{initials}</div>
            }
          </div>
        </div>

        {loading ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
            <Skeleton h={160} /><Skeleton h={90} /><Skeleton h={80} /><Skeleton h={200} />
          </div>
        ) : (<>

          {/* ── BUDGET ALERT ───────────────────────────────────────────── */}
          {budgetStatus !== "safe" && summary.pemasukan > 0 && (
            <div className={"dp-alert dp-alert--" + budgetStatus}>
              <span className="dp-alert__icon">{budgetStatus==="danger"?"🚨":"⚠️"}</span>
              <span className="dp-alert__text">
                {budgetStatus==="danger"
                  ? `Pengeluaran sudah melebihi pemasukan bulan ini (${budgetPersenLabel}%)`
                  : `Pengeluaran sudah mencapai ${budgetPersenLabel}% dari pemasukan bulan ini`}
              </span>
            </div>
          )}

          {/* ── HERO CARD SALDO ────────────────────────────────────────── */}
          <div className="dp-hero-card">
            <div className="dp-hero-card__top">
              <div>
                <p className="dp-hero-card__label">Saldo Bersih</p>
                <p className="dp-hero-card__saldo">
                  {showSaldo ? formatRupiah(summary.saldo) : "Rp ••••••••"}
                </p>
              </div>
              <button className="dp-hero-card__toggle" onClick={() => setShowSaldo(s => !s)}>
                {showSaldo ? "🙈" : "👁️"}
              </button>
            </div>
            <div className="dp-hero-card__bottom">
              <div className="dp-hero-chip">
                <span className="dp-hero-chip__icon">💳</span>
                <span className="dp-hero-chip__num">•••• •••• •••• {virtualCard}</span>
              </div>
              <span className="dp-hero-card__mode">Pribadi</span>
            </div>
          </div>

          {/* ── 3 METRIC CARDS ─────────────────────────────────────────── */}
          <div className="dp-metrics">
            <div className="dp-metric-card">
              <div className="dp-metric-card__top">
                <span className="dp-metric-card__icon">📈</span>
                <span className="dp-metric-card__label">Pemasukan</span>
              </div>
              <p className="dp-metric-card__value dp-metric-card__value--in">{formatRupiah(summary.pemasukan)}</p>
              <div className="dp-metric-card__chart">
                <MiniBarSVG data={last7.map(d=>d.in)} color="#10b981" />
              </div>
              <p className="dp-metric-card__sub">7 hari terakhir</p>
            </div>

            <div className="dp-metric-card">
              <div className="dp-metric-card__top">
                <span className="dp-metric-card__icon">🛒</span>
                <span className="dp-metric-card__label">Pengeluaran</span>
              </div>
              <p className="dp-metric-card__value dp-metric-card__value--out">{formatRupiah(summary.pengeluaran)}</p>
              <div className="dp-metric-card__chart">
                <MiniBarSVG data={last7.map(d=>d.out)} color="#ef4444" />
              </div>
              <p className="dp-metric-card__sub">7 hari terakhir</p>
            </div>

            <div className="dp-metric-card">
              <div className="dp-metric-card__top">
                <span className="dp-metric-card__icon">🎯</span>
                <span className="dp-metric-card__label">Target Aktif</span>
              </div>
              <p className="dp-metric-card__value">{activeTargets.length} target</p>
              <div className="dp-metric-card__chart">
                <MiniBarSVG
                  data={activeTargets.slice(0,7).map(t => (t.terkumpul/t.target)*100)}
                  color="#8b5cf6"
                />
              </div>
              <p className="dp-metric-card__sub">progress rata-rata {activeTargets.length>0?(activeTargets.reduce((s,t)=>s+(t.terkumpul/t.target)*100,0)/activeTargets.length).toFixed(0):0}%</p>
            </div>
          </div>

          {/* ── BUDGET BAR ─────────────────────────────────────────────── */}
          <div className="dp-budget">
            <div className="dp-budget__header">
              <span className="dp-budget__title">Penggunaan Budget Bulan Ini</span>
              <span className={"dp-budget__badge dp-budget__badge--" + budgetStatus}>
                {budgetPersenLabel}%
              </span>
            </div>
            <div className="dp-budget__track">
              <div
                className={"dp-budget__fill dp-budget__fill--" + budgetStatus}
                style={{ width: budgetPersenLabel + "%" }}
              />
            </div>
            <p className="dp-budget__meta">
              {formatRupiah(summary.pengeluaran)} dari {formatRupiah(summary.pemasukan)}
            </p>
          </div>

          {/* ── INSIGHT ────────────────────────────────────────────────── */}
          {insightText && <div className="dp-insight">{insightText}</div>}

          {/* ── INCOME TRACKER ─────────────────────────────────────────── */}
          <div className="dp-income">
            <div className="dashboard__section-header">
              <div className="dashboard__section-title">💰 Income Tracker Bulan Ini</div>
              {incomeDelta !== null && (
                <span className={"dp-income__delta " + (incomeDelta>=0?"dp-income__delta--up":"dp-income__delta--down")}>
                  {incomeDelta>=0?"▲":"▼"} {Math.abs(incomeDelta).toFixed(0)}% vs bulan lalu
                </span>
              )}
            </div>
            <div className="dp-income__summary">
              <div className="dp-income__summary-item">
                <span className="dp-income__summary-label">Bulan Ini</span>
                <span className="dp-income__summary-value dp-income__summary-value--current">{formatRupiah(totalPemasukanIni)}</span>
              </div>
              <div className="dp-income__summary-divider" />
              <div className="dp-income__summary-item">
                <span className="dp-income__summary-label">Bulan Lalu</span>
                <span className="dp-income__summary-value">{totalPemasukanLalu>0?formatRupiah(totalPemasukanLalu):"—"}</span>
              </div>
            </div>
            {incomeSorted.length === 0
              ? <div className="dashboard__empty">Belum ada pemasukan bulan ini</div>
              : (
                <div className="dp-income__list">
                  {incomeSorted.map(([cat, amount]) => {
                    const persen  = totalPemasukanIni>0?(amount/totalPemasukanIni)*100:0;
                    const lastAmt = incomeLastMonth[cat]||0;
                    const catDelta = lastAmt>0?((amount-lastAmt)/lastAmt)*100:null;
                    return (
                      <div key={cat} className="dp-income__row">
                        <div className="dp-income__row-top">
                          <span className="dp-income__cat">
                            <span>{getCategoryEmoji(cat)}</span> {cat}
                          </span>
                          <div className="dp-income__row-right">
                            {catDelta!==null && (
                              <span className={"dp-income__cat-delta "+(catDelta>=0?"dp-income__cat-delta--up":"dp-income__cat-delta--down")}>
                                {catDelta>=0?"▲":"▼"}{Math.abs(catDelta).toFixed(0)}%
                              </span>
                            )}
                            <span className="dp-income__amount">{formatRupiah(amount)}</span>
                          </div>
                        </div>
                        <div className="dp-income__bar">
                          <div className="dp-income__bar-fill" style={{ width: persen+"%" }} />
                        </div>
                        <div className="dp-income__row-meta">
                          <span>{persen.toFixed(0)}% dari total pemasukan</span>
                          {lastAmt>0 && <span>Lalu: {formatRupiah(lastAmt)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          {/* ── ACARA & TARGET (2 kolom) ───────────────────────────────── */}
          <div className="dp-two-col">

            {/* Acara mendatang */}
            <div className="dp-events">
              <div className="dashboard__section-header">
                <div className="dashboard__section-title">📅 Acara (7 Hari)</div>
                <button className="dashboard__see-all" onClick={()=>navigate("/dashboard/personal/catatan")}>
                  Lihat →
                </button>
              </div>
              {upcomingEvents.length === 0
                ? <div className="dp-two-col__empty">Tidak ada acara mendatang</div>
                : upcomingEvents.map(ev => (
                  <div key={ev.id} className="dp-event-card">
                    <div className="dp-event-card__date">
                      {new Date(ev.tanggal).toLocaleDateString("id-ID",{day:"2-digit",month:"short"})}
                    </div>
                    <div className="dp-event-card__info">
                      <p className="dp-event-card__judul">{ev.judul}</p>
                      <span className={"dp-event-card__countdown "+(ev.diff===0?"dp-event-card__countdown--today":"")}>
                        {countdownLabel(ev.diff)}
                      </span>
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Target tabungan */}
            <div className="dashboard__targets">
              <div className="dashboard__section-header">
                <div className="dashboard__section-title">🎯 Target Aktif</div>
                <button className="dashboard__see-all" onClick={()=>navigate("/dashboard/personal/target")}>
                  Lihat →
                </button>
              </div>
              {activeTargets.length === 0
                ? <div className="dp-two-col__empty">Belum ada target aktif</div>
                : activeTargets.map(t => {
                  const persen = Math.min((t.terkumpul/t.target)*100,100);
                  return (
                    <div key={t.id} className="dashboard__target-card">
                      <div className="dashboard__target-top">
                        <div>
                          <p className="dashboard__target-nama">{t.nama}</p>
                          {t.penempatan && <p className="dashboard__target-penempatan">🏦 {t.penempatan}</p>}
                          {t.deadline   && <p className="dashboard__target-penempatan">📅 {new Date(t.deadline).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}</p>}
                        </div>
                        <span className="dashboard__target-persen">{persen.toFixed(0)}%</span>
                      </div>
                      <div className="dashboard__target-bar">
                        <div className="dashboard__target-fill" style={{width:persen+"%"}} />
                      </div>
                      <div className="dashboard__target-info">
                        <span>{formatRupiah(t.terkumpul)}</span>
                        <span>dari {formatRupiah(t.target)}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* ── TREN 6 BULAN ────────────────────────────────────────────── */}
          <div className="dp-trend">
            <div className="dashboard__section-title" style={{marginBottom:"1rem"}}>
              📊 Tren Keuangan 6 Bulan
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={months6} barGap={4} barCategoryGap="30%">
                <XAxis dataKey="label" tick={{ fontSize:11, fill:"var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pemasukan"   name="Pemasukan"   fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {trendInsight && <div className="dp-insight" style={{marginTop:"0.75rem"}}>{trendInsight}</div>}
          </div>

          {/* ── 2 KOLOM BAWAH: DONUT + TRANSAKSI ──────────────────────── */}
          <div className="dp-bottom-row">

            {/* Pengeluaran per Kategori + Donut */}
            <div className="dp-cat-section">
              <div className="dashboard__section-title" style={{marginBottom:"0.75rem"}}>
                🗂️ Pengeluaran per Kategori
              </div>
              {donutData.length === 0
                ? <div className="dashboard__empty">Belum ada data pengeluaran</div>
                : (<>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatRupiah(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="dp-cat-legend">
                    {donutData.map(({ name, value }, i) => (
                      <div key={name} className="dp-cat-legend__item">
                        <span className="dp-cat-legend__dot" style={{background:DONUT_COLORS[i%DONUT_COLORS.length]}} />
                        <span className="dp-cat-legend__name">
                          {getCategoryEmoji(name)} {name}
                        </span>
                        <span className="dp-cat-legend__val">{formatRupiah(value)}</span>
                      </div>
                    ))}
                  </div>
                </>)
              }
            </div>

            {/* Transaksi Terbaru */}
            <div className="dashboard__recent">
              <div className="dashboard__section-header">
                <div className="dashboard__section-title">🕐 Transaksi Terbaru</div>
                <button className="dashboard__see-all" onClick={()=>navigate("/dashboard/personal/transaksi")}>
                  Lihat semua →
                </button>
              </div>
              {recentTx.length === 0
                ? (
                  <div className="dashboard__empty-state">
                    <p>💳</p>
                    <p>Belum ada transaksi.</p>
                    <p>Mulai catat dari menu <strong>Transaksi</strong>.</p>
                  </div>
                )
                : (
                  <div className="dashboard__tx-list">
                    {recentTx.map(tx => (
                      <div key={tx.id} className="dashboard__tx-item">
                        <div className={"dashboard__tx-dot dashboard__tx-dot--" + (tx.type==="pemasukan"?"income":"expense")} />
                        <span className="dashboard__tx-emoji">{getCategoryEmoji(tx.category)}</span>
                        <div className="dashboard__tx-info">
                          <p className="dashboard__tx-desc">{tx.description||tx.category||"—"}</p>
                          <p className="dashboard__tx-date">{new Date(tx.createdAt).toLocaleDateString("id-ID")}</p>
                        </div>
                        <span className={"dashboard__tx-amount "+(tx.type==="pemasukan"?"dashboard__tx-amount--income":"dashboard__tx-amount--expense")}>
                          {tx.type==="pemasukan"?"+":"-"}{formatRupiah(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

        </>)}
      </div>
    </DashboardLayout>
  );
}
