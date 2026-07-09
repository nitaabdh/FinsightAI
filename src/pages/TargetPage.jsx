import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import RupiahInput from "../components/RupiahInput";
import { formatRupiah } from "../utils/storage";
import "./TargetPage.css";
import "./DashboardSkeleton.css";

const getToken = () => localStorage.getItem("finsight_token");

const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  return res.json();
};

const PENEMPATAN_OPTIONS = [
  "Kantong Bank Krom", "Kantong Bank Jago", "Kantong Bank BCA",
  "Kantong Bank BRI", "Kantong Bank Mandiri", "Dompet Digital (GoPay)",
  "Dompet Digital (OVO)", "Dompet Digital (Dana)", "Celengan Rumah",
];

const PENEMPATAN_CUSTOM = "__custom__";

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

// ── Konstanta khusus tab Utang & Cicilan ────────────────────────────────────
const JENIS_UTANG = [
  { id: "utang",    label: "Utang",    emoji: "📤" },
  { id: "kredit",   label: "Kredit",   emoji: "💳" },
  { id: "paylater", label: "Paylater", emoji: "🛍️" },
];
const jenisLabel = (j) => JENIS_UTANG.find(o => o.id === j)?.label || "Utang";
const jenisEmoji = (j) => JENIS_UTANG.find(o => o.id === j)?.emoji || "📤";

const emptyDebtForm = {
  jenis: "utang", nama: "", tanggalMulai: "", tenor: "",
  cicilanPerBulan: "", totalUtang: "", tanggalJatuhTempo: "", dompet: "", keterangan: "",
};

// Tanggal jatuh tempo berikutnya (bulan ini kalau belum lewat, kalau udah lewat bulan depan)
function nextDueDate(tanggalJatuhTempo) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let due = new Date(now.getFullYear(), now.getMonth(), tanggalJatuhTempo);
  if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, tanggalJatuhTempo);
  return due;
}

export default function TargetPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("tabungan"); // "tabungan" | "utang"

  const [targets, setTargets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError]       = useState("");

  // ── State khusus Utang & Cicilan ─────────────────────────────────────────
  const [debts, setDebts]             = useState([]);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [deleteDebtId, setDeleteDebtId] = useState(null);
  const [debtError, setDebtError]       = useState("");
  const [debtForm, setDebtForm]         = useState(emptyDebtForm);

  // Form state dengan field baru
  const [form, setForm] = useState({
    nama: "", target: "", terkumpul: "", deadline: "", penempatan: "",
  });

  // Toggle: apakah sedang mode ketik custom untuk penempatan tabungan
  const [customPenempatan, setCustomPenempatan] = useState(false);

  // State untuk tambah nominal bebas per target
  const [customAmount, setCustomAmount] = useState({});

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiFetch("/api/targets"),
      apiFetch("/api/debts"),
    ]).then(([targetRes, debtRes]) => {
      if (targetRes.success) setTargets(targetRes.data);
      if (debtRes.success)   setDebts(debtRes.data);
    }).finally(() => setLoading(false));
  }, [user]);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  // Handler khusus untuk dropdown penempatan tabungan.
  // Kalau user pilih "Lainnya (ketik sendiri)", buka input teks bebas
  // dan kosongkan dulu nilai form.penempatan supaya user mulai dari kosong.
  const handlePenempatanSelect = (e) => {
    const val = e.target.value;
    if (val === PENEMPATAN_CUSTOM) {
      setCustomPenempatan(true);
      setForm((p) => ({ ...p, penempatan: "" }));
    } else {
      setCustomPenempatan(false);
      setForm((p) => ({ ...p, penempatan: val }));
    }
    setError("");
  };

  const handleAdd = async () => {
  if (!form.nama) { setError("Nama target wajib diisi."); return; }
  if (!form.target || Number(form.target) <= 0) { setError("Nominal target harus lebih dari 0."); return; }
  const result = await apiFetch("/api/targets", {
    method: "POST",
    body: JSON.stringify({ nama: form.nama, target: Number(form.target), terkumpul: Number(form.terkumpul) || 0, deadline: form.deadline || null, penempatan: form.penempatan || null }),
  });
  if (result.success) {
    setTargets((p) => [...p, result.data]);
    setForm({ nama: "", target: "", terkumpul: "", deadline: "", penempatan: "" });
    setCustomPenempatan(false);
    setShowForm(false);
  }
};

  // Tambah nominal — bisa dari tombol cepat atau input bebas.
  // Setiap nambah tabungan otomatis dicatat sebagai transaksi PENGELUARAN juga —
  // soalnya uang itu "pindah" dari saldo/dompet ke pos tabungan target.
  const handleTabung = async (id, tambah) => {
  if (!tambah || tambah <= 0) return;
  const t = targets.find((t) => t.id === id);
  const newTerkumpul = Math.min(t.terkumpul + tambah, t.target);
  const result = await apiFetch("/api/targets", {
    method: "PUT",
    body: JSON.stringify({ id, terkumpul: newTerkumpul }),
  });
  if (result.success) {
    setTargets((p) => p.map((t) => t.id === id ? result.data : t));
    setCustomAmount((p) => ({ ...p, [id]: "" }));
    // Catat otomatis sebagai pengeluaran "Tabungan" biar saldo/dompet ikut kepotong
    await apiFetch("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        mode: "personal",
        type: "pengeluaran",
        amount: tambah,
        category: "Tabungan",
        description: `Nabung ke target: ${t.nama}`,
        date: new Date().toISOString().slice(0, 10),
        kas: t.penempatan || "Kas Tunai",
      }),
    });
  }
};

  const handleDelete = async (id) => {
  await apiFetch(`/api/targets?id=${id}`, { method: "DELETE" });
  setTargets((p) => p.filter((t) => t.id !== id));
  setDeleteId(null);
};

  // ── Handlers: Utang & Cicilan ─────────────────────────────────────────────
  const handleDebtChange = (e) => {
    setDebtForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setDebtError("");
  };

  // Upsert reminder kalender H-jatuh-tempo — coba PUT dulu (kalau reminder-nya
  // udah ada dari sebelumnya), kalau belum ada (gagal) baru POST baru. Dengan
  // id tetap `debt-{id}` biar nggak numpuk-numpuk tiap bulan, cuma geser tanggalnya.
  const syncReminder = async (debt) => {
    if (!debt.tanggalJatuhTempo) return;
    const due = nextDueDate(debt.tanggalJatuhTempo);
    const payload = {
      id: `debt-${debt.id}`,
      mode: "personal",
      title: `${jenisEmoji(debt.jenis)} Bayar ${jenisLabel(debt.jenis)}: ${debt.nama}`,
      body: `Cicilan ${formatRupiah(debt.cicilanPerBulan)}${debt.dompet ? " · " + debt.dompet : ""}`,
      category: "tagihan",
      date: due.toISOString().slice(0, 10),
    };
    const putRes = await apiFetch(`/api/notes?table=cal_notes`, { method: "PUT", body: JSON.stringify(payload) });
    if (!putRes.success) {
      await apiFetch(`/api/notes?table=cal_notes`, { method: "POST", body: JSON.stringify(payload) });
    }
  };

  const removeReminder = async (debtId) => {
    await apiFetch(`/api/notes?table=cal_notes&id=debt-${debtId}`, { method: "DELETE" });
  };

  const handleAddDebt = async () => {
    if (!debtForm.nama.trim()) { setDebtError("Nama wajib diisi."); return; }
    if (!debtForm.cicilanPerBulan || Number(debtForm.cicilanPerBulan) <= 0) {
      setDebtError("Cicilan per bulan harus lebih dari 0."); return;
    }
    const result = await apiFetch("/api/debts", {
      method: "POST",
      body: JSON.stringify({
        jenis:              debtForm.jenis,
        nama:               debtForm.nama.trim(),
        tanggalMulai:       debtForm.tanggalMulai || null,
        tenor:              debtForm.tenor ? Number(debtForm.tenor) : null,
        cicilanPerBulan:    Number(debtForm.cicilanPerBulan),
        totalUtang:         debtForm.totalUtang ? Number(debtForm.totalUtang) : null,
        tanggalJatuhTempo:  debtForm.tanggalJatuhTempo ? Number(debtForm.tanggalJatuhTempo) : null,
        dompet:             debtForm.dompet || null,
        keterangan:         debtForm.keterangan.trim(),
      }),
    });
    if (result.success) {
      setDebts((p) => [...p, result.data]);
      setDebtForm(emptyDebtForm);
      setShowDebtForm(false);
      syncReminder(result.data);
    } else {
      setDebtError(result.message || "Gagal menyimpan. Coba lagi.");
    }
  };

  // Bayar cicilan bulan ini — otomatis bikin transaksi pengeluaran +
  // update progress utang + geser reminder kalender ke bulan berikutnya.
  const handleBayarCicilan = async (id) => {
    const d = debts.find((x) => x.id === id);
    if (!d) return;
    const amount = Number(d.cicilanPerBulan);

    await apiFetch("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        mode: "personal",
        type: "pengeluaran",
        amount,
        category: `Cicilan ${jenisLabel(d.jenis)}`,
        description: `Cicilan ${d.nama}`,
        date: new Date().toISOString().slice(0, 10),
        kas: d.dompet || "Kas Tunai",
      }),
    });

    const newTerbayar      = Number(d.terbayar || 0) + amount;
    const newBulanTerbayar = Number(d.bulanTerbayar || 0) + 1;
    const newLunas = d.tenor
      ? newBulanTerbayar >= d.tenor
      : (d.totalUtang ? newTerbayar >= d.totalUtang : false);

    const result = await apiFetch("/api/debts", {
      method: "PUT",
      body: JSON.stringify({ id, terbayar: newTerbayar, bulanTerbayar: newBulanTerbayar, lunas: newLunas }),
    });
    if (result.success) {
      setDebts((p) => p.map((x) => (x.id === id ? result.data : x)));
      if (newLunas) removeReminder(id);
      else syncReminder(result.data);
    }
  };

  const handleDeleteDebt = async (id) => {
    await apiFetch(`/api/debts?id=${id}`, { method: "DELETE" });
    setDebts((p) => p.filter((d) => d.id !== id));
    setDeleteDebtId(null);
    removeReminder(id);
  };

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    return Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getPerBulan = (target, terkumpul, deadline) => {
    if (!deadline) return null;
    const months = Math.max(Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24 * 30)), 1);
    const perBulan = Math.ceil((target - terkumpul) / months);
    return perBulan > 0 ? perBulan : 0;
  };

  const activeDebts = debts.filter((d) => !d.lunas);

  return (
    <DashboardLayout>
      <div className="targetpage">
        <PageHeader
          title={activeTab === "tabungan" ? "🎯 Target Tabungan" : "💳 Utang & Cicilan"}
          subtitle={activeTab === "tabungan" ? `${targets.length} target aktif` : `${activeDebts.length} cicilan berjalan`}
        />

        {/* ── Tab switcher: Target Tabungan / Utang & Cicilan ── */}
        <div className="targetpage__tabs">
          <button
            className={"targetpage__tab" + (activeTab === "tabungan" ? " targetpage__tab--active" : "")}
            onClick={() => setActiveTab("tabungan")}
          >
            🎯 Target Tabungan
          </button>
          <button
            className={"targetpage__tab" + (activeTab === "utang" ? " targetpage__tab--active" : "")}
            onClick={() => setActiveTab("utang")}
          >
            💳 Utang & Cicilan{activeDebts.length > 0 && <span className="targetpage__tab-badge">{activeDebts.length}</span>}
          </button>
        </div>

        {activeTab === "tabungan" && (
        <div className="targetpage__toolbar">
          <button className="targetpage__add-btn" onClick={() => setShowForm(true)}>
            + Tambah Target
          </button>
        </div>
        )}

        {activeTab === "tabungan" && (loading ? (
          <div className="dashboard__skeleton">
            <div className="targetpage__skeleton-grid">
              {[1,2,3].map(i => <div key={i} className="targetpage__skeleton-card skel" />)}
            </div>
          </div>
        ) : targets.length === 0 ? (
          <div className="targetpage__empty">
            <p>🎯</p>
            <p>Belum ada target tabungan.</p>
            <button className="targetpage__add-btn" onClick={() => setShowForm(true)}>
              + Buat Target Pertama
            </button>
          </div>
        ) : (
          <div className="targetpage__grid">
            {targets.map((t) => {
              const persen   = Math.min((t.terkumpul / t.target) * 100, 100);
              const daysLeft = getDaysLeft(t.deadline);
              const perBulan = getPerBulan(t.target, t.terkumpul, t.deadline);
              const selesai  = t.terkumpul >= t.target;

              return (
                <div key={t.id} className={"targetpage__card " + (selesai ? "targetpage__card--done" : "")}>
                  {selesai && <div className="targetpage__done-badge">✅ Tercapai!</div>}

                  <div className="targetpage__card-header">
                    <div>
                      <h3 className="targetpage__card-nama">{t.nama}</h3>
                      {/* Penempatan tabungan */}
                      {t.penempatan && (
                        <span className="targetpage__card-penempatan">🏦 {t.penempatan}</span>
                      )}
                    </div>
                    <button className="targetpage__card-delete" onClick={() => setDeleteId(t.id)}>🗑</button>
                  </div>

                  {/* Progress bar + persen */}
                  <div>
                    <div className="targetpage__progress-bar">
                      <div className="targetpage__progress-fill" style={{ width: persen + "%" }} />
                    </div>
                    <div className="targetpage__progress-info">
                      <span>{formatRupiah(t.terkumpul)}</span>
                      <span className="targetpage__persen">{persen.toFixed(0)}%</span>
                      <span>{formatRupiah(t.target)}</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="targetpage__info">
                    <div className="targetpage__info-item">
                      <span>Sisa</span>
                      <strong>{formatRupiah(Math.max(t.target - t.terkumpul, 0))}</strong>
                    </div>
                    {t.deadline && (
                      <div className="targetpage__info-item">
                        <span>Deadline</span>
                        <strong className={daysLeft !== null && daysLeft < 30 ? "targetpage__urgent" : ""}>
                          {daysLeft !== null
                            ? (daysLeft > 0 ? `${daysLeft} hari lagi` : "Lewat deadline")
                            : "-"}
                        </strong>
                      </div>
                    )}
                    {perBulan !== null && !selesai && (
                      <div className="targetpage__info-item">
                        <span>Nabung/bulan</span>
                        <strong>{formatRupiah(perBulan)}</strong>
                      </div>
                    )}
                  </div>

                  {/* Tambah tabungan */}
                  {!selesai && (
                    <div className="targetpage__quick-add">
                      <span className="targetpage__quick-label">Tambah tabungan:</span>

                      {/* Tombol cepat */}
                      <div className="targetpage__quick-btns">
                        {QUICK_AMOUNTS.map((n) => (
                          <button
                            key={n}
                            className="targetpage__quick-btn"
                            onClick={() => handleTabung(t.id, n)}
                          >
                            +{n >= 1000000 ? (n/1000000)+"jt" : (n/1000)+"rb"}
                          </button>
                        ))}
                      </div>

                      {/* Input nominal bebas */}
                      <div className="targetpage__custom-wrap">
                        <RupiahInput
                          className="targetpage__custom-input"
                          placeholder="Nominal lain..."
                          value={customAmount[t.id] || ""}
                          onChange={(v) => setCustomAmount((p) => ({ ...p, [t.id]: v }))}
                        />
                        <button
                          className="targetpage__custom-btn"
                          onClick={() => handleTabung(t.id, Number(customAmount[t.id]))}
                          disabled={!customAmount[t.id] || Number(customAmount[t.id]) <= 0}
                        >
                          + Tambah
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Form Modal */}
        {showForm && (
          <div className="targetpage__overlay" onClick={() => setShowForm(false)}>
            <div className="targetpage__form animate-fadeUp" onClick={(e) => e.stopPropagation()}>
              <div className="targetpage__form-header">
                <h3>Tambah Target Baru</h3>
                <button onClick={() => setShowForm(false)}>✕</button>
              </div>

              <div className="targetpage__form-fields">
                <div className="targetpage__field">
                  <label>Nama Target</label>
                  <input name="nama" placeholder="Misal: Beli Laptop, Liburan Bali" value={form.nama} onChange={handleChange} />
                </div>
                <div className="targetpage__field">
                  <label>Nominal Target (Rp)</label>
                  <RupiahInput placeholder="Contoh: 5.000.000" value={form.target}
                    onChange={v => { setForm(p => ({ ...p, target: v })); setError(""); }} />
                </div>
                <div className="targetpage__field">
                  <label>Sudah Terkumpul (Rp)</label>
                  <RupiahInput placeholder="0 jika belum ada" value={form.terkumpul}
                    onChange={v => { setForm(p => ({ ...p, terkumpul: v })); setError(""); }} />
                </div>

                {/* Penempatan tabungan — bisa pilih dari daftar atau ketik sendiri */}
                <div className="targetpage__field">
                  <label>🏦 Penempatan Tabungan <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>

                  {!customPenempatan ? (
                    <select name="penempatan" value={form.penempatan} onChange={handlePenempatanSelect}>
                      <option value="">-- Pilih tempat menabung --</option>
                      {PENEMPATAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      <option value={PENEMPATAN_CUSTOM}>✏️ Lainnya (ketik sendiri)</option>
                    </select>
                  ) : (
                    <div className="targetpage__custom-penempatan-wrap">
                      <input
                        autoFocus
                        name="penempatan"
                        placeholder="Misal: Bank Syariah Indonesia"
                        value={form.penempatan}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        className="targetpage__custom-penempatan-back"
                        onClick={() => { setCustomPenempatan(false); setForm((p) => ({ ...p, penempatan: "" })); }}
                        title="Kembali ke daftar pilihan"
                      >
                        ↺ Pilih dari daftar
                      </button>
                    </div>
                  )}
                </div>

                <div className="targetpage__field">
                  <label>Deadline <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>
                  <input name="deadline" type="date" value={form.deadline} onChange={handleChange} />
                </div>

                {error && <p className="targetpage__error">⚠️ {error}</p>}
                <button className="targetpage__submit" onClick={handleAdd}>Simpan Target</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteId && (
          <div className="targetpage__overlay" onClick={() => setDeleteId(null)}>
            <div className="targetpage__confirm" onClick={(e) => e.stopPropagation()}>
              <p>Hapus target ini?</p>
              <p>Tindakan ini tidak bisa dibatalkan.</p>
              <div className="targetpage__confirm-actions">
                <button onClick={() => setDeleteId(null)}>Batal</button>
                <button className="targetpage__confirm-delete" onClick={() => handleDelete(deleteId)}>Hapus</button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ TAB: UTANG & CICILAN ══════════════════ */}
        {activeTab === "utang" && (
        <div className="targetpage__toolbar">
          <button className="targetpage__add-btn" onClick={() => setShowDebtForm(true)}>
            + Tambah Utang/Kredit/Paylater
          </button>
        </div>
        )}

        {activeTab === "utang" && (loading ? (
          <div className="dashboard__skeleton">
            <div className="targetpage__skeleton-grid">
              {[1,2,3].map(i => <div key={i} className="targetpage__skeleton-card skel" />)}
            </div>
          </div>
        ) : debts.length === 0 ? (
          <div className="targetpage__empty">
            <p>💳</p>
            <p>Belum ada utang, kredit, atau paylater tercatat.</p>
            <button className="targetpage__add-btn" onClick={() => setShowDebtForm(true)}>
              + Catat yang Pertama
            </button>
          </div>
        ) : (
          <div className="targetpage__grid">
            {debts.map((d) => {
              const persen = d.totalUtang
                ? Math.min((d.terbayar / d.totalUtang) * 100, 100)
                : (d.tenor ? Math.min((d.bulanTerbayar / d.tenor) * 100, 100) : 0);
              const sisaTenor = d.tenor ? Math.max(d.tenor - d.bulanTerbayar, 0) : null;
              const due = !d.lunas && d.tanggalJatuhTempo ? nextDueDate(d.tanggalJatuhTempo) : null;
              const dueDays = due ? Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24)) : null;

              return (
                <div key={d.id} className={"targetpage__card " + (d.lunas ? "targetpage__card--done" : "")}>
                  {d.lunas && <div className="targetpage__done-badge">✅ Lunas!</div>}

                  <div className="targetpage__card-header">
                    <div>
                      <h3 className="targetpage__card-nama">{jenisEmoji(d.jenis)} {d.nama}</h3>
                      <span className="targetpage__card-penempatan">{jenisLabel(d.jenis)}{d.dompet ? " · dari " + d.dompet : ""}</span>
                    </div>
                    <button className="targetpage__card-delete" onClick={() => setDeleteDebtId(d.id)}>🗑</button>
                  </div>

                  {(d.totalUtang || d.tenor) && (
                    <div>
                      <div className="targetpage__progress-bar">
                        <div className="targetpage__progress-fill" style={{ width: persen + "%" }} />
                      </div>
                      <div className="targetpage__progress-info">
                        <span>{d.totalUtang ? formatRupiah(d.terbayar) : `${d.bulanTerbayar}x bayar`}</span>
                        <span className="targetpage__persen">{persen.toFixed(0)}%</span>
                        <span>{d.totalUtang ? formatRupiah(d.totalUtang) : `${d.tenor}x cicilan`}</span>
                      </div>
                    </div>
                  )}

                  <div className="targetpage__info">
                    <div className="targetpage__info-item">
                      <span>Cicilan/bulan</span>
                      <strong>{formatRupiah(d.cicilanPerBulan)}</strong>
                    </div>
                    {sisaTenor !== null && !d.lunas && (
                      <div className="targetpage__info-item">
                        <span>Sisa Tenor</span>
                        <strong>{sisaTenor} bulan</strong>
                      </div>
                    )}
                    {dueDays !== null && (
                      <div className="targetpage__info-item">
                        <span>Jatuh Tempo</span>
                        <strong className={dueDays <= 7 ? "targetpage__urgent" : ""}>
                          {dueDays === 0 ? "Hari ini" : dueDays > 0 ? `${dueDays} hari lagi` : "Terlewat"}
                        </strong>
                      </div>
                    )}
                  </div>

                  {d.keterangan && <p className="targetpage__debt-keterangan">📝 {d.keterangan}</p>}

                  {!d.lunas && (
                    <button className="targetpage__submit" onClick={() => handleBayarCicilan(d.id)}>
                      💸 Bayar Cicilan Bulan Ini ({formatRupiah(d.cicilanPerBulan)})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Form Modal: Tambah Utang/Kredit/Paylater */}
        {showDebtForm && (
          <div className="targetpage__overlay" onClick={() => setShowDebtForm(false)}>
            <div className="targetpage__form animate-fadeUp" onClick={(e) => e.stopPropagation()}>
              <div className="targetpage__form-header">
                <h3>Tambah Utang/Kredit/Paylater</h3>
                <button onClick={() => setShowDebtForm(false)}>✕</button>
              </div>

              <div className="targetpage__form-fields">
                <div className="targetpage__field">
                  <label>Jenis</label>
                  <select name="jenis" value={debtForm.jenis} onChange={handleDebtChange}>
                    {JENIS_UTANG.map(o => <option key={o.id} value={o.id}>{o.emoji} {o.label}</option>)}
                  </select>
                </div>
                <div className="targetpage__field">
                  <label>Nama</label>
                  <input name="nama" placeholder="Misal: KTA Bank Jago, Kredivo, Cicilan HP"
                    value={debtForm.nama} onChange={handleDebtChange} />
                </div>
                <div className="targetpage__field">
                  <label>Tanggal Mulai <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>
                  <input name="tanggalMulai" type="date" value={debtForm.tanggalMulai} onChange={handleDebtChange} />
                </div>
                <div className="targetpage__field">
                  <label>Tenor (bulan) <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional, khusus yang ada tenornya)</span></label>
                  <input name="tenor" type="number" min="1" placeholder="Misal: 12"
                    value={debtForm.tenor} onChange={handleDebtChange} />
                </div>
                <div className="targetpage__field">
                  <label>Cicilan per Bulan (Rp)</label>
                  <RupiahInput placeholder="Contoh: 500.000" value={debtForm.cicilanPerBulan}
                    onChange={v => { setDebtForm(p => ({ ...p, cicilanPerBulan: v })); setDebtError(""); }} />
                </div>
                <div className="targetpage__field">
                  <label>Total Utang/Pokok (Rp) <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>
                  <RupiahInput placeholder="Kosongkan kalau nggak tahu totalnya" value={debtForm.totalUtang}
                    onChange={v => { setDebtForm(p => ({ ...p, totalUtang: v })); setDebtError(""); }} />
                </div>
                <div className="targetpage__field">
                  <label>Tanggal Jatuh Tempo Tiap Bulan <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional, 1-28)</span></label>
                  <input name="tanggalJatuhTempo" type="number" min="1" max="28" placeholder="Misal: 25"
                    value={debtForm.tanggalJatuhTempo} onChange={handleDebtChange} />
                </div>
                <div className="targetpage__field">
                  <label>Dompet Sumber Bayar <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>
                  <input name="dompet" placeholder="Misal: Kas Tunai, Rekening Bank"
                    value={debtForm.dompet} onChange={handleDebtChange} />
                </div>
                <div className="targetpage__field">
                  <label>Keterangan <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>
                  <input name="keterangan" placeholder="Catatan tambahan"
                    value={debtForm.keterangan} onChange={handleDebtChange} />
                </div>

                {debtError && <p className="targetpage__error">⚠️ {debtError}</p>}
                <button className="targetpage__submit" onClick={handleAddDebt}>Simpan</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm: Utang */}
        {deleteDebtId && (
          <div className="targetpage__overlay" onClick={() => setDeleteDebtId(null)}>
            <div className="targetpage__confirm" onClick={(e) => e.stopPropagation()}>
              <p>Hapus catatan ini?</p>
              <p>Tindakan ini tidak bisa dibatalkan. Riwayat transaksi cicilan yang udah kebayar TETAP aman.</p>
              <div className="targetpage__confirm-actions">
                <button onClick={() => setDeleteDebtId(null)}>Batal</button>
                <button className="targetpage__confirm-delete" onClick={() => handleDeleteDebt(deleteDebtId)}>Hapus</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
