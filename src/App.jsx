import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { useState, useEffect } from "react";
import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage        from "./pages/LandingPage";
import AuthPage           from "./pages/AuthPage";
import DashboardUMKM      from "./pages/DashboardUMKM";
import DashboardPersonal  from "./pages/DashboardPersonal";
import TransaksiPage      from "./pages/TransaksiPage";
import AIAgentPage        from "./pages/AIAgentPage";
import TargetPage         from "./pages/TargetPage";
import LaporanPage        from "./pages/LaporanPage";
import ProfilePage        from "./pages/ProfilePage";
import CatatanPage        from "./pages/CatatanPage";
import ProduksiPage       from "./pages/ProduksiPage";
import DompetPage         from "./pages/DompetPage";
import FloatingCalcWrapper from "./components/FloatingCalcWrapper";

function U({ children }) { return <ProtectedRoute requiredMode="umkm">{children}</ProtectedRoute>; }
function P({ children }) { return <ProtectedRoute requiredMode="personal">{children}</ProtectedRoute>; }

export default function App() {
  const [showFloat, setShowFloat] = useState(false);

  // Listen event dari tombol "Buka Kalkulator" di CatatanPage
  useEffect(() => {
    const handler = () => setShowFloat(true);
    window.addEventListener("openFloatCalc", handler);
    return () => window.removeEventListener("openFloatCalc", handler);
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/"           element={<LandingPage />} />
            <Route path="/auth/:mode" element={<AuthPage />} />

            {/* UMKM */}
            <Route path="/dashboard/umkm"            element={<U><DashboardUMKM /></U>} />
            <Route path="/dashboard/umkm/transaksi"  element={<U><TransaksiPage /></U>} />
            <Route path="/dashboard/umkm/produksi"   element={<U><ProduksiPage /></U>} />
            <Route path="/dashboard/umkm/laporan"    element={<U><LaporanPage /></U>} />
            <Route path="/dashboard/umkm/ai"         element={<U><AIAgentPage /></U>} />
            <Route path="/dashboard/umkm/profile"    element={<U><ProfilePage /></U>} />
            <Route path="/dashboard/umkm/catatan"    element={<U><CatatanPage /></U>} />

            {/* Personal */}
            <Route path="/dashboard/personal"           element={<P><DashboardPersonal /></P>} />
            <Route path="/dashboard/personal/transaksi" element={<P><TransaksiPage /></P>} />
            <Route path="/dashboard/personal/target"    element={<P><TargetPage /></P>} />
            <Route path="/dashboard/personal/dompet"    element={<P><DompetPage /></P>} />
            <Route path="/dashboard/personal/ai"        element={<P><AIAgentPage /></P>} />
            <Route path="/dashboard/personal/profile"   element={<P><ProfilePage /></P>} />
            <Route path="/dashboard/personal/catatan"   element={<P><CatatanPage /></P>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          {/* Floating Calculator — global, persist lintas halaman */}
          {showFloat && <FloatingCalcWrapper onClose={() => setShowFloat(false)} />}

        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
