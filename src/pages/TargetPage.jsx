import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import { formatRupiah } from "../utils/storage";
import "./TargetPage.css";

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

export default function TargetPage() {
  const { user } = useAuth();
  const [targets, setTargets]   = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError]       = useState("");

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
  apiFetch("/api/targets").then((r) => { if (r.success) setTargets(r.data); });
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

  // Tambah nominal — bisa dari tombol cepat atau input bebas
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
  }
};

  const handleDelete = async (id) => {
  await apiFetch(`/api/targets?id=${id}`, { method: "DELETE" });
  setTargets((p) => p.filter((t) => t.id !== id));
  setDeleteId(null);
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

  return (
    <DashboardLayout>
      <div className="targetpage">
        <PageHeader
          title="Target Tabungan"
          subtitle={`${targets.length} target aktif`}
        />
        <div className="targetpage__toolbar">
          <button className="targetpage__add-btn" onClick={() => setShowForm(true)}>
            + Tambah Target
          </button>
        </div>

        {/* Target Cards */}
        {targets.length === 0 ? (
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
                        <input
                          className="targetpage__custom-input"
                          type="number"
                          placeholder="Nominal lain..."
                          value={customAmount[t.id] || ""}
                          onChange={(e) => setCustomAmount((p) => ({ ...p, [t.id]: e.target.value }))}
                          min="0"
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
        )}

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
                  <input name="target" type="number" placeholder="Contoh: 5000000" value={form.target} onChange={handleChange} />
                </div>
                <div className="targetpage__field">
                  <label>Sudah Terkumpul (Rp)</label>
                  <input name="terkumpul" type="number" placeholder="0 jika belum ada" value={form.terkumpul} onChange={handleChange} />
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
      </div>
    </DashboardLayout>
  );
}
