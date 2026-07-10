// api/_lib/crypto.js
// Util enkripsi buat data sensitif yang disimpan di database (misal: API key
// pihak ketiga punya user). Pakai AES-256-GCM (built-in Node "crypto", nggak
// perlu tambahan dependency).
//
// PENTING: butuh env var API_KEY_ENCRYPTION_SECRET — 32 byte, dalam bentuk
// base64 ATAU hex. Cara generate cepat (jalanin di terminal lokal):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Simpan hasilnya di Vercel Environment Variables. JANGAN pernah commit ke git,
// dan jangan diganti-ganti setelah ada data yang udah dienkripsi pakai secret itu
// (kalau secret hilang/ganti, semua data yang udah dienkripsi nggak bisa dibuka lagi).

import crypto from "crypto";

const ALGORITHM   = "aes-256-gcm";
const ENC_PREFIX  = "enc:v1:"; // penanda format terenkripsi, biar bisa dibedain dari data lama yg masih plaintext

function getKeyBuffer() {
  const raw = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!raw) {
    throw new Error("API_KEY_ENCRYPTION_SECRET belum diset di environment variables.");
  }
  let buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("API_KEY_ENCRYPTION_SECRET harus persis 32 byte (base64 atau hex).");
  }
  return buf;
}

// Enkripsi teks biasa -> string terenkripsi yang aman disimpan di DB.
export function encryptSecret(plainText) {
  if (!plainText) return null;
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12); // ukuran IV rekomendasi utk GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

// Dekripsi balik ke teks asli. Kalau datanya bukan format terenkripsi (masih
// plaintext dari sebelum fitur ini ada), dikembalikan apa adanya — biar key
// lama yang udah kesimpen nggak langsung rusak/hilang begitu fitur ini di-deploy.
export function decryptSecret(payload) {
  if (!payload) return null;
  if (!payload.startsWith(ENC_PREFIX)) return payload; // backward-compat data lama

  const rest = payload.slice(ENC_PREFIX.length);
  const [ivB64, tagB64, dataB64] = rest.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  const key = getKeyBuffer();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
