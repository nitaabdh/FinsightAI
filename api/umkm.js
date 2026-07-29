import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { isKasirRole } from "./_lib/auth-guard.js";

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

const VALID_TABLES = ["bahan_baku", "produk", "aset_usaha", "utang_piutang", "biaya_operasional", "stok_history", "supplier", "dompet", "penjualan_items"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ success: false, message: "Unauthorized." });

  const userId = decoded.id;
  const table  = req.query.table;

  if (!VALID_TABLES.includes(table)) {
    return res.status(400).json({ success: false, message: `Table tidak valid. Pilih: ${VALID_TABLES.join(", ")}` });
  }

  // Mode Kasir CUMA boleh GET produk (buat grid) & dompet (buat pilihan checkout) —
  // nggak boleh liat/ubah bahan baku, aset, biaya, supplier, dst, dan nggak boleh
  // POST/PUT/DELETE apapun lewat sini sama sekali (checkout lewat kasir-checkout.js).
  if (isKasirRole(decoded)) {
    const allowedGet = req.method === "GET" && (table === "produk" || table === "dompet");
    if (!allowedGet) {
      return res.status(403).json({ success: false, message: "Mode Kasir nggak punya akses ke fitur ini." });
    }
  }

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      let query = supabase
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      // Riwayat stok difilter per bahan ATAU per produk (buat halaman detail bahan baku,
      // atau nanti histori stok jadi per produk).
      if (table === "stok_history" && req.query.bahanId) {
        query = query.eq("bahan_id", req.query.bahanId);
      }
      if (table === "stok_history" && req.query.produkId) {
        query = query.eq("produk_id", req.query.produkId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data: data.map(r => normalize(r, table)) });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const payload = buildPayload(req.body, table, userId);
      if (!payload) return res.status(400).json({ success: false, message: "Data tidak lengkap." });

      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data: normalize(data, table) });
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (req.method === "PUT") {
      const { id, ...rest } = req.body;
      if (!id) return res.status(400).json({ success: false, message: "ID wajib diisi." });

      const updates = buildPayload(rest, table, userId, true);
      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data: normalize(data, table) });
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
    console.error(`[umkm/${table}] error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan server." });
  }
}

// ── Build payload per tabel ───────────────────────────────────────────────────
function buildPayload(body, table, userId, isUpdate = false) {
  const base = isUpdate ? {} : { id: body.id, user_id: userId };

  if (table === "bahan_baku") {
    const payload = {
      ...base,
      nama:          body.nama,
      harga_beli:    body.hargaBeli,
      jumlah_beli:   body.jumlahBeli,
      satuan_beli:   body.satuanBeli,
      isi_per_pack:  body.isiPerPack ?? null,
      satuan_unit:   body.satuanUnit ?? null,
      hasil_per_unit: body.hasilPerUnit ?? null,
      hasil_label:    body.hasilLabel ?? null,
    };
    // Stok cuma ditulis kalau memang dikirim eksplisit (tambah baru / restock).
    // Edit koreksi data (nama/harga/dll) TIDAK boleh menyentuh stok sama sekali.
    if (!isUpdate) {
      payload.stok = body.stok ?? 0;
    } else if (body.stok !== undefined) {
      payload.stok = body.stok;
    }
    return payload;
  }

  if (table === "produk") {
    const payload = {
      ...base,
      nama:              body.nama,
      items:             body.items || [],
      ops_items:         body.biayaOperasionalItems || [],
      biaya_operasional: body.biayaOperasional || 0,
      target_untung:     body.targetUntung || 0,
      biaya_bahan:       body.biayaBahan || 0,
      total_biaya:       body.totalBiaya || 0,
      harga_jual:        body.hargaJual || 0,
    };
    // harga_online cuma ditulis kalau memang dikirim eksplisit (dari tab Kalkulator Online).
    // Edit resep/harga dari Kalkulator Harga TIDAK ngirim field ini — kalau selalu ditulis
    // dengan fallback 0, harga online yang udah kesimpen bakal ke-reset tiap kali resep diedit.
    if (!isUpdate) {
      payload.harga_online = body.hargaOnline ?? 0;
    } else if (body.hargaOnline !== undefined) {
      payload.harga_online = body.hargaOnline;
    }
    // online_fee_rows — rincian potongan (nama, tipe %/Rp, nilai) yang dipakai buat ngitung
    // harga_online. Sama kayak harga_online, cuma ditulis kalau dikirim eksplisit, biar nggak
    // ke-reset kalau produk diedit dari tempat lain yang nggak nyentuh bagian online sama sekali.
    if (!isUpdate) {
      payload.online_fee_rows = body.onlineFeeRows ?? [];
    } else if (body.onlineFeeRows !== undefined) {
      payload.online_fee_rows = body.onlineFeeRows;
    }
    // tipe_produk cuma ditulis pas BIKIN BARU — sengaja nggak dibiarin ganti pas edit
    // (lihat catatan di KalkulatorHarga.jsx: ganti tipe produk yang udah ada bisa bikin
    // data stok/resep nggak konsisten, jadi UI-nya emang nggak ngasih opsi ganti tipe).
    if (!isUpdate) {
      payload.tipe_produk = body.tipeProduk || "racikan";
    }
    // pakai_stok cuma relevan buat tipe "racikan" (nentuin produksi nambah stok_jadi
    // apa nggak) — tapi tetep ditulis apa adanya kalau dikirim, biar konsisten.
    if (body.pakaiStok !== undefined) {
      payload.pakai_stok = body.pakaiStok;
    }
    // stok_jadi & harga_modal SENGAJA nggak ditulis fallback 0 pas update biasa dari
    // form Kalkulator Harga (form itu nggak ngirim field ini) — biar nggak ke-reset ke 0
    // tiap kali resep/harga diedit. Cuma ditulis kalau eksplisit dikirim (dari aksi
    // Produksi/Restock di Fase 2, atau checkout Kasir yang ngurangin stok_jadi).
    if (!isUpdate) {
      payload.stok_jadi = body.stokJadi ?? 0;
    } else if (body.stokJadi !== undefined) {
      payload.stok_jadi = body.stokJadi;
    }
    if (!isUpdate) {
      payload.harga_modal = body.hargaModal ?? 0;
    } else if (body.hargaModal !== undefined) {
      payload.harga_modal = body.hargaModal;
    }
    // foto_url biasanya diisi lewat /api/upload-image (bukan dari form ini), tapi
    // tetep didukung di sini jaga-jaga kalau mau di-clear manual (kirim null/"").
    if (body.fotoUrl !== undefined) {
      payload.foto_url = body.fotoUrl || null;
    }
    // tampil_di_kasir — nentuin produk ini muncul di grid Kasir apa nggak.
    // Default true pas bikin baru (biar behavior lama nggak berubah), boleh diubah
    // kapan aja pas edit.
    if (!isUpdate) {
      payload.tampil_di_kasir = body.tampilDiKasir ?? true;
    } else if (body.tampilDiKasir !== undefined) {
      payload.tampil_di_kasir = body.tampilDiKasir;
    }
    return payload;
  }

  if (table === "biaya_operasional") {
    return {
      ...base,
      nama:  body.nama,
      biaya: body.biaya,
    };
  }

  if (table === "stok_history") {
    return {
      ...base,
      bahan_id:     body.bahanId || null,
      produk_id:    body.produkId || null,
      tipe:         body.tipe,          // "tambah" | "kurang"
      sumber:       body.sumber,        // "manual_tambah" | "manual_kurang_rusak" | "manual_kurang_sample" | "manual_kurang_lain" | "transaksi" | "produksi" | "manual_tambah_jadi" | "penjualan"
      jumlah:       body.jumlah,
      satuan_label: body.satuanLabel,
      alasan:       body.alasan || null,
      transaksi_id: body.transaksiId || null,
      supplier_id:  body.supplierId || null,
    };
  }

  // penjualan_items — breakdown per item yang kejual dari Kasir (Fase 2), disimpen
  // di sini duluan (Fase 1) biar skemanya siap. ref_id nyambungin ke transaksi
  // pemasukan yang otomatis kebentuk pas checkout.
  if (table === "penjualan_items") {
    return {
      ...base,
      ref_id:       body.refId,
      produk_id:    body.produkId || null,
      produk_nama:  body.produkNama,
      tipe_produk:  body.tipeProduk,
      qty:          body.qty,
      harga_satuan: body.hargaSatuan,
      subtotal:     body.subtotal,
    };
  }

  if (table === "aset_usaha") {
    return {
      ...base,
      nama:         body.nama,
      kategori:     body.kategori,
      tanggal_beli: body.tanggalBeli,
      harga_beli:   body.hargaBeli,
      kondisi:      body.kondisi || "baik",
      catatan:      body.catatan || "",
    };
  }

  if (table === "utang_piutang") {
    return {
      ...base,
      jenis:       body.jenis,
      nama:        body.nama,
      nominal:     body.nominal,
      jatuh_tempo: body.jatuhTempo || null,
      catatan:     body.catatan || "",
      lunas:       body.lunas || false,
    };
  }

  if (table === "supplier") {
    return {
      ...base,
      nama:             body.nama,
      kontak_wa:        body.kontakWa || "",
      link_marketplace: body.linkMarketplace || "",
      kategori:         body.kategori || "",
      catatan:          body.catatan || "",
    };
  }

  if (table === "dompet") {
    return {
      ...base,
      nama:    body.nama,
      jenis:   body.jenis || "Lainnya", // Tunai / Bank / E-Wallet / QRIS / Lainnya — buat pilih ikon
      catatan: body.catatan || "",
    };
  }

  return null;
}

// ── Normalize snake_case → camelCase ─────────────────────────────────────────
function normalize(row, table) {
  const base = { id: row.id, createdAt: row.created_at };

  if (table === "bahan_baku") {
    return { ...base, nama: row.nama, hargaBeli: row.harga_beli, jumlahBeli: row.jumlah_beli, satuanBeli: row.satuan_beli, isiPerPack: row.isi_per_pack, satuanUnit: row.satuan_unit, hasilPerUnit: row.hasil_per_unit, hasilLabel: row.hasil_label, stok: row.stok };
  }

  if (table === "produk") {
    return { ...base, nama: row.nama, items: row.items || [], biayaOperasionalItems: row.ops_items || [], biayaOperasional: row.biaya_operasional, targetUntung: row.target_untung, biayaBahan: row.biaya_bahan, totalBiaya: row.total_biaya, hargaJual: row.harga_jual, hargaOnline: row.harga_online || 0, onlineFeeRows: row.online_fee_rows || [], tipeProduk: row.tipe_produk || "racikan", pakaiStok: row.pakai_stok || false, stokJadi: row.stok_jadi || 0, hargaModal: row.harga_modal || 0, fotoUrl: row.foto_url || null, tampilDiKasir: row.tampil_di_kasir !== false };
  }

  if (table === "biaya_operasional") {
    return { ...base, nama: row.nama, biaya: row.biaya };
  }

  if (table === "stok_history") {
    return {
      ...base,
      bahanId:     row.bahan_id,
      produkId:    row.produk_id,
      tipe:        row.tipe,
      sumber:      row.sumber,
      jumlah:      row.jumlah,
      satuanLabel: row.satuan_label,
      alasan:      row.alasan,
      transaksiId: row.transaksi_id,
      supplierId:  row.supplier_id,
    };
  }

  if (table === "penjualan_items") {
    return {
      ...base,
      refId:       row.ref_id,
      produkId:    row.produk_id,
      produkNama:  row.produk_nama,
      tipeProduk:  row.tipe_produk,
      qty:         row.qty,
      hargaSatuan: row.harga_satuan,
      subtotal:    row.subtotal,
    };
  }

  if (table === "aset_usaha") {
    return { ...base, nama: row.nama, kategori: row.kategori, tanggalBeli: row.tanggal_beli, hargaBeli: row.harga_beli, kondisi: row.kondisi, catatan: row.catatan };
  }

  if (table === "utang_piutang") {
    return { ...base, jenis: row.jenis, nama: row.nama, nominal: row.nominal, jatuhTempo: row.jatuh_tempo, catatan: row.catatan, lunas: row.lunas };
  }

  if (table === "supplier") {
    return { ...base, nama: row.nama, kontakWa: row.kontak_wa, linkMarketplace: row.link_marketplace, kategori: row.kategori, catatan: row.catatan };
  }

  if (table === "dompet") {
    return { ...base, nama: row.nama, jenis: row.jenis, catatan: row.catatan };
  }

  return row;
}
