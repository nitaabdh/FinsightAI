// /api/profile.js — Vercel Serverless Function
// GET    /api/profile                      -> ambil profil user
// PUT    /api/profile                      -> update field profil
// POST   /api/profile?action=upload-avatar -> upload foto ke Supabase Storage
// POST   /api/profile?action=delete-avatar -> hapus foto

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role agar bisa write ke storage & tabel
);

const JWT_SECRET = process.env.JWT_SECRET;
const AVATAR_BUCKET = "avatars";

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

// Parse multipart/form-data secara manual (tanpa multer, ringan utk Vercel)
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
      const fileBuffer = Buffer.from(fileDataBinary, "binary");
      return fileBuffer;
    }
  }
  throw new Error("File not found in multipart body");
}

export const config = {
  api: { bodyParser: false }, // perlu raw body utk multipart upload
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { action } = req.query;

  try {
    // ── GET: ambil profil ──
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      // Key Groq TIDAK PERNAH dibalikin ke browser, walau punya sendiri —
      // cuma flag hasApiKey yang dikirim, biar frontend tau harus nampilin
      // form "Masukkan API Key" atau langsung chat.
      let responseData = data;
      if (data) {
        const { groq_api_key, ...rest } = data;
        responseData = { ...rest, hasApiKey: !!groq_api_key };
      }
      return res.status(200).json({ success: true, data: responseData });
    }

    // ── PUT: update field profil ──
    if (req.method === "PUT") {
      const body = await getJsonBody(req);
      const { display_name, profesi, deskripsi, pendapatan, tanggungan, tujuan } = body;

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: userId,
            display_name,
            profesi,
            deskripsi,
            pendapatan,
            tanggungan,
            tujuan,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST save-api-key ── (key Groq disimpan di server, nggak pernah dibalikin ke browser lagi)
    if (req.method === "POST" && action === "save-api-key") {
      const body = await getJsonBody(req);
      const apiKey = (body.apiKey || "").trim();
      if (!apiKey || !apiKey.startsWith("gsk_")) {
        return res.status(400).json({ success: false, message: "Groq API key tidak valid." });
      }

      const { error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, groq_api_key: apiKey, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      return res.status(200).json({ success: true, hasApiKey: true });
    }

    // ── POST clear-api-key ──
    if (req.method === "POST" && action === "clear-api-key") {
      const { error } = await supabase
        .from("profiles")
        .update({ groq_api_key: null, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true, hasApiKey: false });
    }

    // ── POST upload-avatar ──
    if (req.method === "POST" && action === "upload-avatar") {
      const fileBuffer = await parseMultipart(req);
      const filePath = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, fileBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath);

      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, avatar_url: avatarUrl, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST delete-avatar ──
    if (req.method === "POST" && action === "delete-avatar") {
      const filePath = `${userId}/avatar.jpg`;
      await supabase.storage.from(AVATAR_BUCKET).remove([filePath]);

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ success: false, message: "Method not allowed" });
  } catch (err) {
    console.error("Profile API error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
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
