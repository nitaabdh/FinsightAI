import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Dompet from "../components/Dompet";
import "./DompetPage.css";

// Halaman "Dompet" versi Personal — wadah semua saldo (kas tunai, rekening bank,
// e-wallet, dll) yang dipakai user pribadi. Dihitung dari histori transaksi mode
// "personal" (bukan umkm), pakai component Dompet yang sama dengan Laporan UMKM
// biar logic saldo per kas nggak dobel/nggak sinkron.
export default function DompetPage() {
  return (
    <DashboardLayout>
      <div className="dompetpage">
        <PageHeader
          title="Dompet"
          subtitle="Semua wadah saldo kamu — tunai, rekening bank, e-wallet, dll"
        />
        <Dompet mode="personal" />
      </div>
    </DashboardLayout>
  );
}
