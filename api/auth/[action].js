// /api/auth/[action].js — Vercel Serverless Function (DYNAMIC ROUTE)
//
// Digabung dari 3 file terpisah (login.js, register.js, update.js) jadi SATU
// function, biar nggak boros kuota "12 Serverless Functions" di Vercel Hobby plan.
//
// Ini "dynamic route" — nama file [action].js bikin Vercel otomatis ngisi
// req.query.action dari segmen URL-nya. Jadi:
//   POST /api/auth/login    -> req.query.action === "login"
//   POST /api/auth/register -> req.query.action === "register"
//   POST /api/auth/update   -> req.query.action === "update"
// URL yang dipanggil dari frontend TETAP SAMA PERSIS kayak sebelumnya — nggak ada
// yang perlu diubah di AuthContext.jsx atau file frontend manapun.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  try { return jwt.verify(auth.slice(7), process.env.JWT_SECRET); }
  catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  const routeAction = req.query.action; // dari URL: login | register | update

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/auth/login
    // ═══════════════════════════════════════════════════════════════════════
    if (routeAction === "login") {
      const { email, password, mode } = req.body;

      if (!email || !password || !mode) {
        return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
      }
      if (!["personal", "umkm"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }

      const { data: found, error: queryError } = await supabase
        .from("users")
        .select("id, name, email, password_hash, mode")
        .eq("email", email)
        .eq("mode", mode)
        .maybeSingle();
      if (queryError) throw queryError;

      // Pesan error sengaja dibuat sama supaya tidak bisa ditebak field mana yang salah
      if (!found) {
        return res.status(401).json({ success: false, message: "Email, password, atau mode tidak sesuai." });
      }

      const match = await bcrypt.compare(password, found.password_hash);
      if (!match) {
        return res.status(401).json({ success: false, message: "Email, password, atau mode tidak sesuai." });
      }

      const token = jwt.sign(
        { id: found.id, name: found.name, email: found.email, mode: found.mode },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.status(200).json({ success: true, token });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/auth/register
    // ═══════════════════════════════════════════════════════════════════════
    if (routeAction === "register") {
      const { name, email, password, mode } = req.body;

      if (!name || !email || !password || !mode) {
        return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
      }
      if (!["personal", "umkm"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password minimal 6 karakter." });
      }

      const { data: existing, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .eq("mode", mode)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existing) {
        return res.status(409).json({ success: false, message: "Email sudah terdaftar di mode ini." });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({ name, email, password_hash, mode })
        .select("id, name, email, mode, created_at")
        .single();
      if (insertError) throw insertError;

      const token = jwt.sign(
        { id: newUser.id, name: newUser.name, email: newUser.email, mode: newUser.mode },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.status(201).json({ success: true, token });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/auth/update  (masih punya sub-action SENDIRI lewat req.body.action
    // — INI BEDA KONSEP dari routeAction di atas, jangan ketuker)
    // ═══════════════════════════════════════════════════════════════════════
    if (routeAction === "update") {
      const { action } = req.body; // sub-action: updateName | checkEmail | resetPassword | deleteAccount
      if (!action) {
        return res.status(400).json({ success: false, message: "Field 'action' wajib diisi." });
      }

      // ── updateName ── butuh JWT
      if (action === "updateName") {
        const decoded = verifyToken(req);
        if (!decoded) return res.status(401).json({ success: false, message: "Token tidak valid atau sudah expired." });

        const { newName } = req.body;
        if (!newName || !newName.trim()) {
          return res.status(400).json({ success: false, message: "Nama baru tidak boleh kosong." });
        }

        const { error } = await supabase.from("users").update({ name: newName.trim() }).eq("id", decoded.id);
        if (error) throw error;

        const newToken = jwt.sign(
          { id: decoded.id, name: newName.trim(), email: decoded.email, mode: decoded.mode },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.status(200).json({ success: true, token: newToken });
      }

      // ── checkEmail ── cek email+mode terdaftar, TANPA ganti apa-apa
      if (action === "checkEmail") {
        const { email, mode } = req.body;
        if (!email || !mode) return res.status(400).json({ success: false, message: "Email dan mode wajib diisi." });
        if (!["personal", "umkm"].includes(mode)) return res.status(400).json({ success: false, message: "Mode tidak valid." });

        const { data: found, error: findError } = await supabase
          .from("users").select("id").eq("email", email).eq("mode", mode).maybeSingle();
        if (findError) throw findError;
        if (!found) {
          return res.status(404).json({ success: false, message: `Email ini belum terdaftar di Mode ${mode === "umkm" ? "UMKM" : "Personal"}.` });
        }
        return res.status(200).json({ success: true });
      }

      // ── resetPassword ── tidak butuh JWT (user lupa password)
      if (action === "resetPassword") {
        const { email, mode, newPassword } = req.body;
        if (!email || !mode || !newPassword) return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
        if (!["personal", "umkm"].includes(mode)) return res.status(400).json({ success: false, message: "Mode tidak valid." });
        if (newPassword.length < 6) return res.status(400).json({ success: false, message: "Password minimal 6 karakter." });

        const { data: found, error: findError } = await supabase
          .from("users").select("id").eq("email", email).eq("mode", mode).maybeSingle();
        if (findError) throw findError;
        if (!found) return res.status(404).json({ success: false, message: "Email tidak ditemukan di mode ini." });

        const password_hash = await bcrypt.hash(newPassword, 12);
        const { error: updateError } = await supabase.from("users").update({ password_hash }).eq("id", found.id);
        if (updateError) throw updateError;
        return res.status(200).json({ success: true });
      }

      // ── deleteAccount ── butuh JWT + password. Hapus SEMUA data user di SEMUA tabel.
      if (action === "deleteAccount") {
        const decoded = verifyToken(req);
        if (!decoded) return res.status(401).json({ success: false, message: "Token tidak valid atau sudah expired." });

        const { password } = req.body;
        if (!password) return res.status(400).json({ success: false, message: "Password wajib diisi buat konfirmasi." });

        const { data: userRow, error: userErr } = await supabase
          .from("users").select("id, password_hash").eq("id", decoded.id).maybeSingle();
        if (userErr) throw userErr;
        if (!userRow) return res.status(404).json({ success: false, message: "Akun tidak ditemukan." });

        const match = await bcrypt.compare(password, userRow.password_hash);
        if (!match) return res.status(401).json({ success: false, message: "Password salah." });

        const uid = decoded.id;
        // Dilakukan eksplisit satu-satu (bukan cuma andelin ON DELETE CASCADE) biar
        // dijamin bersih walau constraint-nya belum/nggak diset di sisi Supabase.
        const tablesWithUserId = [
          "transactions", "bahan_baku", "produk", "aset_usaha", "utang_piutang",
          "biaya_operasional", "stok_history", "supplier", "dompet",
          "targets", "debts", "notes", "cal_notes", "chat_history", "profiles",
          "telegram_links", "telegram_link_codes", "telegram_reminders_sent",
        ];
        for (const table of tablesWithUserId) {
          const { error } = await supabase.from(table).delete().eq("user_id", uid);
          if (error) console.error(`[deleteAccount] gagal hapus dari ${table}:`, error.message);
        }

        try {
          await supabase.storage.from("avatars").remove([`${uid}/avatar.jpg`]);
        } catch (e) {
          console.error("[deleteAccount] gagal hapus avatar:", e.message);
        }

        const { error: delUserErr } = await supabase.from("users").delete().eq("id", uid);
        if (delUserErr) throw delUserErr;

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, message: `Action '${action}' tidak dikenali.` });
    }

    // routeAction (dari URL) nggak dikenali sama sekali
    return res.status(404).json({ success: false, message: `Endpoint /api/auth/${routeAction} tidak ditemukan.` });
  } catch (err) {
    console.error(`[auth/${routeAction}] error:`, err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
