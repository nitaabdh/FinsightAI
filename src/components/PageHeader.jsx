import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./PageHeader.css";

import { LogOut, Pencil } from "lucide-react";
export default function PageHeader({ title, subtitle }) {
  const { user, profile, logout } = useAuth();
  const navigate  = useNavigate();
  const [open, setOpen]               = useState(false);
  const dropdownRef                   = useRef(null);

  const isUMKM   = user?.mode === "umkm";
  const accent   = isUMKM ? "umkm" : "personal";
  const profPath = `/dashboard/${user?.mode}/profile`;

  const displayName = profile?.displayName || user?.name || "";
  const photo       = profile?.photo || null;
  const hasProfile  = profile?.hasProfile || false;

  // Tutup dropdown kalau klik di luar.
  // Pakai "click" (bukan "mousedown") — di layar sentuh, mousedown bisa
  // kejadian duluan sebelum tap-nya "kelar", jadi dropdown keburu ke-close
  // sebelum tombol di dalamnya (mis. Keluar) sempat kepencet.
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    logout();
    // Full reload (bukan cuma navigate) — mastiin semua state kebersihan,
    // gak ada sisa data lama yang nyangkut di komponen yang masih ke-mount.
    window.location.href = "/";
  };

  const handleProfile = () => {
    setOpen(false);
    navigate(profPath);
  };

  const initial = (displayName || user?.name || "U").charAt(0).toUpperCase();

  return (
    <div className="page-header">
      {/* Kiri: title & subtitle */}
      <div className="page-header__left">
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>

      {/* Kanan: mode badge (desktop) + avatar dropdown */}
      <div className="page-header__right">
        <div className={`page-header__badge page-header__badge--${accent}`}>
          {isUMKM ? "Mode UMKM" : "Mode Pribadi"}
        </div>

        <div className="page-header__avatar-wrap" ref={dropdownRef}>
          <button
            className={`page-header__avatar page-header__avatar--${accent}`}
            onClick={() => setOpen((v) => !v)}
            title={displayName || "Profil"}
          >
            {photo
              ? <img src={photo} alt="profil" className="page-header__avatar-img" />
              : initial
            }
          </button>

          {open && (
            <div className="page-header__dropdown">
              <div className="page-header__dropdown-user">
                <div className={`page-header__dropdown-avatar page-header__dropdown-avatar--${accent}`}>
                  {photo
                    ? <img src={photo} alt="profil" className="page-header__avatar-img" />
                    : initial
                  }
                </div>
                <div>
                  <p className="page-header__dropdown-name">{displayName || user?.name}</p>
                  <p className="page-header__dropdown-email">{user?.email}</p>
                </div>
              </div>

              <div className="page-header__dropdown-divider" />

              <button className="page-header__dropdown-item" onClick={handleProfile}>
                <span><Pencil size={14} /></span>
                <span>{hasProfile ? "Edit Profil" : "Isi Profil"}</span>
              </button>

              <button className="page-header__dropdown-item page-header__dropdown-item--danger" onClick={handleLogout}>
                <span><LogOut size={14} /></span>
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
