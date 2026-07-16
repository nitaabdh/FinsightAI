import { useState, useRef, useEffect, useCallback } from "react";
import "./FloatingCalculator.css";

import { Check, X } from "lucide-react";
// ─── Storage ──────────────────────────────────────────────────────────────────
const CALC_HISTORY_KEY = (userId) => `finsight_calcHistory_${userId}`;
const CALC_SAVED_KEY   = (userId) => `finsight_calcSaved_${userId}`;
const loadData = (key) => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
const saveData = (key, data) => localStorage.setItem(key, JSON.stringify(data));
const genId    = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

const fmt = (num) => {
  if (num === null || num === undefined || num === "") return "0";
  const n = parseFloat(num);
  if (isNaN(n)) return "Error";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 10 });
};

export default function FloatingCalculator({ userId, onClose }) {
  // ── Calc state ──────────────────────────────────────────────────────────────
  const [entries,    setEntries]    = useState([]); // [{value, label, op}]
  const [current,    setCurrent]    = useState("");
  const [currentOp,  setCurrentOp]  = useState("+");
  const [result,     setResult]     = useState(null);
  const [showLabel,  setShowLabel]  = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [history,    setHistory]    = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle,  setSaveTitle]  = useState("");
  const [justCalced, setJustCalced] = useState(false);
  const [lastCalcEntries, setLastCalcEntries] = useState([]); // snapshot lengkap entries pas terakhir "=" ditekan, dipakai buat Simpan Perhitungan

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [pos,      setPos]      = useState({ x: window.innerWidth - 340, y: 80 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const floatRef   = useRef(null);

  // ── Load history ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setHistory(loadData(CALC_HISTORY_KEY(userId)));
  }, [userId]);

  // ── Jaga posisi tetap di dalam layar kalau ukuran layar berubah
  //    (misal HP diputar, atau jendela browser di-resize) ──────────────────────
  useEffect(() => {
    const clampToViewport = () => {
      const maxX = window.innerWidth  - (floatRef.current?.offsetWidth  || 320);
      const maxY = window.innerHeight - (floatRef.current?.offsetHeight || 500);
      setPos(p => ({ x: Math.max(0, Math.min(p.x, maxX)), y: Math.max(0, Math.min(p.y, maxY)) }));
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    const nx = e.clientX - dragOffset.current.x;
    const ny = e.clientY - dragOffset.current.y;
    const maxX = window.innerWidth  - (floatRef.current?.offsetWidth  || 320);
    const maxY = window.innerHeight - (floatRef.current?.offsetHeight || 500);
    setPos({ x: Math.max(0, Math.min(nx, maxX)), y: Math.max(0, Math.min(ny, maxY)) });
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup",   onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, [dragging, onMouseMove, onMouseUp]);

  // ── Touch drag ────────────────────────────────────────────────────────────────
  const onTouchStart = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    const t = e.touches[0];
    dragOffset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
  };

  const onTouchMove = (e) => {
    const t = e.touches[0];
    const nx = t.clientX - dragOffset.current.x;
    const ny = t.clientY - dragOffset.current.y;
    const maxX = window.innerWidth  - (floatRef.current?.offsetWidth  || 320);
    const maxY = window.innerHeight - (floatRef.current?.offsetHeight || 500);
    setPos({ x: Math.max(0, Math.min(nx, maxX)), y: Math.max(0, Math.min(ny, maxY)) });
  };

  // ── Calc logic ────────────────────────────────────────────────────────────────
  const handleDigit = (d) => {
    if (justCalced) { setCurrent(d); setJustCalced(false); return; }
    if (d === "." && current.includes(".")) return;
    setCurrent(prev => prev === "0" ? d : prev + d);
    setResult(null);
  };

  const handleOperator = (op) => {
    if (current === "" && entries.length === 0) return;
    if (current !== "") {
      const val = parseFloat(current);
      if (!isNaN(val)) {
        setEntries(prev => [...prev, { value: val, label: "", op: currentOp }]);
      }
      setCurrent("");
    }
    setCurrentOp(op);
    setResult(null);
    setJustCalced(false);
  };

  const handlePercent = () => {
    if (current === "") return;
    const val = parseFloat(current);
    if (!isNaN(val)) setCurrent(String(val / 100));
  };

  const handleBackspace = () => {
    if (justCalced) { setCurrent(""); setJustCalced(false); return; }
    setCurrent(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setEntries([]); setCurrent(""); setCurrentOp("+");
    setResult(null); setJustCalced(false); setLastCalcEntries([]);
  };

  const handleEquals = () => {
    const allEntries = [...entries];
    if (current !== "") {
      const val = parseFloat(current);
      if (!isNaN(val)) allEntries.push({ value: val, label: "", op: currentOp });
    }
    if (allEntries.length === 0) return;

    let total = 0;
    allEntries.forEach((e, i) => {
      if (i === 0) { total = e.value; return; }
      if (e.op === "+") total += e.value;
      if (e.op === "-") total -= e.value;
      if (e.op === "×") total *= e.value;
      if (e.op === "÷") total = e.value !== 0 ? total / e.value : "Error";
    });

    setResult(total);
    setJustCalced(true);
    setCurrent(String(total));
    setLastCalcEntries(allEntries);
    // PENTING: kosongkan entries setelah selesai dihitung. Kalau tidak, entries lama
    // masih "nyangkut" di state — jadi pas lanjut hitung (misal tekan operator lagi
    // setelah dapat hasil), angka-angka lama ikut kehitung ulang bareng hasil barunya
    // dan totalnya jadi salah/gak nyambung. Hasil sekarang (current) jadi titik awal
    // yang baru buat perhitungan berikutnya.
    setEntries([]);

    // Simpan ke history
    const expr = allEntries.map((e,i) => {
      const opStr = i===0 ? "" : ` ${e.op} `;
      return `${opStr}${fmt(e.value)}${e.label ? ` (${e.label})` : ""}`;
    }).join("") + ` = ${fmt(total)}`;

    const newHistory = [{ id:genId(), expr, result:total, createdAt:Date.now() }, ...history].slice(0, 20);
    setHistory(newHistory);
    saveData(CALC_HISTORY_KEY(userId), newHistory);
    window.dispatchEvent(new CustomEvent("calcHistoryUpdated"));
  };

  // ── Label per angka ───────────────────────────────────────────────────────────
  const handleAddLabel = () => {
    if (current === "") return;
    setShowLabel(true);
    setLabelInput("");
  };

  const confirmLabel = () => {
    if (current === "") { setShowLabel(false); return; }
    const val = parseFloat(current);
    if (!isNaN(val)) {
      setEntries(prev => [...prev, { value: val, label: labelInput.trim(), op: currentOp }]);
      setCurrent("");
      setCurrentOp("+");
    }
    setShowLabel(false);
    setLabelInput("");
  };

  // ── Simpan perhitungan ────────────────────────────────────────────────────────
  const handleSave = () => {
    if (result === null) return;
    setSaveTitle("");
    setShowSaveModal(true);
  };

  const confirmSave = () => {
    const savedKey  = CALC_SAVED_KEY(userId);
    const existing  = loadData(savedKey);
    const newSaved  = [{
      id:        genId(),
      title:     saveTitle.trim() || `Perhitungan ${new Date().toLocaleDateString("id-ID")}`,
      entries:   lastCalcEntries,
      result:    result,
      createdAt: Date.now(),
    }, ...existing];
    saveData(savedKey, newSaved);
    setShowSaveModal(false);
    // Dispatch custom event supaya CatatanPage bisa refresh
    window.dispatchEvent(new CustomEvent("calcSaved"));
  };

  // ── Display ───────────────────────────────────────────────────────────────────
  const displayValue = result !== null ? fmt(result) : (current !== "" ? fmt(current) : "0");

  const buttons = [
    ["C", "backspace", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "="],
  ];

  const getClass = (btn) => {
    if (btn === "=")        return "calc-btn calc-btn--eq";
    if (btn === "C")        return "calc-btn calc-btn--clear";
    if (["÷","×","-","+"].includes(btn)) return "calc-btn calc-btn--op";
    if (btn === "+label")   return "calc-btn calc-btn--label";
    if (btn === "backspace") return "calc-btn calc-btn--back";
    if (btn === "%")        return "calc-btn calc-btn--op";
    return "calc-btn";
  };

  const handleBtn = (btn) => {
    if ("0123456789".includes(btn)) return handleDigit(btn);
    if (btn === ".")        return handleDigit(".");
    if (btn === "C")        return handleClear();
    if (btn === "backspace") return handleBackspace();
    if (btn === "%")        return handlePercent();
    if (["÷","×","-","+"].includes(btn)) return handleOperator(btn);
    if (btn === "=")        return handleEquals();
    if (btn === "+label")   return handleAddLabel();
  };

  // ── Keyboard support ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Kalau lagi ngetik di label-input atau save-modal, biarkan input itu
      // yang handle Enter/Escape sendiri (lewat onKeyDown masing-masing).
      if (showLabel || showSaveModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (showLabel) setShowLabel(false);
          if (showSaveModal) setShowSaveModal(false);
        }
        return;
      }

      // Jangan ganggu kalau user sedang fokus mengetik di elemen lain
      // di luar kalkulator (misal textarea chat / input lain di halaman).
      const active = document.activeElement;
      const isTypingElsewhere =
        active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
        !floatRef.current?.contains(active);
      if (isTypingElsewhere) return;

      const { key } = e;

      if ("0123456789".includes(key)) { e.preventDefault(); return handleDigit(key); }
      if (key === ".") { e.preventDefault(); return handleDigit("."); }

      if (key === "+") { e.preventDefault(); return handleOperator("+"); }
      if (key === "-") { e.preventDefault(); return handleOperator("-"); }
      if (key === "*" || key.toLowerCase() === "x") { e.preventDefault(); return handleOperator("×"); }
      if (key === "/") { e.preventDefault(); return handleOperator("÷"); }
      if (key === "%") { e.preventDefault(); return handlePercent(); }

      if (key === "Enter" || key === "=") { e.preventDefault(); return handleEquals(); }
      if (key === "Backspace") { e.preventDefault(); return handleBackspace(); }
      if (key === "Escape") { e.preventDefault(); return handleClear(); }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLabel, showSaveModal, current, entries, currentOp, justCalced, result, history]);

  return (
    <div
      ref={floatRef}
      className={`float-calc${dragging ? " dragging" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* Header */}
      <div className="float-calc__header">
        <span className="float-calc__title">🧮 Kalkulator</span>
        <div className="float-calc__header-actions">
          <button
            className="float-calc__label-btn"
            onClick={handleAddLabel}
            disabled={current === ""}
            title="Kasih label ke angka ini"
          >
            🏷️
          </button>
          <span className="float-calc__drag-hint">⠿</span>
          <button className="float-calc__close" onClick={onClose} title="Tutup"><X size={14} /></button>
        </div>
      </div>

      {/* Entries display */}
      {entries.length > 0 && (
        <div className="float-calc__entries">
          {entries.map((e, i) => (
            <div key={i} className="float-calc__entry">
              <span className="float-calc__entry-op">{i === 0 ? "" : e.op}</span>
              <span className="float-calc__entry-val">{fmt(e.value)}</span>
              {e.label && <span className="float-calc__entry-label">{e.label}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Display */}
      <div className="float-calc__display">
        <div className="float-calc__op-indicator">{entries.length > 0 ? currentOp : ""}</div>
        <div className={`float-calc__value${result !== null ? " result" : ""}`}>
          {displayValue}
        </div>
      </div>

      {/* Label input */}
      {showLabel && (
        <div className="float-calc__label-input">
          <input
            autoFocus
            placeholder={`Label untuk ${fmt(current)}...`}
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirmLabel(); if (e.key === "Escape") setShowLabel(false); }}
          />
          <button onClick={confirmLabel}><Check size={14} /></button>
          <button onClick={() => setShowLabel(false)}><X size={14} /></button>
        </div>
      )}

      {/* Buttons */}
      <div className="float-calc__buttons">
        {buttons.map((row, ri) => (
          <div key={ri} className="float-calc__row">
            {row.map(btn => (
              <button
                key={btn}
                className={getClass(btn) + (btn === "0" && row.length === 3 ? " calc-btn--zero" : "")}
                onClick={() => handleBtn(btn)}
              >
                {btn === "backspace" ? "⌫" : btn}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="float-calc__save-row">
        <button
          className="float-calc__save-btn"
          onClick={handleSave}
          disabled={result === null}
        >
          💾 Simpan Perhitungan
        </button>
      </div>



      {/* Save Modal */}
      {showSaveModal && (
        <div className="float-calc__save-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="float-calc__save-modal" onClick={e => e.stopPropagation()}>
            <h4>💾 Simpan Perhitungan</h4>
            <p className="float-calc__save-result">Hasil: <strong>{fmt(result)}</strong></p>
            <input
              autoFocus
              className="float-calc__save-input"
              placeholder="Nama perhitungan (opsional)..."
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmSave(); }}
            />
            <div className="float-calc__save-actions">
              <button className="fc-btn-sec" onClick={() => setShowSaveModal(false)}>Batal</button>
              <button className="fc-btn-primary" onClick={confirmSave}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
