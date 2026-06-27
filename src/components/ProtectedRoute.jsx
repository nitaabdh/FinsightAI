import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Lindungi halaman agar hanya bisa diakses user yang sudah login
export default function ProtectedRoute({ children, requiredMode }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>Memuat...</div>;

  if (!user) return <Navigate to="/" replace />;

  // Kalau halaman butuh mode tertentu (umkm/personal), cek kesesuaiannya
  if (requiredMode && user.mode !== requiredMode) {
    return <Navigate to={`/dashboard/${user.mode}`} replace />;
  }

  return children;
}
