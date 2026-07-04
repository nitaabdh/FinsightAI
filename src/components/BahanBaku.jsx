import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId,
  formatRupiah,
  hargaPerBase, nilaiStok, stokDisplay, hargaUnitLabel,
  toBase, unitGroupOf,
} from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import "./BahanBaku.css";

const emptyForm = { nama: "", jumlahBeli: "", satuanBeli: "kg", isiPerPack: "", hargaBeli: "", hasilPerUnit: "", hasilLabel: "" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
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
  const [editId,    setEditId]    = useState(null); // koreksi data, bukan restock
  const [error,     setError]     = useState("");
  const [delId,     setDelId]     = useState(null);
  const [restokId,  setRestokId]  = useState(null);
  const [restokJml, setRestokJml] = useState("");
  const [restokHarga, setRestokHarga] = useState("");
  const [restokErr, setRestokErr] = useState("");
  const [showYield, setShowYield] = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [search,    setSearch]    = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => {
      if (r.success) setList(r.data);
    });
  }, [user]);

  const isPack = form.satuanBeli === "pack";

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); setShowYield(false); setShowForm(false); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  // Harga per satuan terkecil (gram/ml/pcs) dari input form saat ini — buat preview
  const previewHarga = () => {
    if (!form.hargaBeli || !form.jumlahBeli || +form.jumlahBeli <= 0) return null;
    if (isPack && (!form.isiPerPack || +form.isiPerPack <= 0)) return null;
    return hargaPerBase({
      hargaBeli: +form.hargaBeli, jumlahBeli: +form.jumlahBeli,
      satuanBeli: form.satuanBeli, isiPerPack: isPack ? +form.isiPerPack : null,
      hasilPerUnit: form.hasilPerUnit ? +form.hasilPerUnit : null,
      hasilLabel: form.hasilLabel,
    });
  };

  const previewSatuan = () => {
    if (form.hasilPerUnit && +form.hasilPerUnit > 1) return form.hasilLabel || "hasil";
    if (isPack) return "pcs";
    const g = unitGroupOf(form.satuanBeli);
    return g === "berat" ? "gram" : g === "volume" ? "ml" : "pcs";
  };

  // Nama satuan kecil saat ini (sebelum dipecah jadi hasil) — buat label kotak opsional
  const satuanKecilSaatIni = () => {
    if (isPack) return "pcs";
    const g = unitGroupOf(form.satuanBeli);
    return g === "berat" ? "gram" : g === "volume" ? "ml" : "pcs";
  };

  const handleSubmit = async () => {
    const { nama, hargaBeli, jumlahBeli, satuanBeli, isiPerPack, hasilPerUnit, hasilLabel } = form;

    if (!nama.trim())                    return setError("Nama bahan belum diisi.");
    if (!jumlahBeli || +jumlahBeli <= 0) return setError("Jumlah beli harus lebih dari 0.");
    if (!hargaBeli || +hargaBeli <= 0)   return setError("Harga belum diisi.");
    if (isPack && (!isiPerPack || +isiPerPack <= 0))
      return setError("Isi 1 pack jadi berapa pcs dulu ya.");
    if (showYield && hasilPerUnit && +hasilPerUnit > 1 && !hasilLabel.trim())
      return setError("Kasih nama hasilnya dulu (misal: cetakan, gantungan kunci).");

    const yieldPayload = (showYield && hasilPerUnit && +hasilPerUnit > 1)
      ? { hasilPerUnit: +hasilPerUnit, hasilLabel: hasilLabel.trim() }
      : { hasilPerUnit: null, hasilLabel: null };

    if (editId) {
      // Edit = koreksi data (nama/jumlah/harga bahan itu sendiri), bukan nambah stok
      const payload = {
        nama: nama.trim(), hargaBeli: +hargaBeli, jumlahBeli: +jumlahBeli,
        satuanBeli, isiPerPack: isPack ? +isiPerPack : null,
        satuanUnit: isPack ? "pcs" : null,
        ...yieldPayload,
      };
      const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
        method: "PUT",
        body: JSON.stringify({ id: editId, ...payload }),
      });
      if (r.success) setList(p => p.map(b => b.id === editId ? r.data : b));
    } else {
      // Tambah baru: "beli berapa" langsung jadi stok
      const stokBase = isPack
        ? toBase(+jumlahBeli, "pack", +isiPerPack)
        : toBase(+jumlahBeli, satuanBeli);
      const payload = {
        nama: nama.trim(), hargaBeli: +hargaBeli, jumlahBeli: +jumlahBeli,
        satuanBeli, isiPerPack: isPack ? +isiPerPack : null,
        satuanUnit: isPack ? "pcs" : null,
        ...yieldPayload,
        stok: stokBase, createdAt: Date.now(),
      };
      const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
        method: "POST",
        body: JSON.stringify({ id: genId(), ...payload }),
      });
      if (r.success) setList(p => [r.data, ...p]);
    }

    resetForm();
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  const openEdit = (b) => {
    setForm({
      nama: b.nama,
      jumlahBeli: String(b.jumlahBeli),
      satuanBeli: b.satuanBeli,
      isiPerPack: b.isiPerPack ? String(b.isiPerPack) : "",
      hargaBeli: String(b.hargaBeli),
      hasilPerUnit: b.hasilPerUnit ? String(b.hasilPerUnit) : "",
      hasilLabel: b.hasilLabel || "",
    });
    setShowYield(!!b.hasilPerUnit);
    setEditId(b.id);
    setError("");
    setShowForm(true);
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=bahan_baku&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(b => b.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  // ── Restock: beli lagi, harga dirata-rata otomatis (weighted average) ──────
  const openRestok = (b) => {
    setRestokId(b.id);
    setRestokJml("");
    setRestokHarga("");
    setRestokErr("");
  };

  const confirmRestok = async () => {
    if (!restokJml || +restokJml <= 0)   return setRestokErr("Isi jumlah beli yang valid.");
    if (!restokHarga || +restokHarga <= 0) return setRestokErr("Isi harga beli yang valid.");
    const bahan = list.find(b => b.id === restokId);
    if (!bahan) return;

    const isPackBahan = !!bahan.satuanUnit;

    // Stok tambahan dalam base unit
    const stokTambahan = isPackBahan
      ? toBase(+restokJml, bahan.satuanBeli, bahan.isiPerPack)
      : toBase(+restokJml, bahan.satuanBeli);

    const stokLama = parseFloat(bahan.stok) || 0;
    const stokBaru = stokLama + stokTambahan;

    // Nilai total lama (Rp) + nilai total baru (Rp), lalu dirata-ratakan → harga baru per base unit
    const nilaiLama = hargaPerBase(bahan) * stokLama;
    const nilaiTambahan = +restokHarga; // harga beli restock kali ini (total, bukan per satuan)
    const hargaPerBaseBaru = stokBaru > 0 ? (nilaiLama + nilaiTambahan) / stokBaru : 0;

    // Simpan ulang jumlahBeli/hargaBeli representatif supaya hargaPerBase() tetap konsisten:
    const isKiloan = bahan.satuanBeli === "kg" || bahan.satuanBeli === "liter";
    const jumlahBeliBaru = isPackBahan ? stokBaru / (bahan.isiPerPack || 1) : (isKiloan ? stokBaru / 1000 : stokBaru);
    const hargaBeliBaru = hargaPerBaseBaru * stokBaru;

    const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
      method: "PUT",
      body: JSON.stringify({
        id: restokId, ...bahan,
        stok: stokBaru,
        jumlahBeli: jumlahBeliBaru,
        hargaBeli: hargaBeliBaru,
      }),
    });
    if (r.success) {
      setList(p => p.map(b => b.id === restokId ? r.data : b));
      window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
    }
    setRestokId(null);
  };

  // ── Helper ─────────────────────────────────────────────────────────────────
  const totalNilaiStok = list.reduce((s, b) => s + nilaiStok(b), 0);

  const unitLabel = (b) => hargaUnitLabel(b);

  const preview = previewHarga();

  const filteredList = list.filter(b =>
    b.nama.toLowerCase().includes(search.trim().toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bahanbaku">

      {/* Form tambah/edit */}
      {!showForm ? (
        <button className="bahanbaku__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Tambah Bahan Baku
        </button>
      ) : (
      <div className="bahanbaku__form">
        <h3 className="bahanbaku__form-title">{editId ? "✏️ Koreksi Data Bahan" : "+ Tambah Bahan Baku"}</h3>

        <div className="bahanbaku__grid">
          <div className="bahanbaku__field bahanbaku__field--wide">
            <label className="bahanbaku__label">Nama Bahan</label>
            <input className="bahanbaku__input" type="text" name="nama"
              placeholder="Misal: Basreng Mix, Kertas Foto, Bahan Gantungan Kunci"
              value={form.nama} onChange={handleChange} />
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Beli Berapa?</label>
            <input className="bahanbaku__input" type="number" name="jumlahBeli"
              placeholder="Contoh: 3" value={form.jumlahBeli} onChange={handleChange} min="0" />
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Satuannya</label>
            <select className="bahanbaku__input" name="satuanBeli" value={form.satuanBeli} onChange={handleChange}>
              <option value="kg">kg</option>
              <option value="gram">gram</option>
              <option value="liter">liter</option>
              <option value="ml">ml</option>
              <option value="pcs">pcs</option>
              <option value="pack">pack / box / dus / rim (isi banyak)</option>
            </select>
          </div>
          <div className="bahanbaku__field">
            <label className="bahanbaku__label">Harga Totalnya (Rp)</label>
            <RupiahInput className="bahanbaku__input"
              placeholder="Contoh: 60.000" value={form.hargaBeli}
              onChange={v => { setForm(p => ({ ...p, hargaBeli: v })); setError(""); }} />
          </div>
        </div>

        {/* Cuma muncul kalau pilih "pack" */}
        {isPack && (
          <div className="bahanbaku__kemasan-box">
            <label className="bahanbaku__label">1 pack itu jadi berapa pcs?</label>
            <input className="bahanbaku__input" type="number" name="isiPerPack"
              placeholder="Contoh: 50 (buat packaging) atau 20 (buat kertas foto)"
              value={form.isiPerPack} onChange={handleChange} min="1" />
          </div>
        )}

        {/* Opsional: 1 satuan kecil bisa jadi berapa hasil (misal 1 lembar → 17 cetakan) */}
        {!showYield ? (
          <button type="button" className="bahanbaku__yield-toggle" onClick={() => setShowYield(true)}>
            + Rata-rata 1 {satuanKecilSaatIni()} bisa jadi beberapa hasil? (opsional)
          </button>
        ) : (
          <div className="bahanbaku__kemasan-box bahanbaku__kemasan-box--yield">
            <div className="bahanbaku__kemasan-box-head">
              <label className="bahanbaku__label">
                Rata-rata 1 {satuanKecilSaatIni()} bisa jadi berapa hasil/produk?
              </label>
              <button type="button" className="bahanbaku__yield-close"
                onClick={() => { setShowYield(false); setForm(p => ({ ...p, hasilPerUnit: "", hasilLabel: "" })); }}>
                Batal
              </button>
            </div>
            <div className="bahanbaku__kemasan-row">
              <input className="bahanbaku__input" type="number" name="hasilPerUnit"
                placeholder="Contoh: 17" value={form.hasilPerUnit} onChange={handleChange} min="1" />
              <input className="bahanbaku__input" type="text" name="hasilLabel"
                placeholder="Nama hasilnya, misal: cetakan" value={form.hasilLabel} onChange={handleChange} />
            </div>
            <p className="bahanbaku__hint-small">
              Contoh: 1 lembar kertas foto rata-rata jadi 17 cetakan gantungan kunci → harga otomatis dihitung per cetakan, bukan per lembar.
            </p>
          </div>
        )}

        {/* Preview harga per satuan kecil */}
        {preview !== null && (
          <div className="bahanbaku__hpp-preview">
            <span className="bahanbaku__hpp-label">Harga per {previewSatuan()} =</span>
            <span className="bahanbaku__hpp-value">{formatRupiah(preview)}</span>
          </div>
        )}

        {error && <p className="bahanbaku__error">⚠️ {error}</p>}

        <div className="bahanbaku__form-actions">
          <button className="bahanbaku__btn-sec" onClick={resetForm}>Batal</button>
          <button className="bahanbaku__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Tambah Bahan"}
          </button>
        </div>
      </div>
      )}

      {/* Total nilai stok */}
      {list.length > 0 && (
        <div className="bahanbaku__stok-summary">
          <span className="bahanbaku__stok-summary-label">Total Estimasi Nilai Stok</span>
          <span className="bahanbaku__stok-summary-value">{formatRupiah(totalNilaiStok)}</span>
        </div>
      )}

      {/* List bahan */}
      <div className="bahanbaku__list">
        {list.length > 0 && (
          <input className="bahanbaku__input" type="text" placeholder="🔍 Cari bahan baku..."
            style={{ marginBottom: "0.85rem" }}
            value={search} onChange={e => setSearch(e.target.value)} />
        )}
        {list.length === 0 ? (
          <div className="bahanbaku__empty">
            <p>🧺</p>
            <p>Belum ada bahan baku tercatat.</p>
            <p>Tambahkan dari form di atas untuk mulai mengelola stok.</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bahanbaku__empty"><p>🔍</p><p>Tidak ada bahan yang cocok dengan pencarian.</p></div>
        ) : (
          filteredList.map(b => {
            const stokBase  = parseFloat(b.stok) || 0;
            const stokMinus = stokBase < 0;
            return (
              <div key={b.id} className={"bahanbaku__item" + (stokMinus ? " bahanbaku__item--minus" : "")}>
                <div className="bahanbaku__item-info">
                  <p className="bahanbaku__item-nama">{b.nama}</p>
                  <p className="bahanbaku__item-meta">
                    ≈ {formatRupiah(hargaPerBase(b))}/{unitLabel(b)}
                  </p>
                </div>
                <div className="bahanbaku__item-stok">
                  <span className={"bahanbaku__item-stokval" + (stokMinus ? " bahanbaku__item-stokval--minus" : "")}>
                    {stokMinus ? "⚠ " : ""}{stokDisplay(b)} tersisa
                  </span>
                  <span className="bahanbaku__item-nilaistok">{formatRupiah(nilaiStok(b))}</span>
                </div>
                <div className="bahanbaku__item-actions">
                  <button className="bahanbaku__item-restok" onClick={() => openRestok(b)} title="Beli Lagi / Tambah Stok">+ Stok</button>
                  <button className="bahanbaku__item-edit" onClick={() => openEdit(b)} title="Koreksi Data">✏️</button>
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
        const satuanBeliLabel = bahan.satuanUnit ? "pack" : bahan.satuanBeli;
        return (
          <div className="bahanbaku__modal-overlay" onClick={() => setRestokId(null)}>
            <div className="bahanbaku__modal" onClick={e => e.stopPropagation()}>
              <h4 className="bahanbaku__modal-title">+ Stok Masuk</h4>
              <p className="bahanbaku__modal-sub">
                <strong>{bahan.nama}</strong> — stok sekarang: {stokDisplay(bahan)}
              </p>
              <div className="bahanbaku__field" style={{ marginBottom: "0.75rem" }}>
                <label className="bahanbaku__label">Beli berapa {satuanBeliLabel}?</label>
                <input
                  className="bahanbaku__input" type="number"
                  placeholder={`Contoh: 2 ${satuanBeliLabel}`}
                  value={restokJml}
                  onChange={e => { setRestokJml(e.target.value); setRestokErr(""); }}
                  min="0" autoFocus
                />
              </div>
              <div className="bahanbaku__field" style={{ marginBottom: "1rem" }}>
                <label className="bahanbaku__label">Harga totalnya berapa (Rp)?</label>
                <RupiahInput
                  className="bahanbaku__input"
                  placeholder="Contoh: 22.000"
                  value={restokHarga}
                  onChange={v => { setRestokHarga(v); setRestokErr(""); }}
                />
              </div>
              <p className="bahanbaku__hpp-hint">
                💡 Kalau harganya beda dari sebelumnya, sistem otomatis hitung rata-ratanya — kamu nggak perlu mikir apa-apa lagi.
              </p>
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
