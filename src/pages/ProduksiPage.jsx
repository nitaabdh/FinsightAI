import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import BahanBaku from "../components/BahanBaku";
import KalkulatorHarga from "../components/KalkulatorHarga";
import AsetUsaha from "../components/AsetUsaha";
import "./ProduksiPage.css";

const TABS = [
  { id: "bahan",      icon: "🧺", label: "Bahan Baku" },
  { id: "kalkulator", icon: "🧮", label: "Kalkulator Harga Jual" },
  { id: "aset",       icon: "🧰", label: "Aset Usaha" },
];

export default function ProduksiPage() {
  const [activeTab, setActiveTab] = useState("bahan");

  return (
    <DashboardLayout>
      <div className="produksipage">
        <PageHeader
          title="Produksi & Stok"
          subtitle="Kelola bahan baku, harga jual, dan aset usahamu"
        />

        {/* Tab switcher */}
        <div className="produksipage__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={"produksipage__tab" + (activeTab === tab.id ? " produksipage__tab--active" : "")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="produksipage__content">
          {activeTab === "bahan"      && <BahanBaku />}
          {activeTab === "kalkulator" && <KalkulatorHarga />}
          {activeTab === "aset"       && <AsetUsaha />}
        </div>
      </div>
    </DashboardLayout>
  );
}
