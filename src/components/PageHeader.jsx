import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getProfile, getPhoto } from "../utils/profile";
import "./PageHeader.css";

export default function PageHeader({ title, subtitle }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [displayName, setDisplayName] = useState("");
  const [photo, setPhoto]             = useState(null);
  const [hasProfile, setHasProfile]   = useState(false);
  const [open, setOpen]               = useState(false);
  const dropdownRef                   = useRef(null);

  const isUMKM  = user?.mode === "umkm";
  const accent  = isUMKM ? "umkm" : "personal";
  const profPath = `/dashboard/${user?.mode}/profile`;

  useEffect(() => {
    if (!user) return;
    const profile = getProfile(user.id);
    setHasProfile(!!profile);
    setDisplayName(profile?.displayName || user.name || "");
    setPhoto(getPhoto(user.id));
  }, [user, location.pathname]);

  // Tutup dropdown kalau klik di luar
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate("/", { replace: true });
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
        {/* Badge mode — disembunyikan di mobile */}
        <div className={`page-header__badge page-header__badge--${accent}`}>
          {isUMKM ? "🏪 Mode UMKM" : "👤 Mode Pribadi"}
        </div>

        {/* Avatar + Dropdown */}
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
            {hasProfile && (
              <span className={`page-header__avatar-dot page-header__avatar-dot--${accent}`} />
            )}
          </button>

          {open && (
            <div className="page-header__dropdown">
              {/* Info user */}
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

              {/* Profil */}
              <button className="page-header__dropdown-item" onClick={handleProfile}>
                <span>✏️</span>
                <span>{hasProfile ? "Edit Profil" : "Isi Profil"}</span>
              </button>

              {/* Keluar */}
              <button className="page-header__dropdown-item page-header__dropdown-item--danger" onClick={handleLogout}>
                <span>🚪</span>
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
