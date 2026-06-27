import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { genId, formatRupiah } from "../utils/umkmCalc";
import "./AsetUsaha.css";

const KATEGORI_PRESET = ["Masak", "Display", "Kasir", "Penyimpanan", "Kebersihan", "Furnitur"];
const KONDISI_OPTIONS = [
  { value: "baik",        label: "Baik" },
  { value: "rusakRingan", label: "Rusak Ringan" },
  { value: "rusakBerat",  label: "Rusak Berat" },
];

const emptyForm = {
  nama: "", kategori: "", kategoriCustom: "",
  tanggalBeli: new Date().toISOString().slice(0, 10),
  hargaBeli: "", kondisi: "baik", catatan: "",
};

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function AsetUsaha() {
  const { user } = useAuth();
  const [list, setList]     = useState([]);
  const [form, setForm]     = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError]   = useState("");
  const [delId, setDelId]   = useState(null);
  const [filterKategori, setFilterKategori] = useState("semua");
  const [filterKondisi,  setFilterKondisi]  = useState("semua");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=aset_usaha`).then(r => { if (r.success) setList(r.data); });
  }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    const { nama, kategori, kategoriCustom, tanggalBeli, hargaBeli, kondisi, catatan } = form;
    if (!nama.trim())    return setError("Nama alat tidak boleh kosong.");
    if (!kategori)       return setError("Pilih kategori terlebih dahulu.");
    if (!hargaBeli || +hargaBeli < 0) return setError("Harga beli tidak valid.");

    const kategoriAkhir = kategori === "lainnya" ? kategoriCustom.trim() : kategori;
    if (!kategoriAkhir)  return setError("Tulis nama kategori terlebih dahulu.");

    const payloadData = {
      nama: nama.trim(),
      kategori: kategoriAkhir,
      tanggalBeli,
      hargaBeli: +hargaBeli,
      kondisi,
      catatan: catatan.trim(),
    };

    if (editId) {
      const r = await apiFetch(`/api/umkm?table=aset_usaha`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payloadData }),
      });
      if (r.success) setList(p => p.map(it => it.id === editId ? r.data : it));
    } else {
      const r = await apiFetch(`/api/umkm?table=aset_usaha`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payloadData, createdAt: Date.now() }),
      });
      if (r.success) setList(p => [r.data, ...p]);
    }
    resetForm();
  };

  const openEdit = (it) => {
    const isPreset = KATEGORI_PRESET.includes(it.kategori);
    setForm({
      nama: it.nama,
      kategori: isPreset ? it.kategori : "lainnya",
      kategoriCustom: isPreset ? "" : it.kategori,
      tanggalBeli: it.tanggalBeli,
      hargaBeli: String(it.hargaBeli),
      kondisi: it.kondisi,
      catatan: it.catatan || "",
    });
    setEditId(it.id);
    setError("");
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=aset_usaha&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(it => it.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
  };

  const semuaKategori = [...new Set([...KATEGORI_PRESET, ...list.map(it => it.kategori)])].sort();
  const filtered = list
    .filter(it => filterKategori === "semua" || it.kategori === filterKategori)
    .filter(it => filterKondisi  === "semua" || it.kondisi  === filterKondisi)
    .sort((a, b) => new Date(b.tanggalBeli) - new Date(a.tanggalBeli));
  const totalNilaiAset = list.reduce((s, it) => s + it.hargaBeli, 0);
  const kondisiLabel = (val) => KONDISI_OPTIONS.find(k => k.value === val)?.label || val;

  return (
    <div className="asetusaha">
      {list.length > 0 && (
        <div className="asetusaha__total">
          <span className="asetusaha__total-label">Total Nilai Aset Usaha</span>
          <span className="asetusaha__total-value">{formatRupiah(totalNilaiAset)}</span>
        </div>
      )}

      <div className="asetusaha__form">
        <h3 className="asetusaha__form-title">{editId ? "✏️ Edit Aset" : "+ Tambah Aset Usaha"}</h3>
        <div className="asetusaha__grid">
          <div className="asetusaha__field asetusaha__field--wide">
            <label className="asetusaha__label">Nama Alat</label>
            <input className="asetusaha__input" type="text" name="nama"
              placeholder="Misal: Etalase Kaca" value={form.nama} onChange={handleChange} />
          </div>
          <div className="asetusaha__field">
            <label className="asetusaha__label">Kategori</label>
            <select className="asetusaha__input" name="kategori" value={form.kategori} onChange={handleChange}>
              <option value="">-- Pilih kategori --</option>
              {KATEGORI_PRESET.map(k => <option key={k} value={k}>{k}</option>)}
              <option value="lainnya">Lainnya...</option>
            </select>
          </div>
          {form.kategori === "lainnya" && (
            <div className="asetusaha__field">
              <label className="asetusaha__label">Kategori Lainnya</label>
              <input className="asetusaha__input" type="text" name="kategoriCustom"
                placeholder="Tulis kategori sendiri" value={form.kategoriCustom} onChange={handleChange} />
            </div>
          )}
          <div className="asetusaha__field">
            <label className="asetusaha__label">Tanggal Beli</label>
            <input className="asetusaha__input" type="date" name="tanggalBeli"
              value={form.tanggalBeli} onChange={handleChange} />
          </div>
          <div className="asetusaha__field">
            <label className="asetusaha__label">Harga Beli (Rp)</label>
            <input className="asetusaha__input" type="number" name="hargaBeli"
              placeholder="Contoh: 1500000" value={form.hargaBeli} onChange={handleChange} min="0" />
          </div>
          <div className="asetusaha__field">
            <label className="asetusaha__label">Kondisi</label>
            <select className="asetusaha__input" name="kondisi" value={form.kondisi} onChange={handleChange}>
              {KONDISI_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
        </div>
        <div className="asetusaha__field">
          <label className="asetusaha__label">Catatan (opsional)</label>
          <input className="asetusaha__input" type="text" name="catatan"
            placeholder="Misal: dibeli bekas dari toko sebelah" value={form.catatan} onChange={handleChange} />
        </div>
        {error && <p className="asetusaha__error">⚠️ {error}</p>}
        <div className="asetusaha__form-actions">
          {editId && <button className="asetusaha__btn-sec" onClick={resetForm}>Batal</button>}
          <button className="asetusaha__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Tambah Aset"}
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="asetusaha__filters">
          <select className="asetusaha__select" value={filterKategori} onChange={e => setFilterKategori(e.target.value)}>
            <option value="semua">Semua Kategori</option>
            {semuaKategori.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="asetusaha__select" value={filterKondisi} onChange={e => setFilterKondisi(e.target.value)}>
            <option value="semua">Semua Kondisi</option>
            {KONDISI_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
      )}

      <div className="asetusaha__list">
        {list.length === 0 ? (
          <div className="asetusaha__empty">
            <p>🧰</p>
            <p>Belum ada aset usaha tercatat.</p>
            <p>Tambahkan dari form di atas untuk mulai mencatat peralatan usahamu.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="asetusaha__empty"><p>🔍</p><p>Tidak ada aset yang cocok dengan filter.</p></div>
        ) : (
          filtered.map(it => (
            <div key={it.id} className="asetusaha__item">
              <div className="asetusaha__item-info">
                <p className="asetusaha__item-nama">{it.nama}</p>
                <p className="asetusaha__item-meta">
                  <span className="asetusaha__item-kategori">{it.kategori}</span>
                  <span> · Dibeli {new Date(it.tanggalBeli).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {it.catatan && <span className="asetusaha__item-catatan"> · {it.catatan}</span>}
                </p>
              </div>
              <div className="asetusaha__item-right">
                <span className="asetusaha__item-harga">{formatRupiah(it.hargaBeli)}</span>
                <span className={"asetusaha__badge asetusaha__badge--" + it.kondisi}>{kondisiLabel(it.kondisi)}</span>
              </div>
              <div className="asetusaha__item-actions">
                <button className="asetusaha__item-edit" onClick={() => openEdit(it)} title="Edit">✏️</button>
                <button className="asetusaha__item-del" onClick={() => setDelId(it.id)} title="Hapus">🗑</button>
              </div>
            </div>
          ))
        )}
      </div>

      {delId && (
        <div className="asetusaha__modal-overlay" onClick={() => setDelId(null)}>
          <div className="asetusaha__modal" onClick={e => e.stopPropagation()}>
            <h4 className="asetusaha__modal-title">Hapus aset ini?</h4>
            <p className="asetusaha__modal-sub">Tindakan ini tidak bisa dibatalkan.</p>
            <div className="asetusaha__modal-actions">
              <button className="asetusaha__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="asetusaha__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
