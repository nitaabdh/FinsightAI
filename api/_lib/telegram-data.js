// api/_lib/telegram-data.js
// Query data langsung ke Supabase (service role) buat dipakai perintah bot Telegram.
// Query langsung ke tabel (bukan lewat api/*.js) biar nggak perlu bikin JWT dummy —
// webhook Telegram udah tervalidasi lewat secret token sendiri (lihat telegram-webhook.js).

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function formatRupiahTG(n) {
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

// ── Saldo per Dompet/Kas — logic SAMA PERSIS kayak computeKasStats di utils/storage.js,
// disalin ke sini (bukan di-import) karena file itu ada dependensi/asumsi environment
// browser yang nggak relevan buat serverless function.
export function computeKasStats(transactions) {
  const map = {};
  const touch = (nama) => {
    const key = (nama || "Kas Tunai").toLowerCase().trim();
    if (!(key in map)) map[key] = { nama: nama || "Kas Tunai", saldo: 0 };
    return map[key];
  };
  transactions.forEach((tx) => {
    const amount = Number(tx.amount || 0);
    if (tx.type === "transfer" && tx.kas_tujuan) {
      touch(tx.kas).saldo -= amount;
      touch(tx.kas_tujuan).saldo += amount;
      return;
    }
    const entry = touch(tx.kas);
    entry.saldo += tx.type === "pemasukan" ? amount : -amount;
  });
  return Object.values(map).sort((a, b) => b.saldo - a.saldo);
}

export function calcSummary(transactions) {
  let pemasukan = 0, pengeluaran = 0;
  transactions.forEach((tx) => {
    if (tx.type === "pemasukan") pemasukan += Number(tx.amount || 0);
    else if (tx.type === "pengeluaran") pengeluaran += Number(tx.amount || 0);
    // transfer nggak masuk pemasukan/pengeluaran, cuma mindah antar dompet
  });
  return { pemasukan, pengeluaran, saldo: pemasukan - pengeluaran };
}

export async function getTransactions(userId, mode) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode);
  if (error) throw error;
  return data || [];
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ── SALDO (personal & umkm sama-sama pakai ini) ─────────────────────────────
export async function getSaldoText(userId, mode) {
  const tx = await getTransactions(userId, mode);
  const stats = computeKasStats(tx);
  if (stats.length === 0) return "Belum ada transaksi yang tercatat, jadi belum ada saldo buat ditampilin.";
  const total = stats.reduce((s, k) => s + k.saldo, 0);
  let out = `👛 *Saldo Kamu Saat Ini*\n\n`;
  stats.forEach(k => { out += `• ${k.nama}: ${formatRupiahTG(k.saldo)}\n`; });
  out += `\n*Total: ${formatRupiahTG(total)}*`;
  return out;
}

const BULAN_ID = ["januari","februari","maret","april","mei","juni","juli","agustus","september","oktober","november","desember"];

// Terima argumen periode dari user, contoh: "", "semua", "2026-06", "juni", "juni 2026", "bulan lalu"
// Return: { mode: "bulan"|"semua", year, month (0-11) } — month/year null kalau mode "semua"
export function parsePeriodArg(arg) {
  const a = (arg || "").trim().toLowerCase();
  const now = new Date();

  if (!a) return { mode: "bulan", year: now.getFullYear(), month: now.getMonth() };
  if (a === "semua" || a === "all") return { mode: "semua" };
  if (a === "bulan lalu" || a === "kemarin") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { mode: "bulan", year: d.getFullYear(), month: d.getMonth() };
  }

  // Format yyyy-mm
  const isoMatch = a.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    return { mode: "bulan", year: Number(isoMatch[1]), month: Number(isoMatch[2]) - 1 };
  }

  // Nama bulan Indonesia, dengan/tanpa tahun. Contoh: "juni" atau "juni 2026"
  const parts = a.split(/\s+/);
  const monthIdx = BULAN_ID.findIndex(b => b.startsWith(parts[0]));
  if (monthIdx !== -1) {
    const year = parts[1] && /^\d{4}$/.test(parts[1]) ? Number(parts[1]) : now.getFullYear();
    return { mode: "bulan", year, month: monthIdx };
  }

  return null; // format nggak dikenali
}

// ── LAPORAN — sekarang bisa pilih periode ("" = bulan ini, "semua", "yyyy-mm", "juni", dst) ──
export async function getLaporanText(userId, mode, periodArg = "") {
  const period = parsePeriodArg(periodArg);
  if (!period) {
    return `Format periode nggak dikenali. Contoh: \`/laporan\` (bulan ini), \`/laporan semua\`, \`/laporan juni\`, \`/laporan 2026-06\`.`;
  }

  const tx = await getTransactions(userId, mode);
  let txFiltered, labelPeriode;

  if (period.mode === "semua") {
    txFiltered = tx;
    labelPeriode = "Semua Periode";
  } else {
    txFiltered = tx.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d.getFullYear() === period.year && d.getMonth() === period.month;
    });
    labelPeriode = `${BULAN_ID[period.month][0].toUpperCase()}${BULAN_ID[period.month].slice(1)} ${period.year}`;
  }

  const summary = calcSummary(txFiltered);
  let out = `📈 *Laporan ${labelPeriode}*\n\n`;
  out += `💰 Pemasukan: ${formatRupiahTG(summary.pemasukan)}\n`;
  out += `🛒 Pengeluaran: ${formatRupiahTG(summary.pengeluaran)}\n`;
  out += `${summary.saldo >= 0 ? "📈" : "📉"} Selisih: ${formatRupiahTG(summary.saldo)}\n`;
  if (txFiltered.length === 0) out += `\n_Belum ada transaksi di periode ini._`;
  return out;
}

// ── UTANG & CICILAN AKTIF (personal) ────────────────────────────────────────
export async function getUtangText(userId) {
  const { data, error } = await supabase.from("debts").select("*").eq("user_id", userId).eq("lunas", false);
  if (error) throw error;
  if (!data || data.length === 0) return "🎉 Nggak ada utang/cicilan aktif. Bersih!";

  const jenisLabel = { utang: "Utang", kredit: "Kredit", paylater: "Paylater" };
  const jenisEmoji = { utang: "📤", kredit: "💳", paylater: "🛍️" };
  let out = `💳 *Utang & Cicilan Aktif (${data.length})*\n\n`;
  let totalBulan = 0;
  data.forEach(d => {
    totalBulan += Number(d.cicilan_per_bulan || 0);
    const sisaTenor = d.tenor ? `, sisa ${Math.max(d.tenor - d.bulan_terbayar, 0)} bulan` : "";
    const jatuhTempo = d.tanggal_jatuh_tempo ? `, jatuh tempo tgl ${d.tanggal_jatuh_tempo}` : "";
    out += `${jenisEmoji[d.jenis] || "📤"} *${d.nama}* (${jenisLabel[d.jenis] || d.jenis})\n`;
    out += `   Cicilan: ${formatRupiahTG(d.cicilan_per_bulan)}/bulan${sisaTenor}${jatuhTempo}\n\n`;
  });
  out += `Total wajib bayar/bulan: *${formatRupiahTG(totalBulan)}*`;
  return out;
}

// ── TARGET TABUNGAN AKTIF (personal) ────────────────────────────────────────
export async function getTargetText(userId) {
  const { data, error } = await supabase.from("targets").select("*").eq("user_id", userId);
  if (error) throw error;
  const aktif = (data || []).filter(t => Number(t.terkumpul) < Number(t.target));
  if (aktif.length === 0) return "Belum ada target tabungan aktif. Yuk bikin target baru dari halaman Target di web!";

  let out = `🎯 *Target Tabungan Aktif (${aktif.length})*\n\n`;
  aktif.forEach(t => {
    const pct = t.target > 0 ? ((t.terkumpul / t.target) * 100).toFixed(0) : 0;
    out += `• *${t.nama}*: ${formatRupiahTG(t.terkumpul)} / ${formatRupiahTG(t.target)} (${pct}%)\n`;
  });
  return out;
}

// ── STOK BAHAN BAKU (umkm) ───────────────────────────────────────────────────
export async function getStokText(userId) {
  const { data, error } = await supabase.from("bahan_baku").select("*").eq("user_id", userId).order("nama");
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada bahan baku yang tercatat.";

  let out = `📦 *Stok Bahan Baku*\n\n`;
  const menipis = [];
  data.forEach(b => {
    const label = b.hasil_label || b.satuan_beli || "";
    out += `• ${b.nama}: *${b.stok ?? 0} ${label}*\n`;
    if (Number(b.stok) <= 3) menipis.push(b.nama);
  });
  if (menipis.length > 0) out += `\n⚠️ Stok menipis: ${menipis.join(", ")}`;
  return out;
}

// ── HARGA PRODUK (umkm) ──────────────────────────────────────────────────────
export async function getHargaText(userId) {
  const { data, error } = await supabase.from("produk").select("*").eq("user_id", userId).order("nama");
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada produk yang tercatat.";

  let out = `🏷️ *Harga Produk*\n\n`;
  data.forEach(p => {
    out += `• ${p.nama}: ${formatRupiahTG(p.harga_jual)}`;
    if (p.harga_online) out += ` (online: ${formatRupiahTG(p.harga_online)})`;
    out += `\n`;
  });
  return out;
}

// ── ASET USAHA (umkm) ────────────────────────────────────────────────────────
export async function getAsetText(userId) {
  const { data, error } = await supabase.from("aset_usaha").select("*").eq("user_id", userId).order("nama");
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada aset usaha yang tercatat.";

  const kondisiEmoji = { baik: "✅", rusakRingan: "🟡", rusakBerat: "🔴" };
  let out = `🏭 *Aset Usaha*\n\n`;
  let totalNilai = 0;
  data.forEach(a => {
    totalNilai += Number(a.harga_beli || 0);
    out += `${kondisiEmoji[a.kondisi] || "✅"} ${a.nama} (${a.kategori}) — ${formatRupiahTG(a.harga_beli)}\n`;
  });
  out += `\nTotal nilai aset: *${formatRupiahTG(totalNilai)}*`;
  return out;
}
