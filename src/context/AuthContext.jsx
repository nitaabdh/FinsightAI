import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

// -------------------------------------------------------
// Token helpers
// -------------------------------------------------------
const TOKEN_KEY = "finsight_token";

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Decode JWT payload tanpa verify (verify dilakukan di server)
function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// Cek apakah token sudah expired
function isTokenExpired(decoded) {
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now();
}

// -------------------------------------------------------
// API caller helper
// -------------------------------------------------------
async function callAPI(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return data; // selalu { success, message?, token? }
}

// -------------------------------------------------------
// AuthProvider
// -------------------------------------------------------
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ displayName: "", photo: null, hasProfile: false });

  // Ambil data profil (nama tampilan, foto) SEKALI aja waktu user login/app
  // load — bukan tiap pindah halaman. Ini yang dipakai bareng-bareng sama
  // Sidebar & PageHeader, biar gak fetch redundant tiap ganti page dan
  // gak "kosong dulu baru keisi" tiap navigasi.
  const loadProfile = async (currentUser) => {
    if (!currentUser) return;
    try {
      const token = getToken();
      const res = await fetch("/api/profile", {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const r = await res.json();
      if (r.success && r.data) {
        setProfile({
          hasProfile: true,
          displayName: r.data.display_name || currentUser.name || "",
          photo: r.data.avatar_url || null,
        });
      } else {
        setProfile({ hasProfile: false, displayName: currentUser.name || "", photo: null });
      }
    } catch {
      setProfile({ hasProfile: false, displayName: currentUser.name || "", photo: null });
    }
  };

  useEffect(() => {
    const token   = getToken();
    const decoded = token ? decodeToken(token) : null;

    if (decoded && !isTokenExpired(decoded)) {
      const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode };
      setUser(u);
      loadProfile(u);
    } else {
      // Token tidak ada atau expired — hapus saja
      removeToken();
    }

    // Apply saved theme
    const theme = localStorage.getItem("finsight_theme") || "dark";
    document.body.classList.toggle("light", theme === "light");

    setLoading(false);
  }, []);

  // -------------------------------------------------------
  // register
  // -------------------------------------------------------
  const register = async ({ name, email, password, mode }) => {
    const result = await callAPI("/api/auth/register", { name, email, password, mode });
    if (!result.success) return result;

    saveToken(result.token);
    const decoded = decodeToken(result.token);
    const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode };
    setUser(u);
    loadProfile(u);
    return { success: true };
  };

  // -------------------------------------------------------
  // login
  // -------------------------------------------------------
  const login = async ({ email, password, mode }) => {
    const result = await callAPI("/api/auth/login", { email, password, mode });
    if (!result.success) return result;

    saveToken(result.token);
    const decoded = decodeToken(result.token);
    const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode };
    setUser(u);
    loadProfile(u);
    return { success: true };
  };

  // -------------------------------------------------------
  // updateName
  // -------------------------------------------------------
  const updateName = async (newName) => {
    const token  = getToken();
    const result = await callAPI("/api/auth/update", { action: "updateName", newName }, token);
    if (!result.success) return result;

    // Simpan token baru (name sudah diupdate di dalamnya)
    saveToken(result.token);
    const decoded = decodeToken(result.token);
    setUser((prev) => ({ ...prev, name: decoded.name }));
    return { success: true };
  };

  // -------------------------------------------------------
  // checkEmailExists — dipakai di step 1 "Lupa Password", biar ketauan dari awal
  // kalau emailnya salah, sebelum user keburu ngetik password baru di step 2.
  // -------------------------------------------------------
  const checkEmailExists = async (email, mode) => {
    return callAPI("/api/auth/update", { action: "checkEmail", email, mode }); // { success, message? }
  };

  // -------------------------------------------------------
  // resetPassword
  // -------------------------------------------------------
  const resetPassword = async (email, mode, newPassword) => {
    const result = await callAPI("/api/auth/update", { action: "resetPassword", email, mode, newPassword });
    return result; // { success, message? }
  };

  // -------------------------------------------------------
  // deleteAccount — hapus akun & SEMUA datanya secara permanen. Nggak bisa dibatalin.
  // Butuh password buat konfirmasi (dicek ulang di server, bukan cuma di sisi frontend).
  // -------------------------------------------------------
  const deleteAccount = async (password) => {
    const token  = getToken();
    const result = await callAPI("/api/auth/update", { action: "deleteAccount", password }, token);
    if (result.success) {
      removeToken();
      setUser(null);
    }
    return result; // { success, message? }
  };

  // -------------------------------------------------------
  // logout
  // -------------------------------------------------------
  const logout = () => {
    removeToken();
    setUser(null);
    setProfile({ displayName: "", photo: null, hasProfile: false });
  };

  // Dipanggil dari ProfilePage setelah simpan/upload/hapus foto, biar
  // Sidebar & PageHeader langsung update tanpa perlu pindah halaman dulu.
  const refreshProfile = () => loadProfile(user);

  return (
    <AuthContext.Provider value={{ user, loading, profile, refreshProfile, register, login, logout, updateName, checkEmailExists, resetPassword, deleteAccount, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return ctx;
};
