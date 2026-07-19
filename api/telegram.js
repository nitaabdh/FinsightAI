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

// URL web app, dipakai buat tombol shortcut "Buka Aplikasi" di chat Telegram.
// Isi env var APP_URL di Vercel; fallback di bawah cuma placeholder.
const APP_URL = process.env.APP_URL || "https://your-app-domain.com";

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

// ═════════════════════════════════════════════════════════════════════════
// Multi-akun per chat: satu chat Telegram sekarang boleh terhubung ke
// MAKSIMAL 2 akun sekaligus (1 Personal + 1 UMKM, karena cuma itu 2 mode
// yang ada). Yang aktif (dipakai buat proses command) ditandai `is_active`.
// Satu akun (user_id) tetap cuma boleh nempel ke 1 chat pada satu waktu.
// ═════════════════════════════════════════════════════════════════════════

// Semua link di satu chat, sudah digabung sama mode akunnya masing-masing.
async function getLinksForChat(chatId) {
  const { data: links } = await supabase
    .from("telegram_links")
    .select("user_id, is_active, telegram_username, telegram_first_name")
    .eq("telegram_chat_id", chatId);
  if (!links || links.length === 0) return [];

  const ids = links.map((l) => l.user_id);
  const { data: users } = await supabase.from("users").select("id, mode, name").in("id", ids);
  return links.map((l) => ({
    ...l,
    mode: users?.find((u) => u.id === l.user_id)?.mode || "personal",
    name: users?.find((u) => u.id === l.user_id)?.name || "",
  }));
}

// Link yang lagi AKTIF di suatu chat (yang dipakai proses command/foto/voice).
// Kalau ada link tapi somehow gak ada yang `is_active` (harusnya gak kejadian),
// self-heal: pilih yang pertama & set aktif, biar bot gak macet total.
async function getActiveLink(chatId) {
  const links = await getLinksForChat(chatId);
  if (links.length === 0) return null;
  let active = links.find((l) => l.is_active);
  if (!active) {
    active = links[0];
    await supabase.from("telegram_links").update({ is_active: true }).eq("telegram_chat_id", chatId).eq("user_id", active.user_id);
  }
  return active;
}

// Jadiin satu akun sebagai aktif, nonaktifin akun lain di chat yang sama.
async function setActiveLink(chatId, userId) {
  await supabase.from("telegram_links").update({ is_active: true }).eq("telegram_chat_id", chatId).eq("user_id", userId);
  await supabase.from("telegram_links").update({ is_active: false }).eq("telegram_chat_id", chatId).neq("user_id", userId);
}

const MODE_LABEL = { umkm: "UMKM", personal: "Personal" };

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
  `/bayar \`nama_utang\` — bayar cicilan (contoh: \`/bayar KTA Bank Jago\`)\n` +
  `/target — progress target tabungan\n` +
  `/nabung \`nama_target\` jumlah — nabung ke target (contoh: \`/nabung Dana Darurat 100rb\`)\n` +
  `/riwayat — 10 transaksi terakhir\n` +
  `/acara — acara terdekat\n` +
  `/acara+ tanggal judul — tambah acara (contoh: \`/acara+ 25 juli Rapat\`)\n` +
  `/catatan — lihat catatan (bernomor)\n` +
  `/catatan+ isi — tambah catatan baru\n` +
  `/catatanedit nomor \`isi_baru\` — edit catatan\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/lupa — reset ingatan obrolan AI\n` +
  `/unlink — putuskan akun aktif (atau \`/unlink semua\`, \`/unlink personal\`, \`/unlink umkm\`)\n` +
  `/switch — pindah ke akun Personal/UMKM lain (kalau chat ini terhubung ke 2 akun)\n` +
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
  `/catatanedit nomor \`isi_baru\` — edit catatan\n` +
  `/batal — hapus transaksi terakhir yang salah kecatet\n` +
  `/lupa — reset ingatan obrolan AI\n` +
  `/unlink — putuskan akun aktif (atau \`/unlink semua\`, \`/unlink personal\`, \`/unlink umkm\`)\n` +
  `/switch — pindah ke akun Personal/UMKM lain (kalau chat ini terhubung ke 2 akun)\n` +
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
        // Kode "23505" = unique/PK violation di Postgres -> ini beneran duplikat, aman di-skip.
        // Kode lain (tabel belum ada, RLS salah, koneksi gagal, dst) BUKAN duplikat -> harus
        // kelihatan di log, jangan diem-diem di-skip kayak dulu (bikin bot keliatan "gak jalan"
        // tanpa jejak error sama sekali).
        if (dupErr.code === "23505") {
          return res.status(200).json({ ok: true, duplicate: true });
        }
        console.error("[telegram-webhook] gagal cek/insert processed_updates (BUKAN duplikat):", dupErr);
        // Tetep lanjut proses pesannya daripada bot diem total gara-gara tabel dedup ini bermasalah.
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
      const photoActive = await getActiveLink(chatId);

      if (!photoActive) {
        await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
        return res.status(200).json({ ok: true });
      }

      await sendTelegramMessage(chatId, `📸 Foto diterima (akun ${MODE_LABEL[photoActive.mode]}), aku baca dulu struknya...`);
      const biggestPhoto = message.photo[message.photo.length - 1]; // resolusi paling besar
      const result = await handleReceiptPhoto(photoActive.user_id, photoActive.mode, biggestPhoto.file_id);

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
      const voiceActive = await getActiveLink(chatId);

      if (!voiceActive) {
        await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
        return res.status(200).json({ ok: true });
      }

      await sendTelegramMessage(chatId, `🎙️ Pesan suara diterima (akun ${MODE_LABEL[voiceActive.mode]}), aku dengerin dulu...`);
      const result = await handleVoiceMessage(voiceActive.user_id, voiceActive.mode, message.voice.file_id);

      if (result.transcript) {
        await sendTelegramMessage(chatId, `_"${result.transcript}"_`);
      }
      await displayFreeTextResult(chatId, result);
      return res.status(200).json({ ok: true });
    }

    if (!message.text) return res.status(200).json({ ok: true });
    const text = message.text.trim();

    // Semua akun yang nempel di chat ini sekarang (0, 1, atau 2 — max 1 Personal + 1 UMKM)
    const linksNow = await getLinksForChat(chatId);
    const activeNow = linksNow.find((l) => l.is_active) || linksNow[0] || null;

    // Logic linking dipisah jadi function biar bisa dipanggil dari 2 jalur:
    // 1) user ketik manual "/link 123456"
    // 2) user pencet tombol shortcut di web -> buka t.me/bot?start=link_123456
    async function performLink(code) {
      if (!code) {
        await sendTelegramMessage(chatId, "Format: `/link 123456` — ambil kode 6 digitnya dari halaman Profil di web.");
        return;
      }

      // Anti brute-force: batasi percobaan kode salah per chat, biar kode 6
      // digit nggak bisa ditebak-tebak berkali-kali dalam waktu singkat.
      const { data: attemptRow } = await supabase
        .from("telegram_link_attempts")
        .select("*")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (attemptRow?.locked_until && new Date(attemptRow.locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(attemptRow.locked_until) - new Date()) / 60000);
        await sendTelegramMessage(chatId, `🔒 Kebanyakan percobaan kode salah. Coba lagi dalam ${minutesLeft} menit.`);
        return;
      }

      const { data: codeRow } = await supabase.from("telegram_link_codes").select("*").eq("code", code).maybeSingle();
      if (!codeRow) {
        const windowActive = attemptRow && new Date(attemptRow.window_started_at) > new Date(Date.now() - 5 * 60 * 1000);
        const nextAttempts = windowActive ? (attemptRow.attempts || 0) + 1 : 1;
        const shouldLock = nextAttempts >= 5;

        await supabase.from("telegram_link_attempts").upsert({
          telegram_chat_id: chatId,
          attempts: shouldLock ? 0 : nextAttempts,
          window_started_at: windowActive ? attemptRow.window_started_at : new Date().toISOString(),
          locked_until: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
        });

        await sendTelegramMessage(chatId, shouldLock
          ? "🔒 Kebanyakan percobaan kode salah. Coba lagi dalam 15 menit."
          : "❌ Kode nggak ditemukan atau salah ketik. Cek lagi kodenya di halaman Profil.");
        return;
      }
      if (new Date(codeRow.expires_at) < new Date()) {
        await supabase.from("telegram_link_codes").delete().eq("code", code);
        await sendTelegramMessage(chatId, "⌛ Kode udah kedaluwarsa (berlaku 5 menit). Generate kode baru dari halaman Profil ya.");
        return;
      }

      const { data: targetUserRow } = await supabase.from("users").select("mode").eq("id", codeRow.user_id).maybeSingle();
      const targetMode = targetUserRow?.mode || "personal";
      const targetLabel = MODE_LABEL[targetMode];

      const already = linksNow.find((l) => l.user_id === codeRow.user_id);

      if (!already) {
        // Chat ini udah punya akun dengan MODE yang sama (misal udah ada Personal,
        // terus coba link akun Personal lain) -> tolak, harus unlink dulu.
        const sameModeOther = linksNow.find((l) => l.mode === targetMode);
        if (sameModeOther) {
          await sendTelegramMessage(chatId,
            `Chat ini udah terhubung ke akun *${targetLabel}* lain. Ketik \`/unlink ${targetMode}\` dulu kalau mau ganti akun ${targetLabel}-nya.`);
          return;
        }
        // Maksimal 2 akun per chat (1 Personal + 1 UMKM) — kasus ini seharusnya
        // gak pernah kejadian karena cuma ada 2 mode, tapi dijaga buat aman.
        if (linksNow.length >= 2) {
          await sendTelegramMessage(chatId, "Chat ini udah terhubung ke 2 akun (maksimal). Ketik /unlink dulu kalau mau ganti salah satu.");
          return;
        }
      }

      // Pastiin akun (user_id) ini gak nyangkut di chat Telegram LAIN — 1 akun cuma
      // boleh nempel ke 1 chat pada satu waktu (kalau pindah HP/akun TG, ke-replace).
      await supabase.from("telegram_links").delete().eq("user_id", codeRow.user_id);

      const { error: insertErr } = await supabase.from("telegram_links").insert({
        user_id: codeRow.user_id,
        telegram_chat_id: chatId,
        telegram_username: from.username || null,
        telegram_first_name: from.first_name || null,
        is_active: true,
      });
      await supabase.from("telegram_link_codes").delete().eq("code", code);
      await supabase.from("telegram_link_attempts").delete().eq("telegram_chat_id", chatId);

      if (insertErr) {
        console.error("[telegram-webhook] gagal insert link:", insertErr);
        await sendTelegramMessage(chatId, "Gagal menghubungkan akun, coba lagi sebentar.");
        return;
      }

      // Akun yang baru di-link jadi AKTIF; nonaktifin akun lain di chat yang sama (kalau ada).
      await supabase.from("telegram_links").update({ is_active: false }).eq("telegram_chat_id", chatId).neq("user_id", codeRow.user_id);

      const totalLinked = already ? linksNow.length : linksNow.length + 1;
      const extraHint = totalLinked > 1
        ? `\n\nChat ini sekarang terhubung ke 2 akun (Personal & UMKM). Ketik /switch buat pindah-pindah kapan aja.`
        : "";

      await sendTelegramMessageWithButtons(chatId,
        `✅ Berhasil terhubung ke akun *${targetLabel}*!${extraHint}\n\nKetik /help buat lihat semua perintah yang bisa dipakai.`, [
          { text: "🌐 Buka Aplikasi", url: APP_URL },
        ]);
    }

    if (text === "/start" || text.startsWith("/start ")) {
      const payload = text.replace("/start", "").trim();
      // Payload "link_123456" datang dari tombol shortcut di web (deep link
      // t.me/<bot>?start=link_123456) -> langsung proses kayak /link, user
      // nggak perlu ngetik apa-apa lagi begitu chat kebuka.
      if (payload.startsWith("link_")) {
        await performLink(payload.replace("link_", "").trim());
        return res.status(200).json({ ok: true });
      }
      if (activeNow) {
        const otherHint = linksNow.length > 1 ? ` (akun aktif: *${MODE_LABEL[activeNow.mode]}*, ketik /switch buat ganti)` : "";
        await sendTelegramMessageWithButtons(chatId, `Halo lagi, ${escapeMd(from.first_name || "")}! Akun kamu udah terhubung${otherHint}. Ketik /help buat lihat perintah yang ada.`, [
          { text: "🌐 Buka Aplikasi", url: APP_URL },
        ]);
      } else {
        await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
      }
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/link")) {
      await performLink(text.replace("/link", "").trim());
      return res.status(200).json({ ok: true });
    }

    if (!activeNow) {
      await sendTelegramMessage(chatId, HELP_TEXT_UNLINKED);
      return res.status(200).json({ ok: true });
    }

    const userId = activeNow.user_id;
    const mode = activeNow.mode;

    // /unlink            -> putuskan akun yang lagi AKTIF di chat ini
    // /unlink semua      -> putuskan SEMUA akun di chat ini (personal & umkm)
    // /unlink personal   -> putuskan akun Personal secara spesifik (nggak peduli lagi aktif atau nggak)
    // /unlink umkm       -> putuskan akun UMKM secara spesifik
    if (text === "/unlink" || text.startsWith("/unlink ")) {
      const arg = text.replace("/unlink", "").trim().toLowerCase();

      if (arg === "semua" || arg === "all") {
        await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId);
        await sendTelegramMessage(chatId, "🔌 Semua akun berhasil diputuskan dari bot ini. Ketik /link <kode> kalau mau hubungin lagi.");
        return res.status(200).json({ ok: true });
      }

      if (arg === "personal" || arg === "umkm") {
        const target = linksNow.find((l) => l.mode === arg);
        if (!target) {
          await sendTelegramMessage(chatId, `Chat ini nggak ada akun ${MODE_LABEL[arg]} yang terhubung.`);
          return res.status(200).json({ ok: true });
        }
        await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId).eq("user_id", target.user_id);
        const remaining = linksNow.filter((l) => l.user_id !== target.user_id);
        if (remaining.length > 0) {
          await setActiveLink(chatId, remaining[0].user_id);
          await sendTelegramMessage(chatId, `🔌 Akun ${MODE_LABEL[arg]} diputuskan. Otomatis pindah ke akun *${MODE_LABEL[remaining[0].mode]}* yang masih terhubung.`);
        } else {
          await sendTelegramMessage(chatId, `🔌 Akun ${MODE_LABEL[arg]} berhasil diputuskan dari bot ini. Ketik /link <kode> kalau mau hubungin lagi.`);
        }
        return res.status(200).json({ ok: true });
      }

      // Tanpa argumen -> putuskan akun yang lagi aktif aja
      await supabase.from("telegram_links").delete().eq("telegram_chat_id", chatId).eq("user_id", userId);
      const remaining = linksNow.filter((l) => l.user_id !== userId);
      if (remaining.length > 0) {
        await setActiveLink(chatId, remaining[0].user_id);
        await sendTelegramMessage(chatId, `🔌 Akun *${MODE_LABEL[mode]}* diputuskan. Otomatis pindah ke akun *${MODE_LABEL[remaining[0].mode]}* yang masih terhubung.`);
      } else {
        await sendTelegramMessage(chatId, "🔌 Akun berhasil diputuskan dari bot ini. Ketik /link <kode> kalau mau hubungin lagi.");
      }
      return res.status(200).json({ ok: true });
    }

    // /switch            -> kalau ada 2 akun terhubung, pindah ke yang satunya
    // /switch personal   -> pindah eksplisit ke akun Personal
    // /switch umkm       -> pindah eksplisit ke akun UMKM
    if (text === "/switch" || text.startsWith("/switch ")) {
      const arg = text.replace("/switch", "").trim().toLowerCase();

      if (linksNow.length < 2) {
        await sendTelegramMessage(chatId, `Chat ini cuma terhubung ke 1 akun (*${MODE_LABEL[mode]}*). Hubungkan akun satunya dulu lewat \`/link <kode>\` dari halaman Profil akun itu.`);
        return res.status(200).json({ ok: true });
      }

      let target;
      if (arg === "personal" || arg === "umkm") {
        target = linksNow.find((l) => l.mode === arg);
        if (!target) {
          await sendTelegramMessage(chatId, `Chat ini nggak ada akun ${MODE_LABEL[arg]} yang terhubung.`);
          return res.status(200).json({ ok: true });
        }
      } else {
        target = linksNow.find((l) => l.user_id !== userId); // toggle ke akun lainnya
      }

      await setActiveLink(chatId, target.user_id);
      await sendTelegramMessageWithButtons(chatId, `🔀 Pindah ke akun *${MODE_LABEL[target.mode]}*. Ketik /help buat lihat perintah yang tersedia di mode ini.`, [
        { text: "🌐 Buka Aplikasi", url: APP_URL },
      ]);
      return res.status(200).json({ ok: true });
    }

    if (text === "/nudgeoff") {
      await supabase.from("telegram_links").update({ daily_nudge_enabled: false }).eq("telegram_chat_id", chatId).eq("user_id", userId);
      await sendTelegramMessage(chatId, `🔕 Oke, reminder malam "jangan lupa catat keuangan" buat akun *${MODE_LABEL[mode]}* aku matiin. Ketik /nudgeon kalau mau nyalain lagi.`);
      return res.status(200).json({ ok: true });
    }
    if (text === "/nudgeon") {
      await supabase.from("telegram_links").update({ daily_nudge_enabled: true }).eq("telegram_chat_id", chatId).eq("user_id", userId);
      await sendTelegramMessage(chatId, `🔔 Oke, reminder malam buat akun *${MODE_LABEL[mode]}* aku nyalain lagi.`);
      return res.status(200).json({ ok: true });
    }

    if (text === "/help") {
      const baseHelp = mode === "umkm" ? HELP_TEXT_UMKM : HELP_TEXT_PERSONAL;
      const switchHint = linksNow.length > 1
        ? `\n\n🔀 Chat ini terhubung ke 2 akun. Sekarang lagi aktif: *${MODE_LABEL[mode]}*. Ketik /switch buat pindah ke akun ${MODE_LABEL[mode] === "UMKM" ? "Personal" : "UMKM"}.`
        : "";
      await sendTelegramMessageWithButtons(chatId, baseHelp + switchHint, [
        { text: "🌐 Buka Aplikasi", url: APP_URL },
      ]);
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
