import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { formatRupiah } from "../utils/umkmCalc";
import RupiahInput from "./RupiahInput";
import {
  PLATFORM_PRESETS, buatFeeRowsDariPreset, genFeeId,
  hitungDanaBersih, hitungHargaJualMundur,
} from "../utils/marketplaceCalc";
import "./KalkulatorOnline.css";

export default function KalkulatorOnline() {
  const { user } = useAuth();
  const [produkList, setProdukList]   = useState([]);
  const [selProdukId, setSelProdukId] = useState("");
  const [platformKey, setPlatformKey] = useState("shopee");
  const [feeRows, setFeeRows]         = useState(buatFeeRowsDariPreset("shopee"));
  const [mode, setMode]               = useState("maju"); // "maju" | "mundur"

  // Mode maju: harga jual diketahui
  const [hargaJual, setHargaJual] = useState("");

  // Mode mundur: target diketahui
  const [targetJenis, setTargetJenis] = useState("bersih"); // "bersih" | "untung"
  const [targetNilai, setTargetNilai] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchProduk = () => {
      const token = localStorage.getItem("finsight_token");
      fetch(`/api/umkm?table=produk`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(r => { if (r.success) setProdukList(r.data); });
    };
    fetchProduk();
    window.addEventListener("produkUpdated", fetchProduk);
    return () => window.removeEventListener("produkUpdated", fetchProduk);
  }, [user]);

  const produk = produkList.find(p => p.id === selProdukId);
  const hpp = produk?.totalBiaya || 0;

  const handlePilihPlatform = (key) => {
    setPlatformKey(key);
    setFeeRows(buatFeeRowsDariPreset(key));
  };

  // Simpen harga jual online per produk — kirim SEMUA field produk yang udah ada
  // (bukan cuma hargaOnline), soalnya backend nulis ulang seluruh row pas PUT.
  const saveHargaOnline = async (produk, hargaBaru) => {
    const token = localStorage.getItem("finsight_token");
    const r = await fetch(`/api/umkm?table=produk`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: produk.id, ...produk, hargaOnline: hargaBaru }),
    }).then(res => res.json());
    if (r.success) {
      setProdukList(list => list.map(p => p.id === produk.id ? r.data : p));
      window.dispatchEvent(new CustomEvent("produkUpdated"));
    }
    return r.success;
  };

  const updateFeeRow = (id, field, value) =>
    setFeeRows(rows => rows.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  const addFeeRow = () => setFeeRows(rows => [...rows, { id: genFeeId(), nama: "", tipe: "persen", nilai: 0 }]);
  const removeFeeRow = (id) => setFeeRows(rows => rows.filter(r => r.id !== id));

  // ── Mode Maju ──────────────────────────────────────────────────────────────
  const hasilMaju        = hitungDanaBersih(hargaJual, feeRows);
  const untungBersihMaju = hasilMaju.danaBersih - hpp;
  const marginBersihMaju = hasilMaju.danaBersih > 0 ? (untungBersihMaju / hasilMaju.danaBersih) * 100 : 0;

  // ── Mode Mundur ────────────────────────────────────────────────────────────
  const targetDanaBersih  = targetJenis === "untung" ? hpp + (parseFloat(targetNilai) || 0) : (parseFloat(targetNilai) || 0);
  const hargaJualHasil    = hitungHargaJualMundur(targetDanaBersih, feeRows);
  const hasilMundurDetail = hargaJualHasil != null ? hitungDanaBersih(hargaJualHasil, feeRows) : null;

  return (
    <div className="komarket">
      <div className="komarket__form">
        <h3 className="komarket__form-title">🛒 Kalkulator Jual Online / Marketplace</h3>
        <p className="komarket__hint">
          Hitung dana bersih yang beneran kamu terima setelah potongan komisi, biaya layanan, dan biaya
          pembayaran platform — atau sebaliknya, cari harga jual yang harus dipasang biar untungnya tetap sesuai target.
        </p>

        <div className="komarket__field">
          <label className="komarket__label">Produk (opsional, buat dibandingin ke HPP)</label>
          <select className="komarket__input" value={selProdukId} onChange={e => setSelProdukId(e.target.value)}>
            <option value="">— Nggak usah, hitung manual aja —</option>
            {produkList.map(p => (
              <option key={p.id} value={p.id}>{p.nama} (HPP {formatRupiah(p.totalBiaya)})</option>
            ))}
          </select>
        </div>

        <div className="komarket__field">
          <label className="komarket__label">Platform</label>
          <div className="komarket__platform-toggle">
            {Object.entries(PLATFORM_PRESETS).map(([key, p]) => (
              <button key={key}
                className={"komarket__platform-btn" + (platformKey === key ? " komarket__platform-btn--active" : "")}
                onClick={() => handlePilihPlatform(key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="komarket__field">
          <label className="komarket__label">Rincian Potongan</label>
          <p className="komarket__hint komarket__hint--tight">
            ⚠️ Persennya sengaja dikosongin — isi sesuai rate yang beneran berlaku di toko kamu sekarang
            (cek dashboard marketplace-nya), soalnya sering berubah & beda per kategori produk.
          </p>
          <div className="komarket__fee-rows">
            {feeRows.map(row => (
              <div key={row.id} className="komarket__fee-row">
                <input className="komarket__input komarket__input--nama" type="text" placeholder="Nama potongan"
                  value={row.nama} onChange={e => updateFeeRow(row.id, "nama", e.target.value)} />
                <select className="komarket__input komarket__input--tipe" value={row.tipe}
                  onChange={e => updateFeeRow(row.id, "tipe", e.target.value)}>
                  <option value="persen">%</option>
                  <option value="nominal">Rp</option>
                </select>
                <input className="komarket__input komarket__input--nilai" type="number" placeholder="0"
                  value={row.nilai} onChange={e => updateFeeRow(row.id, "nilai", e.target.value)} />
                <button className="komarket__fee-remove" onClick={() => removeFeeRow(row.id)} title="Hapus baris">✕</button>
              </div>
            ))}
            {feeRows.length === 0 && <p className="komarket__empty-fee">Belum ada baris potongan. Tambah dulu di bawah.</p>}
          </div>
          <button className="komarket__addfee" onClick={addFeeRow}>+ Tambah Potongan</button>
        </div>

        <div className="komarket__mode-toggle">
          <button className={"komarket__mode-btn" + (mode === "maju" ? " komarket__mode-btn--active" : "")} onClick={() => setMode("maju")}>
            ➡️ Maju: Harga → Dana Bersih
          </button>
          <button className={"komarket__mode-btn" + (mode === "mundur" ? " komarket__mode-btn--active" : "")} onClick={() => setMode("mundur")}>
            ⬅️ Mundur: Target → Harga Jual
          </button>
        </div>

        {mode === "maju" ? (
          <>
            <div className="komarket__field">
              <label className="komarket__label">Harga Jual di Listing (Rp)</label>
              <RupiahInput className="komarket__input" placeholder="Contoh: 50.000" value={hargaJual} onChange={setHargaJual} />
            </div>

            <div className="komarket__summary">
              {hasilMaju.detail.map(d => (
                <div key={d.id} className="komarket__sum-row">
                  <span>{d.nama || "(tanpa nama)"} {d.tipe === "persen" ? `(${d.nilai}%)` : ""}</span>
                  <span>− {formatRupiah(d.potongan)}</span>
                </div>
              ))}
              <div className="komarket__sum-row komarket__sum-row--sub">
                <span>Total Potongan</span><span>− {formatRupiah(hasilMaju.totalPotongan)}</span>
              </div>
              <div className="komarket__sum-row komarket__sum-row--final">
                <span>Dana Bersih Diterima</span><span>{formatRupiah(hasilMaju.danaBersih)}</span>
              </div>
              {produk && (
                <>
                  <div className="komarket__sum-row"><span>HPP Produk</span><span>{formatRupiah(hpp)}</span></div>
                  <div className={"komarket__sum-row komarket__sum-row--final" + (untungBersihMaju < 0 ? " komarket__sum-row--neg" : "")}>
                    <span>Untung Bersih</span><span>{formatRupiah(untungBersihMaju)} ({marginBersihMaju.toFixed(1)}%)</span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="komarket__field">
              <label className="komarket__label">Target</label>
              <div className="komarket__mode-toggle">
                <button className={"komarket__mode-btn" + (targetJenis === "bersih" ? " komarket__mode-btn--active" : "")} onClick={() => setTargetJenis("bersih")}>
                  Dana Bersih Langsung
                </button>
                <button className={"komarket__mode-btn" + (targetJenis === "untung" ? " komarket__mode-btn--active" : "")}
                  onClick={() => produk && setTargetJenis("untung")} disabled={!produk}>
                  Untung di Atas HPP {!produk && "(pilih produk dulu)"}
                </button>
              </div>
            </div>
            <div className="komarket__field">
              <label className="komarket__label">{targetJenis === "untung" ? "Target Untung Bersih (Rp)" : "Target Dana Bersih (Rp)"}</label>
              <RupiahInput className="komarket__input" placeholder="Contoh: 20.000" value={targetNilai} onChange={setTargetNilai} />
            </div>

            <div className="komarket__summary">
              {hargaJualHasil == null ? (
                <p className="komarket__error">
                  ⚠️ Total potongan persen udah ≥100% — nggak mungkin ada harga jual yang bisa nutup ini. Cek lagi rincian potongannya.
                </p>
              ) : (
                <>
                  <div className="komarket__sum-row komarket__sum-row--final">
                    <span>Harga Jual yang Harus Dipasang</span><span>{formatRupiah(hargaJualHasil)}</span>
                  </div>
                  {hasilMundurDetail.detail.map(d => (
                    <div key={d.id} className="komarket__sum-row">
                      <span>{d.nama || "(tanpa nama)"}</span><span>− {formatRupiah(d.potongan)}</span>
                    </div>
                  ))}
                  <div className="komarket__sum-row komarket__sum-row--sub">
                    <span>Dana Bersih (cek ulang)</span><span>{formatRupiah(hasilMundurDetail.danaBersih)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {produkList.length > 0 && (
        <div className="komarket__form komarket__list-card">
          <h3 className="komarket__form-title">💾 Daftar Harga Jual Online</h3>
          <p className="komarket__hint">
            Simpen harga jual listing per produk di sini sekali aja. Nanti pas centang "Ini penjualan online?"
            di form Transaksi dan pilih produknya, harga ini otomatis keisi sendiri — nggak perlu ngetik ulang tiap kali.
          </p>
          <div className="komarket__online-list">
            {produkList.map(p => (
              <HargaOnlineRow key={p.id} produk={p} onSave={saveHargaOnline} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Baris kecil per produk di "Daftar Harga Jual Online" ─────────────────────
// Dipisah jadi komponen sendiri biar state edit tiap baris nggak numpuk di parent
// (tiap baris punya input & status simpannya sendiri-sendiri).
function HargaOnlineRow({ produk, onSave }) {
  const [val, setVal]         = useState(produk.hargaOnline ? String(produk.hargaOnline) : "");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const dirty = val !== (produk.hargaOnline ? String(produk.hargaOnline) : "");

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(produk, +val || 0);
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  return (
    <div className="komarket__online-row">
      <div className="komarket__online-row-info">
        <span className="komarket__online-row-nama">{produk.nama}</span>
        <span className="komarket__online-row-hpp">HPP {formatRupiah(produk.totalBiaya)} · Harga Normal {formatRupiah(produk.hargaJual)}</span>
      </div>
      <RupiahInput className="komarket__input komarket__online-row-input" placeholder="Harga listing online"
        value={val} onChange={setVal} />
      <button
        className="komarket__online-row-save"
        disabled={!dirty || saving}
        onClick={handleSave}
      >
        {saving ? "..." : saved ? "✓ Kesimpen" : "Simpan"}
      </button>
    </div>
  );
}
