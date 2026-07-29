import { useState } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import "./DashboardLayout.css";

const SIDEBAR_COLLAPSED_KEY = "finsight_sidebar_collapsed";

export default function DashboardLayout({ children }) {
  // Dibaca dari localStorage pas pertama mount, biar status collapse-nya "diinget"
  // walau tiap pindah halaman komponen ini lahir baru lagi (bukan 1 layout yang
  // dipakai bareng lewat routing — tiap page bikin DashboardLayout sendiri-sendiri).
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <div className="dash-layout">
      {/* Sidebar — desktop only (hidden via CSS on mobile) */}
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />

      {/* Main content */}
      <main className="dash-layout__main">
        {children}
      </main>

      {/* Bottom nav — mobile only (hidden via CSS on desktop) */}
      <BottomNav />
    </div>
  );
}
