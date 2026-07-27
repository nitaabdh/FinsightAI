// /api/upload-image.js — Vercel Serverless Function
// POST   /api/upload-image?target=produk&id=<produkId>  -> upload foto produk (multipart, field "file")
// DELETE /api/upload-image?target=produk&id=<produkId>  -> hapus foto produk
//
// Endpoint terpisah (bukan digabung ke api/umkm.js) SENGAJA — karena upload
// butuh bodyParser MATI (baca multipart mentah), sedangkan api/umkm.js pakai
// bodyParser default buat semua CRUD JSON-nya. Kalau digabung satu file,
// salah satu bakal rusak. Pola ini niru persis cara api/profile.js upload
// avatar (parseMultipart manual + Supabase Storage).

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;
const PRODUK_FOTO_BUCKET = "produk-foto";

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

// Kasir cuma boleh JUALAN, bukan ngedit katalog produk (termasuk foto-nya).
function isKasirToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return false;
  try { return jwt.verify(token, JWT_SECRET)?.role === "kasir"; }
  catch { return false; }
}

// Parse multipart/form-data secara manual (tanpa multer, ringan utk Vercel) —
// sama persis kayak yang dipakai api/profile.js buat upload avatar.
async function parseMultipart(req) {
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  const buffer = Buffer.concat(buffers);

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error("No boundary found");
  const boundary = "--" + boundaryMatch[1];

  const raw = buffer.toString("binary");
  const parts = raw.split(boundary).filter(p => p.includes("Content-Disposition"));

  for (const part of parts) {
    if (part.includes('name="file"')) {
      const headerEnd = part.indexOf("\r\n\r\n");
      const fileDataBinary = part.slice(headerEnd + 4, part.lastIndexOf("\r\n"));
      return Buffer.from(fileDataBinary, "binary");
    }
  }
  throw new Error("File not found in multipart body");
}

export const config = {
  api: { bodyParser: false }, // perlu raw body utk multipart upload
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (isKasirToken(req)) {
    return res.status(403).json({ success: false, message: "Mode Kasir nggak punya akses ke fitur ini." });
  }

  const { target, id } = req.query;
  if (target !== "produk" || !id) {
    return res.status(400).json({ success: false, message: "Parameter target/id tidak valid." });
  }

  try {
    // Pastiin produk ini beneran punya user yang lagi login (bukan punya orang lain)
    const { data: produkRow, error: findErr } = await supabase
      .from("produk").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (findErr) throw findErr;
    if (!produkRow) return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });

    const filePath = `${userId}/${id}.jpg`;

    if (req.method === "POST") {
      const fileBuffer = await parseMultipart(req);

      const { error: uploadError } = await supabase.storage
        .from(PRODUK_FOTO_BUCKET)
        .upload(filePath, fileBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(PRODUK_FOTO_BUCKET).getPublicUrl(filePath);
      const fotoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust

      const { error: updateErr } = await supabase
        .from("produk")
        .update({ foto_url: fotoUrl })
        .eq("id", id)
        .eq("user_id", userId);
      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true, fotoUrl });
    }

    if (req.method === "DELETE") {
      await supabase.storage.from(PRODUK_FOTO_BUCKET).remove([filePath]);

      const { error: updateErr } = await supabase
        .from("produk")
        .update({ foto_url: null })
        .eq("id", id)
        .eq("user_id", userId);
      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  } catch (err) {
    console.error("[upload-image] error:", err);
    return res.status(500).json({ success: false, message: "Gagal upload foto, coba lagi ya." });
  }
}
