import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Dompet from "../components/Dompet";
import "./DompetUMKMPage.css";

// Halaman "Dompet" versi UMKM — sebelumnya nyempil jadi salah satu tab di
// Laporan, sekarang dipisah jadi halaman sendiri (masuk menu "+" di bottom
// nav) biar lebih gampang ditemukan, konsisten sama Dompet versi Personal.
export default function DompetUMKMPage() {
  return (
    <DashboardLayout>
      <div className="dompetpage">
        <PageHeader
          title="Dompet"
          subtitle="Semua wadah saldo usahamu — kas tunai, rekening bank, e-wallet, dll"
        />
        <Dompet mode="umkm" />
      </div>
    </DashboardLayout>
  );
}
