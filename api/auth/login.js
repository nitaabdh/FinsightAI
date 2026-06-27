import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  try {
    const { email, password, mode } = req.body;

    // --- Validasi input ---
    if (!email || !password || !mode) {
      return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
    }
    if (!["personal", "umkm"].includes(mode)) {
      return res.status(400).json({ success: false, message: "Mode tidak valid." });
    }

    // --- Cari user berdasarkan email + mode ---
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

    // --- Bandingkan password ---
    const match = await bcrypt.compare(password, found.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: "Email, password, atau mode tidak sesuai." });
    }

    // --- Sign JWT ---
    const token = jwt.sign(
      { id: found.id, name: found.name, email: found.email, mode: found.mode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error("[login] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
