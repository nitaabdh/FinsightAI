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

// Escape karakter spesial Markdown biar nama/keterangan user nggak ngerusak format pesan.
export function escapeMd(text = "") {
  return String(text).replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

export function formatRupiahTG(n) {
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

// Download foto yang dikirim user di Telegram, convert jadi base64 data URI
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
