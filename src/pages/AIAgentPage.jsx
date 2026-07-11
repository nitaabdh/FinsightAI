import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import ChatUI from "../components/ChatUI";
import ApiKeySetup from "../components/ApiKeySetup";
import { useAIAgent } from "../hooks/useAIAgent";
import { getTransactions, calcSummary, computeKasStats } from "../utils/storage";
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
    "Gimana strategi terbaik lunasin utang saya?",
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
  const [loadingSummary, setLoadingSummary] = useState(true);
  // Ringkasan Utang, Target Tabungan, dan Saldo Dompet — dikirim ke AI biar
  // sarannya nyambung sama kondisi utang/tabungan user, bukan cuma pemasukan/pengeluaran.
  const [financeContext, setFinanceContext] = useState("");
  const [debtCount, setDebtCount]     = useState(0);
  const [targetCount, setTargetCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("finsight_token");
    const authFetch = (url) => fetch(url, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    }).then(r => r.json());

    setLoadingSummary(true);

    if (mode === "personal") {
      Promise.all([
        // Pakai getTransactions (bukan authFetch mentah) — biar computeKasStats di bawah
        // baca kasTujuan dengan benar buat transaksi Transfer Antar Dompet, jadi konteks
        // yang dikasih ke AI (saldo per dompet) nggak salah.
        getTransactions(user.id, "personal"),
        authFetch(`/api/debts`),
        authFetch(`/api/targets`),
      ]).then(([tx, debtRes, targetRes]) => {
        setSummary(calcSummary(tx));

        const debts   = debtRes.success ? debtRes.data : [];
        const targets = targetRes.success ? targetRes.data : [];
        setDebtCount(debts.filter(d => !d.lunas).length);
        setTargetCount(targets.filter(t => t.terkumpul < t.target).length);

        const kasStats = computeKasStats(tx);
        let ctx = "";

        const utangAktif = debts.filter(d => !d.lunas);
        if (utangAktif.length > 0) {
          const totalCicilanBulan = utangAktif.reduce((s, d) => s + Number(d.cicilanPerBulan || 0), 0);
          ctx += `\n\nData Utang & Cicilan aktif (${utangAktif.length}):`;
          utangAktif.forEach(d => {
            const sisaTenor = d.tenor ? `, sisa ${Math.max(d.tenor - d.bulanTerbayar, 0)} bulan` : "";
            const jatuhTempo = d.tanggalJatuhTempo ? `, jatuh tempo tgl ${d.tanggalJatuhTempo} tiap bulan` : "";
            ctx += `\n- [${d.jenis}] ${d.nama}: cicilan Rp ${Number(d.cicilanPerBulan).toLocaleString("id-ID")}/bulan${sisaTenor}${jatuhTempo}`;
          });
          ctx += `\nTotal wajib bayar cicilan/bulan: Rp ${totalCicilanBulan.toLocaleString("id-ID")}`;
        }

        const targetAktif = targets.filter(t => t.terkumpul < t.target);
        if (targetAktif.length > 0) {
          ctx += `\n\nData Target Tabungan aktif (${targetAktif.length}):`;
          targetAktif.forEach(t => {
            const pct = t.target > 0 ? ((t.terkumpul / t.target) * 100).toFixed(0) : 0;
            ctx += `\n- ${t.nama}: terkumpul Rp ${Number(t.terkumpul).toLocaleString("id-ID")} / Rp ${Number(t.target).toLocaleString("id-ID")} (${pct}%)`;
          });
        }

        if (kasStats.length > 0) {
          const totalSaldo = kasStats.reduce((s, k) => s + k.saldo, 0);
          ctx += `\n\nSaldo per Dompet saat ini:`;
          kasStats.forEach(k => { ctx += `\n- ${k.nama}: Rp ${k.saldo.toLocaleString("id-ID")}`; });
          ctx += `\nTotal saldo semua dompet: Rp ${totalSaldo.toLocaleString("id-ID")}`;
        }

        setFinanceContext(ctx);
      }).finally(() => setLoadingSummary(false));
    } else {
      authFetch(`/api/transactions?mode=${mode}`)
        .then(r => { if (r.success) setSummary(calcSummary(r.data)); })
        .finally(() => setLoadingSummary(false));
    }
  }, [user, mode]);

  // Kirim userId agar history tersimpan per user
  const { messages, loading, error, apiKey, saveApiKey, clearApiKey, sendMessage, clearChat } =
    useAIAgent(mode, summary, user?.id, financeContext);

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

        {loadingSummary ? (
          <div className="aipage__context-skeleton">
            <div className="skel" style={{width:"120px", height:"22px", borderRadius:"6px"}} />
            <div className="skel" style={{width:"160px", height:"22px", borderRadius:"6px"}} />
            <div className="skel" style={{width:"140px", height:"22px", borderRadius:"6px"}} />
          </div>
        ) : (
          <div className="aipage__context">
            <span className="aipage__context-label">📊 Data yang diketahui AI:</span>
            <span className="aipage__context-item aipage__context-item--income">Pemasukan Rp {summary.pemasukan.toLocaleString("id-ID")}</span>
            <span className="aipage__context-item aipage__context-item--expense">Pengeluaran Rp {summary.pengeluaran.toLocaleString("id-ID")}</span>
            <span className={"aipage__context-item " + (summary.saldo >= 0 ? "aipage__context-item--income" : "aipage__context-item--expense")}>
              Saldo Rp {summary.saldo.toLocaleString("id-ID")}
            </span>
            {mode === "personal" && debtCount > 0 && (
              <span className="aipage__context-item aipage__context-item--expense">💳 {debtCount} utang aktif</span>
            )}
            {mode === "personal" && targetCount > 0 && (
              <span className="aipage__context-item aipage__context-item--income">🎯 {targetCount} target aktif</span>
            )}
            {messages.length > 0 && (
              <span className="aipage__context-item aipage__context-item--history">
                💬 {messages.filter(m => m.role === "user").length} pesan tersimpan
              </span>
            )}
          </div>
        )}

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
