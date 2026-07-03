import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { BarChart, Bar, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { calcSummary, formatRupiah, groupByCategory, isModalUsaha } from "../utils/storage";
import { labelJatuhTempo, selisihHari } from "../utils/umkmCalc";
import "./Dashboard.css";
import "./DashboardUMKM.css";

const CATEGORY_EMOJI = {
  "makan": "🍔", "makanan": "🍔", "transportasi": "🚗", "bahan baku": "📦",
  "operasional": "⚙️", "gaji": "💰", "listrik": "💡", "air": "🚰",
  "internet": "🌐", "sewa": "🏠", "pemasaran": "📣", "lainnya": "🗂️",
  "penjualan produk": "🛒", "penjualan": "🛒",
};
function getCategoryEmoji(cat) {
  if (!cat) return "🗂️";
  return CATEGORY_EMOJI[cat.toLowerCase().trim()] || "🗂️";
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function DashboardUMKM() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [transactions,  setTransactions]  = useState([]);
  const [utangPiutang,  setUtangPiutang]  = useState([]);
  const [asetUsaha,     setAsetUsaha]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [profile,       setProfile]       = useState(null);
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
      fetch(`/api/transactions?mode=umkm`, { headers: h }).then(r => r.json()),
      apiFetch(`/api/umkm?table=utang_piutang`),
      apiFetch(`/api/umkm?table=aset_usaha`),
      fetch(`/api/profile`, { headers: h }).then(r => r.json()).catch(() => ({ success: false })),
    ]).then(([txRes, upRes, asetRes, profRes]) => {
      if (txRes.success)  setTransactions(txRes.data);
      if (upRes.success)  setUtangPiutang(upRes.data);
      if (asetRes.success) setAsetUsaha(asetRes.data);
      if (profRes.success) setProfile(profRes.data);
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

  // ── Kalkulasi ────────────────────────────────────────────────────────────────
  const modalTx        = transactions.filter(isModalUsaha);
  const usahaTx         = transactions.filter(t => !isModalUsaha(t)); // exclude modal dari omzet/laba
  const modalUsaha      = modalTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const summary        = calcSummary(usahaTx);
  const topCategories = groupByCategory(usahaTx.filter(tx => tx.type === "pengeluaran")).slice(0, 5);
  const recentTx      = [...transactions].sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt)).slice(0, 5);

  const monthKeyOf    = (tx) => (tx.date || tx.createdAt || "").slice(0, 7);
  const now           = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const prevMonthKey    = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();

  const currentMonthTx = usahaTx.filter(t => monthKeyOf(t) === currentMonthKey);
  const prevMonthTx    = usahaTx.filter(t => monthKeyOf(t) === prevMonthKey);
  const labaBulanIni   = calcSummary(currentMonthTx).saldo;
  const labaBulanLalu  = calcSummary(prevMonthTx).saldo;

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
    : !labaTrend ? "Belum ada data bulan lalu"
    : labaTrend.arah === "tetap" ? "Sama seperti bulan lalu"
    : `${labaTrend.arah === "naik" ? "▲" : "▼"} ${labaTrend.persen}% dari bulan lalu`;

  const reminderJatuhTempo = utangPiutang
    .filter(it => !it.lunas)
    .map(it => ({ ...it, selisih: selisihHari(it.jatuhTempo) }))
    .filter(it => it.selisih !== null && it.selisih <= 3)
    .sort((a, b) => a.selisih - b.selisih)
    .slice(0, 5);

  // ── Total Nilai Aset Usaha ───────────────────────────────────────────────────
  const totalNilaiAset = asetUsaha.reduce((s, it) => s + Number(it.hargaBeli || 0), 0);

  // ── Tren 6 bulan ─────────────────────────────────────────────────────────────
  const tren6Bulan = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
    const pemasukan   = usahaTx.filter(tx => monthKeyOf(tx) === key && tx.type === "pemasukan").reduce((s,tx) => s+Number(tx.amount||0), 0);
    const pengeluaran = usahaTx.filter(tx => monthKeyOf(tx) === key && tx.type === "pengeluaran").reduce((s,tx) => s+Number(tx.amount||0), 0);
    tren6Bulan.push({ label, pemasukan, pengeluaran, laba: pemasukan - pengeluaran });
  }

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const namaUser  = profile?.display_name || user?.name || "Pemilik";
  const avatarUrl = profile?.avatar_url || null;
  const inisial   = namaUser.charAt(0).toUpperCase();

  // ── Pie colors ───────────────────────────────────────────────────────────────
  const PIE_COLORS = ["#f59e0b","#ef4444","#3b82f6","#8b5cf6","#06b6d4"];

  if (loading) return (
    <DashboardLayout>
      <div className="du__skeleton">
        {[1,2,3,4,5].map(i => <div key={i} className="du__skel-block skel" />)}
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="du">

        {/* ── HEADER ── */}
        <div className="du__header">
          <div>
            <h1 className="du__greeting">Halo, {namaUser}! 👋</h1>
            <p className="du__greeting-sub">Ringkasan keuangan usahamu hari ini</p>
          </div>
          <div className="du__avatar-wrap du__avatar-wrap--mobile-only" ref={menuRef}>
            <div className="du__avatar" onClick={() => setMenuOpen(v => !v)}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="du__avatar-img" />
                : <span className="du__avatar-initials">{inisial}</span>
              }
            </div>
            {menuOpen && (
              <div className="du__avatar-dropdown">
                <div className="du__avatar-dropdown-user">
                  <div className="du__avatar-dropdown-av">
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" className="du__avatar-img" />
                      : <span className="du__avatar-initials">{inisial}</span>
                    }
                  </div>
                  <div>
                    <p className="du__avatar-dropdown-name">{namaUser}</p>
                    <p className="du__avatar-dropdown-email">{user?.email}</p>
                  </div>
                </div>
                <div className="du__avatar-dropdown-divider" />
                <button className="du__avatar-dropdown-item" onClick={() => { setMenuOpen(false); navigate(`/dashboard/umkm/profile`); }}>
                  <span>✏️</span><span>Edit Profil</span>
                </button>
                <button className="du__avatar-dropdown-item du__avatar-dropdown-item--danger" onClick={() => { setMenuOpen(false); }}>
                  <span>🚪</span><span>Keluar</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 3 METRIC CARDS ── */}
        <div className="du__metrics">
          <div className="du__metric du__metric--omzet">
            <div className="du__metric-icon du__metric-icon--omzet">📈</div>
            <p className="du__metric-label">Total Omzet</p>
            <p className="du__metric-value">{formatRupiah(summary.pemasukan)}</p>
            <p className="du__metric-sub">Total pemasukan tercatat</p>
          </div>
          <div className="du__metric du__metric--expense">
            <div className="du__metric-icon du__metric-icon--expense">📉</div>
            <p className="du__metric-label">Total Pengeluaran</p>
            <p className="du__metric-value">{formatRupiah(summary.pengeluaran)}</p>
            <p className="du__metric-sub">Modal + operasional</p>
          </div>
          <div className={"du__metric " + (labaBulanIni >= 0 ? "du__metric--laba" : "du__metric--rugi")}>
            <div className={"du__metric-icon " + (labaBulanIni >= 0 ? "du__metric-icon--laba" : "du__metric-icon--rugi")}>💰</div>
            <p className="du__metric-label">Laba Bersih Bulan Ini</p>
            <p className="du__metric-value">{formatRupiah(labaBulanIni)}</p>
            <p className="du__metric-sub">{labaSub}</p>
          </div>
          <div className="du__metric du__metric--modal">
            <div className="du__metric-icon du__metric-icon--modal">🏦</div>
            <p className="du__metric-label">Modal Usaha</p>
            <p className="du__metric-value">{formatRupiah(modalUsaha)}</p>
            <p className="du__metric-sub">{modalTx.length} setoran modal tercatat</p>
          </div>
          <div className="du__metric du__metric--aset">
            <div className="du__metric-icon du__metric-icon--aset">💎</div>
            <p className="du__metric-label">Total Aset Usaha</p>
            <p className="du__metric-value">{formatRupiah(totalNilaiAset)}</p>
            <p className="du__metric-sub">{asetUsaha.length} item peralatan tercatat</p>
          </div>
        </div>

        {/* ── JATUH TEMPO ── */}
        {reminderJatuhTempo.length > 0 && (
          <div className="du__jatuhtempo">
            <div className="du__section-header">
              <span className="du__section-title">⏰ Jatuh Tempo Mendekati</span>
              <button className="du__see-all" onClick={() => navigate("/dashboard/umkm/transaksi")}>Lihat semua →</button>
            </div>
            <div className="du__jatuhtempo-list">
              {reminderJatuhTempo.map(it => {
                const badge = labelJatuhTempo(it.jatuhTempo);
                return (
                  <div key={it.id} className="du__jatuhtempo-item">
                    <span className={"du__jatuhtempo-jenis du__jatuhtempo-jenis--" + it.jenis}>
                      {it.jenis === "piutang" ? "📥" : "📤"}
                    </span>
                    <div className="du__jatuhtempo-info">
                      <p className="du__jatuhtempo-nama">{it.nama}</p>
                      <p className="du__jatuhtempo-sub">{it.jenis === "piutang" ? "Piutang" : "Utang"} · {formatRupiah(it.nominal)}</p>
                    </div>
                    <span className={"du__jatuhtempo-badge du__jatuhtempo-badge--" + badge.status}>{badge.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TREN 6 BULAN + PENGELUARAN TERBESAR ── */}
        <div className="du__row2">
          <div className="du__tren">
            <div className="du__section-header">
              <span className="du__section-title">Tren Keuangan (6 Bulan)</span>
              <div style={{ display:"flex", gap:"0.6rem", fontSize:"10px", color:"var(--text-muted)" }}>
                <span><span style={{color:"#f59e0b"}}>■</span> Omzet</span>
                <span><span style={{color:"#ef4444"}}>■</span> Keluar</span>
                <span><span style={{color:"#10b981"}}>■</span> Laba</span>
              </div>
            </div>
            {tren6Bulan.every(d => d.pemasukan === 0 && d.pengeluaran === 0) ? (
              <div className="du__tren-empty">
                <span>📊</span>
                <p>Belum ada data transaksi.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tren6Bulan} barSize={10} barGap={2} margin={{ top:4, right:4, left:0, bottom:0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fontSize:10, fill:"var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => v>=1000000?`${(v/1000000).toFixed(1)}jt`:v>=1000?`${(v/1000).toFixed(0)}rb`:v} tick={{ fontSize:9, fill:"var(--text-muted)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    formatter={(val, name) => [formatRupiah(val), name==="pemasukan"?"Omzet":name==="pengeluaran"?"Pengeluaran":"Laba"]}
                    contentStyle={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"8px", fontSize:"11px" }}
                    labelStyle={{ color:"var(--text-muted)" }}
                    cursor={{ fill:"rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="pemasukan"   fill="#f59e0b" radius={[3,3,0,0]} name="pemasukan" />
                  <Bar dataKey="pengeluaran" fill="#ef4444" radius={[3,3,0,0]} name="pengeluaran" />
                  <Bar dataKey="laba"        fill="#10b981" radius={[3,3,0,0]} name="laba" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="du__categories">
            <div className="du__section-header">
              <span className="du__section-title">Pengeluaran Terbesar</span>
            </div>
            {topCategories.length === 0 ? (
              <p className="du__empty">Belum ada data pengeluaran</p>
            ) : (
              <div className="du__cat-list">
                {topCategories.map(([cat, amount], i) => {
                  const pct = summary.pengeluaran > 0 ? (amount/summary.pengeluaran*100) : 0;
                  return (
                    <div key={cat} className="du__cat-item">
                      <div className="du__cat-top">
                        <span className="du__cat-name">
                          <span className="du__cat-dot" style={{ background: PIE_COLORS[i%PIE_COLORS.length] }} />
                          {getCategoryEmoji(cat)} {cat}
                        </span>
                        <div style={{ display:"flex", gap:"0.4rem", alignItems:"center" }}>
                          <span className="du__cat-pct">{pct.toFixed(0)}%</span>
                          <span className="du__cat-amt">{formatRupiah(amount)}</span>
                        </div>
                      </div>
                      <div className="du__cat-bar">
                        <div className="du__cat-bar-fill" style={{ width: pct+"%", background: PIE_COLORS[i%PIE_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── TRANSAKSI TERBARU ── */}
        <div className="du__recent">
          <div className="du__section-header">
            <span className="du__section-title">Transaksi Terbaru</span>
            <button className="du__see-all" onClick={() => navigate("/dashboard/umkm/transaksi")}>Lihat semua →</button>
          </div>
          {recentTx.length === 0 ? (
            <div className="du__empty-state">
              <p>🧾</p><p>Belum ada transaksi.</p>
              <p style={{fontSize:"12px"}}>Mulai catat dari menu <strong>Transaksi</strong>.</p>
            </div>
          ) : (
            <div className="du__tx-list">
              {recentTx.map(tx => (
                <div key={tx.id} className="du__tx-item">
                  <div className={"du__tx-icon " + (tx.type==="pemasukan"?"du__tx-icon--income":"du__tx-icon--expense")}>
                    {getCategoryEmoji(tx.category)}
                  </div>
                  <div className="du__tx-info">
                    <p className="du__tx-desc">{tx.description || tx.category || "-"}</p>
                    <p className="du__tx-date">{new Date(tx.date||tx.createdAt).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</p>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <span className={"du__tx-amount " + (tx.type==="pemasukan"?"du__tx-amount--income":"du__tx-amount--expense")}>
                      {tx.type==="pemasukan"?"+":"-"}{formatRupiah(tx.amount)}
                    </span>
                    <p className="du__tx-cat">{tx.category||"-"}</p>
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
