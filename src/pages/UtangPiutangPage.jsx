import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import UtangPiutang from "../components/UtangPiutang";
import "./UtangPiutangPage.css";

// Sebelumnya nyempil jadi tab terakhir di Laporan (paling jarang ketemu kalau
// discroll di mobile). Sekarang dipisah jadi halaman sendiri biar gampang
// ditemukan — masuk menu "+" di bottom nav.
export default function UtangPiutangPage() {
  return (
    <DashboardLayout>
      <div className="utangpiutangpage">
        <PageHeader
          title="Utang & Piutang"
          subtitle="Catat siapa yang berutang ke kamu, dan utangmu ke siapa"
        />
        <UtangPiutang />
      </div>
    </DashboardLayout>
  );
}
