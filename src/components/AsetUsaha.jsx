import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { genId, formatRupiah } from "../utils/umkmCalc";
import { addTransaction, getTransactionsByRef, deleteTransaction } from "../utils/storage";
import RupiahInput from "./RupiahInput";
import "./AsetUsaha.css";

import { Pencil, Search, Trash2, Wrench } from "lucide-react";
const KATEGORI_PRESET = ["Masak", "Display", "Kasir", "Penyimpanan", "Kebersihan", "Furnitur"];
const KONDISI_OPTIONS = [
  { value: "baik",        label: "Baik" },
  { value: "rusakRingan", label: "Rusak Ringan" },
  { value: "rusakBerat",  label: "Rusak Berat" },
];
const KAS_PRESET = ["Kas Tunai", "Rekening Bank", "E-Wallet"];

const emptyForm = {
  nama: "", kategori: "", kategoriCustom: "",
  tanggalBeli: new Date().toISOString().slice(0, 10),
  hargaBeli: "", kondisi: "baik", catatan: "", kas: "Kas Tunai",
};

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

export default function AsetUsaha() {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [list, setList]     = useState([]);
  const [form, setForm]     = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editHargaLocked, setEditHargaLocked] = useState(false); // true kalau aset ini sudah kebeli beneran (hargaBeli > 0 saat dibuat), jadi hargaBeli dikunci
  const [error, setError]   = useState("");
  const [delId, setDelId]   = useState(null);
  const [filterKategori, setFilterKategori] = useState("semua");
  const [filterKondisi,  setFilterKondisi]  = useState("semua");
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");
  const [dompetList, setDompetList] = useState([]);

  // ── Modal hapus ──────────────────────────────────────────────────────────
  const [delAlasanJenis, setDelAlasanJenis] = useState("salahInput"); // "terjual" | "salahInput"
  const [delHargaJual,   setDelHargaJual]   = useState("");
  const [delKasJual,     setDelKasJual]     = useState("Kas Tunai");
  const [delCatatan,     setDelCatatan]     = useState("");
  const [delErr,         setDelErr]         = useState("");
  const [delTxList,      setDelTxList]      = useState([]);
  const [delTxLoading,   setDelTxLoading]   = useState(false);
  const [hapusTxJuga,    setHapusTxJuga]    = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/umkm?table=aset_usaha`).then(r => { if (r.success) setList(r.data); });
    apiFetch(`/api/umkm?table=dompet`).then(r => { if (r.success) setDompetList(r.data); });
  }, [user]);

  const kasOptionsAll = (() => {
    const map = {};
    [...KAS_PRESET, ...dompetList.map(d => d.nama)].forEach(k => {
      const key = (k || "").toLowerCase().trim();
      if (key && !(key in map)) map[key] = k;
    });
    return Object.values(map);
  })();

  const resetForm = () => { setForm(emptyForm); setEditId(null); setEditHargaLocked(false); setError(""); setShowForm(false); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    const { nama, kategori, kategoriCustom, tanggalBeli, hargaBeli, kondisi, catatan, kas } = form;
    if (!nama.trim())    return setError("Nama alat tidak boleh kosong.");
    if (!kategori)       return setError("Pilih kategori terlebih dahulu.");
    if (!hargaBeli || +hargaBeli < 0) return setError("Harga beli tidak valid.");
    if (!editId && +hargaBeli > 0 && !kas?.trim()) return setError("Pilih kas/wadah uang buat beli aset ini.");

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
      // Edit = koreksi data aset, BUKAN transaksi pembelian baru — kas tidak disentuh lagi.
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
      if (r.success) {
        setList(p => [r.data, ...p]);
        // Beli aset = pengeluaran, dipisah kategorinya dari bahan baku/operasional biasa.
        if (+hargaBeli > 0) {
          await addTransaction(user.id, "umkm", {
            type: "pengeluaran",
            amount: +hargaBeli,
            category: "Pembelian Aset Usaha",
            description: `Beli aset: ${nama.trim()}`,
            date: tanggalBeli,
            kas: kas?.trim() || "Kas Tunai",
            refId: r.data.id,
            refType: "aset_usaha",
          });
          window.dispatchEvent(new CustomEvent("transactionsUpdated"));
        }
      }
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
      kas: "Kas Tunai",
    });
    setEditId(it.id);
    // Kalau aset ini sudah pernah kebeli beneran (hargaBeli > 0), harga belinya dikunci —
    // soalnya sudah kecatat sebagai transaksi pengeluaran di Keuangan. Diedit di sini nggak
    // akan mengubah transaksi yang sudah tercatat, jadi malah bikin datanya nggak nyambung.
    setEditHargaLocked(+it.hargaBeli > 0);
    setError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const openDel = async (id) => {
    setDelId(id);
    setDelAlasanJenis("salahInput");
    setDelHargaJual("");
    setDelKasJual("Kas Tunai");
    setDelCatatan("");
    setDelErr("");
    setHapusTxJuga(false);
    setDelTxList([]);
    setDelTxLoading(true);
    const tx = await getTransactionsByRef("umkm", "aset_usaha", id);
    setDelTxList(tx);
    setDelTxLoading(false);
  };

  const confirmDel = async () => {
    const aset = list.find(it => it.id === delId);
    if (!aset) return;

    if (delAlasanJenis === "terjual") {
      if (!delHargaJual || +delHargaJual <= 0) return setDelErr("Isi harga jual aset ini.");
      if (!delCatatan.trim())                 return setDelErr("Isi alasan/catatan penjualannya.");
      if (!delKasJual?.trim())                return setDelErr("Pilih dompet tempat uang penjualan masuk.");
      // Dicatat sebagai kategori terpisah "Penjualan Aset Usaha" — tetap kehitung sebagai
      // pemasukan/mempengaruhi laba, tapi TIDAK masuk "Modal Usaha" (itu khusus setoran
      // modal pemilik) dan TIDAK dicampur sama "Penjualan Produk" asli di laporan.
      await addTransaction(user.id, "umkm", {
        type: "pemasukan",
        amount: +delHargaJual,
        category: "Penjualan Aset Usaha",
        description: `Jual aset: ${aset.nama} — ${delCatatan.trim()}`,
        date: new Date().toISOString().slice(0, 10),
        kas: delKasJual.trim(),
        refId: aset.id,
        refType: "aset_usaha",
      });
      window.dispatchEvent(new CustomEvent("transactionsUpdated"));
    } else {
      if (hapusTxJuga && delTxList.length > 0) {
        await Promise.all(delTxList.map(tx => deleteTransaction(user.id, "umkm", tx.id)));
        window.dispatchEvent(new CustomEvent("transactionsUpdated"));
      }
    }

    await apiFetch(`/api/umkm?table=aset_usaha&id=${delId}`, { method: "DELETE" });
    setList(p => p.filter(it => it.id !== delId));
    if (editId === delId) resetForm();
    setDelId(null);
    setDelTxList([]);
  };

  const semuaKategori = [...new Set([...KATEGORI_PRESET, ...list.map(it => it.kategori)])].sort();
  const filtered = list
    .filter(it => filterKategori === "semua" || it.kategori === filterKategori)
    .filter(it => filterKondisi  === "semua" || it.kondisi  === filterKondisi)
    .filter(it => it.nama.toLowerCase().includes(search.trim().toLowerCase()))
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

      {!showForm ? (
        <button className="asetusaha__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Tambah Aset Usaha
        </button>
      ) : (
      <div className="asetusaha__form" ref={formRef}>
        <h3 className="asetusaha__form-title">{editId ? "✏️ Edit Aset" : "+ Tambah Aset Usaha"}</h3>
        {editHargaLocked && (
          <p className="asetusaha__error" style={{ background: "var(--warning-bg, #fff3cd)", color: "inherit" }}>
            🔒 Harga beli aset ini sudah tercatat sebagai transaksi pengeluaran di Keuangan, jadi tidak bisa diubah dari sini.
          </p>
        )}
        <div className="asetusaha__grid stagger-list">
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
            <RupiahInput className="asetusaha__input"
              placeholder="Contoh: 1.500.000" value={form.hargaBeli}
              onChange={v => { setForm(p => ({ ...p, hargaBeli: v })); setError(""); }}
              disabled={editHargaLocked} />
          </div>
          <div className="asetusaha__field">
            <label className="asetusaha__label">Kondisi</label>
            <select className="asetusaha__input" name="kondisi" value={form.kondisi} onChange={handleChange}>
              {KONDISI_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          {!editId && (
            <div className="asetusaha__field">
              <label className="asetusaha__label">Bayar Pakai Kas</label>
              <select className="asetusaha__input" name="kas" value={form.kas} onChange={handleChange}>
                {kasOptionsAll.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="asetusaha__field">
          <label className="asetusaha__label">Catatan (opsional)</label>
          <input className="asetusaha__input" type="text" name="catatan"
            placeholder="Misal: dibeli bekas dari toko sebelah" value={form.catatan} onChange={handleChange} />
        </div>
        {error && <p className="asetusaha__error">⚠️ {error}</p>}
        <div className="asetusaha__form-actions">
          <button className="asetusaha__btn-sec" onClick={resetForm}>Batal</button>
          <button className="asetusaha__btn-primary" onClick={handleSubmit}>
            {editId ? "Simpan Perubahan" : "+ Tambah Aset"}
          </button>
        </div>
      </div>
      )}

      {list.length > 0 && (
        <div className="asetusaha__filters">
          <input className="asetusaha__select" type="text" placeholder="🔍 Cari nama aset..."
            style={{ flex: 1, minWidth: "160px" }}
            value={search} onChange={e => setSearch(e.target.value)} />
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

      <div className="asetusaha__list stagger-list">
        {list.length === 0 ? (
          <div className="asetusaha__empty">
            <p><Wrench size={14} /></p>
            <p>Belum ada aset usaha tercatat.</p>
            <p>Tambahkan dari form di atas untuk mulai mencatat peralatan usahamu.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="asetusaha__empty"><p><Search size={15} /></p><p>Tidak ada aset yang cocok dengan filter.</p></div>
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
                <button className="asetusaha__item-edit" onClick={() => openEdit(it)} title="Edit"><Pencil size={14} /></button>
                <button className="asetusaha__item-del" onClick={() => openDel(it.id)} title="Hapus"><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {delId && (() => {
        const aset = list.find(it => it.id === delId);
        if (!aset) return null;
        return (
          <div className="asetusaha__modal-overlay" onClick={() => setDelId(null)}>
            <div className="asetusaha__modal" onClick={e => e.stopPropagation()}>
              <h4 className="asetusaha__modal-title">Hapus "{aset.nama}"?</h4>
              <p className="asetusaha__modal-sub">Kenapa aset ini dihapus?</p>

              <div className="asetusaha__del-reason">
                <button
                  className={"asetusaha__del-reason-btn" + (delAlasanJenis === "salahInput" ? " asetusaha__del-reason-btn--active" : "")}
                  onClick={() => { setDelAlasanJenis("salahInput"); setDelErr(""); }}
                >
                  ❌ Salah Input
                </button>
                <button
                  className={"asetusaha__del-reason-btn" + (delAlasanJenis === "terjual" ? " asetusaha__del-reason-btn--active" : "")}
                  onClick={() => { setDelAlasanJenis("terjual"); setDelErr(""); }}
                >
                  💰 Terjual
                </button>
              </div>

              {delAlasanJenis === "terjual" ? (
                <>
                  <p className="asetusaha__modal-sub">
                    Otomatis kecatat sebagai pemasukan kategori "Penjualan Aset Usaha" (terpisah dari Modal & Penjualan Produk).
                  </p>
                  <div className="asetusaha__field" style={{ marginBottom: "0.85rem" }}>
                    <label className="asetusaha__label">Harga Jual (Rp)</label>
                    <RupiahInput className="asetusaha__input" placeholder="Contoh: 800.000"
                      value={delHargaJual} onChange={v => { setDelHargaJual(v); setDelErr(""); }} />
                  </div>
                  <div className="asetusaha__field" style={{ marginBottom: "0.85rem" }}>
                    <label className="asetusaha__label">Uang Masuk ke Dompet</label>
                    <select className="asetusaha__input" value={delKasJual} onChange={e => setDelKasJual(e.target.value)}>
                      {kasOptionsAll.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div className="asetusaha__field" style={{ marginBottom: "0.85rem" }}>
                    <label className="asetusaha__label">Alasan / Catatan</label>
                    <input className="asetusaha__input" type="text" placeholder="Misal: dijual karena mau ganti yang baru"
                      value={delCatatan} onChange={e => { setDelCatatan(e.target.value); setDelErr(""); }} />
                  </div>
                </>
              ) : (
                <>
                  <p className="asetusaha__modal-sub">
                    Aset dihapus dari daftar tanpa nambah transaksi apa pun.
                  </p>
                  {delTxLoading ? (
                    <p className="asetusaha__modal-sub">Mengecek transaksi terkait...</p>
                  ) : delTxList.length > 0 ? (
                    <label className="asetusaha__checkbox-row">
                      <input type="checkbox" checked={hapusTxJuga} onChange={e => setHapusTxJuga(e.target.checked)} />
                      <span>
                        Hapus juga {delTxList.length} transaksi pembelian terkait di Keuangan
                        (total {formatRupiah(delTxList.reduce((s, t) => s + (t.amount || 0), 0))})
                      </span>
                    </label>
                  ) : (
                    <p className="asetusaha__modal-sub">Nggak ada transaksi Keuangan yang nempel ke aset ini.</p>
                  )}
                </>
              )}

              {delErr && <p className="asetusaha__error">⚠️ {delErr}</p>}
              <div className="asetusaha__modal-actions">
                <button className="asetusaha__btn-sec" onClick={() => setDelId(null)}>Batal</button>
                <button className="asetusaha__btn-danger" onClick={confirmDel}>Hapus</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
