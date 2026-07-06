import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  genId,
  formatRupiah,
  hargaPerBase, nilaiStok, stokDisplay, hargaUnitLabel,
  toBase, toBaseWithHasil, unitGroupOf, restokUnitOptions,
} from "../utils/umkmCalc";
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
  const [showYield, setShowYield] = useState(false);

  // Halaman detail
  const [detailId,      setDetailId]      = useState(null);
  const [historyList,   setHistoryList]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Modal + Stok
  const [restokId,    setRestokId]    = useState(null);
  const [restokJml,   setRestokJml]   = useState("");
  const [restokSat,   setRestokSat]   = useState("");
  const [restokHarga, setRestokHarga] = useState("");
  const [restokErr,   setRestokErr]   = useState("");

  // Modal − Kurangi Stok
  const [kurangiId,     setKurangiId]     = useState(null);
  const [kurangiJml,    setKurangiJml]    = useState("");
  const [kurangiSat,    setKurangiSat]    = useState("");
  const [kurangiAlasan, setKurangiAlasan] = useState("");
  const [kurangiErr,    setKurangiErr]    = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=bahan_baku`).then(r => {
      if (r.success) setList(r.data);
    });
  }, [user]);

  const fetchHistory = async (bahanId) => {
    setHistoryLoading(true);
    const r = await apiFetch(`/api/umkm?table=stok_history&bahanId=${bahanId}`);
    if (r.success) setHistoryList(r.data);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (detailId) fetchHistory(detailId);
    else setHistoryList([]);
  }, [detailId]);

  const isPack = form.satuanBeli === "pack";

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); setShowYield(false); };

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
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=bahan_baku&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(b => b.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
    if (detailId === id) setDetailId(null);
    window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
  };

  // ── + Stok: bisa pilih satuan (pack ATAU pcs, kg ATAU gram, dll) ────────────
  const openRestok = (b) => {
    setRestokId(b.id);
    setRestokJml("");
    setRestokSat(restokUnitOptions(b)[0]);
    setRestokHarga("");
    setRestokErr("");
  };

  const confirmRestok = async () => {
    if (!restokJml || +restokJml <= 0)     return setRestokErr("Isi jumlah beli yang valid.");
    if (!restokHarga || +restokHarga <= 0) return setRestokErr("Isi harga beli yang valid.");
    const bahan = list.find(b => b.id === restokId);
    if (!bahan) return;

    // Stok tambahan dalam base unit — mengikuti satuan yang DIPILIH user, bisa pack,
    // pcs, ATAU satuan hasil custom (cetakan/pin/dll, otomatis dikonversi balik ke base).
    const stokTambahan = toBaseWithHasil(+restokJml, restokSat, bahan);

    const stokLama = parseFloat(bahan.stok) || 0;
    const stokBaru = stokLama + stokTambahan;

    // Nilai total lama (Rp) + nilai total baru (Rp), lalu dirata-ratakan → harga baru per base unit
    const nilaiLama = hargaPerBase(bahan) * stokLama;
    const nilaiTambahan = +restokHarga;
    const hargaPerBaseBaru = stokBaru > 0 ? (nilaiLama + nilaiTambahan) / stokBaru : 0;

    const isPackBahan = !!bahan.satuanUnit;
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
      await apiFetch(`/api/umkm?table=stok_history`, {
        method: "POST",
        body: JSON.stringify({
          id: genId(), bahanId: restokId, tipe: "tambah", sumber: "manual_tambah",
          jumlah: +restokJml, satuanLabel: restokSat, alasan: null, createdAt: Date.now(),
        }),
      });
      window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
      if (detailId === restokId) fetchHistory(restokId);
    }
    setRestokId(null);
  };

  // ── − Kurangi Stok manual: wajib isi alasan ─────────────────────────────────
  const openKurangi = (b) => {
    setKurangiId(b.id);
    setKurangiJml("");
    setKurangiSat(restokUnitOptions(b)[0]);
    setKurangiAlasan("");
    setKurangiErr("");
  };

  const confirmKurangi = async () => {
    if (!kurangiJml || +kurangiJml <= 0) return setKurangiErr("Isi jumlah yang valid.");
    if (!kurangiAlasan.trim())            return setKurangiErr("Alasan pengurangan stok wajib diisi.");
    const bahan = list.find(b => b.id === kurangiId);
    if (!bahan) return;

    const jumlahBase = toBaseWithHasil(+kurangiJml, kurangiSat, bahan);
    const stokBaru = (parseFloat(bahan.stok) || 0) - jumlahBase;

    const r = await apiFetch(`/api/umkm?table=bahan_baku`, {
      method: "PUT",
      body: JSON.stringify({ id: kurangiId, ...bahan, stok: stokBaru }),
    });
    if (r.success) {
      setList(p => p.map(b => b.id === kurangiId ? r.data : b));
      await apiFetch(`/api/umkm?table=stok_history`, {
        method: "POST",
        body: JSON.stringify({
          id: genId(), bahanId: kurangiId, tipe: "kurang", sumber: "manual_kurang",
          jumlah: +kurangiJml, satuanLabel: kurangiSat, alasan: kurangiAlasan.trim(), createdAt: Date.now(),
        }),
      });
      window.dispatchEvent(new CustomEvent("bahanBakuUpdated"));
      if (detailId === kurangiId) fetchHistory(kurangiId);
    }
    setKurangiId(null);
  };

  // ── Helper ─────────────────────────────────────────────────────────────────
  const totalNilaiStok = list.reduce((s, b) => s + nilaiStok(b), 0);
  const unitLabel = (b) => hargaUnitLabel(b);
  const preview = previewHarga();
  const detailBahan = detailId ? list.find(b => b.id === detailId) : null;

  const historyBadgeLabel = (h) => h.sumber === "transaksi" ? "Otomatis" : "Manual";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bahanbaku">

      {/* ══════════ HALAMAN DETAIL ══════════ */}
      {detailId && detailBahan && (() => {
        const stokBase  = parseFloat(detailBahan.stok) || 0;
        const stokMinus = stokBase < 0;
        return (
          <div className="bahanbaku__detail">
            <button className="bahanbaku__detail-back" onClick={() => setDetailId(null)}>← Kembali ke Daftar Bahan</button>

            <div className="bahanbaku__detail-card">
              <h3 className="bahanbaku__detail-nama">{detailBahan.nama}</h3>
              <div className="bahanbaku__detail-stats">
                <div className="bahanbaku__detail-stat">
                  <span className="bahanbaku__detail-stat-label">Stok Saat Ini</span>
                  <span className={"bahanbaku__detail-stat-value" + (stokMinus ? " bahanbaku__detail-stat-value--minus" : "")}>
                    {stokMinus ? "⚠ " : ""}{stokDisplay(detailBahan)}
                  </span>
                </div>
                <div className="bahanbaku__detail-stat">
                  <span className="bahanbaku__detail-stat-label">Harga per Satuan</span>
                  <span className="bahanbaku__detail-stat-value">{formatRupiah(hargaPerBase(detailBahan))}/{unitLabel(detailBahan)}</span>
                </div>
                <div className="bahanbaku__detail-stat">
                  <span className="bahanbaku__detail-stat-label">Estimasi Nilai Stok</span>
                  <span className="bahanbaku__detail-stat-value">{formatRupiah(nilaiStok(detailBahan))}</span>
                </div>
              </div>

              <div className="bahanbaku__detail-actions">
                <button className="bahanbaku__item-restok" onClick={() => openRestok(detailBahan)}>+ Tambah Stok</button>
                <button className="bahanbaku__item-kurangi" onClick={() => openKurangi(detailBahan)}>− Kurangi Stok</button>
                <button className="bahanbaku__btn-sec" onClick={() => { openEdit(detailBahan); setDetailId(null); }}>✏️ Edit Data</button>
                <button className="bahanbaku__btn-danger" onClick={() => setDelId(detailBahan.id)}>🗑 Hapus Bahan</button>
              </div>
            </div>

            <div className="bahanbaku__history">
              <h4 className="bahanbaku__history-title">Riwayat Keluar-Masuk Stok</h4>
              {historyLoading ? (
                <p className="bahanbaku__hint-small" style={{ padding: "1rem 0" }}>Memuat riwayat...</p>
              ) : historyList.length === 0 ? (
                <div className="bahanbaku__empty" style={{ padding: "2rem 1rem" }}>
                  <p>📋</p>
                  <p>Belum ada riwayat perubahan stok.</p>
                </div>
              ) : (
                <div className="bahanbaku__history-list">
                  {historyList.map(h => (
                    <div key={h.id} className={"bahanbaku__history-item bahanbaku__history-item--" + h.tipe}>
                      <span className="bahanbaku__history-icon">{h.tipe === "tambah" ? "▲" : "▼"}</span>
                      <div className="bahanbaku__history-info">
                        <p className="bahanbaku__history-jumlah">
                          {h.tipe === "tambah" ? "+" : "−"}{h.jumlah} {h.satuanLabel}
                        </p>
                        <p className="bahanbaku__history-alasan">
                          {h.alasan || (h.sumber === "transaksi" ? "Otomatis dari penjualan produk" : "-")}
                        </p>
                      </div>
                      <div className="bahanbaku__history-meta">
                        <span className={"bahanbaku__history-badge bahanbaku__history-badge--" + h.sumber}>
                          {historyBadgeLabel(h)}
                        </span>
                        <span className="bahanbaku__history-date">
                          {new Date(h.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════ FORM + DAFTAR BAHAN (disembunyikan kalau lagi lihat detail) ══════════ */}
      {!detailId && (<>
      <div className="bahanbaku__form">
        <h3 className="bahanbaku__form-title">{editId ? "✏️ Koreksi Data Bahan" : "+ Tambah Bahan Baku"}</h3>

        {!editId && (
          <p className="bahanbaku__example">
            Contoh: <strong>Kertas</strong>, beli <strong>1 rim</strong> (isi <strong>500 lembar</strong>) seharga <strong>Rp50.000</strong>
            — sistem otomatis hitung harganya jadi Rp100/lembar.
          </p>
        )}

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
            <input className="bahanbaku__input" type="number" name="hargaBeli"
              placeholder="Contoh: 60000" value={form.hargaBeli} onChange={handleChange} min="0" />
          </div>
        </div>

        {isPack && (
          <div className="bahanbaku__kemasan-box">
            <label className="bahanbaku__label">1 pack itu jadi berapa pcs?</label>
            <input className="bahanbaku__input" type="number" name="isiPerPack"
              placeholder="Contoh: 50 (buat packaging) atau 20 (buat kertas foto)"
              value={form.isiPerPack} onChange={handleChange} min="1" />
          </div>
        )}

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

        {preview !== null && (
          <div className="bahanbaku__hpp-preview">
            <span className="bahanbaku__hpp-label">Harga per {previewSatuan()} =</span>
            <span className="bahanbaku__hpp-value">{formatRupiah(preview)}</span>
          </div>
        )}

        {error && <p className="bahanbaku__error">⚠️ {error}</p>}

        <div className="bahanbaku__form-actions">
          {editId && <button className="bahanbaku__btn-sec" onClick={resetForm}>Batal</button>}
          <button className="bahanbaku__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Tambah Bahan"}
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="bahanbaku__stok-summary">
          <span className="bahanbaku__stok-summary-label">Total Estimasi Nilai Stok</span>
          <span className="bahanbaku__stok-summary-value">{formatRupiah(totalNilaiStok)}</span>
        </div>
      )}

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
                  <button className="bahanbaku__item-detail" onClick={() => setDetailId(b.id)}>Detail →</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      </>)}

      {/* Modal + Stok */}
      {restokId && (() => {
        const bahan = list.find(b => b.id === restokId);
        if (!bahan) return null;
        const unitOpts = restokUnitOptions(bahan);
        return (
          <div className="bahanbaku__modal-overlay" onClick={() => setRestokId(null)}>
            <div className="bahanbaku__modal" onClick={e => e.stopPropagation()}>
              <h4 className="bahanbaku__modal-title">+ Stok Masuk</h4>
              <p className="bahanbaku__modal-sub">
                <strong>{bahan.nama}</strong> — stok sekarang: {stokDisplay(bahan)}
              </p>
              <div className="bahanbaku__restok-row">
                <input
                  className="bahanbaku__input" type="number"
                  placeholder="Jumlah"
                  value={restokJml}
                  onChange={e => { setRestokJml(e.target.value); setRestokErr(""); }}
                  min="0" autoFocus
                />
                <select
                  className="bahanbaku__input bahanbaku__input--sat"
                  value={restokSat}
                  onChange={e => setRestokSat(e.target.value)}
                >
                  {unitOpts.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="bahanbaku__field" style={{ marginBottom: "1rem" }}>
                <label className="bahanbaku__label">Harga totalnya berapa (Rp)?</label>
                <input
                  className="bahanbaku__input" type="number"
                  placeholder="Contoh: 22000"
                  value={restokHarga}
                  onChange={e => { setRestokHarga(e.target.value); setRestokErr(""); }}
                  min="0"
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

      {/* Modal − Kurangi Stok */}
      {kurangiId && (() => {
        const bahan = list.find(b => b.id === kurangiId);
        if (!bahan) return null;
        const unitOpts = restokUnitOptions(bahan);
        return (
          <div className="bahanbaku__modal-overlay" onClick={() => setKurangiId(null)}>
            <div className="bahanbaku__modal" onClick={e => e.stopPropagation()}>
              <h4 className="bahanbaku__modal-title">− Kurangi Stok</h4>
              <p className="bahanbaku__modal-sub">
                <strong>{bahan.nama}</strong> — stok sekarang: {stokDisplay(bahan)}
              </p>
              <div className="bahanbaku__restok-row">
                <input
                  className="bahanbaku__input" type="number"
                  placeholder="Jumlah"
                  value={kurangiJml}
                  onChange={e => { setKurangiJml(e.target.value); setKurangiErr(""); }}
                  min="0" autoFocus
                />
                <select
                  className="bahanbaku__input bahanbaku__input--sat"
                  value={kurangiSat}
                  onChange={e => setKurangiSat(e.target.value)}
                >
                  {unitOpts.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="bahanbaku__field" style={{ marginBottom: "1rem" }}>
                <label className="bahanbaku__label">
                  Alasan Pengurangan <span className="bahanbaku__label-required">*wajib</span>
                </label>
                <input
                  className="bahanbaku__input" type="text"
                  placeholder="Misal: Rusak, kadaluarsa, selisih stok opname"
                  value={kurangiAlasan}
                  onChange={e => { setKurangiAlasan(e.target.value); setKurangiErr(""); }}
                />
              </div>
              {kurangiErr && <p className="bahanbaku__error">{kurangiErr}</p>}
              <div className="bahanbaku__modal-actions">
                <button className="bahanbaku__btn-sec" onClick={() => setKurangiId(null)}>Batal</button>
                <button className="bahanbaku__btn-danger" onClick={confirmKurangi}>Kurangi Stok</button>
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
