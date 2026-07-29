// src/utils/thermalPrint.js
//
// Bantu cetak struk ke printer thermal Bluetooth (Android/Chrome) DAN nyiapin
// fallback tampilan print biasa (jalan di device/browser apa aja, termasuk iPhone).
//
// ── CATATAN PENTING soal Bluetooth ──
// UUID service/characteristic di bawah ini adalah konvensi yang paling umum
// dipakai printer thermal Bluetooth murah (yang biasa dijual di marketplace
// lokal, biasanya clone printer 58mm). INI BUKAN standar resmi yang pasti sama
// di semua merk/model. Kalau device picker nggak nemu printer kamu, atau nemu
// tapi gagal connect/print, kemungkinan besar printer itu pakai UUID service
// yang beda — biasanya bisa dicari dengan search nama model printer + "GATT"
// atau "bluetooth service uuid" di internet, terus ganti nilai SERVICE_UUID /
// CHARACTERISTIC_UUID di bawah.
//
// Web Bluetooth API CUMA jalan di Chrome/Edge Android & Desktop — nggak akan
// pernah jalan di Safari/iPhone (batasan dari Apple, bukan bug di kode ini).

const SERVICE_UUID        = "000018f0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

export function isBluetoothPrintSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

// ── ESC/POS command builder ──
const ESC = 0x1b, GS = 0x1d;

class ReceiptBuilder {
  constructor() { this.bytes = []; }
  raw(...arr) { this.bytes.push(...arr); return this; }
  text(str) { this.bytes.push(...new TextEncoder().encode(str)); return this; }
  line(str = "") { return this.text(str).raw(0x0a); }
  init() { return this.raw(ESC, 0x40); }
  align(mode) { // "left" | "center" | "right"
    const n = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    return this.raw(ESC, 0x61, n);
  }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  doubleSize(on) { return this.raw(GS, 0x21, on ? 0x11 : 0x00); }
  feed(n = 1) { return this.raw(...Array(n).fill(0x0a)); }
  cut() { return this.raw(GS, 0x56, 0x00); }
  build() { return new Uint8Array(this.bytes); }
}

function formatRupiahPlain(n) {
  return "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
}
// Rata kiri-kanan dalam 1 baris lebar tetap (default 32 karakter — pas buat
// printer 58mm; kalau printer kamu 80mm, ganti width jadi 42-48).
function padLine(left, right, width = 32) {
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right;
}
function wrapText(str, width = 32) {
  if (str.length <= width) return [str];
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// Struktur data receipt yang dipakai bareng (Bluetooth & HTML fallback) —
// biar 2 jalur print itu selalu nampilin info yang sama.
export function buildReceiptData({ strukSettings, items, totalPemasukan, tanggal, refId }) {
  return {
    judul: "Struk Transaksi",
    namaToko: strukSettings?.namaToko || "Toko Saya",
    alamat: strukSettings?.alamat || "",
    footerText: strukSettings?.footerText || "Terima kasih telah berbelanja!",
    items: items || [],
    total: totalPemasukan || 0,
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    refId: refId || "",
  };
}

// Rekap harian Kasir — dicetak pas tutup toko, nunjukin total SEMUA penjualan
// hari itu (bukan 1 transaksi doang). Dipetain ke bentuk data yang SAMA kayak
// buildReceiptData di atas biar bisa langsung dipake bareng StrukModal &
// buildReceiptBytes yang udah ada, cuma nambahin jumlahTransaksi & perKas.
export function buildRekapReceiptData({ strukSettings, perProduk, perKas, totalPemasukan, jumlahTransaksi, tanggal }) {
  return {
    judul: "Rekap Penjualan Harian",
    namaToko: strukSettings?.namaToko || "Toko Saya",
    alamat: strukSettings?.alamat || "",
    footerText: strukSettings?.footerText || "Terima kasih telah berbelanja!",
    items: (perProduk || []).map(p => ({
      produkNama: p.nama,
      qty: p.qty,
      hargaSatuan: p.qty > 0 ? Math.round(p.subtotal / p.qty) : 0,
      subtotal: p.subtotal,
    })),
    total: totalPemasukan || 0,
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    jumlahTransaksi: jumlahTransaksi || 0,
    perKas: perKas || [],
  };
}

export function buildReceiptBytes(receipt, width = 32) {
  const b = new ReceiptBuilder();
  b.init().align("center");
  b.doubleSize(true).bold(true).line(receipt.namaToko).doubleSize(false).bold(false);
  if (receipt.alamat) wrapText(receipt.alamat, width).forEach(l => b.line(l));
  if (receipt.judul && receipt.judul !== "Struk Transaksi") b.bold(true).line(receipt.judul).bold(false);
  b.line(receipt.tanggal);
  if (receipt.jumlahTransaksi) b.line(`${receipt.jumlahTransaksi} transaksi`);
  b.line("-".repeat(width));
  b.align("left");
  receipt.items.forEach(it => {
    wrapText(it.produkNama, width).forEach(l => b.line(l));
    const kiri = `${it.qty} x ${formatRupiahPlain(it.hargaSatuan)}`;
    b.line(padLine(kiri, formatRupiahPlain(it.subtotal), width));
  });
  b.line("-".repeat(width));
  b.bold(true).line(padLine("TOTAL", formatRupiahPlain(receipt.total), width)).bold(false);
  if (receipt.perKas && receipt.perKas.length > 0) {
    b.feed(1).line("Rincian per Kas:");
    receipt.perKas.forEach(k => b.line(padLine(k.kas, formatRupiahPlain(k.total), width)));
  }
  b.feed(1).align("center");
  if (receipt.footerText) wrapText(receipt.footerText, width).forEach(l => b.line(l));
  b.feed(3).cut();
  return b.build();
}

// ── Kirim ke printer via Web Bluetooth ──
// SENGAJA pakai acceptAllDevices (bukan filters berdasarkan SERVICE_UUID) —
// banyak printer clone murah nggak nge-advertise service ID-nya di paket
// advertisement Bluetooth, jadi kalau pakai filter, printer kamu malah bisa
// nggak muncul sama sekali di device picker. Trade-off-nya: device picker
// nampilin SEMUA perangkat Bluetooth di sekitar, bukan cuma printer.
export async function printViaBluetooth(bytes) {
  if (!isBluetoothPrintSupported()) {
    throw new Error("Browser ini nggak support Web Bluetooth — biasanya karena pakai Safari/iPhone. Pakai Chrome di Android, atau pakai opsi \"Print Biasa\".");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

  // Chunk kecil + jeda dikit antar chunk — banyak printer BLE murah nge-drop
  // data atau nge-lag kalau dikirim sekaligus gede/beruntun tanpa jeda.
  const CHUNK_SIZE = 180;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
    await new Promise(r => setTimeout(r, 60));
  }
  try { await device.gatt.disconnect(); } catch { /* nggak fatal kalau gagal disconnect */ }
}

export { formatRupiahPlain };
