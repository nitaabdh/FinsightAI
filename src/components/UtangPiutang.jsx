import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId,
  formatRupiah, labelJatuhTempo,
} from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import "./UtangPiutang.css";

const emptyForm = { jenis: "piutang", nama: "", nominal: "", jatuhTempo: "", catatan: "" };

export default function UtangPiutang() {
  const { user } = useAuth();
  const [list, setList]     = useState([]);
  const [form, setForm]     = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError]   = useState("");
  const [delId, setDelId]   = useState(null);

  // Tab dalam tab: "piutang" | "utang", dan toggle riwayat (lunas) per sisi
  const [sisi, setSisi]           = useState("piutang");
  const [showRiwayat, setShowRiwayat] = useState(false);

 // Tambah di atas component
const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("finsight_token")}`, ...(options.headers||{}) },
  });
  return res.json();
};

// useEffect
useEffect(() => {
  if (!user) return;
  apiFetch(`/api/umkm?table=utang_piutang`).then(r => { if (r.success) setList(r.data); });
}, [user]);


  const resetForm = () => { setForm({ ...emptyForm, jenis: sisi }); setEditId(null); setError(""); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setError("");
  };

  // handleSubmit
const handleSubmit = async () => {
  if (!form.nama.trim()) return setError("Nama pihak tidak boleh kosong.");
  if (!form.nominal || isNaN(form.nominal) || +form.nominal <= 0) return setError("Masukkan nominal yang valid.");
  if (!form.jatuhTempo) return setError("Pilih tanggal jatuh tempo.");

  const payload = { jenis: form.jenis || sisi, nama: form.nama.trim(), nominal: +form.nominal, jatuhTempo: form.jatuhTempo, catatan: form.catatan.trim(), lunas: false };

  if (editId) {
    const r = await apiFetch(`/api/umkm?table=utang_piutang`, { method: "PUT", body: JSON.stringify({ id: editId, ...payload }) });
    if (r.success) { setList(p => p.map(it => it.id === editId ? r.data : it)); window.dispatchEvent(new CustomEvent("utangPiutangUpdated")); }
  } else {
    const r = await apiFetch(`/api/umkm?table=utang_piutang`, { method: "POST", body: JSON.stringify({ id: genId(), ...payload }) });
    if (r.success) { setList(p => [r.data, ...p]); window.dispatchEvent(new CustomEvent("utangPiutangUpdated")); }
  }
  resetForm();
};

  const openEdit = (it) => {
    setForm({ jenis: it.jenis, nama: it.nama, nominal: String(it.nominal), jatuhTempo: it.jatuhTempo, catatan: it.catatan || "" });
    setEditId(it.id);
    setSisi(it.jenis);
    setError("");
  };

  // handleDel
const handleDel = async (id) => {
  await apiFetch(`/api/umkm?table=utang_piutang&id=${id}`, { method: "DELETE" });
  setList(p => p.filter(it => it.id !== id));
  setDelId(null);
  if (editId === id) resetForm();
  window.dispatchEvent(new CustomEvent("utangPiutangUpdated"));
};

 // toggleLunas
const toggleLunas = async (id) => {
  const it = list.find(x => x.id === id);
  if (!it) return;
  const r = await apiFetch(`/api/umkm?table=utang_piutang`, { method: "PUT", body: JSON.stringify({ id, ...it, lunas: !it.lunas }) });
  if (r.success) { setList(p => p.map(x => x.id === id ? r.data : x)); window.dispatchEvent(new CustomEvent("utangPiutangUpdated")); }
};

  // ── Filter sesuai sisi (piutang/utang) & riwayat ──────────────────────────────
  const filtered = list
    .filter((it) => it.jenis === sisi)
    .filter((it) => (showRiwayat ? it.lunas : !it.lunas))
    .sort((a, b) => new Date(a.jatuhTempo) - new Date(b.jatuhTempo));

  const totalAktif = list
    .filter((it) => it.jenis === sisi && !it.lunas)
    .reduce((s, it) => s + it.nominal, 0);

  return (
    <div className="utangpiutang">
      {/* Sisi switcher: Piutang / Utang */}
      <div className="utangpiutang__sisi-switch">
        <button
          className={"utangpiutang__sisi-btn" + (sisi === "piutang" ? " utangpiutang__sisi-btn--active utangpiutang__sisi-btn--piutang" : "")}
          onClick={() => { setSisi("piutang"); setShowRiwayat(false); resetForm(); }}
        >
          📥 Piutang (Orang Berutang ke Saya)
        </button>
        <button
          className={"utangpiutang__sisi-btn" + (sisi === "utang" ? " utangpiutang__sisi-btn--active utangpiutang__sisi-btn--utang" : "")}
          onClick={() => { setSisi("utang"); setShowRiwayat(false); resetForm(); }}
        >
          📤 Utang (Saya Berutang ke Orang)
        </button>
      </div>

      {/* Total aktif sisi ini */}
      <div className={"utangpiutang__total utangpiutang__total--" + sisi}>
        <span className="utangpiutang__total-label">
          Total {sisi === "piutang" ? "Piutang" : "Utang"} Aktif (Belum Lunas)
        </span>
        <span className="utangpiutang__total-value">{formatRupiah(totalAktif)}</span>
      </div>

      {/* Form tambah/edit */}
      <div className="utangpiutang__form">
        <h3 className="utangpiutang__form-title">
          {editId ? "✏️ Edit Catatan" : sisi === "piutang" ? "+ Catat Piutang Baru" : "+ Catat Utang Baru"}
        </h3>
        <div className="utangpiutang__grid">
          <div className="utangpiutang__field utangpiutang__field--wide">
            <label className="utangpiutang__label">Nama Pihak</label>
            <input
              className="utangpiutang__input" type="text" name="nama"
              placeholder={sisi === "piutang" ? "Misal: Budi (pelanggan)" : "Misal: Toko Sumber Rejeki"}
              value={form.nama} onChange={handleChange}
            />
          </div>
          <div className="utangpiutang__field">
            <label className="utangpiutang__label">Nominal (Rp)</label>
            <RupiahInput
              className="utangpiutang__input"
              placeholder="Contoh: 500.000" value={form.nominal}
              onChange={v => { setForm(p => ({ ...p, nominal: v })); setError(""); }}
            />
          </div>
          <div className="utangpiutang__field">
            <label className="utangpiutang__label">Jatuh Tempo</label>
            <input
              className="utangpiutang__input" type="date" name="jatuhTempo"
              value={form.jatuhTempo} onChange={handleChange}
            />
          </div>
        </div>
        <div className="utangpiutang__field">
          <label className="utangpiutang__label">Catatan (opsional)</label>
          <input
            className="utangpiutang__input" type="text" name="catatan"
            placeholder="Misal: untuk pembelian bahan baku bulan ini"
            value={form.catatan} onChange={handleChange}
          />
        </div>

        {error && <p className="utangpiutang__error">⚠️ {error}</p>}

        <div className="utangpiutang__form-actions">
          {editId && <button className="utangpiutang__btn-sec" onClick={resetForm}>Batal</button>}
          <button className={"utangpiutang__btn-primary utangpiutang__btn-primary--" + sisi} onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Simpan Catatan"}
          </button>
        </div>
      </div>

      {/* List header + toggle riwayat */}
      <div className="utangpiutang__list-header">
        <span className="utangpiutang__list-title">
          {showRiwayat ? "Riwayat Lunas" : "Daftar Aktif"} — {filtered.length} catatan
        </span>
        <button className="utangpiutang__riwayat-toggle" onClick={() => setShowRiwayat((v) => !v)}>
          {showRiwayat ? "← Lihat yang Aktif" : "Lihat Riwayat Lunas →"}
        </button>
      </div>

      {/* List */}
      <div className="utangpiutang__list">
        {filtered.length === 0 ? (
          <div className="utangpiutang__empty">
            <p>{showRiwayat ? "📋" : sisi === "piutang" ? "📥" : "📤"}</p>
            <p>
              {showRiwayat
                ? "Belum ada riwayat yang lunas."
                : sisi === "piutang" ? "Belum ada piutang tercatat." : "Belum ada utang tercatat."}
            </p>
          </div>
        ) : (
          filtered.map((it) => {
            const badge = !showRiwayat ? labelJatuhTempo(it.jatuhTempo) : null;
            return (
              <div key={it.id} className="utangpiutang__item">
                <div className="utangpiutang__item-info">
                  <p className="utangpiutang__item-nama">{it.nama}</p>
                  <p className="utangpiutang__item-meta">
                    Jatuh tempo: {new Date(it.jatuhTempo).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    {it.catatan && <span className="utangpiutang__item-catatan"> · {it.catatan}</span>}
                  </p>
                </div>
                <div className="utangpiutang__item-right">
                  <span className="utangpiutang__item-nominal">{formatRupiah(it.nominal)}</span>
                  {badge && (
                    <span className={"utangpiutang__badge utangpiutang__badge--" + badge.status}>
                      {badge.text}
                    </span>
                  )}
                </div>
                <div className="utangpiutang__item-actions">
                  {!showRiwayat && (
                    <button className="utangpiutang__item-lunas" onClick={() => toggleLunas(it.id)} title="Tandai Lunas">
                      ✓ Lunas
                    </button>
                  )}
                  {showRiwayat && (
                    <button className="utangpiutang__item-batal-lunas" onClick={() => toggleLunas(it.id)} title="Batalkan Status Lunas">
                      ↺ Batalkan
                    </button>
                  )}
                  {!showRiwayat && (
                    <button className="utangpiutang__item-edit" onClick={() => openEdit(it)} title="Edit">✏️</button>
                  )}
                  <button className="utangpiutang__item-del" onClick={() => setDelId(it.id)} title="Hapus">🗑</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Konfirmasi hapus */}
      {delId && (
        <div className="utangpiutang__modal-overlay" onClick={() => setDelId(null)}>
          <div className="utangpiutang__modal" onClick={(e) => e.stopPropagation()}>
            <h4 className="utangpiutang__modal-title">Hapus catatan ini?</h4>
            <p className="utangpiutang__modal-sub">Tindakan ini tidak bisa dibatalkan.</p>
            <div className="utangpiutang__modal-actions">
              <button className="utangpiutang__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="utangpiutang__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
