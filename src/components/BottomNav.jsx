import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./BottomNav.css";

const menuUMKM = [
  { path: "/dashboard/umkm",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/umkm/transaksi", icon: "🧾", label: "Transaksi" },
  { path: "/dashboard/umkm/produksi",  icon: "🏭", label: "Produksi" },
  { path: "/dashboard/umkm/laporan",   icon: "📈", label: "Laporan" },
  { path: "/dashboard/umkm/ai",        icon: "🤖", label: "AI" },
];

const menuPersonal = [
  { path: "/dashboard/personal",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/personal/transaksi", icon: "💳", label: "Transaksi" },
  { path: "/dashboard/personal/target",    icon: "🎯", label: "Target" },
  { path: "/dashboard/personal/catatan",   icon: "📋", label: "Catatan" },
  { path: "/dashboard/personal/ai",        icon: "🤖", label: "AI" },
];

export default function BottomNav() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const isUMKM = user?.mode === "umkm";
  const menu   = isUMKM ? menuUMKM : menuPersonal;
  const accent = isUMKM ? "umkm" : "personal";

  return (
    <nav className={`bottom-nav bottom-nav--${accent}`}>
      {menu.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            className={`bottom-nav__item ${active ? `bottom-nav__item--active bottom-nav__item--${accent}` : ""}`}
            onClick={() => navigate(item.path)}
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
