import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Kasir Checkout ──
// Terima keranjang (array produk+qty), validasi stok CUKUP dulu buat SEMUA item
// sebelum nulis apa-apa (biar nggak ada yang "kepotong stok" separuh jalan kalau
// ternyata item lain di keranjang nggak cukup), baru eksekusi:
//   1. Racikan TANPA stok jadi -> kurangin BAHAN BAKU langsung sesuai resep x qty
//   2. Racikan PAKAI stok jadi / Beli Jadi Nyetok -> kurangin stok_jadi produk
//   3. Dropship -> nggak ada stok yang dikurangin
// Lalu bikin 1 transaksi Pemasukan (total penjualan), 1 transaksi Pengeluaran kalau
// ada item dropship (total modal ke supplier dropship), dan breakdown per item di
// penjualan_items — semua ditandain ref_id yang sama biar bisa dilacak/dihapus bareng.
//
// Harga jual SELALU diambil dari data produk yang tersimpen di server (produk.hargaJual),
// BUKAN dari angka yang dikirim client — biar nggak bisa dimanipulasi jadi harga asal-asalan
// dari sisi frontend. Yang boleh di-override dari client cuma "hargaModalAktual" per item
// dropship (karena modal dropship emang wajar berubah-ubah tiap transaksi).
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed." });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Unauthorized." });
  let decoded;
  try { decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ success: false, message: "Sesi kamu udah expired, login ulang dulu ya." }); }
  if (decoded.mode !== "umkm") return res.status(403).json({ success: false, message: "Kasir cuma buat akun UMKM." });

  const userId = decoded.id;
  const { items, kas, tanggal } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Keranjang kosong." });
  }
  if (!kas?.trim()) {
    return res.status(400).json({ success: false, message: "Pilih dompet tujuan dulu ya." });
  }
  for (const it of items) {
    if (!it.produkId || !it.qty || Number(it.qty) <= 0) {
      return res.status(400).json({ success: false, message: "Ada item di keranjang yang datanya nggak valid." });
    }
  }

  try {
    // ── Ambil data produk & bahan baku terbaru dari server (bukan percaya cache client) ──
    const produkIds = items.map(it => it.produkId);
    const { data: produkRows, error: pErr } = await supabase
      .from("produk").select("*").eq("user_id", userId).in("id", produkIds);
    if (pErr) throw pErr;
    const produkMap = Object.fromEntries((produkRows || []).map(p => [p.id, p]));

    for (const it of items) {
      if (!produkMap[it.produkId]) {
        return res.status(400).json({ success: false, message: `Produk dengan id ${it.produkId} nggak ketemu.` });
      }
    }

    const { data: bahanRows, error: bErr } = await supabase.from("bahan_baku").select("*").eq("user_id", userId);
    if (bErr) throw bErr;
    const bahanMap = Object.fromEntries((bahanRows || []).map(b => [b.id, b]));

    // ── Konversi satuan (disalin dari umkmCalc.js, sama kayak di telegram-data.js) ──
    const toBaseUnit = (value, unit, isiPerPack = 1) => {
      const v = parseFloat(value) || 0;
      if (unit === "kg" || unit === "liter") return v * 1000;
      if (["pack", "box", "dus", "karton", "rim", "krat", "lusin", "kodi", "gross"].includes(unit)) {
        return v * (parseFloat(isiPerPack) || 1);
      }
      return v;
    };
    const toBaseUnitWithHasil = (value, unit, bahan) => {
      const hasil = parseFloat(bahan?.hasil_per_unit) || 0;
      const v = parseFloat(value) || 0;
      if (hasil > 1) {
        if (unit === (bahan.hasil_label || "hasil")) return v;
        return toBaseUnit(v, unit, bahan?.isi_per_pack || 1) * hasil;
      }
      return toBaseUnit(v, unit, bahan?.isi_per_pack || 1);
    };

    // ── PASS 1: hitung total kebutuhan & validasi stok CUKUP, belum nulis apa-apa ──
    const bahanKebutuhan = {}; // bahanId -> total base unit dibutuhkan
    const stokJadiKebutuhan = {}; // produkId -> total qty dibutuhkan
    let totalPemasukan = 0;
    let totalModalDropship = 0;
    const breakdownItems = [];

    for (const it of items) {
      const produk = produkMap[it.produkId];
      const qty = Number(it.qty);
      const hargaSatuan = Number(produk.harga_jual) || 0; // SELALU dari server, bukan dari client
      const subtotal = hargaSatuan * qty;
      totalPemasukan += subtotal;

      if (produk.tipe_produk === "racikan" && !produk.pakai_stok) {
        for (const resepItem of (produk.items || [])) {
          const bahan = bahanMap[resepItem.bahanId];
          if (!bahan) continue; // bahan udah dihapus, dilewatin (nggak bisa divalidasi, biar nggak nge-block seluruh checkout)
          const perUnitBase = toBaseUnitWithHasil(resepItem.jumlahPakai, resepItem.satuanPakai, bahan);
          bahanKebutuhan[bahan.id] = (bahanKebutuhan[bahan.id] || 0) + perUnitBase * qty;
        }
      } else if (produk.tipe_produk === "racikan" || produk.tipe_produk === "jadi_stok") {
        stokJadiKebutuhan[produk.id] = (stokJadiKebutuhan[produk.id] || 0) + qty;
      } else if (produk.tipe_produk === "jadi_dropship") {
        const modalAktual = it.hargaModalAktual !== undefined ? Number(it.hargaModalAktual) : Number(produk.harga_modal || 0);
        totalModalDropship += modalAktual * qty;
      }

      breakdownItems.push({
        id: crypto.randomUUID(),
        user_id: userId,
        produk_id: produk.id,
        produk_nama: produk.nama,
        tipe_produk: produk.tipe_produk,
        qty,
        harga_satuan: hargaSatuan,
        subtotal,
      });
    }

    // Validasi bahan baku cukup
    for (const [bahanId, needed] of Object.entries(bahanKebutuhan)) {
      const bahan = bahanMap[bahanId];
      const stokAda = parseFloat(bahan?.stok) || 0;
      if (needed > stokAda) {
        return res.status(400).json({
          success: false,
          message: `Stok "${bahan?.nama || "bahan"}" nggak cukup. Butuh ${needed}, sisa cuma ${stokAda} ${bahan?.hasil_label || bahan?.satuan_beli || ""}.`,
        });
      }
    }
    // Validasi stok jadi cukup
    for (const [produkId, needed] of Object.entries(stokJadiKebutuhan)) {
      const produk = produkMap[produkId];
      const stokAda = parseFloat(produk.stok_jadi) || 0;
      if (needed > stokAda) {
        return res.status(400).json({
          success: false,
          message: `Stok "${produk.nama}" nggak cukup. Butuh ${needed}, sisa cuma ${stokAda}.`,
        });
      }
    }

    // ── PASS 2: semua valid, baru eksekusi tulis data. Lacak apa yang udah kesave
    // biar bisa di-rollback best-effort kalau ada langkah belakangan yang gagal. ──
    const rollbacks = [];
    const dateStr = tanggal || new Date().toISOString().slice(0, 10);
    const refId = crypto.randomUUID();

    try {
      // Kurangin bahan baku + catet histori
      for (const [bahanId, used] of Object.entries(bahanKebutuhan)) {
        const bahan = bahanMap[bahanId];
        const stokBaru = (parseFloat(bahan.stok) || 0) - used;
        const { error } = await supabase.from("bahan_baku").update({ stok: stokBaru }).eq("id", bahanId);
        if (error) throw error;
        rollbacks.push(async () => { await supabase.from("bahan_baku").update({ stok: bahan.stok }).eq("id", bahanId); });
        await supabase.from("stok_history").insert({
          id: crypto.randomUUID(), user_id: userId, bahan_id: bahanId, tipe: "kurang", sumber: "penjualan",
          jumlah: used, satuan_label: bahan.hasil_label || bahan.satuan_beli || "", transaksi_id: refId,
        });
      }

      // Kurangin stok jadi produk + catet histori
      for (const [produkId, used] of Object.entries(stokJadiKebutuhan)) {
        const produk = produkMap[produkId];
        const stokBaru = (parseFloat(produk.stok_jadi) || 0) - used;
        const { error } = await supabase.from("produk").update({ stok_jadi: stokBaru }).eq("id", produkId);
        if (error) throw error;
        rollbacks.push(async () => { await supabase.from("produk").update({ stok_jadi: produk.stok_jadi }).eq("id", produkId); });
        await supabase.from("stok_history").insert({
          id: crypto.randomUUID(), user_id: userId, produk_id: produkId, tipe: "kurang", sumber: "penjualan",
          jumlah: used, satuan_label: "unit", transaksi_id: refId,
        });
      }

      // Transaksi Pemasukan (total penjualan)
      const { data: txMasuk, error: txErr } = await supabase.from("transactions").insert({
        id: crypto.randomUUID(), user_id: userId, mode: "umkm", type: "pemasukan",
        amount: totalPemasukan, category: "Penjualan Produk", description: "Penjualan via Kasir",
        date: dateStr, kas: kas.trim(), ref_id: refId, ref_type: "penjualan_kasir",
      }).select().single();
      if (txErr) throw txErr;
      rollbacks.push(async () => { await supabase.from("transactions").delete().eq("id", txMasuk.id); });

      // Transaksi Pengeluaran (modal dropship, kalau ada)
      if (totalModalDropship > 0) {
        const { data: txKeluar, error: txErr2 } = await supabase.from("transactions").insert({
          id: crypto.randomUUID(), user_id: userId, mode: "umkm", type: "pengeluaran",
          amount: totalModalDropship, category: "Modal Dropship", description: "Modal ke supplier dropship (via Kasir)",
          date: dateStr, kas: kas.trim(), ref_id: refId, ref_type: "penjualan_kasir",
        }).select().single();
        if (txErr2) throw txErr2;
        rollbacks.push(async () => { await supabase.from("transactions").delete().eq("id", txKeluar.id); });
      }

      // Breakdown item penjualan
      const breakdownWithRef = breakdownItems.map(it => ({ ...it, ref_id: refId }));
      const { error: biErr } = await supabase.from("penjualan_items").insert(breakdownWithRef);
      if (biErr) throw biErr;

      // Ambil template struk (nama toko, alamat, footer) buat langsung dipakai
      // nge-print struk abis checkout — diambil di sini (bukan lewat /api/profile)
      // soalnya /api/profile diblokir buat token Mode Kasir (lihat auth-guard.js),
      // dan struk emang perlu bisa diprint langsung dari sesi Kasir juga.
      const { data: profileRow } = await supabase
        .from("profiles").select("struk_settings, display_name").eq("user_id", userId).maybeSingle();

      return res.status(201).json({
        success: true,
        refId,
        totalPemasukan,
        totalModalDropship,
        itemCount: items.length,
        items: breakdownWithRef.map(it => ({
          produkNama: it.produk_nama, tipeProduk: it.tipe_produk,
          qty: it.qty, hargaSatuan: it.harga_satuan, subtotal: it.subtotal,
        })),
        strukSettings: profileRow?.struk_settings || { namaToko: profileRow?.display_name || "Toko Saya" },
        tanggal: dateStr,
      });
    } catch (writeErr) {
      // Rollback best-effort — urutan kebalik dari yang kesave
      for (const rb of rollbacks.reverse()) {
        try { await rb(); } catch (rbErr) { console.error("[kasir-checkout] rollback gagal:", rbErr); }
      }
      throw writeErr;
    }
  } catch (err) {
    console.error("[kasir-checkout] error:", err);
    return res.status(500).json({ success: false, message: "Gagal memproses checkout, coba lagi ya." });
  }
}
