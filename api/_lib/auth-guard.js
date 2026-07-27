// api/_lib/auth-guard.js
// Token Mode Kasir (dari PIN login) punya field tambahan `role: "kasir"` yang
// nggak ada di token owner biasa. Endpoint yang nggak boleh diakses Mode Kasir
// panggil rejectIfKasir(decoded, res) tepat setelah verifikasi JWT — kalau true,
// handler WAJIB langsung `return` (response error udah dikirim di dalam fungsi ini).
//
// PENTING: guard ini harus dipasang di SETIAP endpoint yang nyimpen/nampilin data
// sensitif (Laporan, Dompet, Profile, dst). Lupa masang di satu endpoint aja =
// token Kasir bisa dipakai buat akses situ, sama persis kayak celah IDOR biasa.
// Endpoint yang SENGAJA boleh diakses Mode Kasir: kasir-checkout.js (checkout),
// dan GET /api/umkm?table=produk / table=dompet (buat nampilin grid & pilihan dompet).
export function isKasirRole(decoded) {
  return decoded?.role === "kasir";
}

export function rejectIfKasir(decoded, res) {
  if (isKasirRole(decoded)) {
    res.status(403).json({ success: false, message: "Mode Kasir nggak punya akses ke fitur ini." });
    return true;
  }
  return false;
}
