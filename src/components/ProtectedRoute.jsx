import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Lindungi halaman agar hanya bisa diakses user yang sudah login
export default function ProtectedRoute({ children, requiredMode, allowKasir = false }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>Memuat...</div>;

  if (!user) return <Navigate to="/" replace />;

  // Kalau halaman butuh mode tertentu (umkm/personal), cek kesesuaiannya
  if (requiredMode && user.mode !== requiredMode) {
    return <Navigate to={`/dashboard/${user.mode}`} replace />;
  }

  // Mode Kasir (PIN login) cuma boleh akses halaman yang eksplisit ngizinin
  // (allowKasir=true) — selain itu dilempar balik ke halaman Kasir. Ini
  // pengaman sisi client; pengaman utamanya tetep di backend (auth-guard.js),
  // ini cuma nyegah kasir "kesasar" liat UI yang sebenernya bakal ditolak server.
  if (user.role === "kasir" && !allowKasir) {
    return <Navigate to="/dashboard/umkm/kasir" replace />;
  }

  return children;
}
