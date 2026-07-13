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

  let data;
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT(mode, contextText) },
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
