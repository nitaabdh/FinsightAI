// /api/ai-chat.js — Vercel Serverless Function
// POST /api/ai-chat  { messages, mode, summary, profileContext, financeContext }
//
// Proxy ke Groq API. API key Groq diambil dari Supabase di SERVER
// (kolom profiles.groq_api_key, cuma bisa dibaca pakai service role key),
// disimpan dalam bentuk TERENKRIPSI (AES-256-GCM, lihat api/_lib/crypto.js)
// dan didekripsi di sini sesaat sebelum dipakai. Browser cuma kirim isi chat —
// key aslinya nggak pernah lewat client sama sekali.

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { decryptSecret } from "./_lib/crypto.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET   = process.env.JWT_SECRET;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL        = "llama-3.3-70b-versatile";

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

// ── Tools & eksekusi tool — sama persis dengan utils/aiAgent.js ─────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "hitung_laba_rugi",
      description: "Hitung laba bersih dan margin keuntungan dari omzet dan pengeluaran",
      parameters: {
        type: "object",
        properties: {
          omzet:       { type: "number", description: "Total pemasukan / omzet dalam Rupiah" },
          pengeluaran: { type: "number", description: "Total pengeluaran dalam Rupiah" },
        },
        required: ["omzet", "pengeluaran"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hitung_cicilan",
      description: "Hitung cicilan bulanan dari pinjaman dengan bunga",
      parameters: {
        type: "object",
        properties: {
          pokok:        { type: "number", description: "Jumlah pinjaman pokok dalam Rupiah" },
          bunga_persen: { type: "number", description: "Bunga per tahun dalam persen" },
          tenor_bulan:  { type: "number", description: "Lama cicilan dalam bulan" },
        },
        required: ["pokok", "bunga_persen", "tenor_bulan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulasi_tabungan",
      description: "Hitung berapa lama waktu yang dibutuhkan untuk mencapai target tabungan",
      parameters: {
        type: "object",
        properties: {
          target:           { type: "number", description: "Nominal target tabungan dalam Rupiah" },
          tabungan_awal:    { type: "number", description: "Tabungan yang sudah ada saat ini" },
          nabung_per_bulan: { type: "number", description: "Jumlah yang akan ditabung setiap bulan" },
        },
        required: ["target", "tabungan_awal", "nabung_per_bulan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisa_keuangan",
      description: "Analisa kondisi keuangan berdasarkan pemasukan dan pengeluaran",
      parameters: {
        type: "object",
        properties: {
          pemasukan:   { type: "number", description: "Total pemasukan dalam Rupiah" },
          pengeluaran: { type: "number", description: "Total pengeluaran dalam Rupiah" },
          mode:        { type: "string", description: "'umkm' atau 'personal'" },
        },
        required: ["pemasukan", "pengeluaran", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hitung_dana_darurat",
      description: "Hitung kebutuhan dana darurat berdasarkan pengeluaran bulanan",
      parameters: {
        type: "object",
        properties: {
          pengeluaran_bulanan: { type: "number", description: "Rata-rata pengeluaran per bulan" },
          bulan:               { type: "number", description: "Target bulan dana darurat (3-6 bulan)" },
        },
        required: ["pengeluaran_bulanan", "bulan"],
      },
    },
  },
];

const executeTool = (name, args) => {
  switch (name) {
    case "hitung_laba_rugi": {
      const { omzet, pengeluaran } = args;
      const laba = omzet - pengeluaran;
      const margin = omzet > 0 ? ((laba / omzet) * 100).toFixed(1) : 0;
      return { laba_bersih: laba, margin_persen: Number(margin), status: laba >= 0 ? "untung" : "rugi" };
    }
    case "hitung_cicilan": {
      const { pokok, bunga_persen, tenor_bulan } = args;
      const bungaBulanan = bunga_persen / 100 / 12;
      const cicilan = bungaBulanan === 0
        ? pokok / tenor_bulan
        : pokok * (bungaBulanan * Math.pow(1 + bungaBulanan, tenor_bulan)) / (Math.pow(1 + bungaBulanan, tenor_bulan) - 1);
      return { cicilan_per_bulan: Math.round(cicilan), total_bayar: Math.round(cicilan * tenor_bulan), total_bunga: Math.round(cicilan * tenor_bulan - pokok) };
    }
    case "simulasi_tabungan": {
      const { target, tabungan_awal, nabung_per_bulan } = args;
      if (nabung_per_bulan <= 0) return { error: "Jumlah nabung harus lebih dari 0" };
      const bulan = Math.ceil((target - tabungan_awal) / nabung_per_bulan);
      const tahun = Math.floor(bulan / 12);
      const sisaBulan = bulan % 12;
      return { estimasi_bulan: bulan, estimasi_waktu: tahun > 0 ? `${tahun} tahun ${sisaBulan} bulan` : `${bulan} bulan` };
    }
    case "analisa_keuangan": {
      const { pemasukan, pengeluaran, mode } = args;
      const saldo = pemasukan - pengeluaran;
      const rasio = pemasukan > 0 ? (pengeluaran / pemasukan) * 100 : 0;
      let status, saran;
      if (rasio < 50)       { status = "Sangat Sehat"; saran = mode === "umkm" ? "Keuangan usaha sangat baik! Pertimbangkan reinvestasi." : "Keuangan sangat baik! Tingkatkan investasi atau tabungan."; }
      else if (rasio < 70)  { status = "Sehat";        saran = mode === "umkm" ? "Cukup baik. Pantau pengeluaran operasional." : "Cukup baik. Coba terapkan aturan 50/30/20."; }
      else if (rasio < 90)  { status = "Perlu Perhatian"; saran = mode === "umkm" ? "Pengeluaran tinggi. Evaluasi biaya operasional." : "Pengeluaran tinggi. Kurangi pengeluaran tidak penting."; }
      else                  { status = "Kritis";       saran = mode === "umkm" ? "Segera evaluasi struktur biaya usaha!" : "Segera buat rencana penghematan!"; }
      return { saldo, rasio_pengeluaran: rasio.toFixed(1), status, saran };
    }
    case "hitung_dana_darurat": {
      const { pengeluaran_bulanan, bulan } = args;
      return { target_dana_darurat: pengeluaran_bulanan * bulan, keterangan: `Dana darurat ${bulan} bulan = Rp ${(pengeluaran_bulanan * bulan).toLocaleString("id-ID")}` };
    }
    default:
      return { error: "Tool tidak ditemukan" };
  }
};

const getSystemPrompt = (mode, summary, profileContext = "", financeContext = "") => `Kamu adalah FinSight AI, asisten keuangan yang ramah dan berbicara Bahasa Indonesia.
Gunakan tools yang tersedia untuk perhitungan. Berikan jawaban praktis dan mudah dipahami.
Format angka dalam Rupiah (Rp) dengan pemisah ribuan.
Sesuaikan saranmu dengan profil dan kondisi spesifik pengguna jika tersedia.
Kalau ada data Utang/Cicilan, Target Tabungan, atau Saldo Dompet di bawah, WAJIB pertimbangkan itu
saat kasih saran (misal: jangan saranin nabung/investasi kalau cicilan wajib bulanan udah gede
dibanding pemasukan, atau ingetin jatuh tempo yang deket).

Mode: ${mode === "umkm" ? "UMKM" : "Keuangan Pribadi"}
Data keuangan saat ini:
- Pemasukan: Rp ${(summary?.pemasukan || 0).toLocaleString("id-ID")}
- Pengeluaran: Rp ${(summary?.pengeluaran || 0).toLocaleString("id-ID")}
- Saldo: Rp ${(summary?.saldo || 0).toLocaleString("id-ID")}${financeContext || ""}${profileContext || ""}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    const { messages, mode, summary, profileContext, financeContext } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: "Pesan tidak valid." });
    }

    // Ambil key Groq punya user ini — service role key, aman diakses server-side.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("groq_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile?.groq_api_key) {
      return res.status(400).json({ success: false, needsApiKey: true, message: "API key belum diatur." });
    }

    let apiKey;
    try {
      apiKey = decryptSecret(profile.groq_api_key);
    } catch (decryptErr) {
      console.error("[ai-chat] Gagal dekripsi API key:", decryptErr);
      return res.status(500).json({ success: false, message: "Gagal membaca API key. Coba atur ulang API key kamu di halaman Profil." });
    }
    if (!apiKey) {
      return res.status(400).json({ success: false, needsApiKey: true, message: "API key belum diatur." });
    }

    const systemPrompt = getSystemPrompt(mode, summary, profileContext, financeContext);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

    // ── Request 1: biarkan AI putuskan pakai tool atau tidak ──
    const res1 = await fetch(GROQ_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!res1.ok) {
      const err = await res1.json().catch(() => ({}));
      return res.status(502).json({ success: false, message: err?.error?.message || `Groq API Error: ${res1.status}` });
    }

    const data1 = await res1.json();
    const assistantMsg = data1.choices?.[0]?.message;

    // ── Kalau tidak ada tool call — langsung return ──
    if (!assistantMsg?.tool_calls?.length) {
      return res.status(200).json({
        success: true,
        data: { role: "assistant", content: assistantMsg?.content || "Maaf, tidak ada respons." },
      });
    }

    // ── Eksekusi semua tool calls ──
    const toolResults = assistantMsg.tool_calls.map((tc) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const result = executeTool(tc.function.name, args);
      return { role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result) };
    });

    // ── Request 2: AI rangkum hasil tool jadi jawaban natural ──
    const res2 = await fetch(GROQ_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
          assistantMsg,
          ...toolResults,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!res2.ok) {
      const err = await res2.json().catch(() => ({}));
      return res.status(502).json({ success: false, message: err?.error?.message || `Groq API Error: ${res2.status}` });
    }

    const data2 = await res2.json();
    const finalContent = data2.choices?.[0]?.message?.content || "Maaf, tidak ada respons.";

    return res.status(200).json({
      success: true,
      data: {
        role: "assistant",
        content: finalContent,
        toolsUsed: assistantMsg.tool_calls.map((tc) => tc.function.name),
      },
    });
  } catch (err) {
    console.error("[ai-chat] error:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
}
