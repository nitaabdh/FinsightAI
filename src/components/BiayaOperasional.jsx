import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { genId, formatRupiah } from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import "./BiayaOperasional.css";

import { Lightbulb, Pencil, Search, Trash2 } from "lucide-react";
const emptyForm = { nama: "", biaya: "" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function BiayaOperasional() {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [opsList, setOpsList] = useState([]);
  const [form,    setForm]    = useState(emptyForm);
  const [editId,  setEditId]  = useState(null);
  const [error,   setError]   = useState("");
  const [delId,   setDelId]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=biaya_operasional`).then(r => { if (r.success) setOpsList(r.data); });
  }, [user]);

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); setShowForm(false); };

  const openEdit = (o) => {
    setForm({ nama: o.nama, biaya: String(o.biaya) });
    setEditId(o.id); setError(""); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const handleSubmit = async () => {
    if (!form.nama.trim())                                   return setError("Nama biaya operasional tidak boleh kosong.");
    if (!form.biaya || isNaN(form.biaya) || +form.biaya < 0)  return setError("Masukkan nominal biaya yang valid.");

    const payload = { nama: form.nama.trim(), biaya: +form.biaya };

    if (editId) {
      const r = await apiFetch(`/api/umkm?table=biaya_operasional`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payload }),
      });
      if (r.success) setOpsList(p => p.map(x => x.id === editId ? r.data : x));
    } else {
      const r = await apiFetch(`/api/umkm?table=biaya_operasional`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payload, createdAt: Date.now() }),
      });
      if (r.success) setOpsList(p => [r.data, ...p]);
    }
    resetForm();
    // Biar dropdown di Kalkulator Harga ikut ke-refresh tanpa harus reload halaman
    window.dispatchEvent(new CustomEvent("biayaOperasionalUpdated"));
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=biaya_operasional&id=${id}`, { method: "DELETE" });
    setOpsList(p => p.filter(x => x.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("biayaOperasionalUpdated"));
  };

  const filteredList = opsList.filter(o =>
    o.nama.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="biayaops">
      {!showForm ? (
        <button className="biayaops__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Tambah Biaya Operasional
        </button>
      ) : (
        <div className="biayaops__form" ref={formRef}>
          <h3 className="biayaops__form-title">{editId ? "Edit Biaya Operasional" : "+ Tambah Biaya Operasional"}</h3>

          <div className="biayaops__form-row">
            <div className="biayaops__field">
              <label className="biayaops__label">Nama</label>
              <input className="biayaops__input" type="text" placeholder="Misal: Listrik, Gas, Tenaga Kerja"
                value={form.nama} onChange={e => { setForm(p => ({ ...p, nama: e.target.value })); setError(""); }} />
            </div>
            <div className="biayaops__field">
              <label className="biayaops__label">Biaya</label>
              <div className="biayaops__rp-wrap">
                <span className="biayaops__rp-prefix">Rp</span>
                <RupiahInput className="biayaops__input biayaops__input--rp"
                  value={form.biaya} onChange={v => { setForm(p => ({ ...p, biaya: v })); setError(""); }} />
              </div>
            </div>
          </div>

          {error && <p className="biayaops__error">{error}</p>}

          <div className="biayaops__form-actions">
            <button className="biayaops__btn-sec" onClick={resetForm}>Batal</button>
            <button className="biayaops__btn-primary" onClick={handleSubmit}>
              {editId ? "Simpan Perubahan" : "+ Tambah"}
            </button>
          </div>
        </div>
      )}

      <div className="biayaops__list">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <h3 className="biayaops__list-title" style={{ margin: 0 }}>Daftar Biaya Operasional</h3>
          {opsList.length > 0 && (
            <input className="biayaops__input" type="text" placeholder="Cari biaya operasional..."
              style={{ maxWidth: "240px" }}
              value={search} onChange={e => setSearch(e.target.value)} />
          )}
        </div>
        {opsList.length === 0 ? (
          <div className="biayaops__empty">
            <p><Lightbulb size={14} /></p>
            <p>Belum ada biaya operasional.</p>
            <p>Tambahkan misalnya listrik, gas, atau tenaga kerja per batch — nanti bisa dipilih langsung saat menghitung harga jual produk di Kalkulator Harga.</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="biayaops__empty"><p><Search size={15} /></p><p>Tidak ada yang cocok dengan pencarian.</p></div>
        ) : (
          <div className="biayaops__rows stagger-list">
            {filteredList.map(o => (
              <div key={o.id} className="biayaops__row">
                <span className="biayaops__row-nama">{o.nama}</span>
                <span className="biayaops__row-biaya">{formatRupiah(o.biaya)}</span>
                <div className="biayaops__row-actions">
                  <button className="biayaops__edit" onClick={() => openEdit(o)} title="Edit"><Pencil size={14} /></button>
                  <button className="biayaops__del" onClick={() => setDelId(o.id)} title="Hapus"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {delId && (
        <div className="biayaops__modal-overlay" onClick={() => setDelId(null)}>
          <div className="biayaops__modal" onClick={e => e.stopPropagation()}>
            <h4 className="biayaops__modal-title">Hapus biaya operasional ini?</h4>
            <p className="biayaops__modal-sub">Produk yang sudah memakai biaya ini akan menampilkan "(dihapus)" pada rinciannya di Kalkulator Harga.</p>
            <div className="biayaops__modal-actions">
              <button className="biayaops__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="biayaops__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
