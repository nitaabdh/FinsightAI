import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import BahanBaku from "../components/BahanBaku";
import BiayaOperasional from "../components/BiayaOperasional";
import KalkulatorHarga from "../components/KalkulatorHarga";
import KalkulatorOnline from "../components/KalkulatorOnline";
import AsetUsaha from "../components/AsetUsaha";
import Supplier from "../components/Supplier";
import "./ProduksiPage.css";

const TABS = [
  { id: "bahan",       icon: "🧺", label: "Bahan Baku" },
  { id: "operasional", icon: "💡", label: "Biaya Operasional" },
  { id: "kalkulator",  icon: "🧮", label: "Kalkulator Harga Jual" },
  { id: "online",      icon: "🛒", label: "Kalkulator Online" },
  { id: "aset",        icon: "🧰", label: "Aset Usaha" },
  { id: "supplier",    icon: "📇", label: "Supplier" },
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

        {/* Tab content — semua tab tetap ke-mount, cuma disembunyikan pakai CSS.
            Ini sengaja BUKAN conditional render ({activeTab === X && <Comp/>}) supaya
            state di dalam form tiap tab (ketikan yang belum disimpan) nggak hilang
            waktu pindah-pindah tab. */}
        <div className="produksipage__content">
          <div style={{ display: activeTab === "bahan" ? "block" : "none" }}>
            <BahanBaku />
          </div>
          <div style={{ display: activeTab === "operasional" ? "block" : "none" }}>
            <BiayaOperasional />
          </div>
          <div style={{ display: activeTab === "kalkulator" ? "block" : "none" }}>
            <KalkulatorHarga />
          </div>
          <div style={{ display: activeTab === "online" ? "block" : "none" }}>
            <KalkulatorOnline />
          </div>
          <div style={{ display: activeTab === "aset" ? "block" : "none" }}>
            <AsetUsaha />
          </div>
          <div style={{ display: activeTab === "supplier" ? "block" : "none" }}>
            <Supplier />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
