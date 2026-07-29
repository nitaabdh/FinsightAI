import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Rekap Harian Kasir ──
// Buat karyawan kasir cek "pemasukan hari ini" & cetak struk pas tutup toko.
// SENGAJA cuma nyangkut transaksi yang lewat Kasir (ref_type: "penjualan_kasir",
// type: "pemasukan") — BUKAN laporan keuangan penuh punya owner (itu tetep
// diblokir total di /api/laporan lewat rejectIfKasir, dan endpoint ini nggak
// nyentuh situ sama sekali). "Hari ini" pakai tanggal kalender biasa (kolom
// `date` di tabel transactions, format YYYY-MM-DD, sama kayak yang dipakai
// kasir-checkout.js), bukan per sesi login/logout.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, message: "Method not allowed." });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Unauthorized." });
  let decoded;
  try { decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Sesi kamu udah expired, login ulang dulu ya." }); }
  if (decoded.mode !== "umkm") return res.status(403).json({ success: false, message: "Rekap Kasir cuma buat akun UMKM." });

  const userId  = decoded.id;
  const dateStr = (req.query.tanggal || new Date().toISOString().slice(0, 10));

  try {
    // Transaksi PEMASUKAN dari Kasir doang, hari itu doang.
    const { data: txRows, error: txErr } = await supabase
      .from("transactions")
      .select("id, ref_id, amount, kas, date")
      .eq("user_id", userId)
      .eq("ref_type", "penjualan_kasir")
      .eq("type", "pemasukan")
      .eq("date", dateStr);
    if (txErr) throw txErr;

    const totalPemasukan  = (txRows || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const jumlahTransaksi = (txRows || []).length;

    // Breakdown per kas/dompet tujuan — berguna buat cocokin uang fisik pas tutup toko.
    const perKasMap = {};
    for (const t of (txRows || [])) {
      const kasKey = t.kas || "(tanpa kas)";
      perKasMap[kasKey] = (perKasMap[kasKey] || 0) + (Number(t.amount) || 0);
    }
    const perKas = Object.entries(perKasMap).map(([kas, total]) => ({ kas, total }));

    // Breakdown per produk — ambil dari penjualan_items, dicocokin lewat ref_id
    // transaksi pemasukan hari itu (ref_id sama dipakai bareng antara transaksi &
    // breakdown item pas checkout, lihat kasir-checkout.js).
    const refIds = (txRows || []).map(t => t.ref_id).filter(Boolean);
    let perProduk = [];
    if (refIds.length > 0) {
      const { data: itemRows, error: itemErr } = await supabase
        .from("penjualan_items")
        .select("produk_nama, qty, subtotal")
        .eq("user_id", userId)
        .in("ref_id", refIds);
      if (itemErr) throw itemErr;

      const produkMap = {};
      for (const it of (itemRows || [])) {
        const key = it.produk_nama || "(produk dihapus)";
        if (!produkMap[key]) produkMap[key] = { nama: key, qty: 0, subtotal: 0 };
        produkMap[key].qty      += Number(it.qty) || 0;
        produkMap[key].subtotal += Number(it.subtotal) || 0;
      }
      perProduk = Object.values(produkMap).sort((a, b) => b.subtotal - a.subtotal);
    }

    // Template struk (nama toko dll) — sama kayak yang dipake kasir-checkout.js,
    // biar konsisten sama struk per-transaksi yang udah ada.
    const { data: profileRow } = await supabase
      .from("profiles").select("struk_settings, display_name").eq("user_id", userId).maybeSingle();

    return res.status(200).json({
      success: true,
      tanggal: dateStr,
      totalPemasukan,
      jumlahTransaksi,
      perKas,
      perProduk,
      strukSettings: profileRow?.struk_settings || { namaToko: profileRow?.display_name || "Toko Saya" },
      dicetakPada: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[kasir-rekap] error:", err);
    return res.status(500).json({ success: false, message: "Gagal mengambil rekap harian, coba lagi ya." });
  }
}
