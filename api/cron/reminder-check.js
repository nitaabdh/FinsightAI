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

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  let sent = 0, skipped = 0, errors = 0;

  try {
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

        // Udah pernah dikirim reminder buat tanggal jatuh tempo ini? skip biar nggak dobel
        const dueDateStr = due.toISOString().slice(0, 10);
        const { data: already } = await supabase
          .from("telegram_reminders_sent")
          .select("id")
          .eq("ref_type", "debt")
          .eq("ref_id", d.id)
          .eq("sent_for_date", dueDateStr)
          .maybeSingle();
        if (already) { skipped++; continue; }

        // User ini udah link Telegram belum?
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

    return res.status(200).json({ ok: true, checked: (debts || []).length, sent, skipped, errors, date: todayStr });
  } catch (err) {
    console.error("[cron/reminder-check] error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
