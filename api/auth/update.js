import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: verify JWT dari Authorization header
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, message: "Field 'action' wajib diisi." });
    }

    // -------------------------------------------------------
    // ACTION: updateName — butuh JWT (user harus login)
    // body: { action: "updateName", newName }
    // -------------------------------------------------------
    if (action === "updateName") {
      const decoded = verifyToken(req);
      if (!decoded) {
        return res.status(401).json({ success: false, message: "Token tidak valid atau sudah expired." });
      }

      const { newName } = req.body;
      if (!newName || !newName.trim()) {
        return res.status(400).json({ success: false, message: "Nama baru tidak boleh kosong." });
      }

      const { error } = await supabase
        .from("users")
        .update({ name: newName.trim() })
        .eq("id", decoded.id);

      if (error) throw error;

      // Kembalikan token baru dengan name yang sudah diupdate
      const newToken = jwt.sign(
        { id: decoded.id, name: newName.trim(), email: decoded.email, mode: decoded.mode },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(200).json({ success: true, token: newToken });
    }

    // -------------------------------------------------------
    // ACTION: checkEmail — cek email+mode terdaftar atau nggak, TANPA ganti apa-apa.
    // Dipakai di step 1 "Lupa Password" biar user langsung tau kalau emailnya salah,
    // nggak perlu keburu ngetik password baru dulu baru ketauan di step 2.
    // body: { action: "checkEmail", email, mode }
    // -------------------------------------------------------
    if (action === "checkEmail") {
      const { email, mode } = req.body;
      if (!email || !mode) {
        return res.status(400).json({ success: false, message: "Email dan mode wajib diisi." });
      }
      if (!["personal", "umkm"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }

      const { data: found, error: findError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .eq("mode", mode)
        .maybeSingle();

      if (findError) throw findError;
      if (!found) {
        return res.status(404).json({ success: false, message: `Email ini belum terdaftar di Mode ${mode === "umkm" ? "UMKM" : "Personal"}.` });
      }
      return res.status(200).json({ success: true });
    }

    // -------------------------------------------------------
    // ACTION: resetPassword — tidak butuh JWT (user lupa password)
    // body: { action: "resetPassword", email, mode, newPassword }
    // -------------------------------------------------------
    if (action === "resetPassword") {
      const { email, mode, newPassword } = req.body;

      if (!email || !mode || !newPassword) {
        return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
      }
      if (!["personal", "umkm"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password minimal 6 karakter." });
      }

      // Cek apakah email + mode terdaftar
      const { data: found, error: findError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .eq("mode", mode)
        .maybeSingle();

      if (findError) throw findError;
      if (!found) {
        return res.status(404).json({ success: false, message: "Email tidak ditemukan di mode ini." });
      }

      const password_hash = await bcrypt.hash(newPassword, 12);

      const { error: updateError } = await supabase
        .from("users")
        .update({ password_hash })
        .eq("id", found.id);

      if (updateError) throw updateError;

      return res.status(200).json({ success: true });
    }

    // -------------------------------------------------------
    // ACTION: deleteAccount — butuh JWT + password (double-check biar nggak kepencet
    // nggak sengaja). Menghapus SEMUA data user di SEMUA tabel, lalu akunnya sendiri.
    // Tidak bisa dibatalkan setelah ini jalan.
    // body: { action: "deleteAccount", password }
    // -------------------------------------------------------
    if (action === "deleteAccount") {
      const decoded = verifyToken(req);
      if (!decoded) {
        return res.status(401).json({ success: false, message: "Token tidak valid atau sudah expired." });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, message: "Password wajib diisi buat konfirmasi." });
      }

      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("id, password_hash")
        .eq("id", decoded.id)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow) {
        return res.status(404).json({ success: false, message: "Akun tidak ditemukan." });
      }

      const match = await bcrypt.compare(password, userRow.password_hash);
      if (!match) {
        return res.status(401).json({ success: false, message: "Password salah." });
      }

      const uid = decoded.id;

      // Hapus dari semua tabel yang nyimpen data per-user. Dilakukan eksplisit satu-satu
      // (bukan cuma andelin ON DELETE CASCADE di database) biar dijamin bersih walau
      // constraint-nya belum/nggak diset di sisi Supabase.
      const tablesWithUserId = [
        "transactions", "bahan_baku", "produk", "aset_usaha", "utang_piutang",
        "biaya_operasional", "stok_history", "supplier", "dompet",
        "targets", "debts", "notes", "cal_notes", "chat_history", "profiles",
      ];
      for (const table of tablesWithUserId) {
        const { error } = await supabase.from(table).delete().eq("user_id", uid);
        if (error) console.error(`[deleteAccount] gagal hapus dari ${table}:`, error.message);
      }

      // Hapus avatar dari storage (best-effort, nggak masalah kalau memang belum pernah upload)
      try {
        await supabase.storage.from("avatars").remove([`${uid}/avatar.jpg`]);
      } catch (e) {
        console.error("[deleteAccount] gagal hapus avatar:", e.message);
      }

      // Terakhir, hapus baris user-nya sendiri
      const { error: delUserErr } = await supabase.from("users").delete().eq("id", uid);
      if (delUserErr) throw delUserErr;

      return res.status(200).json({ success: true });
    }

    // Action tidak dikenali
    return res.status(400).json({ success: false, message: `Action '${action}' tidak dikenali.` });
  } catch (err) {
    console.error("[update] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
