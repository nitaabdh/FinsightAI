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
    // ── GET: ambil semua transaksi user ──────────────────────────────────────
    if (req.method === "GET") {
      const mode = req.query.mode;
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false });

      if (mode) query = query.eq("mode", mode);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST: tambah transaksi baru ──────────────────────────────────────────
    if (req.method === "POST") {
      const { mode, type, amount, category, description, date, items, jumlah_unit, produk_id, kas, kas_tujuan } = req.body;

      if (!mode || !type || !amount) {
        return res.status(400).json({ success: false, message: "Field mode, type, amount wajib diisi." });
      }
      if (type === "transfer") {
        if (!kas || !kas_tujuan) {
          return res.status(400).json({ success: false, message: "Transfer wajib punya dompet asal & dompet tujuan." });
        }
        if (kas.trim().toLowerCase() === kas_tujuan.trim().toLowerCase()) {
          return res.status(400).json({ success: false, message: "Dompet asal dan tujuan tidak boleh sama." });
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          mode,
          type,
          amount,
          category,
          description,
          date,
          items: items || [],
          jumlah_unit: jumlah_unit || 1,
          produk_id: produk_id || null,
          kas: mode === "umkm" ? (kas || "Kas Tunai") : null,
          kas_tujuan: mode === "umkm" && type === "transfer" ? kas_tujuan : null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT: edit transaksi ──────────────────────────────────────────────────
    if (req.method === "PUT") {
      const { id, type, amount, category, description, date, items, jumlah_unit, produk_id, kas, kas_tujuan } = req.body;

      if (!id) return res.status(400).json({ success: false, message: "ID transaksi wajib diisi." });
      if (type === "transfer") {
        if (!kas || !kas_tujuan) {
          return res.status(400).json({ success: false, message: "Transfer wajib punya dompet asal & dompet tujuan." });
        }
        if (kas.trim().toLowerCase() === kas_tujuan.trim().toLowerCase()) {
          return res.status(400).json({ success: false, message: "Dompet asal dan tujuan tidak boleh sama." });
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .update({ type, amount, category, description, date, items, jumlah_unit, produk_id, kas, kas_tujuan: type === "transfer" ? kas_tujuan : null })
        .eq("id", id)
        .eq("user_id", userId) // pastikan hanya bisa edit milik sendiri
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE: hapus transaksi ──────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: "ID transaksi wajib diisi." });

      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error("[transactions] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
