// /api/telegram.js — Vercel Serverless Function
// Digabung dari 2 file (telegram.js + telegram-webhook.js) jadi SATU function
// biar hemat kuota "12 Serverless Functions" di Vercel Hobby plan.
//
// Function ini punya 2 "identitas" yang dibedain dari HEADER request-nya:
//
// 1) DIPANGGIL DARI WEBSITE (frontend, pakai JWT Authorization header):
//    GET  /api/telegram                       -> status link akun
//    POST /api/telegram?action=generate-code  -> generate kode 6 digit
//    POST /api/telegram?action=unlink         -> putuskan koneksi
//
// 2) DIPANGGIL DARI TELEGRAM (webhook, pakai header rahasia bawaan Telegram):
//    POST /api/telegram   (dengan header X-Telegram-Bot-Api-Secret-Token)
//    -> INI YANG DIDAFTARIN KE TELEGRAM WAKTU SETWEBHOOK, ganti dari
//       /api/telegram-webhook jadi /api/telegram (URL-nya beda dari sebelumnya!)
//
// SETUP YANG WAJIB DILAKUKAN MANUAL:
// 1. Bikin bot lewat @BotFather, dapetin BOT TOKEN.
// 2. Set environment variables di Vercel:
//    - TELEGRAM_BOT_TOKEN
//    - TELEGRAM_WEBHOOK_SECRET  (string acak bikin sendiri, minimal 16 karakter)
// 3. Daftarin webhook (URL-nya sekarang /api/telegram, BUKAN /api/telegram-webhook lagi):
//    https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<DOMAIN>/api/telegram&secret_token=<SECRET>

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { sendTelegramMessage, escapeMd } from "./_lib/telegram.js";
import {
  getSaldoText, getLaporanText, getUtangText, getTargetText,
  getStokText, getHargaText, getAsetText, formatRupiahTG,
} from "./_lib/telegram-data.js";
import { handleFreeText, undoLastTransaction } from "./_lib/telegram-ai.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;

function getUserId(req) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id || decoded.userId || decoded.sub;
  } catch {
    return null;
  }
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ═══════════════════════════════════════════════════════════════════════
  // JALUR 1: WEBHOOK TELEGRAM — dikenali dari header secret bawaan Telegram.
  // Ini dicek DULUAN, sebelum jalur JWT, karena request dari Telegram nggak
  // bawa Authorization header sama sekali.
  // ═══════════════════════════════════════════════════════════════════════
  const tgSecretHeader = req.headers["x-telegram-bot-api-secret-token"];
  if (tgSecretHeader !== undefined) {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || tgSecretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false });
    }
    return handleTelegramWebhook(req, res);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JALUR 2: DIPANGGIL DARI WEBSITE — butuh JWT biasa
  // ═══════════════════════════════════════════════════════════════════════
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized." });

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("telegram_links")
        .select("telegram_chat_id, telegram_username, telegram_first_name, linked_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ success: true, linked: !!data, data: data || null });
    }

    if (req.method === "POST" && req.query.action === "generate-code") {
      await supabase.from("telegram_link_codes").delete().eq("user_id", userId);

      let code = genCode();
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase.from("telegram_link_codes").select("code").eq("code", code).maybeSingle();
        if (!existing) break;
        code = genCode();
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const { error } = await supabase.from("telegram_link_codes").insert({ code, user_id: userId, expires_at: expiresAt });
      if (error) throw error;

      return res.status(200).json({ success: true, code, expiresAt });
    }

    if (req.method === "POST" && req.query.action === "unlink") {
      const { error } = await supabase.from("telegram_links").delete().eq("user_id", userId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, message: "Method/action tidak dikenal." });
  } catch (err) {
    console.error("[telegram] error:", err);
    return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan server." });
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Logic webhook Telegram — persis sama kayak isi api/telegram-webhook.js
// sebelumnya, cuma dipindah jadi function biasa di sini.
// ═════════════════════════════════════════════════════════════════════════

const HELP_TEXT_UNLINKED =
  `👋 Halo! Aku FinSight Bot.\n\n` +
  `Akun kamu belum terhubung. Buka halaman *Profil* di web/app FinSight, klik "Hubungkan Telegram", ` +
  `nanti muncul kode 6 digit. Kirim ke sini pakai format:\n\n` +
  `/link 123456`;

const HELP_TEXT_PERSONAL =
  `🤖 *Perintah yang tersedia:*\n\n` +
  `/saldo — saldo tiap dompet\n` +
  `/laporan — ringkasan bulan ini\n` +
  `/laporan semua — semua periode\n` +
  `/laporan juni — bulan tertentu (atau \`2026-06\`)\n` +
  `/utang — daftar utang & cicilan aktif\n` +
  `/target — progress target tabungan\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/unlink — putuskan koneksi akun\n\n` +
  `Kamu juga bisa langsung ngetik bebas, misal:\n` +
  `_"beli kopi 20rb"_ → otomatis kecatet jadi transaksi\n` +
  `_"gimana cara nabung yang efektif?"_ → tanya AI Agent`;

const HELP_TEXT_UMKM =
  `🤖 *Perintah yang tersedia:*\n\n` +
  `/saldo — saldo tiap kas/dompet usaha\n` +
  `/laporan — omzet & pengeluaran bulan ini\n` +
  `/laporan semua — semua periode\n` +
  `/laporan juni — bulan tertentu (atau \`2026-06\`)\n` +
  `/stok — stok bahan baku\n` +
  `/harga — daftar harga produk\n` +
  `/aset — daftar aset usaha\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/unlink — putuskan koneksi akun\n\n` +
  `Kamu juga bisa langsung ngetik bebas, misal:\n` +
  `_"jual 2 kopi susu 40rb"_ → otomatis kecatet jadi transaksi\n` +
  `_"gimana strategi naikin omzet?"_ → tanya AI Agent`;

async function handleTelegramWebhook(req, res) {
  try {
    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text.trim();
    const from = message.from || {};

    const { data: link } = await supabase
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (text === "/start") {
      await sendTelegramMessage(chatId, link
        ? `Halo lagi, ${escapeMd(from.first_name || "")}! Akun kamu udah terhubung. Ketik /help buat lihat perintah yang ada.`
        : HELP_TEXT_UNLINKED);
      return res.status(200).json({ ok: true });
    }

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

    if (!link) {
      await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
      return res.status(200).json({ ok: true });
    }

    const userId = link.user_id;
    const { data: userRow } = await supabase.from("users").select("mode, name").eq("id", userId).maybeSingle();
    const mode = userRow?.mode || "personal";

    if (text === "/unlink") {
      await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, "🔌 Akun berhasil diputuskan dari bot ini. Ketik /link <kode> kalau mau hubungin lagi.");
      return res.status(200).json({ ok: true });
    }

    if (text === "/help") {
      await sendTelegramMessage(chatId, mode === "umkm" ? HELP_TEXT_UMKM : HELP_TEXT_PERSONAL);
      return res.status(200).json({ ok: true });
    }

    if (text === "/saldo") {
      await sendTelegramMessage(chatId, await getSaldoText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    if (text === "/laporan" || text.startsWith("/laporan ")) {
      const arg = text.replace("/laporan", "").trim();
      await sendTelegramMessage(chatId, await getLaporanText(userId, mode, arg));
      return res.status(200).json({ ok: true });
    }

    if (mode === "personal") {
      if (text === "/utang")  { await sendTelegramMessage(chatId, await getUtangText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/target") { await sendTelegramMessage(chatId, await getTargetText(userId)); return res.status(200).json({ ok: true }); }
    }

    if (mode === "umkm") {
      if (text === "/stok")  { await sendTelegramMessage(chatId, await getStokText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/harga") { await sendTelegramMessage(chatId, await getHargaText(userId)); return res.status(200).json({ ok: true }); }
      if (text === "/aset")  { await sendTelegramMessage(chatId, await getAsetText(userId));  return res.status(200).json({ ok: true }); }
    }

    // ── Command: /batal — hapus transaksi terakhir yang dicatet lewat bot ──
    if (text === "/batal") {
      const undo = await undoLastTransaction(userId, mode);
      if (!undo.success) {
        await sendTelegramMessage(chatId, "Nggak ada transaksi yang bisa dibatalin.");
      } else {
        await sendTelegramMessage(chatId, `🗑 Dibatalin: *${undo.data.description || undo.data.category}* — ${formatRupiahTG(undo.data.amount)}`);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Command lain yang diawali "/" tapi nggak dikenal ──
    if (text.startsWith("/")) {
      await sendTelegramMessage(chatId, `Perintah belum dikenali. Ketik /help buat lihat daftar perintah yang bisa dipakai.`);
      return res.status(200).json({ ok: true });
    }

    // ── Bukan command — coba pahami sebagai catat transaksi ATAU obrolan bebas ke AI ──
    await sendTelegramMessage(chatId, "⌛ Sebentar, aku proses dulu...");
    const result = await handleFreeText(userId, mode, text);

    if (result.type === "need_api_key") {
      await sendTelegramMessage(chatId, "Fitur ini butuh API key Groq kamu dulu — atur di halaman *Profil* di web ya (gratis, tinggal daftar di console.groq.com).");
    } else if (result.type === "error") {
      await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
    } else if (result.type === "transaction_saved") {
      const t = result.data;
      const emoji = t.type === "pemasukan" ? "💰" : "🛒";
      await sendTelegramMessage(chatId,
        `${emoji} *Tercatat!*\n${t.description || t.category}\n${formatRupiahTG(t.amount)} — ${t.category}\n\n` +
        `${result.reply || ""}\n\n_Salah catat? Ketik /batal buat ngehapus._`
      );
    } else {
      await sendTelegramMessage(chatId, result.reply || "Maaf, aku kurang paham maksudnya.");
    }
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[telegram-webhook] error:", err);
    return res.status(200).json({ ok: true });
  }
}
