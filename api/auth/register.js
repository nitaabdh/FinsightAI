import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  try {
    const { name, email, password, mode } = req.body;

    // --- Validasi input ---
    if (!name || !email || !password || !mode) {
      return res.status(400).json({ success: false, message: "Semua field wajib diisi." });
    }
    if (!["personal", "umkm"].includes(mode)) {
      return res.status(400).json({ success: false, message: "Mode tidak valid." });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password minimal 6 karakter." });
    }

    // --- Cek duplikat email + mode ---
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

    // --- Hash password ---
    const password_hash = await bcrypt.hash(password, 12);

    // --- Insert user baru ---
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({ name, email, password_hash, mode })
      .select("id, name, email, mode, created_at")
      .single();

    if (insertError) throw insertError;

    // --- Sign JWT ---
    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email, mode: newUser.mode },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({ success: true, token });
  } catch (err) {
    console.error("[register] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
