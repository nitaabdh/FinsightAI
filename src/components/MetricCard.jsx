import "./MetricCard.css";

export default function MetricCard({ label, value, sub, icon, accent = "neutral" }) {
  return (
    <div className={`metric-card metric-card--${accent}`}>
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon">{icon}</span>
      </div>
      <div className="metric-card__value">{value}</div>
      {sub && <div className="metric-card__sub">{sub}</div>}
    </div>
  );
}
