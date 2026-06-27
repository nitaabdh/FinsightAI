import { useState, useCallback, useEffect } from "react";
import { sendToAgent } from "../utils/aiAgent";
import { getProfile, buildProfileContext } from "../utils/profile";

const API_KEY_STORAGE   = "finsight_groq_key";
const CHAT_HISTORY_KEY  = (userId, mode) => `finsight_chat_${mode}_${userId}`;

export function useAIAgent(mode, summary, userId) {
  const [messages, setMessages]       = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [apiKey, setApiKeyState]      = useState(
    () => localStorage.getItem(API_KEY_STORAGE) || ""
  );

  // Load history dari localStorage saat pertama buka
  useEffect(() => {
    if (!userId || !mode) return;
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY(userId, mode));
      if (saved) {
        const { displayMsgs, apiMsgs } = JSON.parse(saved);
        setMessages(displayMsgs || []);
        setApiMessages(apiMsgs || []);
      }
    } catch { /* abaikan error parse */ }
  }, [userId, mode]);

  // Simpan history setiap kali messages berubah
  const saveHistory = useCallback((displayMsgs, apiMsgs) => {
    if (!userId || !mode) return;
    try {
      // Batasi 50 pesan terakhir agar localStorage tidak penuh
      const trimDisplay = displayMsgs.slice(-50);
      const trimApi     = apiMsgs.slice(-50);
      localStorage.setItem(
        CHAT_HISTORY_KEY(userId, mode),
        JSON.stringify({ displayMsgs: trimDisplay, apiMsgs: trimApi })
      );
    } catch { /* abaikan error storage */ }
  }, [userId, mode]);

  const saveApiKey = useCallback((key) => {
    localStorage.setItem(API_KEY_STORAGE, key);
    setApiKeyState(key);
    setError("");
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKeyState("");
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
      const reply = await sendToAgent(apiKey, newApiMsgs, mode, summary, profileContext);
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
  }, [messages, apiMessages, loading, apiKey, mode, summary, saveHistory]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setApiMessages([]);
    setError("");
    if (userId && mode) localStorage.removeItem(CHAT_HISTORY_KEY(userId, mode));
  }, [userId, mode]);

  return { messages, loading, error, apiKey, saveApiKey, clearApiKey, sendMessage, clearChat };
}
