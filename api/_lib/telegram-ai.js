// api/_lib/telegram-ai.js
// Nangkep pesan bebas (bukan command) dari user di Telegram, terus:
// 1. Kalau keliatan kayak "catat transaksi" (misal "beli kopi 20rb") -> parse & simpen otomatis
// 2. Kalau keliatan kayak pertanyaan/ngobrol -> forward ke AI Agent, jawab kayak biasa
// Satu kali panggilan Groq buat dua-duanya (structured JSON output), pakai API key
// Groq PUNYA USER SENDIRI (sama kayak AI Agent di web — BYOK, didekripsi dari DB).

import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto.js";
import { computeKasStats, calcSummary, getTransactions, formatRupiahTG } from "./telegram-data.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL        = "llama-3.3-70b-versatile";
const MAX_HISTORY_MESSAGES = 12; // ~6 giliran obrolan (user+assistant), biar prompt nggak kegedean

// ═══════════════════════════════════════════════════════════════════════════
// PARSER CEPAT (regex, TANPA AI) — buat pola transaksi simpel & jelas kayak
// "beli kopi 20rb" atau "gajian 3jt". Sengaja KONSERVATIF: cuma dianggap
// "yakin" kalau nemu PERSIS 1 angka + ada kata kunci jenis transaksi yang jelas.
// Kalau ragu dikit aja, return null -> baru dilempar ke AI (yang butuh API key).
// ═══════════════════════════════════════════════════════════════════════════

const PEMASUKAN_KEYWORDS = [
  "gajian", "gaji", "dapat", "dapet", "terima", "nerima", "jual", "laku",
  "untung", "profit", "bonus", "cair", "masuk", "hasil", "thr", "komisi",
];
const PENGELUARAN_KEYWORDS = [
  "beli", "bayar", "byr", "belanja", "jajan", "keluar", "bensin", "isi",
  "top up", "topup", "sewa", "kirim", "cicilan", "nyicil", "bensin", "parkir",
];

const CATEGORY_KEYWORDS = {
  "Makanan & Minuman": ["makan","kopi","nasi","jajan","minum","warteg","resto","restoran","kfc","mcd","boba","teh","kue","snack","cemilan","sarapan","gorengan"],
  "Transportasi": ["bensin","grab","gojek","ojek","taxi","taksi","parkir","tol","angkot","kereta","busway","mrt","krl"],
  "Tagihan": ["pulsa","token","listrik","pdam","wifi","internet","bpjs","cicilan","tagihan","nyicil"],
  "Belanja": ["belanja","baju","sepatu","tas","skincare","kosmetik","shopee","tokopedia"],
  "Hiburan": ["nonton","bioskop","game","netflix","spotify","langganan"],
  "Gaji": ["gajian","gaji","thr","bonus","komisi"],
  "Kesehatan": ["obat","dokter","apotek","vitamin"],
};

// Kata/tanda yang nunjukkin ini kemungkinan besar PERTANYAAN/OBROLAN, BUKAN
// pernyataan transaksi — walau kebetulan nyebut angka & kata "dapet"/"beli" dst
// (kayak "aku dapet uang saku 350rb, gimana caranya nabung?").
const QUESTION_INDICATORS = [
  "?", "gimana", "bagaimana", "kenapa", "kok ", "apakah", "apa ya", "caranya",
  "tolong", "minta saran", "menurut", "sebaiknya", "baiknya", "mending",
  "kira-kira", "kira kira", "boleh gak", "boleh ga", "bisa gak", "bisa ga",
];

function looksLikeQuestion(text) {
  const lower = text.toLowerCase();
  return QUESTION_INDICATORS.some((q) => lower.includes(q));
}

function extractAmounts(text) {
  const results = [];
  // Prioritas 1: angka dengan akhiran rb/ribu/k/jt/juta — paling nggak ambigu
  const withSuffix = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(ribu|rb|k|juta|jt)\b/gi)];
  withSuffix.forEach((m) => {
    let num = parseFloat(m[1].replace(",", "."));
    const unit = m[2].toLowerCase();
    num *= (unit === "juta" || unit === "jt") ? 1000000 : 1000;
    results.push(Math.round(num));
  });
  if (results.length > 0) return results;

  // Prioritas 2 (fallback): format ribuan pakai titik (20.000) atau angka polos >= 1000
  const bare = [...text.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d{4,})\b/g)];
  bare.forEach((m) => results.push(parseInt(m[1].replace(/\./g, ""), 10)));
  return results;
}

function detectType(text) {
  const lower = text.toLowerCase();
  const hasIn  = PEMASUKAN_KEYWORDS.some((k) => lower.includes(k));
  const hasOut = PENGELUARAN_KEYWORDS.some((k) => lower.includes(k));
  if (hasIn && !hasOut) return "pemasukan";
  if (hasOut && !hasIn) return "pengeluaran";
  return null; // ambigu (dua-duanya kedetect, atau nggak ada sama sekali)
}

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return cat;
  }
  return "Lainnya";
}

// Return null kalau nggak yakin (biar di-fallback ke AI), atau objek transaksi kalau yakin.
export function tryQuickParse(text) {
  if (looksLikeQuestion(text)) return null;    // kedengeran kayak pertanyaan/obrolan, bukan pernyataan transaksi
  if (text.trim().split(/\s+/).length > 12) return null; // transaksi beneran biasanya pendek & to-the-point

  const amounts = extractAmounts(text);
  if (amounts.length !== 1) return null;      // 0 angka = nggak ketemu, >1 = ambigu angka mana yang dimaksud
  if (amounts[0] < 500) return null;           // kemungkinan besar bukan nominal uang (misal "beli 2 kopi")

  const type = detectType(text);
  if (!type) return null;                      // nggak jelas pemasukan/pengeluaran

  return { type, amount: amounts[0], category: detectCategory(text), description: text.trim() };
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

async function buildContext(userId, mode) {
  const tx = await getTransactions(userId, mode);
  const kasStats = computeKasStats(tx);
  const summaryBulanIni = calcSummary(tx.filter(t => isThisMonth(t.date)));

  let ctx = `Ringkasan bulan ini: pemasukan ${formatRupiahTG(summaryBulanIni.pemasukan)}, pengeluaran ${formatRupiahTG(summaryBulanIni.pengeluaran)}.\n`;
  if (kasStats.length > 0) {
    ctx += `Dompet yang udah pernah dipakai: ${kasStats.map(k => k.nama).join(", ")}.\n`;
  }

  if (mode === "personal") {
    const { data: debts } = await supabase.from("debts").select("nama, cicilan_per_bulan").eq("user_id", userId).eq("lunas", false);
    if (debts && debts.length > 0) {
      ctx += `Utang aktif: ${debts.map(d => `${d.nama} (${formatRupiahTG(d.cicilan_per_bulan)}/bulan)`).join(", ")}.\n`;
    }
  }
  return ctx;
}

const SYSTEM_PROMPT = (mode, contextText) => `Kamu adalah asisten keuangan FinSight yang menerima pesan bebas dari Telegram.
Tugas kamu: KLASIFIKASIKAN pesan user jadi salah satu dari 2 intent, lalu balas HANYA dalam format JSON (tanpa markdown code fence, tanpa teks lain di luar JSON):

{
  "intent": "transaction" atau "chat",
  "transaction": {
    "type": "pemasukan" atau "pengeluaran",
    "amount": <angka murni tanpa titik/koma/Rp>,
    "category": "<kategori singkat, contoh: Makanan, Transportasi, Gaji, dll>",
    "description": "<deskripsi singkat dari pesan user>"
  } (isi null kalau intent bukan "transaction"),
  "reply": "<balasan singkat kamu ke user, ramah, pakai Bahasa Indonesia casual>"
}

Aturan klasifikasi:
- "transaction" kalau user cerita udah BELANJA/BAYAR/TERIMA UANG sesuatu dengan nominal jelas (boleh singkatan "20rb"=20000, "1jt"=1000000, "1,5jt"=1500000)
- "chat" kalau user nanya sesuatu, curhat, minta saran, atau nggak nyebut nominal jelas
- Kalau ragu-ragu / nominal nggak jelas, pilih "chat" dan di reply-nya tanya balik nominalnya berapa
- Mode akun ini: ${mode === "umkm" ? "UMKM (bisnis)" : "Keuangan Pribadi"}

Konteks keuangan user saat ini:
${contextText}

Kalau intent "transaction", isi reply dengan konfirmasi singkat kayak "Oke, tercatat!" — detail nominalnya nggak perlu diulang di reply karena udah ditampilin terpisah.`;

export async function handleFreeText(userId, mode, text) {
  // ── Coba parser cepat dulu (regex, gratis, nggak butuh API key) ──
  const quick = tryQuickParse(text);
  if (quick) {
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        mode,
        type: quick.type,
        amount: quick.amount,
        category: quick.category,
        description: quick.description,
        date: new Date().toISOString().slice(0, 10),
        kas: "Kas Tunai",
      })
      .select()
      .single();

    if (error) {
      console.error("[telegram-ai] gagal simpan transaksi (quick parse):", error);
      return { type: "error", message: "Kedeteksi transaksi, tapi gagal nyimpen. Coba lagi ya." };
    }
    return { type: "transaction_saved", data: inserted, reply: "", quick: true };
  }

  // ── Nggak yakin dari pola sederhana -> lempar ke AI (butuh API key user) ──
  const { data: profile } = await supabase.from("profiles").select("groq_api_key").eq("user_id", userId).maybeSingle();
  if (!profile?.groq_api_key) {
    return { type: "need_api_key" };
  }

  let apiKey;
  try {
    apiKey = decryptSecret(profile.groq_api_key);
  } catch (err) {
    console.error("[telegram-ai] gagal dekripsi key:", err);
    return { type: "error", message: "Gagal membaca API key kamu. Coba atur ulang di halaman Profil ya." };
  }
  if (!apiKey) return { type: "need_api_key" };

  let contextText;
  try {
    contextText = await buildContext(userId, mode);
  } catch (err) {
    console.error("[telegram-ai] gagal build context:", err);
    contextText = "(konteks nggak tersedia)";
  }

  // ── Ambil riwayat obrolan sebelumnya biar AI-nya "inget" konteks chat ──
  const { data: histRow } = await supabase.from("telegram_chat_history").select("messages").eq("user_id", userId).maybeSingle();
  const history = Array.isArray(histRow?.messages) ? histRow.messages : [];

  let data;
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT(mode, contextText) },
          ...history,
          { role: "user", content: text },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    data = await res.json();
    if (!res.ok) {
      console.error("[telegram-ai] Groq error:", data);
      if (data?.error?.code === "invalid_api_key") {
        return { type: "error", message: "API key Groq kamu kayaknya udah nggak valid. Coba cek/atur ulang di halaman Profil." };
      }
      return { type: "error", message: "AI lagi bermasalah, coba lagi sebentar ya." };
    }
  } catch (err) {
    console.error("[telegram-ai] fetch error:", err);
    return { type: "error", message: "Gagal menghubungi AI, coba lagi sebentar ya." };
  }

  let parsed;
  try {
    parsed = JSON.parse(data.choices[0].message.content);
  } catch (err) {
    // Kalau AI-nya nggak balas JSON valid (jarang tapi bisa kejadian), anggap aja itu chat biasa
    return { type: "chat", reply: data.choices[0]?.message?.content || "Maaf, aku kurang ngerti maksudnya. Coba diperjelas ya." };
  }

  // ── Simpen riwayat: pesan user + balasan AI, di-trim biar nggak numpuk kepanjangan ──
  // (assistant message disimpan versi mentah JSON-nya balik, biar AI konsisten liat format sama)
  const newHistory = [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: data.choices[0].message.content },
  ].slice(-MAX_HISTORY_MESSAGES);

  await supabase.from("telegram_chat_history").upsert(
    { user_id: userId, messages: newHistory, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (parsed.intent === "transaction" && parsed.transaction && parsed.transaction.amount) {
    const t = parsed.transaction;
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        mode,
        type: t.type === "pemasukan" ? "pemasukan" : "pengeluaran",
        amount: Number(t.amount),
        category: t.category || "Lainnya",
        description: t.description || text,
        date: new Date().toISOString().slice(0, 10),
        kas: "Kas Tunai",
      })
      .select()
      .single();

    if (error) {
      console.error("[telegram-ai] gagal simpan transaksi:", error);
      return { type: "error", message: "Aku ngerti maksudnya, tapi gagal nyimpen transaksinya. Coba lagi ya." };
    }
    return { type: "transaction_saved", data: inserted, reply: parsed.reply };
  }

  return { type: "chat", reply: parsed.reply || "Hmm, coba diperjelas lagi ya." };
}

// Hapus transaksi terakhir yang dicatet lewat bot (buat command /batal) — jaga-jaga
// AI salah nangkep nominal/kategori.
export async function undoLastTransaction(userId, mode) {
  const { data: last, error: findErr } = await supabase
    .from("transactions")
    .select("id, amount, category, description")
    .eq("user_id", userId)
    .eq("mode", mode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr || !last) return { success: false };

  const { error: delErr } = await supabase.from("transactions").delete().eq("id", last.id);
  if (delErr) return { success: false };
  return { success: true, data: last };
}

// Reset ingatan obrolan (buat command /lupa) — kalau user mau ganti topik total
// atau ngerasa AI-nya "bingung" gara-gara riwayat lama yang udah nggak relevan.
export async function resetChatHistory(userId) {
  await supabase.from("telegram_chat_history").delete().eq("user_id", userId);
}
