import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import RupiahInput from "../components/RupiahInput";
import { formatRupiah } from "../utils/storage";
import "./TargetPage.css";
import "./DashboardSkeleton.css";

import { CreditCard, Pencil, Target, Trash2, X } from "lucide-react";
const getToken = () => localStorage.getItem("finsight_token");

const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  return res.json();
};

// Preset dasar — SAMA PERSIS dengan KAS_PRESET di TransactionForm.jsx, supaya nama
// dompet yang muncul di sini konsisten dengan yang dipakai pas catat transaksi.
// Daftar ASLI yang ditampilkan ke user nanti digabung lagi sama dompet yang udah
// terdaftar di halaman Dompet + nama kas yang pernah dipakai di transaksi (live data),
// jadi user nggak perlu ketik ulang nama yang beda-beda buat wadah yang sama.
const DEFAULT_WALLET_PRESET = ["Kas Tunai", "Rekening Bank", "E-Wallet"];
const PENEMPATAN_CUSTOM = "__custom__";

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

// ── Konstanta khusus tab Utang & Cicilan ────────────────────────────────────
const JENIS_UTANG = [
  { id: "utang",    label: "Utang",    emoji: "" },
  { id: "kredit",   label: "Kredit",   emoji: "" },
  { id: "paylater", label: "Paylater", emoji: "" },
];
const jenisLabel = (j) => JENIS_UTANG.find(o => o.id === j)?.label || "Utang";
const jenisEmoji = (j) => JENIS_UTANG.find(o => o.id === j)?.emoji || "";

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
  const [editingId, setEditingId] = useState(null); // null = tambah baru, isi id = lagi edit target itu
  const [targetSubmitting, setTargetSubmitting] = useState(false); // guard tombol Simpan Target

  // ── State khusus Utang & Cicilan ─────────────────────────────────────────
  const [debts, setDebts]             = useState([]);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [deleteDebtId, setDeleteDebtId] = useState(null);
  const [debtError, setDebtError]       = useState("");
  const [reminderWarning, setReminderWarning] = useState(""); // notice non-blocking kalau sync reminder gagal
  const [debtForm, setDebtForm]         = useState(emptyDebtForm);
  const [editingDebtId, setEditingDebtId] = useState(null); // null = tambah baru, isi id = lagi edit utang itu
  const [customDompetDebt, setCustomDompetDebt] = useState(false); // toggle ketik-bebas utk dompet di form utang

  // Daftar nama dompet yang konsisten dipakai di 3 tempat: Transaksi, Penempatan
  // Target, dan Dompet Sumber Bayar Utang — digabung dari dompet terdaftar +
  // histori kas transaksi + preset dasar, biar nggak kepecah jadi nama yang beda-beda.
  const [walletOptions, setWalletOptions] = useState([]);

  // Form state dengan field baru
  const [form, setForm] = useState({
    nama: "", target: "", terkumpul: "", deadline: "", penempatan: "",
  });

  // Toggle: apakah sedang mode ketik custom untuk penempatan tabungan
  const [customPenempatan, setCustomPenempatan] = useState(false);

  // State untuk tambah nominal bebas per target
  const [customAmount, setCustomAmount] = useState({});
  const [confirmTabung, setConfirmTabung] = useState(null); // { id, nama, penempatan, amount, sumber }
  const [tabungBusy, setTabungBusy]   = useState(false); // guard biar tombol "Ya, Lanjutkan" nggak keklik dobel
  const [payingId, setPayingId]       = useState(null);  // id utang yang lagi diproses "Bayar Cicilan" (cegah klik dobel)
  const [debtSubmitting, setDebtSubmitting] = useState(false); // guard tombol Simpan form utang

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiFetch("/api/targets"),
      apiFetch("/api/debts"),
      apiFetch("/api/transactions?mode=personal"),
      apiFetch("/api/umkm?table=dompet"),
    ]).then(([targetRes, debtRes, txRes, dompetRes]) => {
      if (targetRes.success) setTargets(targetRes.data);
      if (debtRes.success)   setDebts(debtRes.data);

      const dompetTerdaftar = dompetRes.success ? dompetRes.data.map(d => d.nama) : [];
      const kasHist         = txRes.success ? txRes.data.map(tx => tx.kas).filter(Boolean) : [];
      const penempatanLama  = (targetRes.success ? targetRes.data : []).map(t => t.penempatan).filter(Boolean);
      const dompetUtangLama = (debtRes.success ? debtRes.data : []).map(d => d.dompet).filter(Boolean);
      setWalletOptions([...new Set([...DEFAULT_WALLET_PRESET, ...dompetTerdaftar, ...kasHist, ...penempatanLama, ...dompetUtangLama])]);
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

  const handleSaveTarget = async () => {
  if (targetSubmitting) return;
  if (!form.nama) { setError("Nama target wajib diisi."); return; }
  if (!form.target || Number(form.target) <= 0) { setError("Nominal target harus lebih dari 0."); return; }
  setTargetSubmitting(true);
  try {
    if (editingId) {
      const result = await apiFetch("/api/targets", {
        method: "PUT",
        body: JSON.stringify({
          id: editingId, nama: form.nama, target: Number(form.target),
          terkumpul: Number(form.terkumpul) || 0, deadline: form.deadline || null, penempatan: form.penempatan || null,
        }),
      });
      if (result.success) {
        setTargets((p) => p.map((t) => t.id === editingId ? result.data : t));
        setForm({ nama: "", target: "", terkumpul: "", deadline: "", penempatan: "" });
        setCustomPenempatan(false);
        setEditingId(null);
        setShowForm(false);
      } else {
        setError(result.message || "Gagal menyimpan perubahan.");
      }
    } else {
      const result = await apiFetch("/api/targets", {
        method: "POST",
        body: JSON.stringify({ nama: form.nama, target: Number(form.target), terkumpul: Number(form.terkumpul) || 0, deadline: form.deadline || null, penempatan: form.penempatan || null }),
      });
      if (result.success) {
        setTargets((p) => [...p, result.data]);
        setForm({ nama: "", target: "", terkumpul: "", deadline: "", penempatan: "" });
        setCustomPenempatan(false);
        setShowForm(false);
      } else {
        setError(result.message || "Gagal menyimpan target.");
      }
    }
  } finally {
    setTargetSubmitting(false);
  }
};

  const openEditTarget = (t) => {
    setForm({
      nama: t.nama, target: String(t.target), terkumpul: String(t.terkumpul),
      deadline: t.deadline || "", penempatan: t.penempatan || "",
    });
    setCustomPenempatan(!!(t.penempatan && !walletOptions.includes(t.penempatan)));
    setEditingId(t.id);
    setError("");
    setShowForm(true);
  };

  const closeTargetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ nama: "", target: "", terkumpul: "", deadline: "", penempatan: "" });
    setCustomPenempatan(false);
    setError("");
  };

  // Tambah nominal — bisa dari tombol cepat atau input bebas.
  // Kalau target punya "Penempatan Tabungan" (dompet tujuan), dicatat sebagai TRANSFER
  // dari dompet sumber ke dompet penempatan — biar saldo dompet penempatan itu beneran
  // NAMBAH (bukan malah kepotong kayak sebelumnya). Kalau nggak ada penempatan, dicatat
  // sebagai pengeluaran biasa dari dompet sumber (uangnya "disisihkan", tanpa tujuan spesifik).
  const handleTabung = async (id, tambah, sumberDompet) => {
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
    const sumber = sumberDompet || "Kas Tunai";
    if (t.penempatan && t.penempatan.trim().toLowerCase() !== sumber.trim().toLowerCase()) {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          mode: "personal",
          type: "transfer",
          amount: tambah,
          category: "Transfer Antar Dompet",
          description: `Nabung ke target: ${t.nama}`,
          date: new Date().toISOString().slice(0, 10),
          kas: sumber,
          kas_tujuan: t.penempatan,
        }),
      });
    } else {
      // Nggak ada penempatan spesifik (atau sumbernya sama dengan penempatan) —
      // dicatat pengeluaran biasa, konsisten kayak sebelumnya.
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          mode: "personal",
          type: "pengeluaran",
          amount: tambah,
          category: "Tabungan",
          description: `Nabung ke target: ${t.nama}`,
          date: new Date().toISOString().slice(0, 10),
          kas: sumber,
        }),
      });
    }
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
  // Dibungkus try/catch + kasih notice non-blocking kalau gagal, jangan gagal diam-diam
  // (utang/pembayarannya TETAP kesimpen biarpun reminder-nya gagal disinkronkan).
  const syncReminder = async (debt) => {
    if (!debt.tanggalJatuhTempo) return;
    try {
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
        const postRes = await apiFetch(`/api/notes?table=cal_notes`, { method: "POST", body: JSON.stringify(payload) });
        if (!postRes.success) throw new Error(postRes.message || "gagal sync reminder");
      }
      setReminderWarning("");
    } catch (err) {
      console.error("[syncReminder] gagal:", err);
      setReminderWarning(`Data utang "${debt.nama}" tersimpan, tapi reminder di Catatan gagal disinkronkan (cek koneksi lalu buka lagi halaman ini).`);
    }
  };

  const removeReminder = async (debtId) => {
    try {
      const res = await apiFetch(`/api/notes?table=cal_notes&id=debt-${debtId}`, { method: "DELETE" });
      if (!res.success) throw new Error(res.message || "gagal hapus reminder");
    } catch (err) {
      console.error("[removeReminder] gagal:", err);
      setReminderWarning(`Reminder lama masih ketinggalan di Catatan — boleh dihapus manual kalau ganggu.`);
    }
  };

  const handleSaveDebt = async () => {
    if (debtSubmitting) return;
    if (!debtForm.nama.trim()) { setDebtError("Nama wajib diisi."); return; }
    if (!debtForm.cicilanPerBulan || Number(debtForm.cicilanPerBulan) <= 0) {
      setDebtError("Cicilan per bulan harus lebih dari 0."); return;
    }
    setDebtSubmitting(true);
    try {
      const payload = {
        jenis:              debtForm.jenis,
        nama:               debtForm.nama.trim(),
        tanggalMulai:       debtForm.tanggalMulai || null,
        tenor:              debtForm.tenor ? Number(debtForm.tenor) : null,
        cicilanPerBulan:    Number(debtForm.cicilanPerBulan),
        totalUtang:         debtForm.totalUtang ? Number(debtForm.totalUtang) : null,
        tanggalJatuhTempo:  debtForm.tanggalJatuhTempo ? Number(debtForm.tanggalJatuhTempo) : null,
        dompet:             debtForm.dompet || null,
        keterangan:         debtForm.keterangan.trim(),
      };

      if (editingDebtId) {
        // Edit TIDAK menyentuh terbayar/bulanTerbayar/lunas — progress cicilan yang
        // udah jalan harus tetap aman, cuma detail info-nya aja yang berubah.
        const result = await apiFetch("/api/debts", {
          method: "PUT",
          body: JSON.stringify({ id: editingDebtId, ...payload }),
        });
        if (result.success) {
          setDebts((p) => p.map((x) => (x.id === editingDebtId ? result.data : x)));
          setDebtForm(emptyDebtForm);
          setShowDebtForm(false);
          setEditingDebtId(null);
          setCustomDompetDebt(false);
          // Tanggal jatuh tempo bisa aja berubah pas edit — geser ulang reminder-nya
          if (!result.data.lunas) syncReminder(result.data); else removeReminder(editingDebtId);
        } else {
          setDebtError(result.message || "Gagal menyimpan perubahan.");
        }
      } else {
        const result = await apiFetch("/api/debts", { method: "POST", body: JSON.stringify(payload) });
        if (result.success) {
          setDebts((p) => [...p, result.data]);
          setDebtForm(emptyDebtForm);
          setShowDebtForm(false);
          setCustomDompetDebt(false);
          syncReminder(result.data);
        } else {
          setDebtError(result.message || "Gagal menyimpan. Coba lagi.");
        }
      }
    } finally {
      setDebtSubmitting(false);
    }
  };

  const openEditDebt = (d) => {
    setDebtForm({
      jenis: d.jenis, nama: d.nama, tanggalMulai: d.tanggalMulai || "",
      tenor: d.tenor ? String(d.tenor) : "", cicilanPerBulan: String(d.cicilanPerBulan),
      totalUtang: d.totalUtang ? String(d.totalUtang) : "",
      tanggalJatuhTempo: d.tanggalJatuhTempo ? String(d.tanggalJatuhTempo) : "",
      dompet: d.dompet || "", keterangan: d.keterangan || "",
    });
    setCustomDompetDebt(!!(d.dompet && !walletOptions.includes(d.dompet)));
    setEditingDebtId(d.id);
    setDebtError("");
    setShowDebtForm(true);
  };

  const closeDebtForm = () => {
    setShowDebtForm(false);
    setEditingDebtId(null);
    setDebtForm(emptyDebtForm);
    setCustomDompetDebt(false);
    setDebtError("");
  };

  // Bayar cicilan bulan ini — otomatis bikin transaksi pengeluaran +
  // update progress utang + geser reminder kalender ke bulan berikutnya.
  const handleBayarCicilan = async (id) => {
    if (payingId) return; // udah ada pembayaran lain lagi diproses, cegah klik dobel
    const d = debts.find((x) => x.id === id);
    if (!d) return;
    setPayingId(id);
    try {
      const amount = Number(d.cicilanPerBulan);

      const txResult = await apiFetch("/api/transactions", {
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
      // Kalau transaksinya gagal kesimpen, jangan lanjut update progress utang —
      // biar nggak "kecatet lunas" padahal duitnya belum benar-benar tercatat keluar.
      if (!txResult.success) {
        setDebtError("Gagal mencatat transaksi pembayaran. Coba lagi.");
        return;
      }

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
    } finally {
      setPayingId(null);
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
          title={activeTab === "tabungan" ? "Target Tabungan" : "Utang & Cicilan"}
          subtitle={activeTab === "tabungan" ? `${targets.length} target aktif` : `${activeDebts.length} cicilan berjalan`}
        />

        {/* ── Tab switcher: Target Tabungan / Utang & Cicilan ── */}
        <div className="targetpage__tabs">
          <button
            className={"targetpage__tab" + (activeTab === "tabungan" ? " targetpage__tab--active" : "")}
            onClick={() => setActiveTab("tabungan")}
          >
            Target Tabungan
          </button>
          <button
            className={"targetpage__tab" + (activeTab === "utang" ? " targetpage__tab--active" : "")}
            onClick={() => setActiveTab("utang")}
          >
            Utang & Cicilan{activeDebts.length > 0 && <span className="targetpage__tab-badge">{activeDebts.length}</span>}
          </button>
        </div>

        {activeTab === "tabungan" && (
        <div className="targetpage__toolbar">
          <button className="targetpage__add-btn" onClick={() => { setEditingId(null); setShowForm(true); }}>
            + Tambah Target
          </button>
        </div>
        )}

        {activeTab === "tabungan" && (loading ? (
          <div className="dashboard__skeleton">
            <div className="targetpage__skeleton-grid stagger-list">
              {[1,2,3].map(i => <div key={i} className="targetpage__skeleton-card skel" />)}
            </div>
          </div>
        ) : targets.length === 0 ? (
          <div className="targetpage__empty">
            <p><Target size={14} /></p>
            <p>Belum ada target tabungan.</p>
            <button className="targetpage__add-btn" onClick={() => { setEditingId(null); setShowForm(true); }}>
              + Buat Target Pertama
            </button>
          </div>
        ) : (
          <div className="targetpage__grid stagger-list">
            {targets.map((t) => {
              const persen   = Math.min((t.terkumpul / t.target) * 100, 100);
              const daysLeft = getDaysLeft(t.deadline);
              const perBulan = getPerBulan(t.target, t.terkumpul, t.deadline);
              const selesai  = t.terkumpul >= t.target;

              return (
                <div key={t.id} className={"targetpage__card " + (selesai ? "targetpage__card--done" : "")}>
                  {selesai && <div className="targetpage__done-badge">Tercapai!</div>}

                  <div className="targetpage__card-header">
                    <div>
                      <h3 className="targetpage__card-nama">{t.nama}</h3>
                      {/* Penempatan tabungan */}
                      {t.penempatan && (
                        <span className="targetpage__card-penempatan">{t.penempatan}</span>
                      )}
                    </div>
                    <div className="targetpage__card-actions-group">
                      <button className="targetpage__card-edit" onClick={() => openEditTarget(t)} title="Edit"><Pencil size={14} /></button>
                      <button className="targetpage__card-delete" onClick={() => setDeleteId(t.id)} title="Hapus"><Trash2 size={14} /></button>
                    </div>
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
                            onClick={() => setConfirmTabung({ id: t.id, nama: t.nama, penempatan: t.penempatan || "", amount: n, sumber: "Kas Tunai" })}
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
                          onClick={() => setConfirmTabung({ id: t.id, nama: t.nama, penempatan: t.penempatan || "", amount: Number(customAmount[t.id]), sumber: "Kas Tunai" })}
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
          <div className="targetpage__overlay" onClick={closeTargetForm}>
            <div className="targetpage__form animate-fadeUp" onClick={(e) => e.stopPropagation()}>
              <div className="targetpage__form-header">
                <h3>{editingId ? "Edit Target" : "Tambah Target Baru"}</h3>
                <button onClick={closeTargetForm}><X size={14} /></button>
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
                  <label>Penempatan Tabungan <span style={{fontWeight:400, color:"var(--text-muted)", fontSize:"11px"}}>(opsional)</span></label>

                  {!customPenempatan ? (
                    <select name="penempatan" value={form.penempatan} onChange={handlePenempatanSelect}>
                      <option value="">-- Pilih tempat menabung --</option>
                      {walletOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      <option value={PENEMPATAN_CUSTOM}>Lainnya (ketik sendiri)</option>
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

                {error && <p className="targetpage__error">{error}</p>}
                <button className="targetpage__submit" onClick={handleSaveTarget} disabled={targetSubmitting}>
                  {targetSubmitting ? "Menyimpan..." : (editingId ? "Simpan Perubahan" : "Simpan Target")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Konfirmasi Tambah Tabungan */}
        {confirmTabung && (
          <div className="targetpage__overlay" onClick={() => setConfirmTabung(null)}>
            <div className="targetpage__confirm" onClick={(e) => e.stopPropagation()}>
              <p>Tambah Tabungan?</p>
              <p>
                Kamu akan menambah tabungan <strong>{formatRupiah(confirmTabung.amount)}</strong> ke target
                "<strong>{confirmTabung.nama}</strong>"
                {confirmTabung.penempatan
                  ? <> — dipindah dari dompet di bawah ini ke <strong>{confirmTabung.penempatan}</strong>.</>
                  : <> — diambil dari dompet di bawah ini.</>}
              </p>
              <div className="targetpage__field">
                <label>Ambil dari dompet mana?</label>
                <select
                  value={confirmTabung.sumber}
                  onChange={e => setConfirmTabung(p => ({ ...p, sumber: e.target.value }))}
                >
                  {[...new Set([confirmTabung.sumber, ...walletOptions])].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="targetpage__confirm-actions">
                <button onClick={() => setConfirmTabung(null)} disabled={tabungBusy}>Tidak</button>
                <button
                  className="targetpage__confirm-delete targetpage__confirm-delete--positive"
                  disabled={tabungBusy}
                  onClick={async () => {
                    if (tabungBusy) return;
                    setTabungBusy(true);
                    await handleTabung(confirmTabung.id, confirmTabung.amount, confirmTabung.sumber);
                    setTabungBusy(false);
                    setConfirmTabung(null);
                  }}
                >
                  {tabungBusy ? "Memproses..." : "Ya, Lanjutkan"}
                </button>
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
        {activeTab === "utang" && reminderWarning && (
          <div className="targetpage__reminder-warning">
            <span>{reminderWarning}</span>
            <button onClick={() => setReminderWarning("")}><X size={14} /></button>
          </div>
        )}

        {activeTab === "utang" && !showDebtForm && (
        <div className="targetpage__toolbar">
          <button className="targetpage__add-btn" onClick={() => { setEditingDebtId(null); setShowDebtForm(true); }}>
            + Tambah Utang/Kredit/Paylater
          </button>
        </div>
        )}

        {/* Form inline (bukan floating) — biar enak diisi, sama kayak form Biaya Operasional di UMKM */}
        {activeTab === "utang" && showDebtForm && (
          <div className="targetpage__inline-form">
            <h3 className="targetpage__inline-form-title">{editingDebtId ? "Edit Utang/Kredit/Paylater" : "+ Tambah Utang/Kredit/Paylater"}</h3>

            <div className="targetpage__inline-form-grid stagger-list">
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
                <label>Tanggal Mulai <span className="targetpage__label-opt">(opsional)</span></label>
                <input name="tanggalMulai" type="date" value={debtForm.tanggalMulai} onChange={handleDebtChange} />
              </div>
              <div className="targetpage__field">
                <label>Tenor (bulan) <span className="targetpage__label-opt">(opsional)</span></label>
                <input name="tenor" type="number" min="1" placeholder="Misal: 12"
                  value={debtForm.tenor} onChange={handleDebtChange} />
              </div>
              <div className="targetpage__field">
                <label>Cicilan per Bulan (Rp)</label>
                <RupiahInput placeholder="Contoh: 500.000" value={debtForm.cicilanPerBulan}
                  onChange={v => { setDebtForm(p => ({ ...p, cicilanPerBulan: v })); setDebtError(""); }} />
              </div>
              <div className="targetpage__field">
                <label>Total Utang/Pokok (Rp) <span className="targetpage__label-opt">(opsional)</span></label>
                <RupiahInput placeholder="Kosongkan kalau nggak tahu totalnya" value={debtForm.totalUtang}
                  onChange={v => { setDebtForm(p => ({ ...p, totalUtang: v })); setDebtError(""); }} />
              </div>
              <div className="targetpage__field">
                <label>Tanggal Jatuh Tempo Tiap Bulan <span className="targetpage__label-opt">(opsional, 1-28)</span></label>
                <input name="tanggalJatuhTempo" type="number" min="1" max="28" placeholder="Misal: 25"
                  value={debtForm.tanggalJatuhTempo} onChange={handleDebtChange} />
              </div>
              <div className="targetpage__field">
                <label>Dompet Sumber Bayar <span className="targetpage__label-opt">(opsional)</span></label>
                {!customDompetDebt ? (
                  <select
                    value={walletOptions.includes(debtForm.dompet) ? debtForm.dompet : ""}
                    onChange={e => {
                      if (e.target.value === PENEMPATAN_CUSTOM) { setCustomDompetDebt(true); setDebtForm(p => ({ ...p, dompet: "" })); }
                      else setDebtForm(p => ({ ...p, dompet: e.target.value }));
                    }}
                  >
                    <option value="">-- Pilih dompet --</option>
                    {walletOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value={PENEMPATAN_CUSTOM}>Lainnya (ketik sendiri)</option>
                  </select>
                ) : (
                  <div className="targetpage__custom-penempatan-wrap">
                    <input
                      autoFocus
                      placeholder="Misal: Bank Syariah Indonesia"
                      value={debtForm.dompet}
                      onChange={e => setDebtForm(p => ({ ...p, dompet: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="targetpage__custom-penempatan-back"
                      onClick={() => { setCustomDompetDebt(false); setDebtForm(p => ({ ...p, dompet: "" })); }}
                      title="Kembali ke daftar pilihan"
                    >
                      ↺ Pilih dari daftar
                    </button>
                  </div>
                )}
              </div>
              <div className="targetpage__field targetpage__field--wide">
                <label>Keterangan <span className="targetpage__label-opt">(opsional)</span></label>
                <input name="keterangan" placeholder="Catatan tambahan"
                  value={debtForm.keterangan} onChange={handleDebtChange} />
              </div>
            </div>

            {debtError && <p className="targetpage__error">{debtError}</p>}

            <div className="targetpage__inline-form-actions">
              <button className="targetpage__btn-sec" onClick={closeDebtForm}>Batal</button>
              <button className="targetpage__submit" onClick={handleSaveDebt} disabled={debtSubmitting}>
                {debtSubmitting ? "Menyimpan..." : (editingDebtId ? "Simpan Perubahan" : "Simpan")}
              </button>
            </div>
          </div>
        )}

        {activeTab === "utang" && (loading ? (
          <div className="dashboard__skeleton">
            <div className="targetpage__skeleton-grid stagger-list">
              {[1,2,3].map(i => <div key={i} className="targetpage__skeleton-card skel" />)}
            </div>
          </div>
        ) : debts.length === 0 ? (
          <div className="targetpage__empty">
            <p><CreditCard size={14} /></p>
            <p>Belum ada utang, kredit, atau paylater tercatat.</p>
            <button className="targetpage__add-btn" onClick={() => { setEditingDebtId(null); setShowDebtForm(true); }}>
              + Catat yang Pertama
            </button>
          </div>
        ) : (
          <div className="targetpage__grid stagger-list">
            {debts.map((d) => {
              const persen = d.totalUtang
                ? Math.min((d.terbayar / d.totalUtang) * 100, 100)
                : (d.tenor ? Math.min((d.bulanTerbayar / d.tenor) * 100, 100) : 0);
              const sisaTenor = d.tenor ? Math.max(d.tenor - d.bulanTerbayar, 0) : null;
              const due = !d.lunas && d.tanggalJatuhTempo ? nextDueDate(d.tanggalJatuhTempo) : null;
              const dueDays = due ? Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24)) : null;

              return (
                <div key={d.id} className={"targetpage__card " + (d.lunas ? "targetpage__card--done" : "")}>
                  {d.lunas && <div className="targetpage__done-badge">Lunas!</div>}

                  <div className="targetpage__card-header">
                    <div>
                      <h3 className="targetpage__card-nama">{jenisEmoji(d.jenis)} {d.nama}</h3>
                      <span className="targetpage__card-penempatan">{jenisLabel(d.jenis)}{d.dompet ? " · dari " + d.dompet : ""}</span>
                    </div>
                    <div className="targetpage__card-actions-group">
                      <button className="targetpage__card-edit" onClick={() => openEditDebt(d)} title="Edit"><Pencil size={14} /></button>
                      <button className="targetpage__card-delete" onClick={() => setDeleteDebtId(d.id)} title="Hapus"><Trash2 size={14} /></button>
                    </div>
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

                  {d.keterangan && <p className="targetpage__debt-keterangan">{d.keterangan}</p>}

                  {!d.lunas && (
                    <button className="targetpage__submit" onClick={() => handleBayarCicilan(d.id)} disabled={payingId === d.id}>
                      {payingId === d.id ? "⏳ Memproses..." : `Bayar Cicilan Bulan Ini (${formatRupiah(d.cicilanPerBulan)})`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

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
