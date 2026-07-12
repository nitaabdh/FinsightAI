// /api/telegram-webhook.js — Vercel Serverless Function
// POST /api/telegram-webhook  <- dipanggil Telegram tiap ada pesan baru ke bot
//
// SETUP YANG WAJIB DILAKUKAN MANUAL (nggak otomatis cuma dari deploy code):
// 1. Bikin bot baru lewat @BotFather di Telegram, dapetin BOT TOKEN.
// 2. Set environment variables di Vercel:
//    - TELEGRAM_BOT_TOKEN       (dari BotFather)
//    - TELEGRAM_WEBHOOK_SECRET  (bikin sendiri, string acak minimal 16 karakter)
// 3. Daftarin webhook URL ke Telegram (jalanin SEKALI aja lewat browser/curl,
//    ganti <BOT_TOKEN>, <DOMAIN>, dan <SECRET> sesuai punya kamu):
//    https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<DOMAIN>/api/telegram-webhook&secret_token=<SECRET>

import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage, escapeMd } from "./_lib/telegram.js";
import {
  getSaldoText, getLaporanText, getUtangText, getTargetText,
  getStokText, getHargaText, getAsetText,
} from "./_lib/telegram-data.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HELP_TEXT_UNLINKED =
  `👋 Halo! Aku FinSight Bot.\n\n` +
  `Akun kamu belum terhubung. Buka halaman *Profil* di web/app FinSight, klik "Hubungkan Telegram", ` +
  `nanti muncul kode 6 digit. Kirim ke sini pakai format:\n\n` +
  `/link 123456`;

const HELP_TEXT_PERSONAL =
  `🤖 *Perintah yang tersedia:*\n\n` +
  `/saldo — saldo tiap dompet\n` +
  `/laporan — ringkasan bulan ini\n` +
  `/utang — daftar utang & cicilan aktif\n` +
  `/target — progress target tabungan\n` +
  `/unlink — putuskan koneksi akun\n\n` +
  `Kamu juga bisa langsung ngetik transaksi, misal:\n_"beli kopi 20rb"_ atau _"gajian 3jt"_ (fitur ini nyusul ya 🙏)`;

const HELP_TEXT_UMKM =
  `🤖 *Perintah yang tersedia:*\n\n` +
  `/saldo — saldo tiap kas/dompet usaha\n` +
  `/laporan — omzet & pengeluaran bulan ini\n` +
  `/stok — stok bahan baku\n` +
  `/harga — daftar harga produk\n` +
  `/aset — daftar aset usaha\n` +
  `/unlink — putuskan koneksi akun`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  // ── Validasi request beneran dari Telegram, bukan dari sembarang orang ──
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  // Selalu balas 200 ke Telegram secepatnya (di akhir) — kalau kita balas
  // error/timeout, Telegram bakal ngirim ulang update yang sama berkali-kali.
  try {
    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();
    const from = message.from || {};

    // ── Cari apakah chat ini udah ke-link ke akun mana ──
    const { data: link } = await supabase
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    // ── Command: /start ──
    if (text === "/start") {
      await sendTelegramMessage(chatId, link
        ? `Halo lagi, ${escapeMd(from.first_name || "")}! Akun kamu udah terhubung. Ketik /help buat lihat perintah yang ada.`
        : HELP_TEXT_UNLINKED);
      return res.status(200).json({ ok: true });
    }

    // ── Command: /link <kode> ──
    if (text.startsWith("/link")) {
      if (link) {
        await sendTelegramMessage(chatId, "Chat ini udah terhubung ke sebuah akun. Ketik /unlink dulu kalau mau ganti akun.");
        return res.status(200).json({ ok: true });
      }
      const code = text.replace("/link", "").trim();
      if (!code) {
        await sendTelegramMessage(chatId, "Format: `/link 123456` — ambil kode 6 digitnya dari halaman Profil di web.");
        return res.status(200).json({ ok: true });
      }

      const { data: codeRow } = await supabase.from("telegram_link_codes").select("*").eq("code", code).maybeSingle();
      if (!codeRow) {
        await sendTelegramMessage(chatId, "❌ Kode nggak ditemukan atau salah ketik. Cek lagi kodenya di halaman Profil.");
        return res.status(200).json({ ok: true });
      }
      if (new Date(codeRow.expires_at) < new Date()) {
        await supabase.from("telegram_link_codes").delete().eq("code", code);
        await sendTelegramMessage(chatId, "⌛ Kode udah kedaluwarsa (berlaku 5 menit). Generate kode baru dari halaman Profil ya.");
        return res.status(200).json({ ok: true });
      }

      // Kalau chat ini sebelumnya kepakai buat akun lain, lepas dulu (1 chat = 1 akun)
      await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId);

      const { error: insertErr } = await supabase.from("telegram_links").insert({
        user_id: codeRow.user_id,
        telegram_chat_id: chatId,
        telegram_username: from.username || null,
        telegram_first_name: from.first_name || null,
      });
      await supabase.from("telegram_link_codes").delete().eq("code", code);

      if (insertErr) {
        console.error("[telegram-webhook] gagal insert link:", insertErr);
        await sendTelegramMessage(chatId, "Gagal menghubungkan akun, coba lagi sebentar.");
        return res.status(200).json({ ok: true });
      }

      await sendTelegramMessage(chatId, `✅ Berhasil terhubung! Ketik /help buat lihat semua perintah yang bisa dipakai.`);
      return res.status(200).json({ ok: true });
    }

    // ── Dari sini, semua command butuh chat yang udah linked ──
    if (!link) {
      await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
      return res.status(200).json({ ok: true });
    }

    const userId = link.user_id;
    const { data: userRow } = await supabase.from("users").select("mode, name").eq("id", userId).maybeSingle();
    const mode = userRow?.mode || "personal";

    // ── Command: /unlink ──
    if (text === "/unlink") {
      await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, "🔌 Akun berhasil diputuskan dari bot ini. Ketik /link <kode> kalau mau hubungin lagi.");
      return res.status(200).json({ ok: true });
    }

    // ── Command: /help ──
    if (text === "/help") {
      await sendTelegramMessage(chatId, mode === "umkm" ? HELP_TEXT_UMKM : HELP_TEXT_PERSONAL);
      return res.status(200).json({ ok: true });
    }

    // ── Command: /saldo (dua mode) ──
    if (text === "/saldo") {
      await sendTelegramMessage(chatId, await getSaldoText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    // ── Command: /laporan (dua mode) ──
    if (text === "/laporan") {
      await sendTelegramMessage(chatId, await getLaporanText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    // ── Command khusus Personal ──
    if (mode === "personal") {
      if (text === "/utang")  { await sendTelegramMessage(chatId, await getUtangText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/target") { await sendTelegramMessage(chatId, await getTargetText(userId)); return res.status(200).json({ ok: true }); }
    }

    // ── Command khusus UMKM ──
    if (mode === "umkm") {
      if (text === "/stok")  { await sendTelegramMessage(chatId, await getStokText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/harga") { await sendTelegramMessage(chatId, await getHargaText(userId)); return res.status(200).json({ ok: true }); }
      if (text === "/aset")  { await sendTelegramMessage(chatId, await getAsetText(userId));  return res.status(200).json({ ok: true }); }
    }

    // ── Nggak ada command yang cocok ──
    await sendTelegramMessage(chatId, `Perintah belum dikenali. Ketik /help buat lihat daftar perintah yang bisa dipakai.`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[telegram-webhook] error:", err);
    // Tetap balas 200 biar Telegram nggak spam retry kirim update yang sama
    return res.status(200).json({ ok: true });
  }
}
