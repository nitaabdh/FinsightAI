// ─── Shared storage & util: Kalkulator Harga Jual + Stok UMKM ───────────────
// Dipakai oleh: BahanBaku.jsx, KalkulatorHarga.jsx, TransactionForm.jsx, TransaksiPage.jsx

// ── Storage keys ─────────────────────────────────────────────────────────────
export const BAHAN_KEY  = (uid) => `finsight_bahan_${uid}`;
export const PRODUK_KEY = (uid) => `finsight_produk_${uid}`;
export const ASET_KEY = (uid) => `finsight_asetUsaha_${uid}`;
export const genId    = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ── Satuan & konversi ─────────────────────────────────────────────────────────
// Base internal: gram (berat), ml (volume), pcs (satuan).
// `stok` bahan SELALU disimpan dalam base unit supaya konversi konsisten.
export const UNIT_GROUPS = {
  berat:   { base: "gram", units: ["kg", "gram"] },
  volume:  { base: "ml",   units: ["liter", "ml"] },
  pcs:     { base: "pcs",  units: ["pcs"] },
  // Satuan kemasan: 1 pack/dus/karton/box/lusin bisa berisi N unit terkecil
  // isiPerPack disimpan di data bahan, bukan di sini
  pack:    { base: "pcs",  units: ["pcs", "pack"] },
  lembar:  { base: "lembar", units: ["lembar", "rim", "pack"] },
  botol:   { base: "botol",  units: ["botol", "karton", "dus", "krat"] },
  sachet:  { base: "sachet", units: ["sachet", "box", "dus"] },
  buah:    { base: "buah",   units: ["buah", "lusin", "kodi", "gross", "karton"] },
};

export const unitGroupOf = (unit) => {
  if (unit === "kg" || unit === "gram")                          return "berat";
  if (unit === "liter" || unit === "ml")                         return "volume";
  if (unit === "lembar" || unit === "rim")                       return "lembar";
  if (unit === "botol" || unit === "krat")                       return "botol";
  if (unit === "sachet")                                         return "sachet";
  if (unit === "buah" || unit === "lusin" || unit === "kodi" || unit === "gross") return "buah";
  if (unit === "pack" || unit === "box" || unit === "dus" || unit === "karton") return "pack";
  return "pcs";
};

// Satuan yang valid untuk dipakai di resep, sesuai grup bahan
export const validUsageUnits = (satuanBeli, satuanUnit) => {
  // Kalau bahan pakai sistem pack (ada satuanUnit), unit resep = satuanUnit itu
  if (satuanUnit) return [satuanUnit];
  const g = unitGroupOf(satuanBeli);
  return UNIT_GROUPS[g]?.units || ["pcs"];
};

// Konversi angka ke base unit (gram / ml / pcs / unit-terkecil)
// Untuk satuan kemasan (pack/dus/karton/dll), base = satuanUnit (pcs/lembar/botol/dll)
export const toBase = (value, unit, isiPerPack = 1) => {
  const v = parseFloat(value) || 0;
  if (unit === "kg" || unit === "liter") return v * 1000;
  // Satuan kemasan → kalikan isi per kemasan
  if (["pack", "box", "dus", "karton", "rim", "krat", "lusin", "kodi", "gross"].includes(unit)) {
    return v * (parseFloat(isiPerPack) || 1);
  }
  return v;
};

// Konversi dari base unit kembali ke satuan display (untuk tampil di UI)
export const fromBase = (valueBase, unit, isiPerPack = 1) => {
  if (unit === "kg" || unit === "liter") return valueBase / 1000;
  if (["pack", "box", "dus", "karton", "rim", "krat", "lusin", "kodi", "gross"].includes(unit)) {
    return valueBase / (parseFloat(isiPerPack) || 1);
  }
  return valueBase;
};

// Label display satuan base per grup
export const baseUnitLabel = (bahan) => {
  if (typeof bahan === "string") {
    // backward compat: dipanggil dengan satuanBeli string saja
    const g = unitGroupOf(bahan);
    if (g === "berat")  return "gram";
    if (g === "volume") return "ml";
    return "pcs";
  }
  if (bahan.satuanUnit) return bahan.satuanUnit;
  const g = unitGroupOf(bahan.satuanBeli);
  if (g === "berat")  return "gram";
  if (g === "volume") return "ml";
  return bahan.satuanBeli || "pcs";
};

// Display stok dalam satuan terkecil (lebih natural untuk user)
export const stokDisplay = (bahan) => {
  const base = parseFloat(bahan.stok) || 0;
  if (bahan.satuanUnit) {
    // Kemasan: stok sudah dalam unit terkecil
    return `${parseFloat(base.toFixed(4))} ${bahan.satuanUnit}`;
  }
  const display   = fromBase(base, bahan.satuanBeli, parseFloat(bahan.isiPerPack) || 1);
  const formatted = parseFloat(display.toFixed(4)).toString();
  return `${formatted} ${bahan.satuanBeli}`;
};
// Harga beli per base unit (Rp/gram, Rp/ml, Rp/pcs, Rp/lembar, dll)
// Untuk kemasan: hargaBeli / (jumlahBeli × isiPerPack)
export const hargaPerBase = (bahan) => {
  const isi  = parseFloat(bahan.isiPerPack) || 1;
  const base = toBase(bahan.jumlahBeli, bahan.satuanBeli, isi);
  if (base <= 0) return 0;
  return (parseFloat(bahan.hargaBeli) || 0) / base;
};

// Biaya pemakaian satu baris resep (bahan + jumlah pakai) → Rupiah
export const biayaItem = (bahan, jumlahPakai, satuanPakai) => {
  // Untuk bahan kemasan, satuanPakai = satuanUnit (unit terkecil), toBase = 1×jumlahPakai
  return hargaPerBase(bahan) * toBase(jumlahPakai, satuanPakai, parseFloat(bahan.isiPerPack) || 1);
};

// Total biaya bahan resep produk
export const totalBiayaBahan = (items, bahanMap) =>
  items.reduce((sum, it) => {
    const b = bahanMap[it.bahanId];
    return b ? sum + biayaItem(b, it.jumlahPakai, it.satuanPakai) : sum;
  }, 0);

// ── Stok ──────────────────────────────────────────────────────────────────────
// Stok disimpan dalam BASE UNIT (gram/ml/pcs), bukan satuan beli.
// Ini supaya pengurangan dari resep (jumlahPakai dalam satuan sembarang) tinggal toBase() langsung.

// Nilai stok estimasi (Rp)
export const nilaiStok = (bahan) => hargaPerBase(bahan) * (parseFloat(bahan.stok) || 0);

// Display stok dalam satuan beli (lebih natural untuk user)
export const stokDisplay = (bahan) => {
  const base = parseFloat(bahan.stok) || 0;
  const satuan = bahan.satuanBeli;
  const display = fromBase(base, satuan);
  // Format angka: buang desimal berlebih
  const formatted = parseFloat(display.toFixed(4)).toString();
  return `${formatted} ${satuan}`;
};

// Apakah stok cukup untuk memenuhi satu resep × jumlahUnit?
export const cekKecukupanStok = (items, bahanList, jumlahUnit) => {
  const bahanMap = Object.fromEntries(bahanList.map((b) => [b.id, b]));
  return items.map((it) => {
    const b = bahanMap[it.bahanId];
    if (!b) return { bahanId: it.bahanId, nama: "(dihapus)", cukup: false, stokAda: 0, butuh: 0 };
    const butuhBase = toBase(it.jumlahPakai, it.satuanPakai) * jumlahUnit;
    const stokBase  = parseFloat(b.stok) || 0;
    return {
      bahanId: it.bahanId,
      nama:    b.nama,
      cukup:   stokBase >= butuhBase,
      stokAda: stokBase,
      butuh:   butuhBase,
      satuan:  baseUnitLabel(b.satuanBeli),
    };
  });
};

// Kurangi / tambah stok bahan sesuai resep × jumlahUnit
// arah: -1 = kurangi (transaksi tersimpan), +1 = kembalikan (transaksi dihapus/rollback)
export const applyStokDelta = (bahanList, items, jumlahUnit, arah) =>
  bahanList.map((b) => {
    const it = items.find((i) => i.bahanId === b.id);
    if (!it) return b;
    const delta = toBase(it.jumlahPakai, it.satuanPakai) * jumlahUnit * arah;
    return { ...b, stok: (parseFloat(b.stok) || 0) + delta };
  });

// ── Format ────────────────────────────────────────────────────────────────────
export const formatRupiah = (num) =>
  "Rp" + (parseFloat(num) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });

export const formatAngka = (num, maxDec = 4) =>
  parseFloat((parseFloat(num) || 0).toFixed(maxDec)).toLocaleString("id-ID");

// ── Utang-Piutang: hitung selisih hari ke jatuh tempo ──────────────────────────
// Timezone-safe: bandingkan tanggal kalender (Y-M-D lokal), bukan timestamp absolut,
// supaya "hari ini" konsisten berapa pun jam saat ini dieksekusi (lihat catatan bug WIB sebelumnya).
export const selisihHari = (tanggalJatuhTempo) => {
  if (!tanggalJatuhTempo) return null;
  const today = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [y, m, d] = tanggalJatuhTempo.split("-").map(Number);
  const dueLocal = new Date(y, m - 1, d);

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((dueLocal - todayLocal) / msPerDay);
};

// Label badge untuk reminder jatuh tempo: { text, status }
// status: "lewat" | "hariIni" | "mendekati" | "aman"
export const labelJatuhTempo = (tanggalJatuhTempo) => {
  const selisih = selisihHari(tanggalJatuhTempo);
  if (selisih === null) return { text: "", status: "aman", selisih: null };
  if (selisih < 0)  return { text: `Lewat ${Math.abs(selisih)} hari`, status: "lewat", selisih };
  if (selisih === 0) return { text: "Jatuh tempo hari ini", status: "hariIni", selisih };
  return { text: `${selisih} hari lagi`, status: "mendekati", selisih };
};

// ── Break-Even Point ──────────────────────────────────────────────────────────
// Biaya variabel per unit suatu produk = biaya bahan + biaya operasional per unit
// (target untung TIDAK dihitung sebagai biaya, karena itu margin, bukan cost).
export const biayaVariabelPerUnit = (produk) => produk.biayaBahan + produk.biayaOperasional;

// Margin kontribusi per unit = Harga Jual − Biaya Variabel per unit
export const marginKontribusi = (produk) => produk.hargaJual - biayaVariabelPerUnit(produk);

// ── Mode Per Produk ──────────────────────────────────────────────────────────
// BEP (unit) = Biaya Tetap ÷ Margin Kontribusi per unit
// Mengembalikan null kalau margin kontribusi ≤ 0 (harga jual tidak menutup biaya variabel,
// BEP tidak akan pernah tercapai berapa pun unit terjual).
export const hitungBEPProduk = (produk, biayaTetap) => {
  const margin = marginKontribusi(produk);
  if (margin <= 0) return { bepUnit: null, margin, valid: false };
  const bepUnit = biayaTetap / margin;
  return { bepUnit, margin, valid: true };
};

// ── Mode Gabungan ────────────────────────────────────────────────────────────
// Asumsi: proporsi penjualan (sales mix) sama rata antar produk yang dipilih.
// BEP (Rp) = Biaya Tetap ÷ Rasio Margin Kontribusi Gabungan
//   Rasio Margin Kontribusi Gabungan = Total Margin Kontribusi (bobot rata) ÷ Total Harga Jual (bobot rata)
// BEP (unit gabungan, estimasi) = Biaya Tetap ÷ Rata-rata Margin Kontribusi per unit
export const hitungBEPGabungan = (produkList, biayaTetap) => {
  if (produkList.length === 0) return { bepRupiah: null, bepUnitEstimasi: null, valid: false, rasioMargin: 0 };

  const n = produkList.length;
  const totalMargin    = produkList.reduce((s, p) => s + marginKontribusi(p), 0);
  const totalHargaJual = produkList.reduce((s, p) => s + p.hargaJual, 0);
  const rataMargin      = totalMargin / n;
  const rasioMargin      = totalHargaJual > 0 ? totalMargin / totalHargaJual : 0;

  if (rasioMargin <= 0 || rataMargin <= 0) {
    return { bepRupiah: null, bepUnitEstimasi: null, valid: false, rasioMargin };
  }

  const bepRupiah       = biayaTetap / rasioMargin;
  const bepUnitEstimasi = biayaTetap / rataMargin;

  return { bepRupiah, bepUnitEstimasi, valid: true, rasioMargin, rataMargin };
};

// Data titik-titik grafik garis BEP: biaya total vs pendapatan, sumbu X = jumlah unit
// hargaJualEfektif & biayaVariabelEfektif: untuk mode produk tunggal pakai nilai aslinya;
// untuk mode gabungan pakai rata-rata tertimbang (hargaJual rata & biaya variabel rata).
export const dataGrafikBEP = (hargaJualEfektif, biayaVariabelEfektif, biayaTetap, bepUnit) => {
  if (!bepUnit || bepUnit <= 0 || !isFinite(bepUnit)) return [];
  // Rentang grafik: 0 sampai 2x BEP (atau minimal 10 unit), dibagi 10 titik supaya garis halus
  const maxUnit = Math.max(Math.ceil(bepUnit * 2), 10);
  const step = Math.max(Math.round(maxUnit / 10), 1);
  const points = [];
  for (let unit = 0; unit <= maxUnit; unit += step) {
    points.push({
      unit,
      biayaTotal: biayaTetap + biayaVariabelEfektif * unit,
      pendapatan: hargaJualEfektif * unit,
    });
  }
  // Pastikan titik BEP sendiri (bisa pecahan) ikut masuk supaya garis potong terlihat presisi
  const bepBulat = Math.round(bepUnit);
  if (!points.find((p) => p.unit === bepBulat)) {
    points.push({
      unit: bepBulat,
      biayaTotal: biayaTetap + biayaVariabelEfektif * bepBulat,
      pendapatan: hargaJualEfektif * bepBulat,
    });
  }
  return points.sort((a, b) => a.unit - b.unit);
};
