import { useState } from "react";
import { formatRupiah, formatDate } from "../utils/transactionStorage";
import "./TransactionList.css";

export default function TransactionList({ transactions, onDelete, accent = "personal" }) {
  const [filter, setFilter] = useState("all"); // "all" | "income" | "expense"
  const [search, setSearch] = useState("");

  const filtered = transactions.filter((t) => {
    const matchType = filter === "all" || t.type === filter;
    const matchSearch =
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.note && t.note.toLowerCase().includes(search.toLowerCase()));
    return matchType && matchSearch;
  });

  return (
    <div className="txlist stagger-list">
      {/* Controls */}
      <div className="txlist__controls stagger-list">
        <div className="txlist__filters stagger-list">
          {[
            { key: "all", label: "Semua" },
            { key: "income", label: "Pemasukan" },
            { key: "expense", label: "Pengeluaran" },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`txlist__filter-btn ${filter === key ? `txlist__filter-btn--active txlist__filter-btn--${accent}` : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className={`txlist__search txlist__search--${accent}`}
          placeholder="Cari transaksi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="txlist__empty stagger-list">
          <span>📭</span>
          <p>Belum ada transaksi</p>
        </div>
      ) : (
        <div className="txlist__items stagger-list">
          {filtered.map((t) => (
            <div key={t.id} className="txlist__item animate-fadeIn">
              <div className={`txlist__item-dot txlist__item-dot--${t.type}`} />
              <div className="txlist__item-info">
                <span className="txlist__item-category">{t.category}</span>
                {t.note && <span className="txlist__item-note">{t.note}</span>}
                <span className="txlist__item-date">{formatDate(t.createdAt)}</span>
              </div>
              <div className="txlist__item-right">
                <span className={`txlist__item-amount txlist__item-amount--${t.type}`}>
                  {t.type === "income" ? "+" : "-"}{formatRupiah(t.amount)}
                </span>
                <button
                  className="txlist__item-delete"
                  onClick={() => onDelete(t.id)}
                  title="Hapus"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
