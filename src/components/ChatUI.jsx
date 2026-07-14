import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getProfile, getPhoto } from "../utils/profile";
import "./ChatUI.css";

const formatText = (text) => {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
};

const TOOL_LABELS = {
  hitung_laba_rugi:    "🔢 Hitung Laba Rugi",
  hitung_cicilan:      "💳 Hitung Cicilan",
  simulasi_tabungan:   "🎯 Simulasi Tabungan",
  analisa_keuangan:    "📊 Analisa Keuangan",
  hitung_dana_darurat: "🛡️ Dana Darurat",
};

const isRawToolCall = (msg) => {
  if (!msg?.content) return false;
  const c = msg.content;
  return c.includes("/function=") || c.includes("tool_call") || (c.startsWith("{") && c.includes("function"));
};

export default function ChatUI({ messages, loading, onSend, accent, suggestions = [] }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [userPhoto, setUserPhoto]       = useState(null);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [isListening, setIsListening] = useState(false);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  const SpeechRecognitionAPI =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const voiceSupported = !!SpeechRecognitionAPI;

  // Load foto & nama dari profil
  useEffect(() => {
    if (!user) return;
    const profile = getProfile(user.id);
    setUserDisplayName(profile?.displayName || user.name || "");
    setUserPhoto(getPhoto(user.id));
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Cleanup recognition saat komponen unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleListening = () => {
    if (!voiceSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = navigator.language || "id-ID";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev.trim() + " " + transcript : transcript));
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    onSend(text);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const visibleMessages = messages.filter((msg) => {
    if (msg.role === "tool") return false;
    if (isRawToolCall(msg)) return false;
    if (!msg.content?.trim()) return false;
    return true;
  });

  const userInitial = (userDisplayName || user?.name || "U").charAt(0).toUpperCase();

  return (
    <div className="chat">
      <div className="chat__messages">
        {visibleMessages.length === 0 && (
          <div className="chat__welcome">
            <div className="chat__welcome-icon">🤖</div>
            <p className="chat__welcome-title">FinSight AI Agent</p>
            <p className="chat__welcome-sub">
              Tanya apa saja tentang keuanganmu.<br/>
              AI akan menganalisa dan menghitung secara otomatis.
            </p>
            {suggestions.length > 0 && (
              <div className="chat__suggestions stagger-list">
                {suggestions.map((s, i) => (
                  <button key={i} className={"chat__suggestion chat__suggestion--" + accent} onClick={() => onSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {visibleMessages.map((msg, i) => (
          <div key={i} className={"chat__msg chat__msg--" + msg.role}>
            {/* Avatar AI */}
            {msg.role === "assistant" && (
              <div className="chat__avatar chat__avatar--ai">🤖</div>
            )}

            <div className={"chat__bubble chat__bubble--" + msg.role + (msg.role === "assistant" ? " chat__bubble--" + accent : "")}>
              {msg.toolsUsed?.length > 0 && (
                <div className="chat__tools-used">
                  {msg.toolsUsed.map((t) => (
                    <span key={t} className="chat__tool-chip">{TOOL_LABELS[t] || t}</span>
                  ))}
                </div>
              )}
              <div className="chat__text" dangerouslySetInnerHTML={{ __html: formatText(msg.content) }} />
            </div>

            {/* Avatar User — foto atau inisial */}
            {msg.role === "user" && (
              <div className="chat__avatar chat__avatar--user">
                {userPhoto
                  ? <img src={userPhoto} alt="kamu" className="chat__avatar-img" />
                  : userInitial
                }
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="chat__msg chat__msg--assistant">
            <div className="chat__avatar chat__avatar--ai">🤖</div>
            <div className={"chat__bubble chat__bubble--assistant chat__bubble--" + accent}>
              <div className="chat__typing"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat__input-wrap">
        {/* Mini avatar di input */}
        <div className="chat__input-avatar">
          {userPhoto
            ? <img src={userPhoto} alt="kamu" className="chat__avatar-img" />
            : userInitial
          }
        </div>
        <div className="chat__input-field">
          <textarea
            className={"chat__input chat__input--" + accent}
            placeholder={isListening ? "Mendengarkan..." : "Tanya sesuatu... (Enter untuk kirim)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            disabled={loading}
          />
          {voiceSupported && (
            <button
              type="button"
              className={"chat__mic chat__mic--" + accent + (isListening ? " chat__mic--listening" : "")}
              onClick={toggleListening}
              disabled={loading}
              title={isListening ? "Berhenti merekam" : "Bicara untuk mengisi pesan"}
            >
              {isListening ? "⏹" : "🎤"}
            </button>
          )}
        </div>
        <button
          className={"chat__send chat__send--" + accent}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
