// api/_lib/telegram-data.js
// Query data langsung ke Supabase (service role) buat dipakai perintah bot Telegram.
// Query langsung ke tabel (bukan lewat api/*.js) biar nggak perlu bikin JWT dummy —
// webhook Telegram udah tervalidasi lewat secret token sendiri (lihat telegram-webhook.js).

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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

// ── UTANG/PIUTANG USAHA (umkm) — beda dari debts Personal, ini lump-sum + jatuh tempo tanggal pasti ──
export async function getUtangPiutangText(userId) {
  const { data, error } = await supabase.from("utang_piutang").select("*").eq("user_id", userId).eq("lunas", false).order("jatuh_tempo");
  if (error) throw error;
  if (!data || data.length === 0) return "🎉 Nggak ada utang/piutang usaha yang aktif. Bersih!";

  const jenisLabel = { utang: "Utang (kita berutang)", piutang: "Piutang (orang berutang ke kita)" };
  let out = `📋 *Utang & Piutang Usaha Aktif (${data.length})*\n\n`;
  data.forEach(u => {
    const jatuhTempo = u.jatuh_tempo ? new Date(u.jatuh_tempo).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";
    out += `• *${u.nama}* (${jenisLabel[u.jenis] || u.jenis})\n  ${formatRupiahTG(u.nominal)} — jatuh tempo ${jatuhTempo}\n`;
    if (u.catatan) out += `  📝 ${u.catatan}\n`;
    out += `\n`;
  });
  return out;
}

// ── BIAYA OPERASIONAL (umkm) ─────────────────────────────────────────────────
export async function getBiayaText(userId) {
  const { data, error } = await supabase.from("biaya_operasional").select("*").eq("user_id", userId).order("nama");
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada biaya operasional yang tercatat.";

  let out = `🧾 *Biaya Operasional*\n\n`;
  let total = 0;
  data.forEach(b => {
    total += Number(b.biaya || 0);
    out += `• ${b.nama}: ${formatRupiahTG(b.biaya)}\n`;
  });
  out += `\nTotal: *${formatRupiahTG(total)}*`;
  return out;
}

// ── TAMBAH/KURANGI STOK (umkm) — dipakai command /stok+ dan /stok- ───────────
// Fuzzy match nama bahan (case-insensitive, partial), biar user nggak perlu ketik persis.
export async function adjustStok(userId, namaBahan, jumlah, tipe) {
  const { data: bahanList, error: findErr } = await supabase
    .from("bahan_baku").select("*").eq("user_id", userId);
  if (findErr) throw findErr;

  const lower = namaBahan.toLowerCase().trim();
  const matches = (bahanList || []).filter(b => b.nama.toLowerCase().includes(lower));

  if (matches.length === 0) {
    return { success: false, message: `Bahan baku "${namaBahan}" nggak ketemu. Cek nama persisnya di halaman Bahan Baku ya.` };
  }
  if (matches.length > 1) {
    const daftar = matches.map(b => b.nama).join(", ");
    return { success: false, message: `Ada ${matches.length} bahan yang cocok sama "${namaBahan}": ${daftar}. Coba lebih spesifik.` };
  }

  const bahan = matches[0];
  const stokLama = Number(bahan.stok || 0);
  const delta = tipe === "tambah" ? jumlah : -jumlah;
  const stokBaru = Math.max(0, stokLama + delta);

  const { error: updateErr } = await supabase.from("bahan_baku").update({ stok: stokBaru }).eq("id", bahan.id);
  if (updateErr) throw updateErr;

  // Catat juga di stok_history biar konsisten sama riwayat yang di web
  await supabase.from("stok_history").insert({
    user_id: userId,
    bahan_id: bahan.id,
    tipe,
    sumber: tipe === "tambah" ? "manual_tambah" : "manual_kurang_lain",
    jumlah,
    satuan_label: bahan.satuan_beli || bahan.hasil_label || "",
    alasan: "Lewat bot Telegram",
  });

  return {
    success: true,
    nama: bahan.nama,
    stokLama,
    stokBaru,
    satuan: bahan.hasil_label || bahan.satuan_beli || "",
  };
}

// Parse tanggal fleksibel dari teks user: "2026-07-25", "25/07/2026", "25/07",
// "25 juli", "25 juli 2026", "besok", "lusa", "hari ini". Return "yyyy-mm-dd" atau null.
export function parseFlexibleDate(text) {
  const a = (text || "").trim().toLowerCase();
  const now = new Date(); now.setHours(0, 0, 0, 0);

  if (a === "hari ini" || a === "hariini") return now.toISOString().slice(0, 10);
  if (a === "besok") { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (a === "lusa")  { const d = new Date(now); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); }

  let m = a.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;

  m = a.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;

  m = a.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    let year = now.getFullYear();
    let d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (d < now) d = new Date(year + 1, Number(m[2]) - 1, Number(m[1]));
    return d.toISOString().slice(0, 10);
  }

  m = a.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (m) {
    const monthIdx = BULAN_ID.findIndex(b => b.startsWith(m[2]));
    if (monthIdx !== -1) {
      let year = m[3] ? Number(m[3]) : now.getFullYear();
      let d = new Date(year, monthIdx, Number(m[1]));
      if (!m[3] && d < now) d = new Date(year + 1, monthIdx, Number(m[1]));
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

// ── ACARA TERDEKAT (cal_notes, mode-aware) ──────────────────────────────────
export async function getUpcomingAcaraText(userId, mode) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("cal_notes").select("*").eq("user_id", userId).eq("mode", mode)
    .gte("date", todayStr).order("date", { ascending: true }).limit(8);
  if (error) throw error;
  if (!data || data.length === 0) return "Nggak ada acara mendatang yang tercatat. 🎉";

  let out = `📅 *Acara Terdekat*\n\n`;
  data.forEach(a => {
    const d = new Date(a.date); d.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = Math.round((d - now) / (1000*60*60*24));
    const label = diff === 0 ? "Hari ini" : diff === 1 ? "Besok" : `${diff} hari lagi`;
    const tgl = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    out += `• *${a.title}* — ${tgl} (${label})\n`;
    if (a.body) out += `  ${a.body}\n`;
  });
  return out;
}

export async function addAcara(userId, mode, title, dateStr) {
  const { data, error } = await supabase.from("cal_notes").insert({
    id: randomUUID(), user_id: userId, mode, title, body: "", category: "umum", date: dateStr,
  }).select().single();
  if (error) throw error;
  return data;
}

// ── CATATAN (notes, mode-aware) — list bernomor biar bisa dirujuk pas edit ──
export async function getCatatanListText(userId, mode) {
  const { data, error } = await supabase
    .from("notes").select("*").eq("user_id", userId).eq("mode", mode)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada catatan. Tambah pakai `/catatan+ isi catatannya`.";

  let out = `📋 *Catatan Kamu*\n\n`;
  data.forEach((n, i) => {
    const preview = n.body ? n.body.slice(0, 60) : "";
    out += `*${i + 1}.* ${n.title}${preview ? `\n   ${preview}${n.body.length > 60 ? "..." : ""}` : ""}\n`;
  });
  out += `\n_Edit: \`/catatanedit <nomor> isi baru\`_`;
  return out;
}

export async function addCatatan(userId, mode, title) {
  const { data, error } = await supabase.from("notes").insert({
    id: randomUUID(), user_id: userId, mode, title, body: "", category: "umum", color: "yellow",
  }).select().single();
  if (error) throw error;
  return data;
}

// Edit catatan berdasarkan NOMOR urut dari /catatan (list ter-fresh, urutan sama persis).
export async function editCatatanByIndex(userId, mode, index, newText) {
  const { data: list, error: listErr } = await supabase
    .from("notes").select("*").eq("user_id", userId).eq("mode", mode)
    .order("created_at", { ascending: false }).limit(10);
  if (listErr) throw listErr;

  const target = list?.[index - 1];
  if (!target) return { success: false, message: `Catatan nomor ${index} nggak ketemu. Cek lagi pakai /catatan.` };

  const { data, error } = await supabase.from("notes")
    .update({ title: newText, updated_at: new Date().toISOString() })
    .eq("id", target.id).eq("user_id", userId).select().single();
  if (error) throw error;
  return { success: true, data };
}

// ── BAYAR CICILAN lewat bot (personal) — mirror logic handleBayarCicilan di TargetPage.jsx ──
export async function payCicilan(userId, namaUtang) {
  const { data: debts, error: findErr } = await supabase.from("debts").select("*").eq("user_id", userId).eq("lunas", false);
  if (findErr) throw findErr;

  const lower = namaUtang.toLowerCase().trim();
  const matches = (debts || []).filter(d => d.nama.toLowerCase().includes(lower));
  if (matches.length === 0) return { success: false, message: `Utang "${namaUtang}" nggak ketemu atau udah lunas. Cek /utang dulu buat lihat nama persisnya.` };
  if (matches.length > 1) return { success: false, message: `Ada ${matches.length} utang yang cocok sama "${namaUtang}": ${matches.map(d => d.nama).join(", ")}. Coba lebih spesifik.` };

  const d = matches[0];
  const amount = Number(d.cicilan_per_bulan);
  const jenisLabel = { utang: "Utang", kredit: "Kredit", paylater: "Paylater" };

  const { error: txErr } = await supabase.from("transactions").insert({
    user_id: userId, mode: "personal", type: "pengeluaran", amount,
    category: `Cicilan ${jenisLabel[d.jenis] || d.jenis}`, description: `Cicilan ${d.nama}`,
    date: new Date().toISOString().slice(0, 10), kas: d.dompet || "Kas Tunai",
  });
  if (txErr) throw txErr;

  const newTerbayar = Number(d.terbayar || 0) + amount;
  const newBulanTerbayar = Number(d.bulan_terbayar || 0) + 1;
  const newLunas = d.tenor ? newBulanTerbayar >= d.tenor : (d.total_utang ? newTerbayar >= d.total_utang : false);

  const { error: updErr } = await supabase.from("debts")
    .update({ terbayar: newTerbayar, bulan_terbayar: newBulanTerbayar, lunas: newLunas })
    .eq("id", d.id);
  if (updErr) throw updErr;

  // Sinkronin reminder kalender — konsisten sama yang di web (id tetap `debt-{id}`)
  try {
    if (newLunas) {
      await supabase.from("cal_notes").delete().eq("id", `debt-${d.id}`);
    } else if (d.tanggal_jatuh_tempo) {
      const now = new Date(); now.setHours(0, 0, 0, 0);
      let due = new Date(now.getFullYear(), now.getMonth(), d.tanggal_jatuh_tempo);
      if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, d.tanggal_jatuh_tempo);
      await supabase.from("cal_notes").upsert({
        id: `debt-${d.id}`, user_id: userId, mode: "personal",
        title: `💳 Bayar ${jenisLabel[d.jenis] || d.jenis}: ${d.nama}`,
        body: `Cicilan ${formatRupiahTG(amount)}${d.dompet ? " · " + d.dompet : ""}`,
        category: "tagihan", date: due.toISOString().slice(0, 10),
      }, { onConflict: "id" });
    }
  } catch (reminderErr) {
    console.error("[telegram-data] gagal sync reminder pas bayar cicilan:", reminderErr);
    // nggak fatal, pembayarannya sendiri tetep berhasil
  }

  return { success: true, nama: d.nama, amount, newTerbayar, newBulanTerbayar, newLunas, tenor: d.tenor, totalUtang: d.total_utang };
}

// ── NABUNG KE TARGET lewat bot (personal) — mirror logic handleTabung di TargetPage.jsx ──
export async function nabungTarget(userId, mode, namaTarget, jumlah) {
  const { data: targets, error: findErr } = await supabase.from("targets").select("*").eq("user_id", userId);
  if (findErr) throw findErr;

  const lower = namaTarget.toLowerCase().trim();
  const matches = (targets || []).filter(t => t.nama.toLowerCase().includes(lower) && Number(t.terkumpul) < Number(t.target));
  if (matches.length === 0) return { success: false, message: `Target "${namaTarget}" nggak ketemu atau udah tercapai. Cek /target dulu buat lihat nama persisnya.` };
  if (matches.length > 1) return { success: false, message: `Ada ${matches.length} target yang cocok sama "${namaTarget}": ${matches.map(t => t.nama).join(", ")}. Coba lebih spesifik.` };

  const t = matches[0];
  const newTerkumpul = Math.min(Number(t.terkumpul) + jumlah, Number(t.target));

  const { error: updErr } = await supabase.from("targets").update({ terkumpul: newTerkumpul }).eq("id", t.id);
  if (updErr) throw updErr;

  // Konsisten sama web: nabung ke target otomatis kecatet sebagai transaksi pengeluaran
  await supabase.from("transactions").insert({
    user_id: userId, mode, type: "pengeluaran", amount: jumlah, category: "Tabungan",
    description: `Nabung ke target: ${t.nama}`, date: new Date().toISOString().slice(0, 10),
    kas: t.penempatan || "Kas Tunai",
  });

  return { success: true, nama: t.nama, jumlah, newTerkumpul, target: Number(t.target) };
}

// ── RIWAYAT TRANSAKSI TERAKHIR ────────────────────────────────────────────────
export async function getRiwayatText(userId, mode) {
  const { data, error } = await supabase
    .from("transactions").select("*").eq("user_id", userId).eq("mode", mode)
    .order("date", { ascending: false }).limit(10);
  if (error) throw error;
  if (!data || data.length === 0) return "Belum ada transaksi tercatat.";

  let out = `📜 *10 Transaksi Terakhir*\n\n`;
  data.forEach(t => {
    const emoji = t.type === "pemasukan" ? "💰" : t.type === "transfer" ? "🔁" : "🛒";
    const tglLabel = new Date(t.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    out += `${emoji} ${tglLabel} — ${t.description || t.category}: ${formatRupiahTG(t.amount)}\n`;
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
