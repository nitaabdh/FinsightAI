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

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("targets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ success: true, data: data.map(normalize) });
    }

    // ── POST: tambah target baru ─────────────────────────────────────────────
    if (req.method === "POST") {
      const { nama, target, terkumpul, deadline, penempatan } = req.body;
      if (!nama || !target) {
        return res.status(400).json({ success: false, message: "Nama dan nominal target wajib diisi." });
      }

      const { data, error } = await supabase
        .from("targets")
        .insert({
          user_id:    userId,
          nama,
          target,
          terkumpul:  terkumpul || 0,
          deadline:   deadline  || null,
          penempatan: penempatan || null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data: normalize(data) });
    }

    // ── PUT: update terkumpul atau data target ───────────────────────────────
    if (req.method === "PUT") {
      const { id, nama, target, terkumpul, deadline, penempatan } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "ID target wajib diisi." });

      const { data, error } = await supabase
        .from("targets")
        .update({ nama, target, terkumpul, deadline, penempatan })
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
      if (!id) return res.status(400).json({ success: false, message: "ID target wajib diisi." });

      const { error } = await supabase
        .from("targets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error("[targets] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}

function normalize(t) {
  return {
    id:         t.id,
    nama:       t.nama,
    target:     t.target,
    terkumpul:  t.terkumpul,
    deadline:   t.deadline,
    penempatan: t.penempatan,
    createdAt:  t.created_at,
  };
}
