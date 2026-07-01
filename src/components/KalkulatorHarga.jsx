import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId, formatRupiah, biayaItem, totalBiayaBahan, validUsageUnits,
} from "../utils/umkmCalc";
import "./KalkulatorHarga.css";

const emptyForm = { nama: "", items: [], biayaOperasional: "", targetUntung: "" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function KalkulatorHarga() {
  const { user } = useAuth();
  const [bahanList,  setBahanList]  = useState([]);
  const [produkList, setProdukList] = useState([]);
  const [form,    setForm]    = useState(emptyForm);
  const [editId,  setEditId]  = useState(null);
  const [error,   setError]   = useState("");
  const [delId,   setDelId]   = useState(null);
  const [selBahan,  setSelBahan]  = useState("");
  const [selJumlah, setSelJumlah] = useState("");
  const [selSatuan, setSelSatuan] = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
    apiFetch(`/api/umkm?table=produk`).then(r => { if (r.success) setProdukList(r.data); });
  }, [user]);

  // Sinkron bahan kalau ada update dari tab Bahan Baku
  useEffect(() => {
    const refresh = () => {
      if (user) apiFetch(`/api/umkm?table=bahan_baku`).then(r => { if (r.success) setBahanList(r.data); });
    };
    window.addEventListener("bahanBakuUpdated", refresh);
    return () => window.removeEventListener("bahanBakuUpdated", refresh);
  }, [user]);

  const bahanMap = Object.fromEntries(bahanList.map(b => [b.id, b]));

  const resetForm = () => {
    setForm(emptyForm); setEditId(null); setError("");
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
  };

  const openEdit = (p) => {
    setForm({ nama: p.nama, items: p.items, biayaOperasional: String(p.biayaOperasional), targetUntung: String(p.targetUntung) });
    setEditId(p.id); setError("");
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
  };

  const handlePilihBahan = (id) => {
    setSelBahan(id);
    const b = bahanMap[id];
    setSelSatuan(b ? validUsageUnits(b.satuanBeli)[0] : "");
  };

  const handleTambahItem = () => {
    if (!selBahan)                                          return setError("Pilih bahan terlebih dahulu.");
    if (!selJumlah || isNaN(selJumlah) || +selJumlah <= 0) return setError("Masukkan jumlah pakai yang valid.");
    setForm(p => ({ ...p, items: [...p.items, { bahanId: selBahan, jumlahPakai: +selJumlah, satuanPakai: selSatuan }] }));
    setSelBahan(""); setSelJumlah(""); setSelSatuan("");
    setError("");
  };

  const handleHapusItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const biayaBahan      = totalBiayaBahan(form.items, bahanMap);
  const biayaOpsNum     = +form.biayaOperasional || 0;
  const targetUntungNum = +form.targetUntung || 0;
  const totalBiaya      = biayaBahan + biayaOpsNum;
  const hargaJual       = totalBiaya + targetUntungNum;

  const handleSubmit = async () => {
    if (!form.nama.trim())      return setError("Nama produk tidak boleh kosong.");
    if (form.items.length === 0) return setError("Tambahkan minimal satu bahan ke resep.");

    const payload = {
      nama: form.nama.trim(),
      items: form.items,
      biayaOperasional: biayaOpsNum,
      targetUntung: targetUntungNum,
      biayaBahan,
      totalBiaya,
      hargaJual,
    };

    if (editId) {
      const r = await apiFetch(`/api/umkm?table=produk`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payload }),
      });
      if (r.success) {
        setProdukList(p => p.map(x => x.id === editId ? r.data : x));
        window.dispatchEvent(new CustomEvent("produkUpdated"));
      }
    } else {
      const r = await apiFetch(`/api/umkm?table=produk`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payload, createdAt: Date.now() }),
      });
      if (r.success) {
        setProdukList(p => [r.data, ...p]);
        window.dispatchEvent(new CustomEvent("produkUpdated"));
      }
    }
    resetForm();
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=produk&id=${id}`, { method: "DELETE" });
    setProdukList(p => p.filter(x => x.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("produkUpdated"));
  };

  return (
    <div className="kalkharga">
      <div className="kalkharga__form">
        <h3 className="kalkharga__form-title">{editId ? "✏️ Edit Produk" : "+ Hitung Harga Jual Produk"}</h3>

        <div className="kalkharga__field">
          <label className="kalkharga__label">Nama Produk</label>
          <input className="kalkharga__input" type="text" placeholder="Misal: Roti Coklat"
            value={form.nama} onChange={e => { setForm(p => ({ ...p, nama: e.target.value })); setError(""); }} />
        </div>

        <div className="kalkharga__addbahan">
          <label className="kalkharga__label">Tambah Bahan dari Master Data</label>
          {bahanList.length === 0 ? (
            <p className="kalkharga__hint">Belum ada bahan baku. Tambahkan dulu di tab <strong>Bahan Baku</strong>.</p>
          ) : (
            <div className="kalkharga__addbahan-row">
              <select className="kalkharga__input" value={selBahan} onChange={e => handlePilihBahan(e.target.value)}>
                <option value="">-- Pilih bahan --</option>
                {bahanList.map(b => <option key={b.id} value={b.id}>{b.nama}</option>)}
              </select>
              <input className="kalkharga__input kalkharga__input--qty" type="number" placeholder="Jumlah"
                value={selJumlah} onChange={e => setSelJumlah(e.target.value)} min="0" />
              <select className="kalkharga__input kalkharga__input--unit" value={selSatuan}
                onChange={e => setSelSatuan(e.target.value)} disabled={!selBahan}>
                {selBahan && validUsageUnits(bahanMap[selBahan]?.satuanBeli).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button className="kalkharga__addbtn" onClick={handleTambahItem}>+ Tambah</button>
            </div>
          )}
        </div>

        {form.items.length > 0 && (
          <div className="kalkharga__items">
            {form.items.map((it, idx) => {
              const b = bahanMap[it.bahanId];
              const biaya = b ? biayaItem(b, it.jumlahPakai, it.satuanPakai) : 0;
              return (
                <div key={idx} className="kalkharga__item-row">
                  <span className="kalkharga__item-nama">{b ? b.nama : "(bahan dihapus)"}</span>
                  <span className="kalkharga__item-qty">{it.jumlahPakai} {it.satuanPakai}</span>
                  <span className="kalkharga__item-biaya">{formatRupiah(biaya)}</span>
                  <button className="kalkharga__item-remove" onClick={() => handleHapusItem(idx)} title="Hapus">✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div className="kalkharga__costs">
          <div className="kalkharga__field">
            <label className="kalkharga__label">Biaya Operasional (Rp)</label>
            <input className="kalkharga__input" type="number" placeholder="Misal: 5000 (listrik, gas, kemasan)"
              value={form.biayaOperasional} onChange={e => { setForm(p => ({ ...p, biayaOperasional: e.target.value })); setError(""); }} min="0" />
          </div>
          <div className="kalkharga__field">
            <label className="kalkharga__label">Target Untung (Rp)</label>
            <input className="kalkharga__input" type="number" placeholder="Misal: 3000"
              value={form.targetUntung} onChange={e => { setForm(p => ({ ...p, targetUntung: e.target.value })); setError(""); }} min="0" />
          </div>
        </div>

        <div className="kalkharga__summary">
          <div className="kalkharga__sum-row"><span>Biaya Bahan</span><span>{formatRupiah(biayaBahan)}</span></div>
          <div className="kalkharga__sum-row"><span>Biaya Operasional</span><span>{formatRupiah(biayaOpsNum)}</span></div>
          <div className="kalkharga__sum-row kalkharga__sum-row--sub"><span>Total Biaya</span><span>{formatRupiah(totalBiaya)}</span></div>
          <div className="kalkharga__sum-row"><span>Target Untung</span><span>{formatRupiah(targetUntungNum)}</span></div>
          <div className="kalkharga__sum-row kalkharga__sum-row--final"><span>Harga Jual</span><span>{formatRupiah(hargaJual)}</span></div>
        </div>

        {error && <p className="kalkharga__error">⚠️ {error}</p>}

        <div className="kalkharga__form-actions">
          {editId && <button className="kalkharga__btn-sec" onClick={resetForm}>Batal</button>}
          <button className="kalkharga__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "💾 Simpan Produk"}
          </button>
        </div>
      </div>

      <div className="kalkharga__list">
        <h3 className="kalkharga__list-title">Daftar Produk</h3>
        {produkList.length === 0 ? (
          <div className="kalkharga__empty">
            <p>🛍️</p>
            <p>Belum ada produk dihitung.</p>
            <p>Gunakan form di atas untuk menghitung harga jual pertama kamu.</p>
          </div>
        ) : (
          <div className="kalkharga__produk-grid">
            {produkList.map(p => (
              <div key={p.id} className="kalkharga__produk-card">
                <div className="kalkharga__produk-header">
                  <span className="kalkharga__produk-nama">{p.nama}</span>
                  <div className="kalkharga__produk-actions">
                    <button className="kalkharga__produk-edit" onClick={() => openEdit(p)} title="Edit">✏️</button>
                    <button className="kalkharga__produk-del" onClick={() => setDelId(p.id)} title="Hapus">🗑</button>
                  </div>
                </div>
                <div className="kalkharga__produk-body">
                  <span className="kalkharga__produk-label">Harga Jual</span>
                  <span className="kalkharga__produk-harga">{formatRupiah(p.hargaJual)}</span>
                </div>
                <div className="kalkharga__produk-detail">
                  <span>Modal: {formatRupiah(p.totalBiaya)}</span>
                  <span>Untung: {formatRupiah(p.targetUntung)}</span>
                </div>
                <div className="kalkharga__produk-resep">{p.items.length} bahan dalam resep</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {delId && (
        <div className="kalkharga__modal-overlay" onClick={() => setDelId(null)}>
          <div className="kalkharga__modal" onClick={e => e.stopPropagation()}>
            <h4 className="kalkharga__modal-title">Hapus produk ini?</h4>
            <p className="kalkharga__modal-sub">Produk tidak akan lagi muncul sebagai pilihan saat mencatat transaksi pemasukan.</p>
            <div className="kalkharga__modal-actions">
              <button className="kalkharga__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="kalkharga__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
