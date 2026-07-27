import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Login Mode Kasir ──
// Dipanggil dari halaman awal (sebelum masuk akun biasa) — email + PIN 6 digit
// yang di-setup owner lewat Profil. Token yang dihasilkan PUNYA field `role: "kasir"`
// yang nggak ada di token owner biasa, dan masa berlakunya lebih pendek (12 jam,
// bukan 7 hari) karena ini device yang dipegang bareng, bukan device pribadi.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed." });

  const { email, pin } = req.body;
  if (!email?.trim() || !pin?.trim()) {
    return res.status(400).json({ success: false, message: "Email dan PIN wajib diisi." });
  }

  try {
    const { data: found, error } = await supabase
      .from("users")
      .select("id, name, email, mode, kasir_pin_hash")
      .eq("email", email.trim().toLowerCase())
      .eq("mode", "umkm")
      .maybeSingle();

    // Pesan generik disamain antara "email nggak ketemu" dan "PIN salah" — sengaja,
    // biar orang yang asal coba-coba nggak bisa nebak email UMKM mana yang valid.
    if (error || !found || !found.kasir_pin_hash) {
      return res.status(401).json({ success: false, message: "Email atau PIN salah, atau Mode Kasir belum diaktifin buat akun ini." });
    }

    const match = await bcrypt.compare(pin.trim(), found.kasir_pin_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: "Email atau PIN salah." });
    }

    const token = jwt.sign(
      { id: found.id, name: found.name, email: found.email, mode: found.mode, role: "kasir" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error("[kasir-login] error:", err);
    return res.status(500).json({ success: false, message: "Gagal login, coba lagi ya." });
  }
}
