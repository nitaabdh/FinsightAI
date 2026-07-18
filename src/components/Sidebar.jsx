import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, Receipt, Factory, TrendingUp, FileEdit, Bot,
  CreditCard, Target, Wallet, ClipboardList, Store, User, Pencil,
  AlertTriangle, LogOut, HandCoins,
} from "lucide-react";
import "./Sidebar.css";

const menuUMKM = [
  { path: "/dashboard/umkm",              icon: LayoutDashboard, label: "Dashboard" },
  { path: "/dashboard/umkm/transaksi",    icon: Receipt,         label: "Transaksi" },
  { path: "/dashboard/umkm/produksi",     icon: Factory,         label: "Produksi & Stok" },
  { path: "/dashboard/umkm/dompet",       icon: Wallet,          label: "Dompet" },
  { path: "/dashboard/umkm/utang-piutang",icon: HandCoins,       label: "Utang-Piutang" },
  { path: "/dashboard/umkm/laporan",      icon: TrendingUp,      label: "Laporan" },
  { path: "/dashboard/umkm/catatan",      icon: FileEdit,        label: "Catatan" },
  { path: "/dashboard/umkm/ai",           icon: Bot,             label: "AI Agent" },
];

const menuPersonal = [
  { path: "/dashboard/personal",           icon: LayoutDashboard, label: "Dashboard" },
  { path: "/dashboard/personal/transaksi", icon: CreditCard,      label: "Transaksi" },
  { path: "/dashboard/personal/target",    icon: Target,          label: "Target" },
  { path: "/dashboard/personal/dompet",    icon: Wallet,          label: "Dompet" },
  { path: "/dashboard/personal/laporan",   icon: TrendingUp,      label: "Laporan" },
  { path: `/dashboard/personal/catatan`, icon: ClipboardList,     label: "Catatan" },
  { path: "/dashboard/personal/ai",        icon: Bot,             label: "AI Agent" },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, profile, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const isUMKM  = user?.mode === "umkm";
  const menu    = isUMKM ? menuUMKM : menuPersonal;
  const accent  = isUMKM ? "umkm" : "personal";
  const profPath = `/dashboard/${user?.mode}/profile`;

  const displayName = profile?.displayName || user?.name || "";
  const photo       = profile?.photo || null;
  const hasProfile  = profile?.hasProfile || false;

  const handleLogout = () => { logout(); window.location.href = "/"; };
  const initial = (displayName || user?.name || "U").charAt(0).toUpperCase();

  return (
    <aside className={`sidebar sidebar--${accent} ${collapsed ? "sidebar--collapsed" : ""}`}>
      {/* Logo — klik untuk toggle collapse/expand sidebar */}
      <button className="sidebar__logo" onClick={onToggle} title={collapsed ? "Buka sidebar" : "Tutup sidebar"}>
        <span className="sidebar__logo-icon">◈</span>
        {!collapsed && (
          <span className="sidebar__logo-text">
            FinSight <span className="sidebar__logo-ai">AI</span>
          </span>
        )}
      </button>

      {/* Mode Badge */}
      {!collapsed && (
        <div className={`sidebar__mode sidebar__mode--${accent}`}>
          {isUMKM ? <><Store size={13} /> Mode UMKM</> : <><User size={13} /> Mode Pribadi</>}
        </div>
      )}

      {/* Nav */}
      <nav className="sidebar__nav">
        {menu.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              className={`sidebar__item ${active ? "sidebar__item--active sidebar__item--" + accent : ""}`}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : ""}
            >
              <span className="sidebar__item-icon"><item.icon size={18} /></span>
              {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer — Profile + Logout */}
      <div className="sidebar__footer">
        <button
          className={`sidebar__profile-btn ${location.pathname.includes("/profile") ? "sidebar__profile-btn--active sidebar__profile-btn--" + accent : ""}`}
          onClick={() => navigate(profPath)}
          title={collapsed ? (displayName || "Profil") : ""}
        >
          <div className={`sidebar__avatar sidebar__avatar--${accent}`}>
            {photo
              ? <img src={photo} alt="profil" className="sidebar__avatar-img" />
              : initial
            }
          </div>

          {!collapsed && (
            <div className="sidebar__user-info">
              <p className="sidebar__user-name">{displayName || user?.name}</p>
              <p className="sidebar__user-email">
                {hasProfile ? <><Pencil size={11} /> Edit profil</> : <><AlertTriangle size={11} /> Isi profil dulu</>}
              </p>
            </div>
          )}
        </button>

        <button className="sidebar__logout" onClick={handleLogout} title="Keluar">
          <LogOut size={16} /> {!collapsed && "Keluar"}
        </button>
      </div>
    </aside>
  );
}
