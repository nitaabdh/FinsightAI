import { useState } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import "./DashboardLayout.css";

export default function DashboardLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="dash-layout">
      {/* Sidebar — desktop only (hidden via CSS on mobile) */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((p) => !p)} />

      {/* Main content */}
      <main className="dash-layout__main">
        {children}
      </main>

      {/* Bottom nav — mobile only (hidden via CSS on desktop) */}
      <BottomNav />
    </div>
  );
}
