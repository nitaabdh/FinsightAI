import { groupByMonth, monthLabel } from "../utils/storage";
import "./MiniChart.css";

import { BarChart3 } from "lucide-react";
/**
 * MiniChart — grafik batang sederhana untuk dashboard
 * Props: transactions, accent
 */
export default function MiniChart({ transactions = [], accent = "umkm" }) {
  const grouped = groupByMonth(transactions);

  if (grouped.length === 0) {
    return (
      <div className="mini-chart mini-chart--empty">
        <span className="mini-chart__empty-icon"><BarChart3 size={14} /></span>
        <p>Belum ada transaksi buat ditampilin di sini</p>
        <p className="mini-chart__empty-sub">Grafiknya bakal muncul otomatis begitu ada transaksi tercatat</p>
      </div>
    );
  }

  const allValues = grouped.flatMap(([, v]) => [v.pemasukan, v.pengeluaran]);
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className="mini-chart">
      <div className="mini-chart__bars">
        {grouped.map(([month, val], i) => (
          <div key={month} className="mini-chart__group">
            <div className="mini-chart__pair">
              <div
                className={`mini-chart__bar mini-chart__bar--income mini-chart__bar--${accent} chart-bar-grow`}
                style={{ height: `${(val.pemasukan / maxVal) * 100}%`, animationDelay: `${i * 0.05}s` }}
                title={`Pemasukan: ${val.pemasukan.toLocaleString("id-ID")}`}
              />
              <div
                className="mini-chart__bar mini-chart__bar--expense chart-bar-grow"
                style={{ height: `${(val.pengeluaran / maxVal) * 100}%`, animationDelay: `${i * 0.05 + 0.03}s` }}
                title={`Pengeluaran: ${val.pengeluaran.toLocaleString("id-ID")}`}
              />
            </div>
            <span className="mini-chart__label">{monthLabel(month)}</span>
          </div>
        ))}
      </div>
      <div className="mini-chart__legend">
        <span className={`mini-chart__legend-dot mini-chart__legend-dot--${accent}`} />
        <span>Pemasukan</span>
        <span className="mini-chart__legend-dot mini-chart__legend-dot--expense" />
        <span>Pengeluaran</span>
      </div>
    </div>
  );
}
