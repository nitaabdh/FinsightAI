import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import "./Sidebar.css";

const menuUMKM = [
  { path: "/dashboard/umkm",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/umkm/transaksi", icon: "🧾", label: "Transaksi" },
  { path: "/dashboard/umkm/produksi",  icon: "🏭", label: "Produksi & Stok" },
  { path: "/dashboard/umkm/laporan",   icon: "📈", label: "Laporan" },
  { path: "/dashboard/umkm/catatan",   icon: "📝", label: "Catatan" },
  { path: "/dashboard/umkm/ai",        icon: "🤖", label: "AI Agent" },
];

const menuPersonal = [
  { path: "/dashboard/personal",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/personal/transaksi", icon: "💳", label: "Transaksi" },
  { path: "/dashboard/personal/target",    icon: "🎯", label: "Target" },
  { path: "/dashboard/personal/dompet",    icon: "👛", label: "Dompet" },
  { path: "/dashboard/personal/laporan",   icon: "📈", label: "Laporan" },
  { path: `/dashboard/personal/catatan`, icon: "📋", label: "Catatan" },
  { path: "/dashboard/personal/ai",        icon: "🤖", label: "AI Agent" },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [displayName, setDisplayName] = useState("");
  const [photo, setPhoto]             = useState(null);
  const [hasProfile, setHasProfile]   = useState(false);

  const isUMKM  = user?.mode === "umkm";
  const menu    = isUMKM ? menuUMKM : menuPersonal;
  const accent  = isUMKM ? "umkm" : "personal";
  const profPath = `/dashboard/${user?.mode}/profile`;

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("finsight_token");
    fetch("/api/profile", {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(r => {
        if (r.success && r.data) {
          setHasProfile(true);
          setDisplayName(r.data.display_name || user.name || "");
          setPhoto(r.data.avatar_url || null);
        } else {
          setHasProfile(false);
          setDisplayName(user.name || "");
          setPhoto(null);
        }
      })
      .catch(() => {
        setHasProfile(false);
        setDisplayName(user.name || "");
        setPhoto(null);
      });
  }, [user, location.pathname]); // re-load saat navigasi (misal balik dari profil)

  const handleLogout = () => { logout(); navigate("/", { replace: true }); };
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
          {isUMKM ? "🏪 Mode UMKM" : "👤 Mode Pribadi"}
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
              <span className="sidebar__item-icon">{item.icon}</span>
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
                {hasProfile ? "✏️ Edit profil" : "⚠️ Isi profil dulu"}
              </p>
            </div>
          )}
        </button>

        <button className="sidebar__logout" onClick={handleLogout} title="Keluar">
          🚪 {!collapsed && "Keluar"}
        </button>
      </div>
    </aside>
  );
}
