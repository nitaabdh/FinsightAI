import { getLast6MonthsData, formatRupiah } from "../utils/transactionStorage";
import "./BarChart.css";

export default function BarChart({ transactions, accent = "personal" }) {
  const data = getLast6MonthsData(transactions);
  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);

  const incomeColor = accent === "umkm" ? "#f59e0b" : "#10b981";
  const expenseColor = "#f87171";

  return (
    <div className="barchart">
      <div className="barchart__legend">
        <span className="barchart__legend-item">
          <span className="barchart__legend-dot" style={{ background: incomeColor }} />
          Pemasukan
        </span>
        <span className="barchart__legend-item">
          <span className="barchart__legend-dot" style={{ background: expenseColor }} />
          Pengeluaran
        </span>
      </div>

      <div className="barchart__bars">
        {data.map((d, i) => (
          <div key={i} className="barchart__group">
            <div className="barchart__bar-pair">
              {/* Income bar */}
              <div
                className="barchart__bar"
                style={{
                  height: `${(d.income / maxVal) * 100}%`,
                  background: incomeColor,
                  opacity: 0.85,
                }}
                title={`Pemasukan: ${formatRupiah(d.income)}`}
              />
              {/* Expense bar */}
              <div
                className="barchart__bar"
                style={{
                  height: `${(d.expense / maxVal) * 100}%`,
                  background: expenseColor,
                  opacity: 0.75,
                }}
                title={`Pengeluaran: ${formatRupiah(d.expense)}`}
              />
            </div>
            <span className="barchart__label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
