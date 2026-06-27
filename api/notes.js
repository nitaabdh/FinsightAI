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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: "Unauthorized." });

  const userId = decoded.id;

  // `table` query param menentukan tabel mana: "cal_notes" atau "notes"
  const table = req.query.table;
  if (!["cal_notes", "notes"].includes(table)) {
    return res.status(400).json({ success: false, message: "Query param 'table' harus 'cal_notes' atau 'notes'." });
  }

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const mode = req.query.mode;
      let query = supabase
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: table === "notes" ? false : true });

      if (mode) query = query.eq("mode", mode);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data: data.map(normalize) });
    }

    // ── POST: tambah baru ────────────────────────────────────────────────────
    if (req.method === "POST") {
      const { id, mode, title, body, category, color, date } = req.body;

      if (!title || !mode) {
        return res.status(400).json({ success: false, message: "Field title dan mode wajib diisi." });
      }

      const payload = {
        id,       // pakai id dari client (genId()) supaya konsisten
        user_id:  userId,
        mode,
        title,
        body:     body || "",
        category: category || "umum",
        ...(table === "cal_notes" ? { date } : { color: color || "yellow" }),
      };

      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data: normalize(data) });
    }

    // ── PUT: update ──────────────────────────────────────────────────────────
    if (req.method === "PUT") {
      const { id, title, body, category, color, date } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "ID wajib diisi." });

      const updates = {
        title,
        body:       body || "",
        category,
        updated_at: new Date().toISOString(),
        ...(table === "cal_notes" ? { date } : { color }),
      };

      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data: normalize(data) });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: "ID wajib diisi." });

      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error(`[${table}] error:`, err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}

function normalize(n) {
  return {
    id:        n.id,
    mode:      n.mode,
    title:     n.title,
    body:      n.body || "",
    category:  n.category,
    color:     n.color   || undefined,
    date:      n.date    || undefined,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}
