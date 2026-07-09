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

// Halaman "Utang & Cicilan" — nempel di TargetPage (tab kedua), khusus mode Personal.
// Beda dengan `utang_piutang` (UMKM) yang lump-sum + jatuh tempo sekali: tabel ini
// dikhususkan buat utang BERCICILAN (kartu kredit, KTA, paylater, cicilan barang, dll)
// yang punya tenor & cicilan tetap per bulan.
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
        .from("debts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ success: true, data: data.map(normalize) });
    }

    // ── POST: tambah utang/kredit/paylater baru ─────────────────────────────
    if (req.method === "POST") {
      const { jenis, nama, tanggalMulai, tenor, cicilanPerBulan, totalUtang, tanggalJatuhTempo, dompet, keterangan } = req.body;

      if (!nama || !jenis) {
        return res.status(400).json({ success: false, message: "Nama dan jenis wajib diisi." });
      }
      if (!cicilanPerBulan || Number(cicilanPerBulan) <= 0) {
        return res.status(400).json({ success: false, message: "Cicilan per bulan harus lebih dari 0." });
      }

      const { data, error } = await supabase
        .from("debts")
        .insert({
          user_id:             userId,
          jenis,
          nama,
          tanggal_mulai:       tanggalMulai || null,
          tenor:                tenor || null,
          cicilan_per_bulan:   cicilanPerBulan,
          total_utang:         totalUtang || null,
          terbayar:            0,
          bulan_terbayar:      0,
          tanggal_jatuh_tempo: tanggalJatuhTempo || null,
          dompet:              dompet || null,
          keterangan:          keterangan || "",
          lunas:               false,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data: normalize(data) });
    }

    // ── PUT: edit data ATAU catat pembayaran cicilan (client hitung nilai baru) ─
    if (req.method === "PUT") {
      const { id, ...rest } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "ID wajib diisi." });

      const updates = {};
      if (rest.jenis              !== undefined) updates.jenis               = rest.jenis;
      if (rest.nama                !== undefined) updates.nama                = rest.nama;
      if (rest.tanggalMulai        !== undefined) updates.tanggal_mulai       = rest.tanggalMulai || null;
      if (rest.tenor                !== undefined) updates.tenor               = rest.tenor || null;
      if (rest.cicilanPerBulan    !== undefined) updates.cicilan_per_bulan   = rest.cicilanPerBulan;
      if (rest.totalUtang          !== undefined) updates.total_utang         = rest.totalUtang || null;
      if (rest.terbayar            !== undefined) updates.terbayar            = rest.terbayar;
      if (rest.bulanTerbayar      !== undefined) updates.bulan_terbayar      = rest.bulanTerbayar;
      if (rest.tanggalJatuhTempo !== undefined) updates.tanggal_jatuh_tempo = rest.tanggalJatuhTempo || null;
      if (rest.dompet              !== undefined) updates.dompet              = rest.dompet || null;
      if (rest.keterangan          !== undefined) updates.keterangan          = rest.keterangan || "";
      if (rest.lunas                !== undefined) updates.lunas               = rest.lunas;

      const { data, error } = await supabase
        .from("debts")
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
        .from("debts")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error("[debts] error:", err);
    return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan server." });
  }
}

function normalize(d) {
  return {
    id:                d.id,
    jenis:             d.jenis,
    nama:              d.nama,
    tanggalMulai:      d.tanggal_mulai,
    tenor:             d.tenor,
    cicilanPerBulan:   d.cicilan_per_bulan,
    totalUtang:        d.total_utang,
    terbayar:          d.terbayar,
    bulanTerbayar:     d.bulan_terbayar,
    tanggalJatuhTempo: d.tanggal_jatuh_tempo,
    dompet:            d.dompet,
    keterangan:        d.keterangan,
    lunas:             d.lunas,
    createdAt:         d.created_at,
  };
}
