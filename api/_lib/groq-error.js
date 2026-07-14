// api/_lib/groq-error.js
// Nerjemahin error dari Groq API jadi pesan yang JELAS bedanya — biar gampang
// ketauan pas ada masalah, itu soal API key user, model yang dipensiunkan Groq,
// kuota abis, atau error lain. Dipakai bareng di ai-chat.js (web) & telegram-ai.js (bot).

// Return { userMessage, isModelIssue } — userMessage buat ditampilin ke user,
// isModelIssue true kalau ini soal MODEL (bukan salah user), biar caller bisa
// log lebih menonjol di server (developer perlu tau & ganti model/env var).
export function interpretGroqError(errBody, modelName) {
  const code = errBody?.error?.code;
  const message = errBody?.error?.message || "";
  const lowerMsg = message.toLowerCase();

  if (code === "invalid_api_key" || lowerMsg.includes("invalid api key")) {
    return {
      userMessage: "API key Groq kamu kayaknya nggak valid. Coba cek/atur ulang di halaman Profil ya.",
      isModelIssue: false,
    };
  }

  if (code === "model_decommissioned" || lowerMsg.includes("decommission") || lowerMsg.includes("has been deprecated")) {
    return {
      userMessage: "Fitur AI lagi bermasalah karena model yang dipakai udah dipensiunkan sama Groq. Ini bukan salah kamu — tolong laporkan ke pengembang aplikasi biar model-nya diperbarui.",
      isModelIssue: true,
    };
  }

  if (code === "rate_limit_exceeded" || lowerMsg.includes("rate limit") || lowerMsg.includes("quota")) {
    return {
      userMessage: "Kuota API key Groq kamu abis buat sementara ini. Coba lagi beberapa saat lagi, atau cek batasan quota di console.groq.com.",
      isModelIssue: false,
    };
  }

  if (code === "model_not_found" || lowerMsg.includes("does not exist") || lowerMsg.includes("model not found")) {
    return {
      userMessage: "Fitur AI lagi bermasalah karena nama model-nya nggak ketemu di Groq. Ini bukan salah kamu — tolong laporkan ke pengembang aplikasi.",
      isModelIssue: true,
    };
  }

  return {
    userMessage: "AI lagi bermasalah, coba lagi sebentar ya.",
    isModelIssue: false,
  };
}

// Log ke server dengan format seragam, gampang di-grep di Vercel logs.
export function logGroqError(context, errBody, modelName, isModelIssue) {
  const tag = isModelIssue ? "🔴 MODEL ISSUE" : "⚠️ groq-error";
  console.error(`[${context}] ${tag} (model: ${modelName}):`, JSON.stringify(errBody?.error || errBody));
}
