import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { genId } from "../utils/umkmCalc";
import "./Supplier.css";

import { Contact, Pencil, Search, Trash2 } from "lucide-react";
const KATEGORI_PRESET = ["Bahan Baku", "Kemasan", "Peralatan", "Jasa"];

const emptyForm = { nama: "", kontakWa: "", linkMarketplace: "", kategori: "", catatan: "" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

// Normalisasi nomor WA ke format wa.me (628xxxx)
function waLink(nomor) {
  if (!nomor) return null;
  let n = nomor.replace(/[^0-9]/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return `https://wa.me/${n}`;
}

export default function Supplier() {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [list, setList]     = useState([]);
  const [form, setForm]     = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError]   = useState("");
  const [delId, setDelId]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");
  const [filterKategori, setFilterKategori] = useState("semua");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=supplier`).then(r => { if (r.success) setList(r.data); });
  }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); setShowForm(false); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    if (!form.nama.trim()) return setError("Nama supplier tidak boleh kosong.");

    const payload = {
      nama: form.nama.trim(),
      kontakWa: form.kontakWa.trim(),
      linkMarketplace: form.linkMarketplace.trim(),
      kategori: form.kategori.trim(),
      catatan: form.catatan.trim(),
    };

    if (editId) {
      const r = await apiFetch(`/api/umkm?table=supplier`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payload }),
      });
      if (r.success) setList(p => p.map(x => x.id === editId ? r.data : x));
    } else {
      const r = await apiFetch(`/api/umkm?table=supplier`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payload, createdAt: Date.now() }),
      });
      if (r.success) setList(p => [r.data, ...p]);
    }
    resetForm();
    window.dispatchEvent(new CustomEvent("supplierUpdated"));
  };

  const openEdit = (s) => {
    setForm({
      nama: s.nama,
      kontakWa: s.kontakWa || "",
      linkMarketplace: s.linkMarketplace || "",
      kategori: s.kategori || "",
      catatan: s.catatan || "",
    });
    setEditId(s.id); setError(""); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=supplier&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(x => x.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("supplierUpdated"));
  };

  const semuaKategori = [...new Set([...KATEGORI_PRESET, ...list.map(s => s.kategori).filter(Boolean)])].sort();

  const filteredList = list
    .filter(s => filterKategori === "semua" || s.kategori === filterKategori)
    .filter(s => s.nama.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="supplier">
      {!showForm ? (
        <button className="supplier__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Tambah Supplier
        </button>
      ) : (
        <div className="supplier__form" ref={formRef}>
          <h3 className="supplier__form-title">{editId ? "Edit Supplier" : "+ Tambah Supplier"}</h3>

          <div className="supplier__grid">
            <div className="supplier__field supplier__field--wide">
              <label className="supplier__label">Nama Supplier</label>
              <input className="supplier__input" type="text" name="nama"
                placeholder="Misal: Toko Bahan Kue Sejahtera" value={form.nama} onChange={handleChange} />
            </div>
            <div className="supplier__field">
              <label className="supplier__label">Kontak WhatsApp (opsional)</label>
              <input className="supplier__input" type="text" name="kontakWa"
                placeholder="08123456789" value={form.kontakWa} onChange={handleChange} />
            </div>
            <div className="supplier__field">
              <label className="supplier__label">Link Marketplace (opsional)</label>
              <input className="supplier__input" type="text" name="linkMarketplace"
                placeholder="https://shopee.co.id/toko-..." value={form.linkMarketplace} onChange={handleChange} />
            </div>
            <div className="supplier__field">
              <label className="supplier__label">Kategori (opsional)</label>
              <input className="supplier__input" list="supplier-kategori-preset" name="kategori"
                placeholder="Misal: Bahan Baku" value={form.kategori} onChange={handleChange} />
              <datalist id="supplier-kategori-preset">
                {KATEGORI_PRESET.map(k => <option key={k} value={k} />)}
              </datalist>
            </div>
          </div>

          <div className="supplier__field">
            <label className="supplier__label">Catatan (opsional)</label>
            <input className="supplier__input" type="text" name="catatan"
              placeholder="Misal: minimal order 10pcs, kirim H+2" value={form.catatan} onChange={handleChange} />
          </div>

          {error && <p className="supplier__error">{error}</p>}

          <div className="supplier__form-actions">
            <button className="supplier__btn-sec" onClick={resetForm}>Batal</button>
            <button className="supplier__btn-primary" onClick={handleSubmit}>
              {editId ? "Simpan Perubahan" : "+ Tambah Supplier"}
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="supplier__filters">
          <input className="supplier__select" type="text" placeholder="Cari nama supplier..."
            style={{ flex: 1, minWidth: "160px" }}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="supplier__select" value={filterKategori} onChange={e => setFilterKategori(e.target.value)}>
            <option value="semua">Semua Kategori</option>
            {semuaKategori.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      <div className="supplier__list stagger-list">
        {list.length === 0 ? (
          <div className="supplier__empty">
            <p><Contact size={14} /></p>
            <p>Belum ada supplier tercatat.</p>
            <p>Tambahkan kontak WA atau link marketplace supplier langgananmu di sini.</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="supplier__empty"><p><Search size={15} /></p><p>Tidak ada supplier yang cocok.</p></div>
        ) : (
          <div className="supplier__grid-list stagger-list">
            {filteredList.map(s => (
              <div key={s.id} className="supplier__card">
                <div className="supplier__card-header">
                  <p className="supplier__card-nama">{s.nama}</p>
                  <div className="supplier__card-actions">
                    <button className="supplier__edit" onClick={() => openEdit(s)} title="Edit"><Pencil size={14} /></button>
                    <button className="supplier__del" onClick={() => setDelId(s.id)} title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </div>
                {s.kategori && <span className="supplier__badge">{s.kategori}</span>}
                {s.catatan && <p className="supplier__card-catatan">{s.catatan}</p>}
                <div className="supplier__card-links">
                  {s.kontakWa && (
                    <a className="supplier__link supplier__link--wa" href={waLink(s.kontakWa)} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  )}
                  {s.linkMarketplace && (
                    <a className="supplier__link supplier__link--market" href={s.linkMarketplace} target="_blank" rel="noreferrer">
                      Marketplace
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {delId && (
        <div className="supplier__modal-overlay" onClick={() => setDelId(null)}>
          <div className="supplier__modal" onClick={e => e.stopPropagation()}>
            <h4 className="supplier__modal-title">Hapus supplier ini?</h4>
            <p className="supplier__modal-sub">Tindakan ini tidak bisa dibatalkan.</p>
            <div className="supplier__modal-actions">
              <button className="supplier__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="supplier__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
