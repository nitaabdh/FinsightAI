import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Store, User, X, Check } from "lucide-react";
import "./AccountSwitcherList.css";

// Daftar switch akun ala Telegram — dipakai bareng di semua dropdown profil
// (PageHeader, Sidebar, dashboard mobile) biar behaviornya selalu konsisten
// di satu tempat aja, nggak ke-duplikat/gampang out-of-sync kayak sebelumnya.
export default function AccountSwitcherList({ onAfterAction }) {
  const { user, savedAccounts, switchAccount, removeAccount } = useAuth();
  const navigate = useNavigate();

  const MODES = [
    { key: "umkm",     label: "Mode UMKM",    icon: Store },
    { key: "personal", label: "Mode Pribadi", icon: User  },
  ];

  const handleClick = async (mode) => {
    if (mode === user?.mode) { onAfterAction?.(); return; }

    const saved = savedAccounts?.[mode];
    if (!saved) {
      // Belum pernah login di device ini — arahkan ke form login mode itu
      onAfterAction?.();
      navigate(`/auth/${mode}`);
      return;
    }

    const result = await switchAccount(mode);
    onAfterAction?.();
    if (result.success) {
      navigate(`/dashboard/${mode}`);
    } else {
      // Token tersimpan udah kadaluarsa — minta login ulang buat akun itu
      navigate(`/auth/${mode}`);
    }
  };

  const handleRemove = (e, mode) => {
    e.stopPropagation();
    removeAccount(mode);
  };

  return (
    <div className="account-switcher">
      {MODES.map(({ key, label, icon: Icon }) => {
        const saved    = savedAccounts?.[key];
        const isActive = user?.mode === key;
        return (
          <div key={key} className={`account-switcher__row ${isActive ? "account-switcher__row--active" : ""}`}>
            <button className="account-switcher__main" onClick={() => handleClick(key)}>
              <span className={`account-switcher__icon account-switcher__icon--${key}`}>
                <Icon size={15} />
              </span>
              <span className="account-switcher__info">
                <span className="account-switcher__name">{saved?.name || label}</span>
                <span className="account-switcher__sub">
                  {saved ? saved.email : "Belum login di HP ini"}
                </span>
              </span>
              {isActive && <Check size={14} className="account-switcher__check" />}
            </button>
            {saved && !isActive && (
              <button
                className="account-switcher__remove"
                title="Lupakan akun ini dari HP ini"
                onClick={(e) => handleRemove(e, key)}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
