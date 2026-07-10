import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { BarChart, Bar, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  calcSummary, formatRupiah, groupByMonth, groupByCategoryType, monthLabel,
  computeKasStats, getKasEmoji,
} from "../utils/storage";
import "./LaporanPersonalPage.css";
import "./DashboardSkeleton.css";

const CATEGORY_EMOJI = {
  "makan": "🍔", "makanan": "🍔", "transportasi": "🚗", "transport": "🚗",
  "belanja": "🛍️", "hiburan": "🎮", "kesehatan": "💊", "pendidikan": "📚",
  "tagihan": "🧾", "listrik": "💡", "air": "🚰", "internet": "🌐",
  "pulsa": "📱", "gaji": "💰", "freelance": "💼", "investasi": "📈",
  "tabungan": "🏦", "hadiah": "🎁", "lainnya": "🗂️",
};
const getCategoryEmoji = (cat) => CATEGORY_EMOJI[(cat || "").toLowerCase().trim()] || "🗂️";

const getToken = () => localStorage.getItem("finsight_token");
const apiFetch = async (url) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` } });
  return res.json();
};

// Laporan Personal — versi ringan dari Laporan UMKM, fokus ke ARUS KAS bulanan
// (bukan laba-rugi usaha): pemasukan vs pengeluaran vs cicilan utang vs nabung ke
// target, plus posisi saldo tiap dompet saat ini.
export default function LaporanPersonalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts]               = useState([]);
  const [targets, setTargets]           = useState([]);
  const [filterMonth, setFilterMonth]   = useState("semua");
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiFetch("/api/transactions?mode=personal"),
      apiFetch("/api/debts"),
      apiFetch("/api/targets"),
    ]).then(([txRes, debtRes, targetRes]) => {
      if (txRes.success)     setTransactions(txRes.data);
      if (debtRes.success)   setDebts(debtRes.data);
      if (targetRes.success) setTargets(targetRes.data);
    }).finally(() => setLoading(false));
  }, [user]);

  const months = [...new Set(transactions.map(t => (t.date || t.createdAt || "").slice(0, 7)).filter(Boolean))].sort().reverse();

  const filtered = filterMonth === "semua"
    ? transactions
    : transactions.filter(t => (t.date || t.createdAt || "").slice(0, 7) === filterMonth);

  const summary        = calcSummary(filtered);
  const incomeByCat    = groupByCategoryType(filtered, "pemasukan");
  const expenseByCat   = groupByCategoryType(filtered, "pengeluaran");
  const tren6Bulan     = groupByMonth(transactions).map(([key, v]) => ({ label: monthLabel(key), ...v }));

  // Cicilan utang yang kebayar dalam periode ini — dikenali dari kategori
  // "Cicilan ..." yang dibikin otomatis pas klik tombol Bayar Cicilan.
  const cicilanTx      = filtered.filter(t => (t.category || "").startsWith("Cicilan "));
  const totalCicilan   = cicilanTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const cicilanAktifPerBulan = debts.filter(d => !d.lunas).reduce((s, d) => s + Number(d.cicilanPerBulan || 0), 0);

  // Nabung ke target dalam periode ini — kategori "Tabungan" (dibikin otomatis
  // dari TargetPage tiap kali nambah saldo target).
  const tabunganTx     = filtered.filter(t => t.category === "Tabungan");
  const totalNabung    = tabunganTx.reduce((s, t) => s + Number(t.amount || 0), 0);

  // Saldo per dompet — snapshot SEKARANG, sengaja tidak ikut filter bulan
  // (sama seperti Laporan UMKM: posisi kas itu kumulatif, bukan pergerakan per bulan).
  const kasStats       = computeKasStats(transactions);
  const totalSaldo     = kasStats.reduce((s, k) => s + k.saldo, 0);

  return (
    <DashboardLayout>
      <div className="lapper">
        <PageHeader title="📈 Laporan Personal" subtitle="Ringkasan arus kas, cicilan, tabungan, dan saldo dompetmu" />

        {/* Filter bulan */}
        <div className="lapper__toolbar">
          <select className="lapper__month-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="semua">Semua Periode</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="dashboard__skeleton">
            <div className="lapper__skel-grid">
              {[1,2,3,4].map(i => <div key={i} className="lapper__skel-card skel" />)}
            </div>
          </div>
        ) : (
          <>
            {/* ── RINGKASAN ARUS KAS ── */}
            <div className="lapper__summary-grid">
              <div className="lapper__summary-card lapper__summary-card--income">
                <span className="lapper__summary-label">💰 Pemasukan</span>
                <span className="lapper__summary-value">{formatRupiah(summary.pemasukan)}</span>
              </div>
              <div className="lapper__summary-card lapper__summary-card--expense">
                <span className="lapper__summary-label">🛒 Pengeluaran</span>
                <span className="lapper__summary-value">{formatRupiah(summary.pengeluaran)}</span>
              </div>
              <div className={"lapper__summary-card " + (summary.saldo >= 0 ? "lapper__summary-card--positive" : "lapper__summary-card--negative")}>
                <span className="lapper__summary-label">{summary.saldo >= 0 ? "📈" : "📉"} Selisih</span>
                <span className="lapper__summary-value">{formatRupiah(summary.saldo)}</span>
              </div>
              <div className="lapper__summary-card lapper__summary-card--wallet">
                <span className="lapper__summary-label">👛 Total Saldo Dompet</span>
                <span className="lapper__summary-value">{formatRupiah(totalSaldo)}</span>
              </div>
            </div>

            {/* ── TREN 6 BULAN ── */}
            <div className="lapper__card">
              <div className="lapper__card-header">
                <span className="lapper__card-title">Tren Arus Kas (6 Bulan)</span>
                <div className="lapper__legend">
                  <span><span style={{color:"#10b981"}}>■</span> Pemasukan</span>
                  <span><span style={{color:"#ef4444"}}>■</span> Pengeluaran</span>
                </div>
              </div>
              {tren6Bulan.length === 0 ? (
                <p className="lapper__empty">Belum ada data transaksi.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tren6Bulan} barSize={16} barGap={3} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}jt` : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={36}
                    />
                    <Tooltip
                      formatter={(val, name) => [formatRupiah(val), name === "pemasukan" ? "Pemasukan" : "Pengeluaran"]}
                      contentStyle={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"8px", fontSize:"12px" }}
                    />
                    <Bar dataKey="pemasukan" fill="#10b981" radius={[3,3,0,0]} name="pemasukan" />
                    <Bar dataKey="pengeluaran" fill="#ef4444" radius={[3,3,0,0]} name="pengeluaran" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── CICILAN UTANG + NABUNG TARGET sebelahan ── */}
            <div className="lapper__row2">
              <div className="lapper__card">
                <div className="lapper__card-header">
                  <span className="lapper__card-title">💳 Cicilan Utang Periode Ini</span>
                  <button className="lapper__see-all" onClick={() => navigate("/dashboard/personal/target")}>Kelola →</button>
                </div>
                <div className="lapper__stat-row">
                  <div className="lapper__stat-item">
                    <span>Terbayar periode ini</span>
                    <strong>{formatRupiah(totalCicilan)}</strong>
                  </div>
                  <div className="lapper__stat-item">
                    <span>Wajib bayar/bulan (aktif)</span>
                    <strong>{formatRupiah(cicilanAktifPerBulan)}</strong>
                  </div>
                </div>
                {cicilanTx.length === 0 ? (
                  <p className="lapper__empty">Belum ada pembayaran cicilan periode ini.</p>
                ) : (
                  <div className="lapper__mini-list">
                    {cicilanTx.slice(0, 6).map(t => (
                      <div key={t.id} className="lapper__mini-item">
                        <span>{t.description || t.category}</span>
                        <strong>{formatRupiah(t.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lapper__card">
                <div className="lapper__card-header">
                  <span className="lapper__card-title">🎯 Nabung ke Target Periode Ini</span>
                  <button className="lapper__see-all" onClick={() => navigate("/dashboard/personal/target")}>Kelola →</button>
                </div>
                <div className="lapper__stat-row">
                  <div className="lapper__stat-item">
                    <span>Total dinabung periode ini</span>
                    <strong>{formatRupiah(totalNabung)}</strong>
                  </div>
                  <div className="lapper__stat-item">
                    <span>Target aktif</span>
                    <strong>{targets.filter(t => t.terkumpul < t.target).length}</strong>
                  </div>
                </div>
                {tabunganTx.length === 0 ? (
                  <p className="lapper__empty">Belum ada setoran tabungan periode ini.</p>
                ) : (
                  <div className="lapper__mini-list">
                    {tabunganTx.slice(0, 6).map(t => (
                      <div key={t.id} className="lapper__mini-item">
                        <span>{t.description || t.category}</span>
                        <strong>{formatRupiah(t.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── BREAKDOWN KATEGORI ── */}
            <div className="lapper__row2">
              <div className="lapper__card">
                <div className="lapper__card-header"><span className="lapper__card-title">💰 Pemasukan per Kategori</span></div>
                {incomeByCat.length === 0 ? <p className="lapper__empty">Belum ada data.</p> : (
                  <div className="lapper__cat-list">
                    {incomeByCat.map(([cat, amt]) => {
                      const pct = summary.pemasukan > 0 ? (amt / summary.pemasukan) * 100 : 0;
                      return (
                        <div key={cat} className="lapper__cat-item">
                          <div className="lapper__cat-top">
                            <span>{getCategoryEmoji(cat)} {cat}</span>
                            <span>{formatRupiah(amt)}</span>
                          </div>
                          <div className="lapper__cat-bar"><div className="lapper__cat-bar-fill lapper__cat-bar-fill--income" style={{ width: pct + "%" }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lapper__card">
                <div className="lapper__card-header"><span className="lapper__card-title">🛒 Pengeluaran per Kategori</span></div>
                {expenseByCat.length === 0 ? <p className="lapper__empty">Belum ada data.</p> : (
                  <div className="lapper__cat-list">
                    {expenseByCat.map(([cat, amt]) => {
                      const pct = summary.pengeluaran > 0 ? (amt / summary.pengeluaran) * 100 : 0;
                      return (
                        <div key={cat} className="lapper__cat-item">
                          <div className="lapper__cat-top">
                            <span>{getCategoryEmoji(cat)} {cat}</span>
                            <span>{formatRupiah(amt)}</span>
                          </div>
                          <div className="lapper__cat-bar"><div className="lapper__cat-bar-fill lapper__cat-bar-fill--expense" style={{ width: pct + "%" }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── SALDO PER DOMPET (snapshot sekarang) ── */}
            <div className="lapper__card">
              <div className="lapper__card-header">
                <span className="lapper__card-title">👛 Saldo per Dompet (Saat Ini)</span>
                <button className="lapper__see-all" onClick={() => navigate("/dashboard/personal/dompet")}>Kelola →</button>
              </div>
              {kasStats.length === 0 ? (
                <p className="lapper__empty">Belum ada transaksi dengan dompet tercatat.</p>
              ) : (
                <div className="lapper__wallet-grid">
                  {kasStats.map(k => (
                    <div key={k.nama} className={"lapper__wallet-item" + (k.saldo < 0 ? " lapper__wallet-item--neg" : "")}>
                      <span className="lapper__wallet-icon">{getKasEmoji(k.nama)}</span>
                      <div>
                        <p className="lapper__wallet-nama">{k.nama}</p>
                        <p className="lapper__wallet-saldo">{formatRupiah(k.saldo)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
