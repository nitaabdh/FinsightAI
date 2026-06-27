import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId,
  formatRupiah,
  hargaPerBase, nilaiStok, stokDisplay,
  toBase, validUsageUnits, unitGroupOf,
} from "../utils/umkmCalc";
import "./BahanBaku.css";

const emptyForm = { nama: "", hargaBeli: "", jumlahBeli: "", satuanBeli: "kg", stokAwal: "0" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res.json();
}

export default function BahanBaku() {
  const { user } = useAuth();
  const [list,      setList]      = useState([]);
  const [form,      setForm]      = useState(emptyForm);
  const [editId,    setEditId]    = useState(null);
  const [error,     setError]     = useState("");
  const [delId,     setDelId]     = useState(null);
  const [restokId,  setRestokId]  = useState(null);
  const [restokJml, setRestokJml] = useState("");
  const [restokSat, setRestokSat] = useState("");
  const [restokErr, setRestokErr] = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => {
      if (r.success) setList(r.data);
    });
  }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    const { nama, hargaBeli, jumlahBeli, satuanBeli, stokAwal } = form;

    if (!nama.trim())          return setError("Nama bahan tidak boleh kosong.");
    if (!hargaBeli || +hargaBeli <= 0) return setError("Harga beli harus lebih dari 0.");
    if (!jumlahBeli || +jumlahBeli <= 0) return setError("Jumlah beli harus lebih dari 0.");

    const payload = {
      nama:       nama.trim(),
      hargaBeli:  +hargaBeli,
      jumlahBeli: +jumlahBeli,
      satuanBeli,
    };

    if (editId) {
      // Edit: tidak overwrite stok yang sudah ada
      const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payload }),
      });
      if (r.success) setList(p => p.map(b => b.id === editId ? r.data : b));
    } else {
      // Tambah baru: pakai stokAwal
      const stokBase = toBase(+stokAwal, satuanBeli);
      const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payload, stok: stokBase, createdAt: Date.now() }),
      });
      if (r.success) setList(p => [r.data, ...p]);
    }

    resetForm();
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  const openEdit = (b) => {
    setForm({ nama: b.nama, hargaBeli: String(b.hargaBeli), jumlahBeli: String(b.jumlahBeli), satuanBeli: b.satuanBeli, stokAwal: "0" });
    setEditId(b.id);
    setError("");
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=bahan_baku&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(b => b.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  // ── Restock ────────────────────────────────────────────────────────────────
  const openRestok = (b) => {
    setRestokId(b.id);
    setRestokJml("");
    setRestokSat(validUsageUnits(b.satuanBeli)[0]);
    setRestokErr("");
  };

  const confirmRestok = async () => {
    if (!restokJml || isNaN(restokJml) || +restokJml <= 0)
      return setRestokErr("Masukkan jumlah stok masuk yang valid.");
    const bahan = list.find(b => b.id === restokId);
    if (!bahan) return;

    const newStok = (parseFloat(bahan.stok) || 0) + toBase(+restokJml, restokSat);
    const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
      method: "PUT",
      body: JSON.stringify({ id: restokId, ...bahan, stok: newStok }),
    });
    if (r.success) {
      setList(p => p.map(b => b.id === restokId ? r.data : b));
      window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
    }
    setRestokId(null);
  };

  // ── Helper ─────────────────────────────────────────────────────────────────
  const totalNilaiStok = list.reduce((s, b) => s + nilaiStok(b), 0);

  const unitLabel = (b) => {
    const g = unitGroupOf(b.satuanBeli);
    return g === "berat" ? "/gram" : g === "volume" ? "/ml" : "/pcs";
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bahanbaku">

      {/* Form tambah/edit */}
      <div className="bahanbaku__form">
        <h3 className="bahanbaku__form-title">{editId ? "✏️ Edit Bahan Baku" : "+ Tambah Bahan Baku"}</h3>
        <div className="bahanbaku__grid">
          <div className="bahanbaku__field bahanbaku__field--wide">
            <label className="bahanbaku__label">Nama Bahan</label>
            <input className="bahanbaku__input" type="text" name="nama"
              placeholder="Misal: Tepung Terigu" value={form.nama} onChange={handleChange} />
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Harga Beli (Rp)</label>
            <input className="bahanbaku__input" type="number" name="hargaBeli"
              placeholder="Contoh: 12000" value={form.hargaBeli} onChange={handleChange} min="0" />
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Jumlah Beli</label>
            <input className="bahanbaku__input" type="number" name="jumlahBeli"
              placeholder="Contoh: 1" value={form.jumlahBeli} onChange={handleChange} min="0" />
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Satuan</label>
            <select className="bahanbaku__input" name="satuanBeli" value={form.satuanBeli} onChange={handleChange}>
              <option value="kg">kg</option>
              <option value="gram">gram</option>
              <option value="liter">liter</option>
              <option value="ml">ml</option>
              <option value="pcs">pcs</option>
            </select>
          </div>
          {!editId && (
            <div className="bahanbaku__field">
              <label className="bahanbaku__label">Stok Awal ({form.satuanBeli})</label>
              <input className="bahanbaku__input" type="number" name="stokAwal"
                placeholder="0" value={form.stokAwal} onChange={handleChange} min="0" />
            </div>
          )}
        </div>

        {form.hargaBeli && form.jumlahBeli && +form.jumlahBeli > 0 && (
          <p className="bahanbaku__preview">
            ≈ {formatRupiah(hargaPerBase({ hargaBeli: +form.hargaBeli, jumlahBeli: +form.jumlahBeli, satuanBeli: form.satuanBeli }))}
            {unitLabel({ satuanBeli: form.satuanBeli })}
          </p>
        )}

        {error && <p className="bahanbaku__error">⚠️ {error}</p>}

        <div className="bahanbaku__form-actions">
          {editId && <button className="bahanbaku__btn-sec" onClick={resetForm}>Batal</button>}
          <button className="bahanbaku__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Tambah Bahan"}
          </button>
        </div>
      </div>

      {/* Total nilai stok */}
      {list.length > 0 && (
        <div className="bahanbaku__stok-summary">
          <span className="bahanbaku__stok-summary-label">Total Estimasi Nilai Stok</span>
          <span className="bahanbaku__stok-summary-value">{formatRupiah(totalNilaiStok)}</span>
        </div>
      )}

      {/* List bahan */}
      <div className="bahanbaku__list">
        {list.length === 0 ? (
          <div className="bahanbaku__empty">
            <p>🧺</p>
            <p>Belum ada bahan baku tercatat.</p>
            <p>Tambahkan dari form di atas untuk mulai mengelola stok.</p>
          </div>
        ) : (
          list.map(b => {
            const stokBase  = parseFloat(b.stok) || 0;
            const stokMinus = stokBase < 0;
            return (
              <div key={b.id} className={"bahanbaku__item" + (stokMinus ? " bahanbaku__item--minus" : "")}>
                <div className="bahanbaku__item-info">
                  <p className="bahanbaku__item-nama">{b.nama}</p>
                  <p className="bahanbaku__item-meta">
                    {formatRupiah(b.hargaBeli)} / {b.jumlahBeli} {b.satuanBeli}
                    <span className="bahanbaku__item-perunit"> (≈ {formatRupiah(hargaPerBase(b))}{unitLabel(b)})</span>
                  </p>
                </div>
                <div className="bahanbaku__item-stok">
                  <span className={"bahanbaku__item-stokval" + (stokMinus ? " bahanbaku__item-stokval--minus" : "")}>
                    {stokMinus ? "⚠ " : ""}{stokDisplay(b)}
                  </span>
                  <span className="bahanbaku__item-nilaistok">{formatRupiah(nilaiStok(b))}</span>
                </div>
                <div className="bahanbaku__item-actions">
                  <button className="bahanbaku__item-restok" onClick={() => openRestok(b)} title="Stok Masuk">+ Stok</button>
                  <button className="bahanbaku__item-edit" onClick={() => openEdit(b)} title="Edit">✏️</button>
                  <button className="bahanbaku__item-del" onClick={() => setDelId(b.id)} title="Hapus">🗑</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Restock */}
      {restokId && (() => {
        const bahan = list.find(b => b.id === restokId);
        if (!bahan) return null;
        return (
          <div className="bahanbaku__modal-overlay" onClick={() => setRestokId(null)}>
            <div className="bahanbaku__modal" onClick={e => e.stopPropagation()}>
              <h4 className="bahanbaku__modal-title">+ Stok Masuk</h4>
              <p className="bahanbaku__modal-sub">
                <strong>{bahan.nama}</strong> — stok saat ini: {stokDisplay(bahan)}
              </p>
              <div className="bahanbaku__restok-row">
                <input
                  className="bahanbaku__input"
                  type="number"
                  placeholder="Jumlah masuk"
                  value={restokJml}
                  onChange={e => { setRestokJml(e.target.value); setRestokErr(""); }}
                  min="0"
                  autoFocus
                />
                <select
                  className="bahanbaku__input bahanbaku__input--sat"
                  value={restokSat}
                  onChange={e => setRestokSat(e.target.value)}
                >
                  {validUsageUnits(bahan.satuanBeli).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {restokErr && <p className="bahanbaku__error">{restokErr}</p>}
              <div className="bahanbaku__modal-actions">
                <button className="bahanbaku__btn-sec" onClick={() => setRestokId(null)}>Batal</button>
                <button className="bahanbaku__btn-primary" onClick={confirmRestok}>Tambah Stok</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Konfirmasi hapus */}
      {delId && (
        <div className="bahanbaku__modal-overlay" onClick={() => setDelId(null)}>
          <div className="bahanbaku__modal" onClick={e => e.stopPropagation()}>
            <h4 className="bahanbaku__modal-title">Hapus bahan ini?</h4>
            <p className="bahanbaku__modal-sub">
              Produk yang sudah memakai bahan ini tidak terhapus, tapi perhitungan biayanya tidak akan ter-update.
            </p>
            <div className="bahanbaku__modal-actions">
              <button className="bahanbaku__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="bahanbaku__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
