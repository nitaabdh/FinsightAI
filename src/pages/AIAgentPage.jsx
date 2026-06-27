import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import ChatUI from "../components/ChatUI";
import ApiKeySetup from "../components/ApiKeySetup";
import { useAIAgent } from "../hooks/useAIAgent";
import { getTransactions, calcSummary } from "../utils/storage";
import { useEffect, useState } from "react";
import "./AIAgentPage.css";

const SUGGESTIONS = {
  umkm: [
    "Analisa kondisi keuangan usaha saya",
    "Berapa margin keuntungan saya?",
    "Hitung cicilan pinjaman Rp 50 juta, bunga 12%, tenor 24 bulan",
    "Tips efisiensi pengeluaran untuk UMKM",
  ],
  personal: [
    "Analisa kondisi keuangan saya",
    "Hitung dana darurat saya selama 6 bulan",
    "Simulasi tabungan target Rp 50 juta, nabung Rp 1 juta/bulan",
    "Bagaimana menerapkan aturan 50/30/20 untuk saya?",
  ],
};

export default function AIAgentPage() {
  const { user } = useAuth();
  const mode   = user?.mode;
  const accent = mode === "umkm" ? "umkm" : "personal";
  const [summary, setSummary] = useState({ pemasukan: 0, pengeluaran: 0, saldo: 0 });

  useEffect(() => {
  if (!user) return;
  const token = localStorage.getItem("finsight_token");
  fetch(`/api/transactions?mode=${mode}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(r => { if (r.success) setSummary(calcSummary(r.data)); });
}, [user, mode]);

  // Kirim userId agar history tersimpan per user
  const { messages, loading, error, apiKey, saveApiKey, clearApiKey, sendMessage, clearChat } =
    useAIAgent(mode, summary, user?.id);

  return (
    <DashboardLayout>
      <div className="aipage">
        <PageHeader
          title="AI Agent"
          subtitle={mode === "umkm" ? "Konsultan bisnis cerdas untuk usahamu" : "Penasihat keuangan pribadi cerdasmu"}
        />

        {/* Aksi chat — clear & ganti key */}
        {apiKey && (
          <div className="aipage__header-actions">
            <button className="aipage__btn-clear" onClick={clearChat}>🗑 Bersihkan Chat</button>
            <button className="aipage__btn-key" onClick={clearApiKey}>🔑 Ganti Key</button>
          </div>
        )}

        <div className="aipage__context">
          <span className="aipage__context-label">📊 Data yang diketahui AI:</span>
          <span className="aipage__context-item aipage__context-item--income">Pemasukan Rp {summary.pemasukan.toLocaleString("id-ID")}</span>
          <span className="aipage__context-item aipage__context-item--expense">Pengeluaran Rp {summary.pengeluaran.toLocaleString("id-ID")}</span>
          <span className={"aipage__context-item " + (summary.saldo >= 0 ? "aipage__context-item--income" : "aipage__context-item--expense")}>
            Saldo Rp {summary.saldo.toLocaleString("id-ID")}
          </span>
          {messages.length > 0 && (
            <span className="aipage__context-item aipage__context-item--history">
              💬 {messages.filter(m => m.role === "user").length} pesan tersimpan
            </span>
          )}
        </div>

        {error && <div className="aipage__error">⚠️ {error}</div>}

        <div className="aipage__chat-wrap">
          {!apiKey ? (
            <ApiKeySetup onSave={saveApiKey} accent={accent} />
          ) : (
            <ChatUI
              messages={messages}
              loading={loading}
              onSend={sendMessage}
              accent={accent}
              suggestions={SUGGESTIONS[mode] || []}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
