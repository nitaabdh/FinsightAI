// api/_lib/telegram.js
// Helper tipis buat manggil Telegram Bot API. Dipakai bareng sama webhook
// handler (bales chat user) dan cron job reminder (kirim notif jatuh tempo).
//
// Butuh env var TELEGRAM_BOT_TOKEN (didapat dari @BotFather di Telegram).

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Kirim pesan teks ke satu chat. parseMode default "Markdown" biar bisa bold/italic.
export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN belum diset di environment variables.");
    return { ok: false, error: "missing_bot_token" };
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        ...options,
      }),
    });
    const data = await res.json();
    if (!data.ok) console.error("[telegram] sendMessage gagal:", data.description);
    return data;
  } catch (err) {
    console.error("[telegram] sendMessage error:", err);
    return { ok: false, error: String(err) };
  }
}

// Kirim pesan dengan tombol interaktif di bawahnya. Tiap button:
// - { text, data } -> tombol callback (data dikirim balik ke webhook, dipakai
//   buat konfirmasi pas AI ragu-ragu)
// - { text, url }  -> tombol yang langsung buka link (dipakai buat shortcut
//   balik ke web app)
export async function sendTelegramMessageWithButtons(chatId, text, buttons) {
  const result = await sendTelegramMessage(chatId, text, {
    reply_markup: { inline_keyboard: [buttons.map(b => b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })] },
  });
  // Kalau Telegram nolak pesannya (misal tombol url invalid/nggak diisi bener),
  // fallback kirim ulang tanpa tombol biar user tetep dapet balasan, bukan diem total.
  if (!result.ok) {
    console.error("[telegram] sendMessageWithButtons gagal, fallback ke plain text:", result.description || result.error);
    return sendTelegramMessage(chatId, text);
  }
  return result;
}

// Wajib dipanggil tiap ada callback_query masuk, biar tombolnya berhenti "loading"
// di HP user. `text` opsional, kalau diisi muncul notif kecil di atas layar user.
export async function answerCallbackQuery(callbackQueryId, text = "") {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false };
  try {
    const res = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
    return await res.json();
  } catch (err) {
    console.error("[telegram] answerCallbackQuery error:", err);
    return { ok: false };
  }
}

// Escape karakter spesial Markdown biar nama/keterangan user nggak ngerusak format pesan.
export function escapeMd(text = "") {
  return String(text).replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

export function formatRupiahTG(n) {
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

// Download foto/audio yang dikirim user di Telegram, convert jadi base64 data URI
// (biar bisa langsung dikirim ke model vision Groq).
export async function getTelegramFileBase64(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");

  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok) throw new Error("Gagal ambil info file dari Telegram: " + fileData.description);

  const filePath = fileData.result.file_path;
  const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!imgRes.ok) throw new Error("Gagal download file gambar dari Telegram.");

  const arrayBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

// Download voice note Telegram sebagai Buffer mentah (buat dikirim ke API
// transkripsi Groq lewat multipart/form-data, bukan base64).
export async function getTelegramFileBuffer(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");

  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok) throw new Error("Gagal ambil info file dari Telegram: " + fileData.description);

  const filePath = fileData.result.file_path;
  const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!audioRes.ok) throw new Error("Gagal download file audio dari Telegram.");

  const arrayBuffer = await audioRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), filePath };
}
