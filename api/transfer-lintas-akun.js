import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyAny(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

// ── Transfer Lintas Akun (Setor Modal / Prive) ──
// Mindahin uang antara akun Personal & akun UMKM milik orang yang sama. Karena
// di database Personal & UMKM itu DUA baris user_id yang beda sama sekali (bukan
// satu akun dengan 2 mode), endpoint ini WAJIB dapet bukti kepemilikan dari
// KEDUA akun sebelum nulis apa-apa — bukan cuma percaya user_id yang dikirim
// dari frontend (itu celah IDOR, orang lain bisa nyuntik user_id sembarangan).
//
// Buktinya: 2 token JWT (yang lagi login = header Authorization, satunya lagi =
// body.targetToken, diambil dari localStorage "finsight_accounts" browser tempat
// switchAccount nyimpen token semua akun yang pernah login di device itu). Server
// verify DUA-DUANYA pakai jwt.verify (bukan cuma decode), terus cross-check email-nya
// sama sebagai lapisan pengaman tambahan (bukan satu-satunya, tapi nambah kepastian).
//
// Transaksi dibikin 2 baris terhubung (ref_id sama, ref_type "cross_mode_transfer"),
// pakai kategori "Modal Usaha" / "Prive Pemilik" yang SENGAJA dikecualikan dari
// perhitungan Omzet/Laba di Laporan (lihat isModalUsaha/isPriveUsaha di storage.js)
// biar laporan keuangan usaha tetap akurat — modal/prive bukan pendapatan/biaya beneran.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed." });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Unauthorized." });
  const sourceDecoded = verifyAny(auth.slice(7));
  if (!sourceDecoded) return res.status(401).json({ success: false, message: "Sesi kamu udah expired, login ulang dulu ya." });

  const { targetToken, arah, amount, kasAsal, kasTujuan, tanggal } = req.body;

  if (!targetToken) {
    return res.status(400).json({ success: false, message: "Akun satunya belum login di device ini. Login dulu ke akun itu (sekali aja, abis itu ke-save otomatis)." });
  }
  if (!arah || !["setor", "prive"].includes(arah)) {
    return res.status(400).json({ success: false, message: "Arah transfer tidak valid." });
  }
  const amt = Number(amount);
  if (!amt || amt <= 0) {
    return res.status(400).json({ success: false, message: "Nominal tidak valid." });
  }
  if (!kasAsal?.trim() || !kasTujuan?.trim()) {
    return res.status(400).json({ success: false, message: "Dompet asal & tujuan wajib diisi." });
  }

  const targetDecoded = verifyAny(targetToken);
  if (!targetDecoded) {
    return res.status(401).json({ success: false, message: "Sesi akun satunya udah expired. Login ulang ke akun itu ya, terus coba lagi." });
  }

  // ── Validasi pasangan akun ──
  if (sourceDecoded.mode === targetDecoded.mode) {
    return res.status(400).json({ success: false, message: "Kedua akun harus beda mode (satu Personal, satu UMKM)." });
  }
  if ((sourceDecoded.email || "").toLowerCase().trim() !== (targetDecoded.email || "").toLowerCase().trim()) {
    return res.status(403).json({ success: false, message: "Email kedua akun beda — transfer nggak diizinkan demi keamanan." });
  }

  const personalDecoded = sourceDecoded.mode === "personal" ? sourceDecoded : targetDecoded;
  const umkmDecoded      = sourceDecoded.mode === "umkm"      ? sourceDecoded : targetDecoded;

  const dateStr = tanggal || new Date().toISOString().slice(0, 10);
  const refId = crypto.randomUUID();

  // arah "setor": Personal -> UMKM (modal masuk usaha). kasAsal = dompet Personal, kasTujuan = dompet UMKM
  // arah "prive": UMKM -> Personal (ambil buat pribadi). kasAsal = dompet UMKM, kasTujuan = dompet Personal
  const rowPersonal = arah === "setor"
    ? { user_id: personalDecoded.id, mode: "personal", type: "pengeluaran", amount: amt, category: "Setor Modal ke Usaha", description: "Setor modal ke usaha", date: dateStr, kas: kasAsal.trim(), ref_id: refId, ref_type: "cross_mode_transfer" }
    : { user_id: personalDecoded.id, mode: "personal", type: "pemasukan", amount: amt, category: "Tarik dari Usaha", description: "Prive dari usaha", date: dateStr, kas: kasTujuan.trim(), ref_id: refId, ref_type: "cross_mode_transfer" };

  const rowUmkm = arah === "setor"
    ? { user_id: umkmDecoded.id, mode: "umkm", type: "pemasukan", amount: amt, category: "Modal Usaha", description: "Modal disetor dari pribadi", date: dateStr, kas: kasTujuan.trim(), ref_id: refId, ref_type: "cross_mode_transfer" }
    : { user_id: umkmDecoded.id, mode: "umkm", type: "pengeluaran", amount: amt, category: "Prive Pemilik", description: "Prive diambil pemilik untuk pribadi", date: dateStr, kas: kasAsal.trim(), ref_id: refId, ref_type: "cross_mode_transfer" };

  try {
    const { data: rowSaved1, error: err1 } = await supabase.from("transactions").insert(rowPersonal).select().single();
    if (err1) throw err1;

    const { data: rowSaved2, error: err2 } = await supabase.from("transactions").insert(rowUmkm).select().single();
    if (err2) {
      // Gagal di sisi kedua -> rollback sisi pertama biar nggak nyangkut sendirian (nggak balance)
      await supabase.from("transactions").delete().eq("id", rowSaved1.id);
      throw err2;
    }

    return res.status(201).json({
      success: true,
      refId,
      personal: rowSaved1,
      umkm: rowSaved2,
    });
  } catch (err) {
    console.error("[transfer-lintas-akun] error:", err);
    return res.status(500).json({ success: false, message: "Gagal memproses transfer, coba lagi ya." });
  }
}
