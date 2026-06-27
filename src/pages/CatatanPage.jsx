import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import "./CatatanPage.css";
import NoteEditor from "../components/NoteEditor";

// ─── Storage helpers ─────────────────────────────────────────────────────────
const CAL_KEY  = (userId, mode) => `finsight_calNotes_${mode}_${userId}`;
const NOTE_KEY = (userId, mode) => `finsight_stickyNotes_${mode}_${userId}`;
const loadData = (key) => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
const saveData = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS   = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni",
                "Juli","Agustus","September","Oktober","November","Desember"];

const NOTE_COLORS = [
  { id:"yellow", hex:"#FDE68A" }, { id:"blue",   hex:"#BAE6FD" },
  { id:"green",  hex:"#BBF7D0" }, { id:"pink",   hex:"#FBCFE8" },
  { id:"purple", hex:"#DDD6FE" }, { id:"orange", hex:"#FED7AA" },
];

const NOTE_CATEGORIES = [
  { id:"umum",    label:"Umum",    emoji:"📌" },
  { id:"tagihan", label:"Tagihan", emoji:"💸" },
  { id:"belanja", label:"Belanja", emoji:"🛒" },
  { id:"meeting", label:"Meeting", emoji:"📅" },
  { id:"penting", label:"Penting", emoji:"⚠️" },
  { id:"pribadi", label:"Pribadi", emoji:"🔒" },
];

const genId      = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
const fmtDateKey = (y,m,d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const TODAY      = new Date();
const todayKey   = fmtDateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

// ─── Countdown helper ────────────────────────────────────────────────────────
const getCountdown = (dateKey) => {
  const [y,m,d]  = dateKey.split("-").map(Number);
  const target   = new Date(y, m-1, d);
  const now      = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const diff     = Math.round((target - now) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)} hari lalu`, past: true };
  if (diff === 0) return { label: "Hari ini", past: false, today: true };
  if (diff === 1) return { label: "Besok", past: false };
  return { label: `${diff} hari lagi`, past: false };
};

const getToken = () => localStorage.getItem("finsight_token");
const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers||{}) },
  });
  return res.json();
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function CatatanPage() {
  const location = useLocation();
  // Deteksi mode dari URL path, karena route didaftarkan hardcoded
  // (/dashboard/umkm/catatan dan /dashboard/personal/catatan), bukan
  // dynamic segment ":mode" — jadi useParams() tidak bisa dipakai di sini.
  const mode     = location.pathname.includes("/umkm/") ? "umkm" : "personal";
  const { user } = useAuth();
  const userId   = user?.id || "guest";

  // ── State ───────────────────────────────────────────────────────────────────
  const [activeTab,  setActiveTab]  = useState("kalender");
  const [curYear,    setCurYear]    = useState(TODAY.getFullYear());
  const [curMonth,   setCurMonth]   = useState(TODAY.getMonth());
  const [calNotes,   setCalNotes]   = useState([]);
  const [filterDate, setFilterDate] = useState(null); // null = tampil semua

  // Popup kalender
  const [popupDate,    setPopupDate]    = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [calForm,      setCalForm]      = useState({ title:"", body:"", category:"umum" });
  const [editCalId,    setEditCalId]    = useState(null);
  const [deleteCalConfirm, setDeleteCalConfirm] = useState(null);

  // Sticky notes
  const [notes,         setNotes]         = useState([]);
  const [notesView,     setNotesView]     = useState("grid");
  const [searchQ,       setSearchQ]       = useState("");
  const [filterCat,     setFilterCat]     = useState("semua");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteForm,      setNoteForm]      = useState({ title:"", body:"", color:"yellow", category:"umum" });
  const [editNoteId,    setEditNoteId]    = useState(null);
  const [deleteConfirm,   setDeleteConfirm]   = useState(null);
  const [openNote,        setOpenNote]        = useState(null);
  const [openNoteTitle,   setOpenNoteTitle]   = useState("");
  const [openNoteBody,    setOpenNoteBody]    = useState("");
  const [openNoteEditing, setOpenNoteEditing] = useState(false);

  // Refs untuk scroll
  const cardsRef = useRef(null);

  // Catatan perhitungan & riwayat
  const SAVED_KEY = (uid) => `finsight_calcSaved_${uid}`;
  const [savedCalcs,  setSavedCalcs]  = useState([]);
  const [calcHistory, setCalcHistory] = useState([]);

  // ── Load data ────────────────────────────────────────────────────────────────
 useEffect(() => {
  if (!user) return;
  apiFetch(`/api/notes?table=cal_notes&mode=${mode}`).then(r => { if (r.success) setCalNotes(r.data); });
  apiFetch(`/api/notes?table=notes&mode=${mode}`).then(r => { if (r.success) setNotes(r.data); });
  // savedCalcs & calcHistory tetap localStorage
  setSavedCalcs(loadData(`finsight_calcSaved_${userId}`));
  setCalcHistory(loadData(`finsight_calcHistory_${userId}`));
}, [user, mode]);

  // Listen event dari FloatingCalculator saat simpan
  useEffect(() => {
    const onSaved = () => {
      setSavedCalcs(loadData(`finsight_calcSaved_${userId}`));
      setCalcHistory(loadData(`finsight_calcHistory_${userId}`));
    };
    window.addEventListener("calcSaved", onSaved);
    // Listen history update dari FloatingCalculator
    const onHistoryUpdate = () => setCalcHistory(loadData(`finsight_calcHistory_${userId}`));
    window.addEventListener("calcHistoryUpdated", onHistoryUpdate);

    return () => {
      window.removeEventListener("calcSaved", onSaved);
      window.removeEventListener("calcHistoryUpdated", onHistoryUpdate);
    };
  }, [userId]);

  // ── Kalender helpers ─────────────────────────────────────────────────────────
  const daysInMonth  = (y,m) => new Date(y, m+1, 0).getDate();
  const firstDay     = (y,m) => new Date(y, m, 1).getDay();
  const notesForDate = useCallback((dk) => calNotes.filter(n => n.date === dk), [calNotes]);

  const prevMonth = () => { if (curMonth===0){setCurYear(y=>y-1);setCurMonth(11);}else setCurMonth(m=>m-1); };
  const nextMonth = () => { if (curMonth===11){setCurYear(y=>y+1);setCurMonth(0);}else setCurMonth(m=>m+1); };

  // Klik tanggal → buka popup
  const handleDayClick = (dk) => {
    setPopupDate(dk);
    setShowForm(false);
    setCalForm({ title:"", body:"", category:"umum" });
    setEditCalId(null);
  };

  // Klik tanggal yang punya acara → filter cards + scroll
  const handleDayClickWithScroll = (dk) => {
    const hasNotes = calNotes.some(n => n.date === dk);
    handleDayClick(dk);
    if (hasNotes) {
      setFilterDate(dk);
      setTimeout(() => {
        cardsRef.current?.scrollIntoView({ behavior:"smooth", block:"start" });
      }, 100);
    }
  };

  const closePopup = () => { setPopupDate(null); setShowForm(false); setEditCalId(null); };

  const openEditCal = (note) => {
    setCalForm({ title:note.title, body:note.body||"", category:note.category });
    setEditCalId(note.id);
    setShowForm(true);
  };

  const saveCalNote = async () => {
  if (!calForm.title.trim()) return;
  const existing = calNotes.filter(n => n.date === popupDate);
  if (!editCalId && existing.length >= 3) return;
  if (editCalId) {
    const r = await apiFetch(`/api/notes?table=cal_notes`, {
      method: "PUT",
      body: JSON.stringify({ id: editCalId, ...calForm, date: popupDate }),
    });
    if (r.success) setCalNotes(p => p.map(n => n.id === editCalId ? r.data : n));
  } else {
    const r = await apiFetch(`/api/notes?table=cal_notes`, {
      method: "POST",
      body: JSON.stringify({ id: genId(), mode, date: popupDate, ...calForm }),
    });
    if (r.success) setCalNotes(p => [...p, r.data]);
  }
  setShowForm(false); setEditCalId(null); setCalForm({ title:"", body:"", category:"umum" });
};

  const deleteCalNote = async (id) => {
  await apiFetch(`/api/notes?table=cal_notes&id=${id}`, { method: "DELETE" });
  setCalNotes(p => p.filter(n => n.id !== id));
  setDeleteCalConfirm(null);
};

  // ── Cards sorted ─────────────────────────────────────────────────────────────
  const sortedCalNotes = [...calNotes].sort((a,b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return da - db;
  });

  const displayedCalNotes = filterDate
    ? sortedCalNotes.filter(n => n.date === filterDate)
    : sortedCalNotes;

  // ── Notes helpers ────────────────────────────────────────────────────────────
  const openNoteModal = (note=null) => {
    if (note) { setNoteForm({ title:note.title, body:note.body||"", color:note.color, category:note.category }); setEditNoteId(note.id); }
    else      { setNoteForm({ title:"", body:"", color:"yellow", category:"umum" }); setEditNoteId(null); }
    setShowNoteModal(true);
  };

  const saveNote = async () => {
  if (!noteForm.title.trim()) return;
  if (editNoteId) {
    const r = await apiFetch(`/api/notes?table=notes`, {
      method: "PUT",
      body: JSON.stringify({ id: editNoteId, mode, ...noteForm }),
    });
    if (r.success) setNotes(p => p.map(n => n.id === editNoteId ? r.data : n));
  } else {
    const r = await apiFetch(`/api/notes?table=notes`, {
      method: "POST",
      body: JSON.stringify({ id: genId(), mode, ...noteForm }),
    });
    if (r.success) setNotes(p => [r.data, ...p]);
  }
  setShowNoteModal(false);
};

  const deleteNote = async (id) => {
  await apiFetch(`/api/notes?table=notes&id=${id}`, { method: "DELETE" });
  setNotes(p => p.filter(n => n.id !== id));
  setDeleteConfirm(null);
};

  // ── Note popup helpers ────────────────────────────────────────────────────
  const openNotePopup = (note) => {
    setOpenNote(note);
    setOpenNoteTitle(note.title);
    setOpenNoteBody(note.body || "");
    setOpenNoteEditing(false);
  };

  const closeNotePopup = async () => {
  if (openNote) {
    const r = await apiFetch(`/api/notes?table=notes`, {
      method: "PUT",
      body: JSON.stringify({ id: openNote.id, mode, title: openNoteTitle, body: openNoteBody, color: openNote.color, category: openNote.category }),
    });
    if (r.success) setNotes(p => p.map(n => n.id === openNote.id ? r.data : n));
  }
  setOpenNote(null);
};

const updateOpenNoteMeta = async (field, value) => {
  const updated = { ...openNote, [field]: value };
  const r = await apiFetch(`/api/notes?table=notes`, {
    method: "PUT",
    body: JSON.stringify({ id: openNote.id, mode, title: openNoteTitle, body: openNoteBody, color: updated.color, category: updated.category }),
  });
  if (r.success) { setNotes(p => p.map(n => n.id === openNote.id ? r.data : n)); setOpenNote(updated); }
};

  const filteredNotes = notes.filter(n => {
    const q = n.title.toLowerCase().includes(searchQ.toLowerCase()) || n.body.toLowerCase().includes(searchQ.toLowerCase());
    const c = filterCat==="semua" || n.category===filterCat;
    return q && c;
  });

  const getCat   = (id) => NOTE_CATEGORIES.find(c=>c.id===id) || NOTE_CATEGORIES[0];
  const getColor = (id) => NOTE_COLORS.find(c=>c.id===id)?.hex || "#FDE68A";

  // ── Render: Kalender ──────────────────────────────────────────────────────────
  const renderKalender = () => {
    const total = daysInMonth(curYear, curMonth);
    const start = firstDay(curYear, curMonth);
    const cells = [...Array(start).fill(null), ...Array.from({length:total},(_,i)=>i+1)];

    const isToday = (d) => d===TODAY.getDate() && curMonth===TODAY.getMonth() && curYear===TODAY.getFullYear();
    const isPast  = (dk) => dk < todayKey;

    return (
      <div className="cal-section">
        {/* Grid kalender */}
        <div className="cal-wrapper">
          <div className="cal-header">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <h2 className="cal-title">{MONTHS[curMonth]} <span className="cal-year">{curYear}</span></h2>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          </div>
          <div className="cal-grid">
            {DAYS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
            {cells.map((day,idx) => {
              if (!day) return <div key={`e${idx}`} className="cal-cell empty" />;
              const dk       = fmtDateKey(curYear, curMonth, day);
              const dayNotes = notesForDate(dk);
              const past     = isPast(dk);
              const selected = filterDate === dk;
              return (
                <div
                  key={dk}
                  className={[
                    "cal-cell",
                    isToday(day) ? "today" : "",
                    dayNotes.length ? "has-notes" : "",
                    past ? "past" : "",
                    selected ? "selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleDayClickWithScroll(dk)}
                >
                  <span className="cal-day-num">{day}</span>
                  {dayNotes.length > 0 && (
                    <div className="cal-dots">
                      {dayNotes.slice(0,3).map(n => (
                        <span key={n.id} className="cal-dot">{getCat(n.category).emoji}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cal-footer">
            <span>📅 {calNotes.length} acara tersimpan</span>
            <span className="cal-hint">Klik tanggal untuk tambah acara</span>
          </div>
        </div>

        {/* Cards acara */}
        <div className="cal-cards-section" ref={cardsRef}>
          <div className="cal-cards-header">
            <h3 className="cal-cards-title">
              {filterDate
                ? `📌 ${parseInt(filterDate.split("-")[2])} ${MONTHS[parseInt(filterDate.split("-")[1])-1]} ${filterDate.split("-")[0]}`
                : "📋 Semua Acara"}
            </h3>
            {filterDate && (
              <button className="cal-filter-clear" onClick={() => setFilterDate(null)}>
                ✕ Lihat semua
              </button>
            )}
          </div>

          {displayedCalNotes.length === 0 && (
            <div className="cal-cards-empty">
              <span>🗓️</span>
              <p>{filterDate ? "Tidak ada acara di tanggal ini." : "Belum ada acara. Klik tanggal di kalender untuk menambah!"}</p>
            </div>
          )}

          <div className="cal-cards-list">
            {displayedCalNotes.map(note => {
              const cd      = getCountdown(note.date);
              const cat     = getCat(note.category);
              const [y,m,d] = note.date.split("-");
              const dateLabel = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
              return (
                <div key={note.id} className={`cal-card${cd.past ? " cal-card--past" : ""}${cd.today ? " cal-card--today" : ""}`}>
                  <div className="cal-card__left">
                    <div className="cal-card__cat">{cat.emoji} {cat.label}</div>
                    <h4 className="cal-card__title">{note.title}</h4>
                    {note.body && <p className="cal-card__body">{note.body}</p>}
                    <span className="cal-card__date">{dateLabel}</span>
                  </div>
                  <div className="cal-card__right">
                    <span className={`cal-card__countdown${cd.past?" past":cd.today?" today":""}`}>
                      {cd.label}
                    </span>
                    <div className="cal-card__actions">
                      <button className="cal-card__btn" onClick={() => { setPopupDate(note.date); openEditCal(note); }} title="Edit">✏️</button>
                      <button className="cal-card__btn" onClick={() => setDeleteCalConfirm(note.id)} title="Hapus">🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Render: Kalkulator tab ────────────────────────────────────────────────────
  const renderKalkulator = () => {
    const fmt = (num) => {
      if (num === null || num === undefined) return "-";
      const n = parseFloat(num);
      if (isNaN(n)) return String(num);
      return n.toLocaleString("id-ID", { maximumFractionDigits: 10 });
    };
    const deleteSaved = (id) => {
      const updated = savedCalcs.filter(c => c.id !== id);
      setSavedCalcs(updated);
      saveData(`finsight_calcSaved_${userId}`, updated);
    };
    return (
      <div className="calc-tab-wrapper">
        {/* CTA float */}
        <div className="calc-tab-cta">
          <div>
            <h3 className="calc-tab-cta__title">🧮 Kalkulator Keuangan</h3>
            <p className="calc-tab-cta__desc">Buka kalkulator dan bisa dibawa ke halaman lain</p>
          </div>
          <button className="calc-tab-cta__btn" onClick={() => window.dispatchEvent(new CustomEvent("openFloatCalc"))}>
            Buka Kalkulator
          </button>
        </div>

        {/* Riwayat Kalkulasi */}
        <div className="calc-history-section">
          <div className="calc-history-header">
            <h3 className="calc-saved-title">🕓 Riwayat Kalkulasi</h3>
            {calcHistory.length > 0 && (
              <button className="calc-history-clear" onClick={() => {
                setCalcHistory([]);
                saveData(`finsight_calcHistory_${userId}`, []);
              }}>Hapus semua</button>
            )}
          </div>
          {calcHistory.length === 0 ? (
            <div className="calc-saved-empty">
              <span>🕓</span>
              <p>Belum ada riwayat. Gunakan kalkulator untuk mulai menghitung.</p>
            </div>
          ) : (
            <div className="calc-history-list">
              {calcHistory.slice(0, 20).map(h => (
                <div key={h.id} className="calc-history-item">
                  <span className="calc-history-expr">{h.expr}</span>
                  <span className="calc-history-time">
                    {new Date(h.createdAt).toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"})}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Catatan Perhitungan */}
        <div className="calc-saved-section">
          <h3 className="calc-saved-title">💾 Catatan Perhitungan</h3>
          {savedCalcs.length === 0 ? (
            <div className="calc-saved-empty">
              <span>🧮</span>
              <p>Belum ada perhitungan tersimpan. Gunakan kalkulator lalu tekan "Simpan Perhitungan".</p>
            </div>
          ) : (
            <div className="calc-saved-list">
              {savedCalcs.map(c => (
                <div key={c.id} className="calc-saved-card">
                  <div className="calc-saved-card__header">
                    <h4 className="calc-saved-card__title">{c.title}</h4>
                    <div className="calc-saved-card__actions">
                      <span className="calc-saved-card__date">
                        {new Date(c.createdAt).toLocaleDateString("id-ID", {day:"numeric",month:"short",year:"numeric"})}
                      </span>
                      <button className="calc-saved-card__del" onClick={() => deleteSaved(c.id)} title="Hapus">🗑️</button>
                    </div>
                  </div>
                  <div className="calc-saved-card__entries">
                    {c.entries.map((e, i) => (
                      <div key={i} className="calc-saved-entry">
                        <span className="calc-saved-entry__op">{i===0 ? "" : e.op}</span>
                        <span className="calc-saved-entry__val">{fmt(e.value)}</span>
                        {e.label && <span className="calc-saved-entry__label">{e.label}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="calc-saved-card__result">
                    <span>Hasil</span>
                    <strong>{fmt(c.result)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render: Notes ─────────────────────────────────────────────────────────────
  const renderNotes = () => (
    <div className="notes-wrapper">
      <div className="notes-toolbar">
        <div className="notes-search-wrap">
          <span className="search-icon">🔍</span>
          <input className="notes-search" placeholder="Cari catatan..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} />
          {searchQ && <button className="search-clear" onClick={()=>setSearchQ("")}>✕</button>}
        </div>
        <div className="notes-right-toolbar">
          <select className="notes-cat-select" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="semua">Semua kategori</option>
            {NOTE_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
          <div className="view-toggle">
            <button className={`view-btn${notesView==="grid"?" active":""}`} onClick={()=>setNotesView("grid")} title="Grid">▦</button>
            <button className={`view-btn${notesView==="list"?" active":""}`} onClick={()=>setNotesView("list")} title="List">☰</button>
          </div>
          <button className="notes-add-icon-btn" onClick={async () => {
            const newNote = { id: genId(), title: "", body: "", color: "yellow", category: "umum" };
            const r = await apiFetch(`/api/notes?table=notes`, {
              method: "POST",
              body: JSON.stringify({ ...newNote, mode }),
            });
            if (r.success) { setNotes(p => [r.data, ...p]); openNotePopup(r.data); }
          }} title="Tambah catatan">＋</button>
        </div>
      </div>

      {filteredNotes.length === 0 && (
        <div className="notes-empty">
          <span className="notes-empty-icon">📝</span>
          <p>{searchQ||filterCat!=="semua" ? "Tidak ada catatan yang cocok." : "Belum ada catatan. Yuk mulai catat!"}</p>
        </div>
      )}

      {notesView==="grid" && filteredNotes.length>0 && (
        <div className="notes-grid">
          {filteredNotes.map(n => {
            const cat = getCat(n.category);
            // Strip HTML tags untuk preview plain text
            const plainBody = n.body ? n.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
            return (
              <div key={n.id} className="sticky-card" style={{"--nc": getColor(n.color)}}
                onClick={() => openNotePopup(n)}>
                <div className="sticky-header">
                  <span className="sticky-cat">{cat.emoji} {cat.label}</span>
                </div>
                <h3 className="sticky-title">{n.title}</h3>
                {plainBody && <p className="sticky-body">{plainBody}</p>}
                <div className="sticky-footer">
                  <span className="sticky-date">{new Date(n.updatedAt||n.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notesView==="list" && filteredNotes.length>0 && (
        <div className="notes-list">
          {filteredNotes.map(n => {
            const cat = getCat(n.category);
            return (
              <div key={n.id} className="list-card" onClick={() => openNotePopup(n)}>
                <div className="list-color-bar" style={{background: getColor(n.color)}} />
                <div className="list-content">
                  <div className="list-meta">
                    <span className="sticky-cat">{cat.emoji} {cat.label}</span>
                    <span className="sticky-date">{new Date(n.updatedAt||n.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}</span>
                  </div>
                  <h3 className="sticky-title list-title">{n.title}</h3>
                  {n.body && <p className="list-preview">{n.body.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Popup Kalender ────────────────────────────────────────────────────────────
  const renderPopup = () => {
    if (!popupDate) return null;
    const [y,m,d]   = popupDate.split("-");
    const label      = `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
    const existing   = calNotes.filter(n => n.date === popupDate);
    const isPastDate = popupDate < todayKey;
    const isFull     = existing.length >= 3 && !editCalId;

    return (
      <div className="cn-overlay" onClick={closePopup}>
        <div className="cn-modal" onClick={e=>e.stopPropagation()}>
          <div className="cn-modal-header">
            <div>
              <h3>📅 {label}</h3>
              {isPastDate && <span className="popup-past-badge">Tanggal sudah lewat</span>}
            </div>
            <button className="cn-close" onClick={closePopup}>✕</button>
          </div>

          {/* List acara yang sudah ada */}
          {existing.length > 0 && (
            <div className="cn-existing">
              <p className="cn-existing-label">Acara di tanggal ini ({existing.length}/3)</p>
              {existing.map(n => {
                const cat = getCat(n.category);
                const cd  = getCountdown(n.date);
                return (
                  <div key={n.id} className={`cn-existing-item${cd.past?" past":""}`}>
                    <span>{cat.emoji}</span>
                    <span className="cn-existing-title">{n.title}</span>
                    <span className={`cn-existing-cd${cd.past?" past":cd.today?" today":""}`}>{cd.label}</span>
                    <button className="cn-item-btn" onClick={()=>openEditCal(n)} title="Edit">✏️</button>
                    <button className="cn-item-btn" onClick={()=>setDeleteCalConfirm(n.id)} title="Hapus">🗑️</button>
                  </div>
                );
              })}
              {!isFull && !showForm && <hr className="cn-divider" />}
            </div>
          )}

          {/* Empty state */}
          {existing.length === 0 && !showForm && (
            <div className="popup-empty">
              <span>🗓️</span>
              <p>Belum ada acara di tanggal ini</p>
            </div>
          )}

          {/* Tombol tambah atau pesan penuh */}
          {!showForm && (
            <div className="popup-footer">
              {isFull
                ? <p className="popup-full-msg">⚠️ Maksimal 3 acara per tanggal</p>
                : <button className="cn-btn-primary popup-add-btn" onClick={()=>setShowForm(true)}>＋ Tambah Acara</button>
              }
            </div>
          )}

          {/* Form tambah/edit inline */}
          {showForm && (
            <div className="cn-form">
              <p className="cn-form-title">{editCalId ? "Edit acara" : "Tambah acara baru"}</p>
              <div className="cn-field">
                <label>Judul *</label>
                <input className="cn-input" placeholder="Contoh: Seminar digital kampus"
                  value={calForm.title} onChange={e=>setCalForm(f=>({...f,title:e.target.value}))} autoFocus />
              </div>
              <div className="cn-field">
                <label>Kategori</label>
                <div className="cat-chips">
                  {NOTE_CATEGORIES.map(c=>(
                    <button key={c.id} className={`cat-chip${calForm.category===c.id?" active":""}`}
                      onClick={()=>setCalForm(f=>({...f,category:c.id}))}>{c.emoji} {c.label}</button>
                  ))}
                </div>
              </div>
              <div className="cn-field">
                <label>Catatan (opsional)</label>
                <textarea className="cn-textarea" placeholder="Detail tambahan..." rows={3}
                  value={calForm.body} onChange={e=>setCalForm(f=>({...f,body:e.target.value}))} />
              </div>
              <div className="cn-actions">
                <button className="cn-btn-sec" onClick={()=>{setShowForm(false);setEditCalId(null);setCalForm({title:"",body:"",category:"umum"});}}>Batal</button>
                <button className="cn-btn-primary" onClick={saveCalNote} disabled={!calForm.title.trim()}>
                  {editCalId ? "Simpan Perubahan" : "Tambah Acara"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Modal: Note Form ──────────────────────────────────────────────────────────
  const renderNoteModal = () => (
    <div className="cn-overlay" onClick={()=>setShowNoteModal(false)}>
      <div className="cn-modal cn-modal--note" onClick={e=>e.stopPropagation()}>
        <div className="cn-modal-header">
          <h3>{editNoteId ? "✏️ Edit Catatan" : "📝 Catatan Baru"}</h3>
          <button className="cn-close" onClick={()=>setShowNoteModal(false)}>✕</button>
        </div>
        <div className="cn-form">
          <div className="cn-field">
            <label>Judul *</label>
            <input className="cn-input" placeholder="Judul catatan..."
              value={noteForm.title}
              onChange={e=>setNoteForm(f=>({...f,title:e.target.value}))} autoFocus />
          </div>
          <div className="cn-field">
            <label>Isi Catatan</label>
            <div className="cn-editor-wrap">
              <NoteEditor
                content={noteForm.body}
                onChange={val => setNoteForm(f=>({...f, body:val}))}
              />
            </div>
          </div>
          <div className="cn-field">
            <label>Kategori</label>
            <div className="cat-chips">
              {NOTE_CATEGORIES.map(c=>(
                <button key={c.id} className={`cat-chip${noteForm.category===c.id?" active":""}`}
                  onClick={()=>setNoteForm(f=>({...f,category:c.id}))}>{c.emoji} {c.label}</button>
              ))}
            </div>
          </div>
          <div className="cn-field">
            <label>Warna Kartu</label>
            <div className="color-picker">
              {NOTE_COLORS.map(c=>(
                <button key={c.id} className={`color-swatch${noteForm.color===c.id?" active":""}`}
                  style={{background:c.hex}} onClick={()=>setNoteForm(f=>({...f,color:c.id}))} />
              ))}
            </div>
          </div>
          <div className="cn-actions">
            <button className="cn-btn-sec" onClick={()=>setShowNoteModal(false)}>Batal</button>
            <button className="cn-btn-primary" onClick={saveNote} disabled={!noteForm.title.trim()}>
              {editNoteId ? "Simpan Perubahan" : "Simpan Catatan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Confirm Hapus Kalender ────────────────────────────────────────────────────
  const renderDeleteCal = () => (
    <div className="cn-overlay" onClick={()=>setDeleteCalConfirm(null)}>
      <div className="cn-modal cn-confirm" onClick={e=>e.stopPropagation()}>
        <div className="cn-confirm-icon">🗑️</div>
        <h3>Hapus acara ini?</h3>
        <p>Tindakan ini tidak bisa dibatalkan.</p>
        <div className="cn-actions">
          <button className="cn-btn-sec"    onClick={()=>setDeleteCalConfirm(null)}>Batal</button>
          <button className="cn-btn-danger" onClick={()=>deleteCalNote(deleteCalConfirm)}>Hapus</button>
        </div>
      </div>
    </div>
  );

  // ── Confirm Hapus Note ────────────────────────────────────────────────────────
  const renderDeleteNote = () => (
    <div className="cn-overlay" onClick={()=>setDeleteConfirm(null)}>
      <div className="cn-modal cn-confirm" onClick={e=>e.stopPropagation()}>
        <div className="cn-confirm-icon">🗑️</div>
        <h3>Hapus catatan ini?</h3>
        <p>Tindakan ini tidak bisa dibatalkan.</p>
        <div className="cn-actions">
          <button className="cn-btn-sec"    onClick={()=>setDeleteConfirm(null)}>Batal</button>
          <button className="cn-btn-danger" onClick={()=>deleteNote(deleteConfirm)}>Hapus</button>
        </div>
      </div>
    </div>
  );

  // ── Note Popup Full ───────────────────────────────────────────────────────────
  const renderNotePopup = () => {
    if (!openNote) return null;
    const cat = getCat(openNote.category);
    return (
      <div className="note-popup-overlay" onClick={closeNotePopup}>
        <div className="note-popup" style={{"--nc": getColor(openNote.color)}} onClick={e=>e.stopPropagation()}>
          {/* Header popup */}
          <div className="note-popup__header">
            <input
              className="note-popup__title-input"
              value={openNoteTitle}
              onChange={e => setOpenNoteTitle(e.target.value)}
              placeholder="Judul catatan..."
            />
            <div className="note-popup__header-actions">
              <button
                className="note-popup__meta-btn"
                onClick={() => setOpenNoteEditing(v=>!v)}
                title="Edit kategori & warna"
              >
                ✏️
              </button>
              <button
                className="note-popup__del-btn"
                onClick={() => { setDeleteConfirm(openNote.id); setOpenNote(null); }}
                title="Hapus catatan"
              >
                🗑️
              </button>
              <button className="note-popup__close" onClick={closeNotePopup}>✕</button>
            </div>
          </div>

          {/* Edit meta (kategori & warna) */}
          {openNoteEditing && (
            <div className="note-popup__meta-panel">
              <div className="note-popup__meta-row">
                <span className="note-popup__meta-label">Kategori</span>
                <div className="cat-chips">
                  {NOTE_CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      className={`cat-chip${openNote.category===c.id?" active":""}`}
                      onClick={() => updateOpenNoteMeta("category", c.id)}
                    >{c.emoji} {c.label}</button>
                  ))}
                </div>
              </div>
              <div className="note-popup__meta-row">
                <span className="note-popup__meta-label">Warna</span>
                <div className="color-picker">
                  {NOTE_COLORS.map(c => (
                    <button
                      key={c.id}
                      className={`color-swatch${openNote.color===c.id?" active":""}`}
                      style={{background:c.hex}}
                      onClick={() => updateOpenNoteMeta("color", c.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cat badge */}
          <div className="note-popup__cat-badge">
            <span>{cat.emoji} {cat.label}</span>
            <span className="note-popup__updated">
              {new Date(openNote.updatedAt||openNote.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}
            </span>
          </div>

          {/* Rich text editor */}
          <div className="note-popup__body">
            <NoteEditor
              content={openNoteBody}
              onChange={setOpenNoteBody}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="catatanpage">
        <PageHeader
          title={mode === "umkm" ? "📋 Catatan Usaha" : "📋 Catatan Pribadi"}
          subtitle={mode === "umkm" ? "Jadwal, reminder, dan catatan penting usahamu" : "Kalender personal dan catatan harianmu"}
        />

        <div className="tab-toggle">
          <button className={`tab-btn${activeTab==="kalender"?" active":""}`} onClick={()=>setActiveTab("kalender")}>📅 Kalender</button>
          <button className={`tab-btn${activeTab==="notes"?" active":""}`} onClick={()=>setActiveTab("notes")}>
            📝 Catatan{notes.length>0 && <span className="tab-badge">{notes.length}</span>}
          </button>
          <button className={`tab-btn${activeTab==="kalkulator"?" active":""}`} onClick={()=>setActiveTab("kalkulator")}>🧮 Kalkulator</button>
        </div>

        <div className="tab-content">
          {activeTab==="kalender"   && renderKalender()}
          {activeTab==="notes"      && renderNotes()}
          {activeTab==="kalkulator" && renderKalkulator()}
        </div>

        {popupDate        && renderPopup()}
        {showNoteModal    && renderNoteModal()}
        {openNote        && renderNotePopup()}
        {deleteCalConfirm && renderDeleteCal()}
        {deleteConfirm    && renderDeleteNote()}
      </div>
    </DashboardLayout>
  );
}
