// ─── Kalkulator Jual Online/Marketplace ──────────────────────────────────────
// Dipakai oleh: KalkulatorOnline.jsx (halaman Produksi & Stok) dan TransactionForm.jsx
// (pas nyatet penjualan online). Dipisah ke sini biar rumusnya SATU sumber kebenaran —
// nggak ada versi hitungan ganda yang bisa saling beda kalau salah satu diedit doang.

export const genFeeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Preset ini CUMA ngisiin nama-nama potongan yang umum ada di tiap platform.
// Nilai % nya sengaja dikosongin (0) — karena rate asli sering berubah & beda per
// kategori produk / tier toko, jadi HARUS diisi/dicek manual sama user, bukan
// dianggap pasti bener dari sini.
export const PLATFORM_PRESETS = {
  shopee: {
    label: "Shopee",
    fees: [
      { nama: "Komisi Shopee", tipe: "persen", nilai: 0 },
      { nama: "Biaya Layanan (Gratis Ongkir/Star+)", tipe: "persen", nilai: 0 },
      { nama: "Biaya Proses Pembayaran", tipe: "persen", nilai: 0 },
    ],
  },
  tokopedia: {
    label: "Tokopedia",
    fees: [
      { nama: "Biaya Layanan Tokopedia", tipe: "persen", nilai: 0 },
      { nama: "Biaya Proses Transaksi", tipe: "persen", nilai: 0 },
    ],
  },
  tiktokshop: {
    label: "TikTok Shop",
    fees: [
      { nama: "Komisi TikTok Shop", tipe: "persen", nilai: 0 },
      { nama: "Biaya Proses Pembayaran", tipe: "persen", nilai: 0 },
    ],
  },
  lazada: {
    label: "Lazada",
    fees: [
      { nama: "Komisi Kategori", tipe: "persen", nilai: 0 },
      { nama: "Biaya Pembayaran", tipe: "persen", nilai: 0 },
    ],
  },
  custom: { label: "Custom / Lainnya", fees: [] },
};

// Bikin baris potongan baru dari preset (dikasih id unik masing-masing)
export const buatFeeRowsDariPreset = (platformKey) =>
  (PLATFORM_PRESETS[platformKey]?.fees || []).map(f => ({ ...f, id: genFeeId() }));

// ── Mode MAJU: harga jual diketahui → hitung dana bersih ────────────────────
// potongan: [{ tipe: "persen"|"nominal", nilai: number }]
// Urutan penghitungan: SEMUA persen dihitung dari harga jual ASLI (bukan bertingkat/
// compounding satu sama lain) — ini pendekatan paling umum & gampang diverifikasi,
// meski beberapa platform teknisnya menghitung sebagian potongan dari subtotal
// setelah potongan lain. Kalau butuh presisi 100%, cek rincian asli di dashboard
// marketplace-nya masing-masing.
export const hitungDanaBersih = (hargaJual, potonganRows) => {
  const harga = parseFloat(hargaJual) || 0;
  const detail = (potonganRows || []).map(row => {
    const nilai = parseFloat(row.nilai) || 0;
    const potongan = row.tipe === "persen" ? harga * (nilai / 100) : nilai;
    return { ...row, potongan };
  });
  const totalPotongan = detail.reduce((s, d) => s + d.potongan, 0);
  const danaBersih = harga - totalPotongan;
  return { detail, totalPotongan, danaBersih };
};

// ── Mode MUNDUR: target dana bersih diketahui → hitung harga jual yang harus dipasang ─
// Rumus: danaBersih = hargaJual × (1 − Σpersen) − Σnominal
//   → hargaJual = (targetDanaBersih + Σnominal) / (1 − Σpersen)
// Return null kalau total persen >= 100% (kondisi mustahil, harga jual berapa pun
// nggak akan pernah cukup nutup potongan + target).
export const hitungHargaJualMundur = (targetDanaBersih, potonganRows) => {
  const target = parseFloat(targetDanaBersih) || 0;
  const totalPersen = (potonganRows || [])
    .filter(r => r.tipe === "persen")
    .reduce((s, r) => s + (parseFloat(r.nilai) || 0), 0) / 100;
  const totalNominal = (potonganRows || [])
    .filter(r => r.tipe === "nominal")
    .reduce((s, r) => s + (parseFloat(r.nilai) || 0), 0);

  if (totalPersen >= 1) return null; // potongan persen udah >=100%, mustahil dihitung
  const hargaJual = (target + totalNominal) / (1 - totalPersen);
  return hargaJual;
};
