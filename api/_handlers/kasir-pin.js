import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { rejectIfKasir } from "../_lib/auth-guard.js";

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

// ── Atur PIN Mode Kasir — CUMA owner (token biasa) yang boleh, Mode Kasir sendiri
// nggak boleh ganti PIN-nya sendiri (kalau boleh, gunanya PIN jadi percuma). ──
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: "Unauthorized." });
  if (rejectIfKasir(decoded, res)) return;
  if (decoded.mode !== "umkm") return res.status(403).json({ success: false, message: "Fitur ini cuma buat akun UMKM." });

  try {
    if (req.method === "POST") {
      const { pin } = req.body;
      if (!/^\d{6}$/.test(pin || "")) {
        return res.status(400).json({ success: false, message: "PIN harus 6 digit angka." });
      }
      const kasir_pin_hash = await bcrypt.hash(pin, 12);
      const { error } = await supabase.from("users").update({ kasir_pin_hash }).eq("id", decoded.id);
      if (error) throw error;
      return res.status(200).json({ success: true, message: "PIN Kasir berhasil diatur." });
    }

    if (req.method === "DELETE") {
      // Matiin Mode Kasir — kasir_pin_hash di-null-in, jadi nggak bisa LOGIN PIN lagi
      // mulai sekarang. Catatan: token Kasir yang KEBETULAN masih aktif (belum lewat
      // 12 jam) tetep jalan sampai expired sendiri — sama kayak token biasa, sistem
      // ini nggak ngecek ulang ke database di setiap request, cuma pas login doang.
      const { error } = await supabase.from("users").update({ kasir_pin_hash: null }).eq("id", decoded.id);
      if (error) throw error;
      return res.status(200).json({ success: true, message: "Mode Kasir dimatiin." });
    }

    return res.status(405).json({ success: false, message: "Method not allowed." });
  } catch (err) {
    console.error("[kasir-pin] error:", err);
    return res.status(500).json({ success: false, message: "Gagal menyimpan, coba lagi ya." });
  }
}
