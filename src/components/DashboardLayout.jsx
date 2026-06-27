import { useState } from "react";
import Sidebar from "./Sidebar";
import "./DashboardLayout.css";

export default function DashboardLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="dash-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((p) => !p)} />
      <main className="dash-layout__main">
        {children}
      </main>
    </div>
  );
}
