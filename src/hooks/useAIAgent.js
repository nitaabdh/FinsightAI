import { useState, useCallback, useEffect } from "react";
import { getProfile, buildProfileContext } from "../utils/profile";

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export function useAIAgent(mode, summary, userId, financeContext = "") {
  const [messages, setMessages]       = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Key Groq disimpan di server (Supabase), bukan localStorage — otomatis
  // kebaca walau login dari device lain. Key aslinya nggak pernah dikirim
  // balik ke browser; yang kita tau cuma "sudah ada atau belum".
  const [hasApiKey, setHasApiKey]           = useState(false);
  const [checkingApiKey, setCheckingApiKey] = useState(true);

  useEffect(() => {
    if (!userId) { setCheckingApiKey(false); return; }
    apiFetch("/api/profile")
      .then(r => { if (r.success) setHasApiKey(!!r.data?.hasApiKey); })
      .finally(() => setCheckingApiKey(false));
  }, [userId]);

  // Riwayat chat sekarang juga disimpan di server (Supabase), bukan
  // localStorage — biar ikut kebawa walau ganti/login dari device lain.
  useEffect(() => {
    if (!userId || !mode) return;
    let cancelled = false;
    apiFetch(`/api/chat-history?mode=${mode}`).then(r => {
      if (cancelled) return;
      if (r.success && r.data) {
        setMessages(r.data.displayMsgs || []);
        setApiMessages(r.data.apiMsgs || []);
      } else {
        setMessages([]);
        setApiMessages([]);
      }
    });
    return () => { cancelled = true; };
  }, [userId, mode]);

  const saveHistory = useCallback((displayMsgs, apiMsgs) => {
    if (!userId || !mode) return;
    // Batasi 50 pesan terakhir biar payload nggak membengkak
    const trimDisplay = displayMsgs.slice(-50);
    const trimApi     = apiMsgs.slice(-50);
    apiFetch("/api/chat-history", {
      method: "PUT",
      body: JSON.stringify({ mode, displayMsgs: trimDisplay, apiMsgs: trimApi }),
    }).catch(() => { /* abaikan error simpan, chat tetap kepakai di sesi ini */ });
  }, [userId, mode]);

  const saveApiKey = useCallback(async (key) => {
    setError("");
    try {
      const r = await apiFetch("/api/profile?action=save-api-key", {
        method: "POST",
        body: JSON.stringify({ apiKey: key }),
      });
      if (r.success) setHasApiKey(true);
      else setError(r.message || "Gagal menyimpan API key.");
    } catch {
      setError("Gagal menyimpan API key. Coba lagi.");
    }
  }, []);

  const clearApiKey = useCallback(async () => {
    try {
      const r = await apiFetch("/api/profile?action=clear-api-key", { method: "POST" });
      if (r.success) setHasApiKey(false);
    } catch { /* abaikan */ }
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;

    const userMsg        = { role: "user", content: text };
    const newDisplayMsgs = [...messages, userMsg];
    const newApiMsgs     = [...apiMessages, userMsg];

    setMessages(newDisplayMsgs);
    setApiMessages(newApiMsgs);
    setLoading(true);
    setError("");

    try {
      const profile = userId ? getProfile(userId) : null;
      const profileContext = buildProfileContext(profile);

      // Panggilan ke Groq lewat backend (/api/ai-chat) — key Groq diambil
      // server-side dari Supabase, nggak pernah lewat browser.
      const r = await apiFetch("/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ messages: newApiMsgs, mode, summary, profileContext, financeContext }),
      });

      if (!r.success) {
        if (r.needsApiKey) setHasApiKey(false);
        throw new Error(r.message || "Terjadi kesalahan. Coba lagi.");
      }

      const reply = r.data;
      const { toolsUsed, ...cleanReply } = reply;

      const finalDisplayMsgs = [...newDisplayMsgs, { ...reply }];
      const finalApiMsgs     = [...newApiMsgs, cleanReply];

      setMessages(finalDisplayMsgs);
      setApiMessages(finalApiMsgs);
      saveHistory(finalDisplayMsgs, finalApiMsgs);
    } catch (err) {
      setError(err.message || "Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [messages, apiMessages, loading, mode, summary, userId, financeContext, saveHistory]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setApiMessages([]);
    setError("");
    if (userId && mode) {
      apiFetch(`/api/chat-history?mode=${mode}`, { method: "DELETE" }).catch(() => {});
    }
  }, [userId, mode]);

  return {
    messages, loading, error,
    apiKey: hasApiKey, checkingApiKey,
    saveApiKey, clearApiKey, sendMessage, clearChat,
  };
}
