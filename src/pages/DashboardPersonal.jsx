import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import MetricCard from "../components/MetricCard";
import MiniChart from "../components/MiniChart";
import { getTransactions, calcSummary, formatRupiah, groupByCategory } from "../utils/storage";
import "./Dashboard.css";
import "./DashboardPersonal.css";

const TARGET_KEY  = (userId) => `finsight_targets_${userId}`;
const CALNOTE_KEY = (userId) => `finsight_calNotes_personal_${userId}`;

// Mapping emoji per kategori. Key dicocokkan case-insensitive,
// fallback ke "Lainnya" kalau kategori tidak dikenal.
const CATEGORY_EMOJI = {
  "makan": "🍔",
  "makanan": "🍔",
  "transportasi": "🚗",
  "transport": "🚗",
  "belanja": "🛍️",
  "hiburan": "🎮",
  "kesehatan": "💊",
  "pendidikan": "📚",
  "tagihan": "🧾",
  "listrik": "💡",
  "air": "🚰",
  "internet": "🌐",
  "pulsa": "📱",
  "gaji": "💰",
  "freelance": "💼",
  "investasi": "📈",
  "tabungan": "🏦",
  "hadiah": "🎁",
  "lainnya": "🗂️",
};

function getCategoryEmoji(category) {
  if (!category) return "🗂️";
  const key = String(category).toLowerCase().trim();
  return CATEGORY_EMOJI[key] || "🗂️";
}

// Hitung selisih hari (acara - hari ini), dibulatkan ke hari kalender.
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function countdownLabel(diff) {
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff > 1) return `${diff} hari lagi`;
  return `${Math.abs(diff)} hari lalu`;
}

export default function DashboardPersonal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [targets, setTargets]           = useState([]);
  const [events, setEvents]             = useState([]);

  useEffect(() => {
  if (!user) return;
  const token = localStorage.getItem("finsight_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // Transactions
  fetch(`/api/transactions?mode=personal`, { headers })
    .then(r => r.json())
    .then(r => { if (r.success) setTransactions(r.data); });

  // Targets
  fetch(`/api/targets`, { headers })
    .then(r => r.json())
    .then(r => { if (r.success) setTargets(r.data); });

  // Calendar events
  fetch(`/api/notes?table=cal_notes&mode=personal`, { headers })
    .then(r => r.json())
    .then(r => {
      if (r.success) setEvents(r.data.map(ev => ({
        id: ev.id,
        tanggal: ev.date,
        judul: ev.title || "Acara",
      })));
    });
}, [user]);

  const summary        = calcSummary(transactions);
  const recentTx       = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const topCategories  = groupByCategory(transactions).slice(0, 4);
  const budgetPersen   = summary.pemasukan > 0
    ? Math.min((summary.pengeluaran / summary.pemasukan) * 100, 100)
    : 0;
  const budgetPersenLabel = budgetPersen.toFixed(0);

  // Status alert budget: aman | warning (>=80%) | danger (>=100%)
  const budgetStatus = budgetPersen >= 100 ? "danger" : budgetPersen >= 80 ? "warning" : "safe";

  // Hanya tampilkan target yang belum selesai, maks 3
  const activeTargets = targets.filter((t) => t.terkumpul < t.target).slice(0, 3);

  // Insight otomatis: kategori pengeluaran terbesar BULAN INI
  const now = new Date();
  const txBulanIni = transactions.filter((tx) => {
    const d = new Date(tx.createdAt);
    return tx.type === "pengeluaran" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalPengeluaranBulanIni = txBulanIni.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const catBulanIni = {};
  txBulanIni.forEach((tx) => {
    const cat = tx.category || "Lainnya";
    catBulanIni[cat] = (catBulanIni[cat] || 0) + Number(tx.amount || 0);
  });
  const topCatBulanIni = Object.entries(catBulanIni).sort((a, b) => b[1] - a[1])[0];
  const insightText = topCatBulanIni && totalPengeluaranBulanIni > 0
    ? `${getCategoryEmoji(topCatBulanIni[0])} Bulan ini paling banyak keluar buat ${topCatBulanIni[0]} (${((topCatBulanIni[1] / totalPengeluaranBulanIni) * 100).toFixed(0)}%)`
    : null;

  // Acara H-7: tanggal dari hari ini s.d. 7 hari ke depan, urut terdekat
  const upcomingEvents = events
    .map((ev) => ({ ...ev, diff: daysUntil(ev.tanggal) }))
    .filter((ev) => ev.diff >= 0 && ev.diff <= 7)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 4);

  return (
    <DashboardLayout>
      <div className="dashboard">
        {/* Header */}
        <div className="dashboard__header">
          <div>
            <h1 className="dashboard__title">Dashboard Pribadi</h1>
            <p className="dashboard__subtitle">Ringkasan keuangan personal kamu</p>
          </div>
          <div className="dashboard__badge dashboard__badge--personal">👤 Mode Pribadi</div>
        </div>

        {/* Budget Alert Banner */}
        {budgetStatus !== "safe" && summary.pemasukan > 0 && (
          <div className={"dp-alert dp-alert--" + budgetStatus}>
            <span className="dp-alert__icon">{budgetStatus === "danger" ? "🚨" : "⚠️"}</span>
            <span className="dp-alert__text">
              {budgetStatus === "danger"
                ? `Pengeluaran sudah melebihi pemasukan bulan ini (${budgetPersenLabel}%)`
                : `Pengeluaran sudah mencapai ${budgetPersenLabel}% dari pemasukan bulan ini`}
            </span>
          </div>
        )}

        {/* Insight otomatis */}
        {insightText && (
          <div className="dp-insight">
            {insightText}
          </div>
        )}

        {/* Metric Cards */}
        <div className="dashboard__metrics">
          <MetricCard label="Saldo Saat Ini"    value={formatRupiah(summary.saldo)}        sub="Pemasukan - Pengeluaran"          icon="💳" accent="personal" />
          <MetricCard label="Total Pemasukan"   value={formatRupiah(summary.pemasukan)}    sub="Gaji, freelance, dll"             icon="📈" accent="positive" />
          <MetricCard label="Total Pengeluaran" value={formatRupiah(summary.pengeluaran)}  sub={`${budgetPersenLabel}% dari pemasukan`} icon="🛒" accent="negative" />
        </div>

        {/* Budget bar */}
        <div className="dashboard__budget-wrap">
          <div className="dashboard__section-title" style={{ marginBottom: "0.6rem" }}>
            Penggunaan Budget Bulan Ini
          </div>
          <div className="dashboard__budget-bar">
            <div
              className={"dashboard__budget-fill " + (Number(budgetPersenLabel) > 80 ? "dashboard__budget-fill--danger" : "dashboard__budget-fill--safe")}
              style={{ width: budgetPersenLabel + "%" }}
            />
          </div>
          <p className="dashboard__budget-label">
            {formatRupiah(summary.pengeluaran)} dari {formatRupiah(summary.pemasukan)} ({budgetPersenLabel}%)
          </p>
        </div>

        {/* Countdown Acara H-7 */}
        {upcomingEvents.length > 0 && (
          <div className="dp-events">
            <div className="dashboard__section-header">
              <div className="dashboard__section-title">📅 Acara Mendatang (7 Hari)</div>
              <button className="dashboard__see-all" onClick={() => navigate("/dashboard/personal/catatan")}>
                Lihat semua →
              </button>
            </div>
            <div className="dp-events__list">
              {upcomingEvents.map((ev) => (
                <div key={ev.id} className="dp-event-card">
                  <div className="dp-event-card__date">
                    {new Date(ev.tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                  </div>
                  <div className="dp-event-card__info">
                    <p className="dp-event-card__judul">{ev.judul}</p>
                    <span className={"dp-event-card__countdown " + (ev.diff === 0 ? "dp-event-card__countdown--today" : "")}>
                      {countdownLabel(ev.diff)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target Cards */}
        {activeTargets.length > 0 && (
          <div className="dashboard__targets">
            <div className="dashboard__section-header">
              <div className="dashboard__section-title">🎯 Target Tabungan Aktif</div>
              <button className="dashboard__see-all" onClick={() => navigate("/dashboard/personal/target")}>
                Lihat semua →
              </button>
            </div>
            <div className="dashboard__target-grid">
              {activeTargets.map((t) => {
                const persen = Math.min((t.terkumpul / t.target) * 100, 100);
                return (
                  <div key={t.id} className="dashboard__target-card">
                    <div className="dashboard__target-top">
                      <div>
                        <p className="dashboard__target-nama">{t.nama}</p>
                        {t.penempatan && (
                          <p className="dashboard__target-penempatan">🏦 {t.penempatan}</p>
                        )}
                      </div>
                      <span className="dashboard__target-persen">{persen.toFixed(0)}%</span>
                    </div>
                    <div className="dashboard__target-bar">
                      <div className="dashboard__target-fill" style={{ width: persen + "%" }} />
                    </div>
                    <div className="dashboard__target-info">
                      <span>{formatRupiah(t.terkumpul)}</span>
                      <span>dari {formatRupiah(t.target)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chart + Categories */}
        <div className="dashboard__row">
          <div className="dashboard__chart-wrap">
            <div className="dashboard__section-title">Tren Keuangan (6 Bulan)</div>
            <MiniChart transactions={transactions} accent="personal" />
          </div>
          <div className="dashboard__categories">
            <div className="dashboard__section-title">Pengeluaran per Kategori</div>
            {topCategories.length === 0 ? (
              <div className="dashboard__empty">Belum ada data pengeluaran</div>
            ) : (
              <div className="dashboard__cat-list">
                {topCategories.map(([cat, amount]) => (
                  <div key={cat} className="dashboard__cat-item">
                    <span className="dashboard__cat-name">
                      <span className="dashboard__cat-emoji">{getCategoryEmoji(cat)}</span> {cat}
                    </span>
                    <span className="dashboard__cat-amount">{formatRupiah(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="dashboard__recent">
          <div className="dashboard__section-header">
            <div className="dashboard__section-title">Transaksi Terbaru</div>
            <button className="dashboard__see-all" onClick={() => navigate("/dashboard/personal/transaksi")}>
              Lihat semua →
            </button>
          </div>
          {recentTx.length === 0 ? (
            <div className="dashboard__empty-state">
              <p>💳</p>
              <p>Belum ada transaksi.</p>
              <p>Mulai catat dari menu <strong>Transaksi</strong>.</p>
            </div>
          ) : (
            <div className="dashboard__tx-list">
              {recentTx.map((tx) => (
                <div key={tx.id} className="dashboard__tx-item">
                  <div className={"dashboard__tx-dot dashboard__tx-dot--" + (tx.type === "pemasukan" ? "income" : "expense")} />
                  <span className="dashboard__tx-emoji">{getCategoryEmoji(tx.category)}</span>
                  <div className="dashboard__tx-info">
                    <p className="dashboard__tx-desc">{tx.description || tx.category || "-"}</p>
                    <p className="dashboard__tx-date">{new Date(tx.createdAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  <span className={"dashboard__tx-amount " + (tx.type === "pemasukan" ? "dashboard__tx-amount--income" : "dashboard__tx-amount--expense")}>
                    {tx.type === "pemasukan" ? "+" : "-"}{formatRupiah(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
