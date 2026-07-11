import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./BottomNav.css";

const menuUMKM = [
  { path: "/dashboard/umkm",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/umkm/transaksi", icon: "🧾", label: "Transaksi" },
  { path: "/dashboard/umkm/produksi",  icon: "🏭", label: "Produksi" },
  { path: "/dashboard/umkm/laporan",   icon: "📈", label: "Laporan" },
  { path: "/dashboard/umkm/catatan",   icon: "📋", label: "Catatan" },
  { path: "/dashboard/umkm/ai",        icon: "🤖", label: "AI" },
];

// Personal: 4 menu utama tampil langsung (2 kiri, 2 kanan), tombol "+" persis
// di tengah. Sisanya (Laporan, AI) muncul lewat popup pas "+" dipencet. Profil
// SENGAJA nggak dimasukin ke sini — udah ada di avatar pojok kanan atas (PageHeader).
const primaryPersonal = [
  { path: "/dashboard/personal",           icon: "📊", label: "Dashboard" },
  { path: "/dashboard/personal/transaksi", icon: "💳", label: "Transaksi" },
  { path: "/dashboard/personal/target",    icon: "🎯", label: "Target" },
  { path: "/dashboard/personal/catatan",   icon: "📋", label: "Catatan" },
];
const morePersonal = [
  { path: "/dashboard/personal/laporan", icon: "📈", label: "Laporan" },
  { path: "/dashboard/personal/ai",      icon: "🤖", label: "AI" },
];

export default function BottomNav() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef(null);

  const isUMKM = user?.mode === "umkm";
  const accent = isUMKM ? "umkm" : "personal";

  // Tutup popup pas ganti halaman atau pas tap di luar popup
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [moreOpen]);

  const isMoreActive = !isUMKM && morePersonal.some(m => m.path === location.pathname);

  if (isUMKM) {
    return (
      <nav className={`bottom-nav bottom-nav--${accent}`}>
        {menuUMKM.map((item) => {
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

  return (
    <div className="bottom-nav-wrap" ref={wrapRef}>
      {/* Popup "Menu Lainnya" — muncul di atas tombol + */}
      {moreOpen && (
        <div className="bottom-nav__more-popup">
          {morePersonal.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                className={`bottom-nav__more-item ${active ? "bottom-nav__more-item--active" : ""}`}
                onClick={() => { navigate(item.path); setMoreOpen(false); }}
              >
                <span className="bottom-nav__icon">{item.icon}</span>
                <span className="bottom-nav__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <nav className={`bottom-nav bottom-nav--${accent}`}>
        <div className="bottom-nav__side">
          {primaryPersonal.slice(0, 2).map((item) => {
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
        </div>

        {/* Tombol + di tengah — slot lebar tetap, diapit 2 grup sisi kiri/kanan yang
            sama-sama flex:1, jadi posisinya presisi di tengah nggak peduli isi tiap sisi */}
        <button
          className={`bottom-nav__plus ${moreOpen || isMoreActive ? "bottom-nav__plus--active" : ""}`}
          onClick={() => setMoreOpen((p) => !p)}
          aria-label="Menu lainnya"
        >
          <span className="bottom-nav__plus-icon">{moreOpen ? "✕" : "+"}</span>
        </button>

        <div className="bottom-nav__side">
          {primaryPersonal.slice(2).map((item) => {
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
        </div>
      </nav>
    </div>
  );
}
