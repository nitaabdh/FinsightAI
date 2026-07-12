// /api/telegram.js — Vercel Serverless Function
// GET  /api/telegram                       -> status link (udah connect ke Telegram apa belum)
// POST /api/telegram?action=generate-code  -> generate kode 6 digit (berlaku 5 menit)
// POST /api/telegram?action=unlink         -> putuskan koneksi Telegram

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;

function getUserId(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id || decoded.userId || decoded.sub;
  } catch {
    return null;
  }
}

function genCode() {
  // 6 digit, hindari leading-zero ambigu secara tampilan tapi tetap string
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized." });

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("telegram_links")
        .select("telegram_chat_id, telegram_username, telegram_first_name, linked_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ success: true, linked: !!data, data: data || null });
    }

    if (req.method === "POST" && req.query.action === "generate-code") {
      // Satu user cuma boleh punya 1 kode aktif — hapus kode lama dia dulu (kalau ada) baru bikin baru.
      await supabase.from("telegram_link_codes").delete().eq("user_id", userId);

      let code = genCode();
      // Jaga-jaga kalau kode bentrok sama punya orang lain yang masih aktif (jarang tapi mungkin)
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase.from("telegram_link_codes").select("code").eq("code", code).maybeSingle();
        if (!existing) break;
        code = genCode();
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 menit
      const { error } = await supabase.from("telegram_link_codes").insert({ code, user_id: userId, expires_at: expiresAt });
      if (error) throw error;

      return res.status(200).json({ success: true, code, expiresAt });
    }

    if (req.method === "POST" && req.query.action === "unlink") {
      const { error } = await supabase.from("telegram_links").delete().eq("user_id", userId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method/action tidak dikenal." });
  } catch (err) {
    console.error("[telegram] error:", err);
    return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan server." });
  }
}
