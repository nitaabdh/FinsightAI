import { groupByMonth, monthLabel } from "../utils/storage";
import "./MiniChart.css";

/**
 * MiniChart — grafik batang sederhana untuk dashboard
 * Props: transactions, accent
 */
export default function MiniChart({ transactions = [], accent = "umkm" }) {
  const grouped = groupByMonth(transactions);

  if (grouped.length === 0) {
    return (
      <div className="mini-chart mini-chart--empty">
        <p>Belum ada data transaksi</p>
      </div>
    );
  }

  const allValues = grouped.flatMap(([, v]) => [v.pemasukan, v.pengeluaran]);
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className="mini-chart">
      <div className="mini-chart__bars">
        {grouped.map(([month, val]) => (
          <div key={month} className="mini-chart__group">
            <div className="mini-chart__pair">
              <div
                className={`mini-chart__bar mini-chart__bar--income mini-chart__bar--${accent}`}
                style={{ height: `${(val.pemasukan / maxVal) * 100}%` }}
                title={`Pemasukan: ${val.pemasukan.toLocaleString("id-ID")}`}
              />
              <div
                className="mini-chart__bar mini-chart__bar--expense"
                style={{ height: `${(val.pengeluaran / maxVal) * 100}%` }}
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
