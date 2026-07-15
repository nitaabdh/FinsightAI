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
import { sendTelegramMessage, sendTelegramMessageWithButtons, answerCallbackQuery, escapeMd } from "./_lib/telegram.js";
import {
  getSaldoText, getLaporanText, getUtangText, getTargetText,
  getStokText, getHargaText, getAsetText, formatRupiahTG,
  getUtangPiutangText, getBiayaText, adjustStok,
  parseFlexibleDate, getUpcomingAcaraText, addAcara,
  getCatatanListText, addCatatan, editCatatanByIndex,
  payCicilan, nabungTarget, getRiwayatText,
} from "./_lib/telegram-data.js";
import { handleFreeText, undoLastTransaction, resetChatHistory, handleReceiptPhoto, handleVoiceMessage, executePendingAction, cancelPendingAction } from "./_lib/telegram-ai.js";

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
  `/bayar nama_utang — bayar cicilan (contoh: \`/bayar KTA Bank Jago\`)\n` +
  `/target — progress target tabungan\n` +
  `/nabung nama_target jumlah — nabung ke target (contoh: \`/nabung Dana Darurat 100rb\`)\n` +
  `/riwayat — 10 transaksi terakhir\n` +
  `/acara — acara terdekat\n` +
  `/acara+ tanggal judul — tambah acara (contoh: \`/acara+ 25 juli Rapat\`)\n` +
  `/catatan — lihat catatan (bernomor)\n` +
  `/catatan+ isi — tambah catatan baru\n` +
  `/catatanedit nomor isi_baru — edit catatan\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/lupa — reset ingatan obrolan AI\n` +
  `/unlink — putuskan koneksi akun\n` +
  `/nudgeoff — matiin reminder malam catat keuangan\n\n` +
  `Kamu juga bisa langsung ngetik bebas, misal:\n` +
  `_"beli kopi 20rb"_ → langsung kecatet (nggak butuh API key)\n` +
  `_"inget rapat sama klien besok"_ → otomatis jadi acara (butuh API key)\n` +
  `_"catat jangan lupa isi ulang token listrik"_ → otomatis jadi catatan (butuh API key)\n` +
  `_"gimana cara nabung yang efektif?"_ → tanya AI Agent (butuh API key Groq di Profil)\n\n` +
  `📸 Kirim *foto struk belanja* juga bisa — otomatis kebaca & kecatet (butuh API key Groq juga)\n\n` +
  `🎙️ Kirim *pesan suara* juga bisa — tinggal ngomong aja, nanti ditranskrip & diproses otomatis (butuh API key Groq juga)`;

const HELP_TEXT_UMKM =
  `🤖 *Perintah yang tersedia:*\n\n` +
  `/saldo — saldo tiap kas/dompet usaha\n` +
  `/laporan — omzet & pengeluaran bulan ini\n` +
  `/laporan semua — semua periode\n` +
  `/laporan juni — bulan tertentu (atau \`2026-06\`)\n` +
  `/riwayat — 10 transaksi terakhir\n` +
  `/stok — stok bahan baku\n` +
  `/stok+ nama jumlah — tambah stok (contoh: \`/stok+ kopi arabika 5\`)\n` +
  `/stok- nama jumlah — kurangi stok\n` +
  `/harga — daftar harga jual produk (reguler & online)\n` +
  `/aset — daftar aset usaha\n` +
  `/utangpiutang — daftar utang & piutang usaha aktif\n` +
  `/biaya — daftar biaya operasional\n` +
  `/acara — acara terdekat\n` +
  `/acara+ tanggal judul — tambah acara (contoh: \`/acara+ 25 juli Rapat\`)\n` +
  `/catatan — lihat catatan (bernomor)\n` +
  `/catatan+ isi — tambah catatan baru\n` +
  `/catatanedit nomor isi_baru — edit catatan\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/lupa — reset ingatan obrolan AI\n` +
  `/unlink — putuskan koneksi akun\n` +
  `/nudgeoff — matiin reminder malam catat keuangan\n\n` +
  `Kamu juga bisa langsung ngetik bebas, misal:\n` +
  `_"jual 2 kopi susu 40rb"_ → langsung kecatet (nggak butuh API key)\n` +
  `_"tambahin stok kopi arabika 5kg"_ → otomatis update stok (butuh API key)\n` +
  `_"inget rapat sama supplier besok"_ → otomatis jadi acara (butuh API key)\n` +
  `_"gimana strategi naikin omzet?"_ → tanya AI Agent (butuh API key Groq di Profil)\n\n` +
  `📸 Kirim *foto struk belanja* juga bisa — otomatis kebaca & kecatet (butuh API key Groq juga)\n\n` +
  `🎙️ Kirim *pesan suara* juga bisa — tinggal ngomong aja, nanti ditranskrip & diproses otomatis (butuh API key Groq juga)`;

// Dipakai bareng oleh jalur teks bebas DAN voice note — biar tampilan hasilnya konsisten.
async function displayFreeTextResult(chatId, result) {
  if (result.type === "need_api_key") {
    await sendTelegramMessage(chatId, "Fitur ini butuh API key Groq kamu dulu — atur di halaman *Profil* di web ya (gratis, tinggal daftar di console.groq.com).");
  } else if (result.type === "error") {
    await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
  } else if (result.type === "transaction_saved") {
    const t = result.data;
    const emoji = t.type === "pemasukan" ? "💰" : "🛒";
    const tag = result.quick ? "⚡" : "🤖";
    await sendTelegramMessage(chatId,
      `${emoji} *Tercatat!* ${tag}\n${t.description || t.category}\n${formatRupiahTG(t.amount)} — ${t.category}\n\n` +
      `${result.reply || ""}\n\n_Salah catat? Ketik /batal buat ngehapus._`
    );
  } else if (result.type === "note_saved") {
    await sendTelegramMessage(chatId, `📝 *Catatan tersimpan!* 🤖\n${result.data.title}\n\n${result.reply || ""}`);
  } else if (result.type === "event_saved") {
    const tglLabel = new Date(result.dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    await sendTelegramMessage(chatId, `📅 *Acara tersimpan!* 🤖\n${result.data.title} — ${tglLabel}\n\n${result.reply || ""}`);
  } else if (result.type === "stock_adjusted") {
    const s = result.data;
    const arrow = s.stokBaru >= s.stokLama ? "📈" : "📉";
    await sendTelegramMessage(chatId, `${arrow} *Stok ${s.nama} diperbarui!* 🤖\n${s.stokLama} → *${s.stokBaru}* ${s.satuan}\n\n${result.reply || ""}`);
  } else if (result.type === "needs_confirmation") {
    await sendTelegramMessageWithButtons(
      chatId,
      `🤔 *Aku kurang yakin, ini maksudnya gini kan?*\n\n${result.previewText}\n\n${result.reply || ""}`,
      [
        { text: "✅ Benar", data: `confirm:${result.pendingId}` },
        { text: "❌ Bukan", data: `cancel:${result.pendingId}` },
      ]
    );
  } else {
    await sendTelegramMessage(chatId, result.reply || "Maaf, aku kurang paham maksudnya.");
  }
}

async function handleTelegramWebhook(req, res) {
  try {
    const update = req.body;

    // ── Anti proses-dobel: kalau update_id ini udah pernah diproses, skip.
    // Telegram kadang ngirim ulang update yang sama kalau respon kita lambat. ──
    if (update?.update_id) {
      const { error: dupErr } = await supabase.from("telegram_processed_updates").insert({ update_id: update.update_id });
      if (dupErr) {
        // gagal insert karena PK udah ada = update ini udah pernah diproses sebelumnya
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    // ── Tap tombol konfirmasi (✅/❌) ──
    if (update?.callback_query) {
      const cq = update.callback_query;
      const cqChatId = cq.message?.chat?.id;
      const [action, pendingId] = (cq.data || "").split(":");

      if (action === "confirm" && pendingId) {
        const result = await executePendingAction(pendingId);
        await answerCallbackQuery(cq.id);
        if (!result.success) {
          await sendTelegramMessage(cqChatId, `⚠️ ${result.message}`);
        } else if (result.type === "transaction_saved") {
          const t = result.data;
          const emoji = t.type === "pemasukan" ? "💰" : "🛒";
          await sendTelegramMessage(cqChatId, `${emoji} *Tercatat!*\n${t.description || t.category}\n${formatRupiahTG(t.amount)} — ${t.category}\n\n_Salah catat? Ketik /batal buat ngehapus._`);
        } else if (result.type === "note_saved") {
          await sendTelegramMessage(cqChatId, `📝 *Catatan tersimpan!*\n${result.data.title}`);
        } else if (result.type === "event_saved") {
          const tglLabel = new Date(result.dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
          await sendTelegramMessage(cqChatId, `📅 *Acara tersimpan!*\n${result.data.title} — ${tglLabel}`);
        } else if (result.type === "stock_adjusted") {
          const s = result.data;
          const arrow = s.stokBaru >= s.stokLama ? "📈" : "📉";
          await sendTelegramMessage(cqChatId, `${arrow} *Stok ${s.nama} diperbarui!*\n${s.stokLama} → *${s.stokBaru}* ${s.satuan}`);
        }
        return res.status(200).json({ ok: true });
      }

      if (action === "cancel" && pendingId) {
        await cancelPendingAction(pendingId);
        await answerCallbackQuery(cq.id, "Dibatalin");
        await sendTelegramMessage(cqChatId, "Oke, dibatalin. Nggak ada yang kesimpen. 👍");
        return res.status(200).json({ ok: true });
      }

      await answerCallbackQuery(cq.id);
      return res.status(200).json({ ok: true });
    }

    const message = update?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const from = message.from || {};

    // ── Foto dikirim -> kemungkinan struk belanja ──
    if (message.photo && message.photo.length > 0) {
      const { data: photoLink } = await supabase
        .from("telegram_links")
        .select("user_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!photoLink) {
        await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
        return res.status(200).json({ ok: true });
      }

      const { data: userRow2 } = await supabase.from("users").select("mode").eq("id", photoLink.user_id).maybeSingle();
      const photoMode = userRow2?.mode || "personal";

      await sendTelegramMessage(chatId, "📸 Foto diterima, aku baca dulu struknya...");
      const biggestPhoto = message.photo[message.photo.length - 1]; // resolusi paling besar
      const result = await handleReceiptPhoto(photoLink.user_id, photoMode, biggestPhoto.file_id);

      if (result.type === "need_api_key") {
        await sendTelegramMessage(chatId, "Fitur baca struk butuh API key Groq kamu dulu — atur di halaman *Profil* di web ya (gratis, tinggal daftar di console.groq.com).");
      } else if (result.type === "not_a_receipt") {
        await sendTelegramMessage(chatId, "Hmm, ini kayaknya bukan foto struk/nota belanja. Kirim foto struk yang jelas ya.");
      } else if (result.type === "receipt_unclear") {
        const d = result.data || {};
        await sendTelegramMessage(chatId,
          `🤔 Struknya kebaca tapi kurang jelas (mungkin buram/gelap/kepotong).\n` +
          `${d.merchant ? `Toko: ${d.merchant}\n` : ""}${d.total ? `Total keliatan: ${formatRupiahTG(d.total)}\n` : ""}\n` +
          `Coba foto ulang yang lebih terang & fokus ke bagian totalnya, atau catat manual aja lewat chat biasa.`
        );
      } else if (result.type === "error") {
        await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
      } else if (result.type === "transaction_saved") {
        const t = result.data;
        await sendTelegramMessage(chatId,
          `🧾 *Struk kebaca & tercatat!*\n${t.description}\n${formatRupiahTG(t.amount)} — ${t.category}\n\n` +
          `_Salah baca? Ketik /batal buat ngehapus._`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // ── Voice note dikirim -> transkrip dulu, baru diproses kayak teks biasa ──
    if (message.voice) {
      const { data: voiceLink } = await supabase
        .from("telegram_links")
        .select("user_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!voiceLink) {
        await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
        return res.status(200).json({ ok: true });
      }

      const { data: userRow3 } = await supabase.from("users").select("mode").eq("id", voiceLink.user_id).maybeSingle();
      const voiceMode = userRow3?.mode || "personal";

      await sendTelegramMessage(chatId, "🎙️ Pesan suara diterima, aku dengerin dulu...");
      const result = await handleVoiceMessage(voiceLink.user_id, voiceMode, message.voice.file_id);

      if (result.transcript) {
        await sendTelegramMessage(chatId, `_"${result.transcript}"_`);
      }
      await displayFreeTextResult(chatId, result);
      return res.status(200).json({ ok: true });
    }

    if (!message.text) return res.status(200).json({ ok: true });
    const text = message.text.trim();

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

    if (text === "/nudgeoff") {
      await supabase.from("telegram_links").update({ daily_nudge_enabled: false }).eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, "🔕 Oke, reminder malam \"jangan lupa catat keuangan\" aku matiin. Ketik /nudgeon kalau mau nyalain lagi.");
      return res.status(200).json({ ok: true });
    }
    if (text === "/nudgeon") {
      await supabase.from("telegram_links").update({ daily_nudge_enabled: true }).eq("telegram_chat_id", chatId);
      await sendTelegramMessage(chatId, "🔔 Oke, reminder malam aku nyalain lagi.");
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

    // ── Kalender & Catatan — sama-sama ada di dua mode ──
    if (text === "/acara") {
      await sendTelegramMessage(chatId, await getUpcomingAcaraText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/acara+")) {
      const rest = text.replace("/acara+", "").trim();
      // Format: /acara+ <tanggal> <judul>  — tanggal bisa "25 juli", "besok", "2026-07-25", dst
      const match = rest.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{4})?|besok|lusa|hari ini|\d{1,2}\s+\S+(?:\s+\d{4})?)\s+(.+)$/i);
      if (!match) {
        await sendTelegramMessage(chatId, `Format: \`/acara+ tanggal judul\`\nContoh: \`/acara+ 25 juli Rapat sama supplier\` atau \`/acara+ besok Bayar sewa\``);
        return res.status(200).json({ ok: true });
      }
      const dateStr = parseFlexibleDate(match[1]);
      if (!dateStr) {
        await sendTelegramMessage(chatId, `Tanggal "${match[1]}" nggak kebaca formatnya. Coba pakai "25 juli", "besok", atau "2026-07-25".`);
        return res.status(200).json({ ok: true });
      }
      const acara = await addAcara(userId, mode, match[2].trim(), dateStr);
      const tglLabel = new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
      await sendTelegramMessage(chatId, `📅 *Acara ditambahkan!*\n${acara.title} — ${tglLabel}`);
      return res.status(200).json({ ok: true });
    }

    if (text === "/catatan") {
      await sendTelegramMessage(chatId, await getCatatanListText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/catatan+")) {
      const isi = text.replace("/catatan+", "").trim();
      if (!isi) {
        await sendTelegramMessage(chatId, `Format: \`/catatan+ isi catatannya\``);
        return res.status(200).json({ ok: true });
      }
      await addCatatan(userId, mode, isi);
      await sendTelegramMessage(chatId, `📝 *Catatan ditambahkan!*\n${isi}`);
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/catatanedit")) {
      const rest = text.replace("/catatanedit", "").trim();
      const match = rest.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        await sendTelegramMessage(chatId, `Format: \`/catatanedit nomor isi_baru\`\nContoh: \`/catatanedit 2 Beli oleh-oleh weekend depan\`\n\nCek nomornya dulu pakai /catatan.`);
        return res.status(200).json({ ok: true });
      }
      const result = await editCatatanByIndex(userId, mode, Number(match[1]), match[2].trim());
      if (!result.success) {
        await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
      } else {
        await sendTelegramMessage(chatId, `✏️ *Catatan #${match[1]} diperbarui!*\n${result.data.title}`);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Riwayat transaksi (universal) ──
    if (text === "/riwayat") {
      await sendTelegramMessage(chatId, await getRiwayatText(userId, mode));
      return res.status(200).json({ ok: true });
    }

    if (mode === "personal") {
      if (text === "/utang")  { await sendTelegramMessage(chatId, await getUtangText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/target") { await sendTelegramMessage(chatId, await getTargetText(userId)); return res.status(200).json({ ok: true }); }

      // /bayar <nama utang>
      if (text.startsWith("/bayar")) {
        const nama = text.replace("/bayar", "").trim();
        if (!nama) {
          await sendTelegramMessage(chatId, `Format: \`/bayar nama utang\`\nContoh: \`/bayar KTA Bank Jago\`\n\nCek nama persisnya di /utang.`);
          return res.status(200).json({ ok: true });
        }
        try {
          const result = await payCicilan(userId, nama);
          if (!result.success) {
            await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
          } else {
            const sisaTenor = result.tenor ? `\nSisa tenor: ${Math.max(result.tenor - result.newBulanTerbayar, 0)} bulan` : "";
            await sendTelegramMessage(chatId,
              `💸 *Cicilan ${result.nama} dibayar!*\n${formatRupiahTG(result.amount)}${sisaTenor}\n\n` +
              (result.newLunas ? "🎉 *LUNAS!* Selamat, utang ini udah beres." : "")
            );
          }
        } catch (err) {
          console.error("[telegram] gagal bayar cicilan:", err);
          await sendTelegramMessage(chatId, "Gagal proses pembayaran, coba lagi ya.");
        }
        return res.status(200).json({ ok: true });
      }

      // /nabung <nama target> <jumlah>
      if (text.startsWith("/nabung")) {
        const rest = text.replace("/nabung", "").trim();
        const match = rest.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?$/i);
        if (!match) {
          await sendTelegramMessage(chatId, `Format: \`/nabung nama target jumlah\`\nContoh: \`/nabung Dana Darurat 100rb\`\n\nCek nama persisnya di /target.`);
          return res.status(200).json({ ok: true });
        }
        const namaTarget = match[1].trim();
        let jumlah = parseFloat(match[2].replace(",", "."));
        const unit = (match[3] || "").toLowerCase();
        if (unit === "rb" || unit === "ribu" || unit === "k") jumlah *= 1000;
        else if (unit === "jt" || unit === "juta") jumlah *= 1000000;

        try {
          const result = await nabungTarget(userId, mode, namaTarget, jumlah);
          if (!result.success) {
            await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
          } else {
            const pct = result.target > 0 ? ((result.newTerkumpul / result.target) * 100).toFixed(0) : 0;
            await sendTelegramMessage(chatId,
              `🎯 *Nabung ke ${result.nama} berhasil!*\n${formatRupiahTG(result.jumlah)} ditambahkan\n` +
              `Progress: ${formatRupiahTG(result.newTerkumpul)} / ${formatRupiahTG(result.target)} (${pct}%)`
            );
          }
        } catch (err) {
          console.error("[telegram] gagal nabung:", err);
          await sendTelegramMessage(chatId, "Gagal proses nabung, coba lagi ya.");
        }
        return res.status(200).json({ ok: true });
      }
    }

    if (mode === "umkm") {
      if (text === "/stok")  { await sendTelegramMessage(chatId, await getStokText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/harga") { await sendTelegramMessage(chatId, await getHargaText(userId)); return res.status(200).json({ ok: true }); }
      if (text === "/aset")  { await sendTelegramMessage(chatId, await getAsetText(userId));  return res.status(200).json({ ok: true }); }
      if (text === "/utangpiutang") { await sendTelegramMessage(chatId, await getUtangPiutangText(userId)); return res.status(200).json({ ok: true }); }
      if (text === "/biaya") { await sendTelegramMessage(chatId, await getBiayaText(userId)); return res.status(200).json({ ok: true }); }

      // /stok+ <nama bahan> <jumlah>  atau  /stok- <nama bahan> <jumlah>
      if (text.startsWith("/stok+") || text.startsWith("/stok-")) {
        const tipe = text.startsWith("/stok+") ? "tambah" : "kurang";
        const rest = text.replace(/^\/stok[+-]/, "").trim();
        const match = rest.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/); // "nama bahan" + angka di akhir
        if (!match) {
          await sendTelegramMessage(chatId, `Format: \`/stok+ nama bahan jumlah\` atau \`/stok- nama bahan jumlah\`\nContoh: \`/stok+ kopi arabika 5\``);
          return res.status(200).json({ ok: true });
        }
        const namaBahan = match[1].trim();
        const jumlah = parseFloat(match[2].replace(",", "."));

        try {
          const result = await adjustStok(userId, namaBahan, jumlah, tipe);
          if (!result.success) {
            await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
          } else {
            const arrow = tipe === "tambah" ? "📈" : "📉";
            await sendTelegramMessage(chatId,
              `${arrow} *Stok ${result.nama} diperbarui*\n${result.stokLama} → *${result.stokBaru}* ${result.satuan}`
            );
          }
        } catch (err) {
          console.error("[telegram] gagal adjust stok:", err);
          await sendTelegramMessage(chatId, "Gagal update stok, coba lagi ya.");
        }
        return res.status(200).json({ ok: true });
      }
    }

    // ── Command: /lupa — reset ingatan obrolan AI (bukan hapus data transaksi/dll) ──
    if (text === "/lupa") {
      await resetChatHistory(userId);
      await sendTelegramMessage(chatId, "🧹 Oke, ingatan obrolan aku direset. Data transaksi/utang/target kamu tetap aman ya, ini cuma reset konteks chat aja.");
      return res.status(200).json({ ok: true });
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
    const quickPreview = /\d/.test(text); // ada angka -> kemungkinan transaksi, kasih indikator proses beda
    if (!quickPreview) {
      await sendTelegramMessage(chatId, "⌛ Sebentar, aku proses dulu...");
    }
    const result = await handleFreeText(userId, mode, text);
    await displayFreeTextResult(chatId, result);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[telegram-webhook] error:", err);
    return res.status(200).json({ ok: true });
  }
}
