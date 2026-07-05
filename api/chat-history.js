// /api/chat-history.js — Vercel Serverless Function
// GET    /api/chat-history?mode=umkm   -> ambil riwayat chat AI Agent user ini
// PUT    /api/chat-history             -> simpan/replace riwayat { mode, displayMsgs, apiMsgs }
// DELETE /api/chat-history?mode=umkm   -> hapus riwayat chat mode itu

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

function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export const config = {
  api: { bodyParser: false },
};

const VALID_MODES = ["umkm", "personal"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const mode = req.query.mode;
      if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }

      const { data, error } = await supabase
        .from("chat_history")
        .select("display_msgs, api_msgs")
        .eq("user_id", userId)
        .eq("mode", mode)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json({
        success: true,
        data: data ? { displayMsgs: data.display_msgs || [], apiMsgs: data.api_msgs || [] } : null,
      });
    }

    // ── PUT: simpan/replace riwayat ─────────────────────────────────────────
    if (req.method === "PUT") {
      const body = await getJsonBody(req);
      const { mode, displayMsgs, apiMsgs } = body;
      if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }

      const { error } = await supabase
        .from("chat_history")
        .upsert(
          {
            user_id: userId,
            mode,
            display_msgs: displayMsgs || [],
            api_msgs: apiMsgs || [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,mode" }
        );

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // ── DELETE: hapus riwayat mode ini ──────────────────────────────────────
    if (req.method === "DELETE") {
      const mode = req.query.mode;
      if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ success: false, message: "Mode tidak valid." });
      }

      const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", userId)
        .eq("mode", mode);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error("[chat-history] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
