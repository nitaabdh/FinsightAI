import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

// -------------------------------------------------------
// Token helpers
// -------------------------------------------------------
const TOKEN_KEY = "finsight_token";
// "Kotak akun tersimpan" — kunci per mode, isinya token + info ringkas biar
// bisa ditampilin di switcher tanpa perlu decode ulang tiap render.
const ACCOUNTS_KEY = "finsight_accounts";

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAccount(mode, token, decoded) {
  const accounts = getSavedAccounts();
  accounts[mode] = { token, name: decoded.name, email: decoded.email };
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function removeSavedAccount(mode) {
  const accounts = getSavedAccounts();
  delete accounts[mode];
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
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
  const [savedAccounts, setSavedAccounts] = useState({});

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
      const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode, role: decoded.role };
      setUser(u);
      // Mode Kasir nggak punya akses ke /api/profile (diblokir server), jadi
      // skip fetch-nya dan langsung pakai nama dari token aja.
      if (decoded.role === "kasir") {
        setProfile({ hasProfile: false, displayName: "Kasir", photo: null });
      } else {
        loadProfile(u);
      }
    } else {
      // Token tidak ada atau expired — hapus saja
      removeToken();
    }

    setSavedAccounts(getSavedAccounts());
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
    saveAccount(decoded.mode, result.token, decoded);
    setSavedAccounts(getSavedAccounts());
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
    saveAccount(decoded.mode, result.token, decoded);
    setSavedAccounts(getSavedAccounts());
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
    saveAccount(decoded.mode, result.token, decoded);
    setSavedAccounts(getSavedAccounts());
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
      if (user?.mode) removeSavedAccount(user.mode);
      setSavedAccounts(getSavedAccounts());
      removeToken();
      setUser(null);
    }
    return result; // { success, message? }
  };

  // -------------------------------------------------------
  // switchAccount — pindah ke akun mode lain TANPA login ulang, asal
  // tokennya masih tersimpan & belum expired. Mirip switch akun di Telegram.
  // -------------------------------------------------------
  const switchAccount = async (mode) => {
    const accounts = getSavedAccounts();
    const saved = accounts[mode];
    if (!saved) return { success: false, reason: "not_saved" };

    const decoded = decodeToken(saved.token);
    if (!decoded || isTokenExpired(decoded)) {
      removeSavedAccount(mode);
      setSavedAccounts(getSavedAccounts());
      return { success: false, reason: "expired" };
    }

    saveToken(saved.token);
    const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode };
    setUser(u);
    await loadProfile(u);
    return { success: true };
  };

  // Lupain satu akun dari daftar switcher (tanpa nge-logout akun yang lagi
  // aktif, kecuali yang dihapus emang akun yang lagi aktif).
  const removeAccount = (mode) => {
    removeSavedAccount(mode);
    setSavedAccounts(getSavedAccounts());
    if (user?.mode === mode) {
      logout();
    }
  };

  // -------------------------------------------------------
  // loginKasir / logoutKasir — Mode Kasir (PIN login dari landing page)
  // -------------------------------------------------------
  // SENGAJA terpisah dari login()/logout() biasa dan SENGAJA nggak nyentuh
  // saveAccount/removeSavedAccount sama sekali. Alasannya: sesi Kasir pakai
  // mode "umkm" juga (sama kayak akun owner beneran) — kalau ikut kesimpen/
  // kehapus di savedAccounts (yang di-key per mode), sesi Kasir bisa nimpa
  // atau ngehapus token akun UMKM asli si owner yang kebetulan login juga
  // di device yang sama. Sesi Kasir emang harusnya "numpang lewat" doang,
  // nggak masuk ke daftar switcher akun.
  const loginKasir = (token) => {
    saveToken(token);
    const decoded = decodeToken(token);
    const u = { id: decoded.id, name: decoded.name, email: decoded.email, mode: decoded.mode, role: decoded.role };
    setUser(u);
    setProfile({ hasProfile: false, displayName: "Kasir", photo: null });
  };

  const logoutKasir = () => {
    removeToken();
    setUser(null);
    setProfile({ displayName: "", photo: null, hasProfile: false });
  };

  // -------------------------------------------------------
  // logout
  // -------------------------------------------------------
  const logout = () => {
    removeToken();
    if (user?.mode) removeSavedAccount(user.mode);
    setSavedAccounts(getSavedAccounts());
    setUser(null);
    setProfile({ displayName: "", photo: null, hasProfile: false });
  };

  // Dipanggil dari ProfilePage setelah simpan/upload/hapus foto, biar
  // Sidebar & PageHeader langsung update tanpa perlu pindah halaman dulu.
  const refreshProfile = () => loadProfile(user);

  return (
    <AuthContext.Provider value={{ user, loading, profile, refreshProfile, savedAccounts, switchAccount, removeAccount, register, login, logout, loginKasir, logoutKasir, updateName, checkEmailExists, resetPassword, deleteAccount, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return ctx;
};
