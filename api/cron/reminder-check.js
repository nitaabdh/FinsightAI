// /api/cron/reminder-check.js — Vercel Serverless Function (dipanggil CRON, bukan user)
// Jalan otomatis 1x/hari (jadwal diatur di vercel.json), ngecek SEMUA utang aktif
// semua user, kirim reminder Telegram kalau jatuh temponya H-3 atau H-1 dari hari ini.
//
// SETUP TAMBAHAN YANG WAJIB:
// 1. File vercel.json di root project udah didaftarin jadwal cron-nya (lihat file itu).
// 2. Set environment variable CRON_SECRET di Vercel (string acak bikin sendiri) —
//    Vercel otomatis ngirim ini sebagai "Authorization: Bearer <CRON_SECRET>" tiap
//    manggil cron job, jadi endpoint ini nggak bisa dipicu sembarang orang dari luar.

import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage, formatRupiahTG } from "../_lib/telegram.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JENIS_LABEL = { utang: "Utang", kredit: "Kredit", paylater: "Paylater" };
const JENIS_EMOJI = { utang: "📤", kredit: "💳", paylater: "🛍️" };

function nextDueDate(tanggalJatuhTempo) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let due = new Date(now.getFullYear(), now.getMonth(), tanggalJatuhTempo);
  if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, tanggalJatuhTempo);
  return due;
}
function daysBetween(a, b) {
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  // Validasi request beneran dari Vercel Cron, bukan dari sembarang orang yang tau URL-nya
  const authHeader = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  // Cron ini dipanggil Vercel 2x sehari dengan job berbeda (lihat vercel.json):
  // - pagi (default, tanpa ?job=)  -> cek jatuh tempo cicilan/utang-piutang
  // - malam (?job=daily-nudge)     -> ingetin user buat catat transaksi hari ini
  if (req.query.job === "daily-nudge") {
    return handleDailyNudge(req, res);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Beres-beres data lama biar tabel nggak numpuk terus — jalan 1x/hari nebeng cron pagi ini
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("telegram_processed_updates").delete().lt("processed_at", sevenDaysAgo);
    await supabase.from("telegram_pending_actions").delete().lt("expires_at", new Date().toISOString());
  } catch (cleanupErr) {
    console.error("[cron/reminder-check] gagal cleanup:", cleanupErr);
  }

  let sent = 0, skipped = 0, errors = 0;

  try {
    // ── Bagian 1: Utang/Cicilan Personal (debts) — jatuh tempo berulang tiap bulan ──
    const { data: debts, error } = await supabase
      .from("debts")
      .select("id, user_id, jenis, nama, cicilan_per_bulan, dompet, tanggal_jatuh_tempo")
      .eq("lunas", false)
      .not("tanggal_jatuh_tempo", "is", null);
    if (error) throw error;

    for (const d of debts || []) {
      try {
        const due = nextDueDate(d.tanggal_jatuh_tempo);
        const hMin = daysBetween(due, today); // 3 = H-3, 1 = H-1, 0 = hari ini

        if (![1, 3].includes(hMin)) { skipped++; continue; }

        const dueDateStr = due.toISOString().slice(0, 10);
        const { data: already } = await supabase
          .from("telegram_reminders_sent")
          .select("id")
          .eq("ref_type", "debt")
          .eq("ref_id", d.id)
          .eq("sent_for_date", dueDateStr)
          .maybeSingle();
        if (already) { skipped++; continue; }

        const { data: link } = await supabase
          .from("telegram_links")
          .select("telegram_chat_id")
          .eq("user_id", d.user_id)
          .maybeSingle();
        if (!link) { skipped++; continue; }

        const label = hMin === 1 ? "BESOK" : `${hMin} hari lagi`;
        const text =
          `⏰ *Reminder Cicilan*\n\n` +
          `${JENIS_EMOJI[d.jenis] || "📤"} *${d.nama}* (${JENIS_LABEL[d.jenis] || d.jenis})\n` +
          `Jatuh tempo: *${label}* (tgl ${d.tanggal_jatuh_tempo})\n` +
          `Cicilan: ${formatRupiahTG(d.cicilan_per_bulan)}${d.dompet ? ` dari ${d.dompet}` : ""}\n\n` +
          `Buka bot ini abis bayar, nanti aku bantu catetin otomatis. 👍`;

        const result = await sendTelegramMessage(link.telegram_chat_id, text);
        if (result.ok) {
          await supabase.from("telegram_reminders_sent").insert({
            user_id: d.user_id, ref_type: "debt", ref_id: d.id, sent_for_date: dueDateStr,
          });
          sent++;
        } else {
          errors++;
        }
      } catch (innerErr) {
        console.error("[cron/reminder-check] gagal proses debt", d.id, innerErr);
        errors++;
      }
    }

    // ── Bagian 2: Utang/Piutang Usaha UMKM (utang_piutang) — jatuh tempo TANGGAL PASTI, bukan berulang ──
    const { data: utangPiutang, error: upError } = await supabase
      .from("utang_piutang")
      .select("id, user_id, jenis, nama, nominal, jatuh_tempo")
      .eq("lunas", false)
      .not("jatuh_tempo", "is", null);
    if (upError) throw upError;

    const UP_JENIS_LABEL = { utang: "Utang Usaha", piutang: "Piutang Usaha" };
    const UP_JENIS_EMOJI = { utang: "📤", piutang: "📥" };

    for (const u of utangPiutang || []) {
      try {
        const due = new Date(u.jatuh_tempo); due.setHours(0, 0, 0, 0);
        const hMin = daysBetween(due, today);

        if (![1, 3].includes(hMin)) { skipped++; continue; }

        const dueDateStr = due.toISOString().slice(0, 10);
        const { data: already } = await supabase
          .from("telegram_reminders_sent")
          .select("id")
          .eq("ref_type", "utang_piutang")
          .eq("ref_id", u.id)
          .eq("sent_for_date", dueDateStr)
          .maybeSingle();
        if (already) { skipped++; continue; }

        const { data: link } = await supabase
          .from("telegram_links")
          .select("telegram_chat_id")
          .eq("user_id", u.user_id)
          .maybeSingle();
        if (!link) { skipped++; continue; }

        const label = hMin === 1 ? "BESOK" : `${hMin} hari lagi`;
        const verb = u.jenis === "piutang" ? "Ditagih" : "Dibayar";
        const text =
          `⏰ *Reminder ${UP_JENIS_LABEL[u.jenis] || "Utang/Piutang"}*\n\n` +
          `${UP_JENIS_EMOJI[u.jenis] || "📤"} *${u.nama}*\n` +
          `Jatuh tempo: *${label}*\n` +
          `Nominal: ${formatRupiahTG(u.nominal)} (${verb.toLowerCase()})\n\n` +
          `Buka halaman Utang/Piutang di web abis diurus ya.`;

        const result = await sendTelegramMessage(link.telegram_chat_id, text);
        if (result.ok) {
          await supabase.from("telegram_reminders_sent").insert({
            user_id: u.user_id, ref_type: "utang_piutang", ref_id: u.id, sent_for_date: dueDateStr,
          });
          sent++;
        } else {
          errors++;
        }
      } catch (innerErr) {
        console.error("[cron/reminder-check] gagal proses utang_piutang", u.id, innerErr);
        errors++;
      }
    }

    return res.status(200).json({ ok: true, checkedDebts: (debts || []).length, checkedUtangPiutang: (utangPiutang || []).length, sent, skipped, errors, date: todayStr });
  } catch (err) {
    console.error("[cron/reminder-check] error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// ── Job malam: ingetin user yang BELUM catat transaksi apa-apa hari ini ──
// Sengaja cuma kirim ke yang beneran belum nyatet apa-apa (bukan spam ke semua
// orang tiap hari), biar nggak ganggu yang udah rajin.
async function handleDailyNudge(req, res) {
  const todayStr = new Date().toISOString().slice(0, 10);
  let sent = 0, skipped = 0, errors = 0;

  try {
    const { data: links, error } = await supabase.from("telegram_links").select("user_id, telegram_chat_id, daily_nudge_enabled");
    if (error) throw error;

    for (const link of links || []) {
      try {
        if (link.daily_nudge_enabled === false) { skipped++; continue; }

        const { data: txToday } = await supabase
          .from("transactions").select("id").eq("user_id", link.user_id).eq("date", todayStr).limit(1);
        if (txToday && txToday.length > 0) { skipped++; continue; } // udah nyatet, skip

        const { data: userRow } = await supabase.from("users").select("mode").eq("id", link.user_id).maybeSingle();
        const mode = userRow?.mode || "personal";

        const text = mode === "umkm"
          ? "🌙 Udah malem nih! Ada penjualan atau pengeluaran usaha hari ini? Jangan lupa dicatet ya biar laporan bulan ini tetep akurat 📊"
          : "🌙 Udah malem nih! Ada pemasukan atau pengeluaran apa aja hari ini? Jangan lupa dicatet keuangannya ya 💰\n\nTinggal ketik aja langsung, misal \"beli kopi 20rb\".";

        const result = await sendTelegramMessage(link.telegram_chat_id, text);
        if (result.ok) sent++; else errors++;
      } catch (innerErr) {
        console.error("[cron/daily-nudge] gagal proses user", link.user_id, innerErr);
        errors++;
      }
    }

    return res.status(200).json({ ok: true, job: "daily-nudge", checked: (links || []).length, sent, skipped, errors, date: todayStr });
  } catch (err) {
    console.error("[cron/daily-nudge] error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
