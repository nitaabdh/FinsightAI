import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ResponsiveContainer,
} from "recharts";
import {
  PRODUK_KEY, loadData, formatRupiah,
  marginKontribusi, biayaVariabelPerUnit,
  hitungBEPProduk, hitungBEPGabungan, dataGrafikBEP,
} from "../utils/umkmCalc";
import "./BreakEvenPoint.css";

export default function BreakEvenPoint() {
  const { user } = useAuth();
  const [produkList, setProdukList] = useState([]);
  const [mode, setMode] = useState("tunggal"); // "tunggal" | "gabungan"
  const [biayaTetap, setBiayaTetap] = useState("");

  // Mode tunggal
  const [selProdukId, setSelProdukId] = useState("");

  // Mode gabungan: set of produkId yang dicentang
  const [selGabungan, setSelGabungan] = useState(new Set());

  useEffect(() => {
    if (user) setProdukList(loadData(PRODUK_KEY(user.id)));
  }, [user]);

  // Refresh kalau ada perubahan dari tab Kalkulator Harga Jual
  useEffect(() => {
    const refresh = () => { if (user) setProdukList(loadData(PRODUK_KEY(user.id))); };
    window.addEventListener("produkUpdated", refresh);
    return () => window.removeEventListener("produkUpdated", refresh);
  }, [user]);

  const biayaTetapNum = parseFloat(biayaTetap) || 0;

  const toggleGabungan = (id) => {
    setSelGabungan((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Mode Tunggal ───────────────────────────────────────────────────────────
  const produkTerpilih = produkList.find((p) => p.id === selProdukId) || null;

  const hasilTunggal = useMemo(() => {
    if (!produkTerpilih || biayaTetapNum <= 0) return null;
    return hitungBEPProduk(produkTerpilih, biayaTetapNum);
  }, [produkTerpilih, biayaTetapNum]);

  const grafikTunggal = useMemo(() => {
    if (!produkTerpilih || !hasilTunggal?.valid) return [];
    return dataGrafikBEP(
      produkTerpilih.hargaJual,
      biayaVariabelPerUnit(produkTerpilih),
      biayaTetapNum,
      hasilTunggal.bepUnit
    );
  }, [produkTerpilih, hasilTunggal, biayaTetapNum]);

  // ── Mode Gabungan ──────────────────────────────────────────────────────────
  const produkGabunganTerpilih = produkList.filter((p) => selGabungan.has(p.id));

  const hasilGabungan = useMemo(() => {
    if (produkGabunganTerpilih.length === 0 || biayaTetapNum <= 0) return null;
    return hitungBEPGabungan(produkGabunganTerpilih, biayaTetapNum);
  }, [produkGabunganTerpilih, biayaTetapNum]);

  const grafikGabungan = useMemo(() => {
    if (produkGabunganTerpilih.length === 0 || !hasilGabungan?.valid) return [];
    const hargaJualRata = produkGabunganTerpilih.reduce((s, p) => s + p.hargaJual, 0) / produkGabunganTerpilih.length;
    const biayaVarRata  = produkGabunganTerpilih.reduce((s, p) => s + biayaVariabelPerUnit(p), 0) / produkGabunganTerpilih.length;
    return dataGrafikBEP(hargaJualRata, biayaVarRata, biayaTetapNum, hasilGabungan.bepUnitEstimasi);
  }, [produkGabunganTerpilih, hasilGabungan, biayaTetapNum]);

  // ── Data aktif sesuai mode ────────────────────────────────────────────────────
  const grafikData = mode === "tunggal" ? grafikTunggal : grafikGabungan;
  const hasil       = mode === "tunggal" ? hasilTunggal : hasilGabungan;
  const bepUnitUntukDot = mode === "tunggal" ? hasilTunggal?.bepUnit : hasilGabungan?.bepUnitEstimasi;
  const bepValueUntukDot = grafikData.find((p) => p.unit === Math.round(bepUnitUntukDot || -1))?.pendapatan;

  return (
    <div className="bep">
      <h3 className="bep__title">📐 Break-Even Point</h3>

      {/* Mode switcher */}
      <div className="bep__mode-switch">
        <button
          className={"bep__mode-btn" + (mode === "tunggal" ? " bep__mode-btn--active" : "")}
          onClick={() => setMode("tunggal")}
        >
          Per Produk
        </button>
        <button
          className={"bep__mode-btn" + (mode === "gabungan" ? " bep__mode-btn--active" : "")}
          onClick={() => setMode("gabungan")}
        >
          Gabungan Semua Produk
        </button>
      </div>

      {/* Biaya tetap bulanan — input bersama kedua mode */}
      <div className="bep__field">
        <label className="bep__label">Biaya Tetap Bulanan (Rp)</label>
        <input
          className="bep__input"
          type="number"
          placeholder="Misal: 2100000 (sewa, listrik, gaji, dll)"
          value={biayaTetap}
          onChange={(e) => setBiayaTetap(e.target.value)}
          min="0"
        />
      </div>

      {produkList.length === 0 ? (
        <p className="bep__hint">
          Belum ada produk dihitung. Buat dulu di tab <strong>Kalkulator Harga Jual</strong> pada halaman Transaksi.
        </p>
      ) : mode === "tunggal" ? (
        <>
          {/* Pilih produk */}
          <div className="bep__field">
            <label className="bep__label">Pilih Produk</label>
            <select className="bep__input" value={selProdukId} onChange={(e) => setSelProdukId(e.target.value)}>
              <option value="">-- Pilih produk --</option>
              {produkList.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
          </div>

          {produkTerpilih && biayaTetapNum > 0 && (
            <BEPResultTunggal produk={produkTerpilih} hasil={hasilTunggal} biayaTetap={biayaTetapNum} />
          )}
        </>
      ) : (
        <>
          {/* Multi-select produk gabungan */}
          <div className="bep__field">
            <label className="bep__label">Pilih Produk yang Dihitung Gabungan</label>
            <div className="bep__checklist">
              {produkList.map((p) => (
                <label key={p.id} className="bep__check-item">
                  <input
                    type="checkbox"
                    checked={selGabungan.has(p.id)}
                    onChange={() => toggleGabungan(p.id)}
                  />
                  <span>{p.nama}</span>
                  <span className="bep__check-harga">{formatRupiah(p.hargaJual)}</span>
                </label>
              ))}
            </div>
          </div>

          {produkGabunganTerpilih.length > 0 && biayaTetapNum > 0 && (
            <BEPResultGabungan produkList={produkGabunganTerpilih} hasil={hasilGabungan} biayaTetap={biayaTetapNum} />
          )}
        </>
      )}

      {/* Grafik garis */}
      {grafikData.length > 0 && hasil?.valid && (
        <div className="bep__chart-wrap">
          <p className="bep__chart-title">Grafik Biaya Total vs Pendapatan</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={grafikData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="unit"
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
                label={{ value: "Jumlah Unit", position: "insideBottom", offset: -5, fontSize: 11, fill: "var(--text-muted)" }}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}rb`}
              />
              <Tooltip
                formatter={(value, name) => [formatRupiah(value), name === "biayaTotal" ? "Biaya Total" : "Pendapatan"]}
                labelFormatter={(unit) => `${unit} unit`}
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Legend
                formatter={(value) => (value === "biayaTotal" ? "Biaya Total" : "Pendapatan")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line type="monotone" dataKey="biayaTotal" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pendapatan" stroke="#f59e0b" strokeWidth={2} dot={false} />
              {bepValueUntukDot !== undefined && (
                <ReferenceDot
                  x={Math.round(bepUnitUntukDot)}
                  y={bepValueUntukDot}
                  r={6}
                  fill="var(--accent-umkm)"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Sub-komponen hasil mode tunggal ──────────────────────────────────────────────
function BEPResultTunggal({ produk, hasil, biayaTetap }) {
  const variabelPerUnit = biayaVariabelPerUnit(produk);
  if (!hasil.valid) {
    return (
      <div className="bep__warning">
        ⚠️ Harga jual ({formatRupiah(produk.hargaJual)}) tidak menutup biaya variabel per unit ({formatRupiah(variabelPerUnit)}).
        Produk ini akan selalu rugi berapa pun unit terjual — pertimbangkan menaikkan harga jual atau menurunkan biaya produksi.
      </div>
    );
  }
  const bepBulat = Math.ceil(hasil.bepUnit);
  return (
    <div className="bep__result">
      <div className="bep__result-row"><span>Harga Jual</span><span>{formatRupiah(produk.hargaJual)}</span></div>
      <div className="bep__result-row"><span>Biaya Variabel per Unit</span><span>{formatRupiah(variabelPerUnit)}</span></div>
      <div className="bep__result-row bep__result-row--sub"><span>Margin Kontribusi per Unit</span><span>{formatRupiah(hasil.margin)}</span></div>
      <div className="bep__result-row"><span>Biaya Tetap Bulanan</span><span>{formatRupiah(biayaTetap)}</span></div>
      <div className="bep__result-row bep__result-row--final">
        <span>Break-Even Point</span>
        <span>{bepBulat.toLocaleString("id-ID")} unit/bulan</span>
      </div>
      <p className="bep__conclusion">
        Kamu perlu jual <strong>{bepBulat.toLocaleString("id-ID")} {produk.nama}</strong> per bulan biar gak rugi.
        Setara dengan sekitar <strong>{Math.ceil(bepBulat / 30)} unit per hari</strong> (asumsi 30 hari operasional).
      </p>
    </div>
  );
}

// ── Sub-komponen hasil mode gabungan ─────────────────────────────────────────────
function BEPResultGabungan({ produkList, hasil, biayaTetap }) {
  if (!hasil.valid) {
    return (
      <div className="bep__warning">
        ⚠️ Rata-rata margin kontribusi dari produk yang dipilih bernilai negatif atau nol.
        Periksa kembali harga jual dan biaya produksi masing-masing produk.
      </div>
    );
  }
  const bepUnitBulat = Math.ceil(hasil.bepUnitEstimasi);
  return (
    <div className="bep__result">
      <div className="bep__result-row"><span>Jumlah Produk Dihitung</span><span>{produkList.length} produk</span></div>
      <div className="bep__result-row"><span>Rata-rata Margin Kontribusi</span><span>{formatRupiah(hasil.rataMargin)}/unit</span></div>
      <div className="bep__result-row"><span>Rasio Margin Kontribusi</span><span>{(hasil.rasioMargin * 100).toFixed(1)}%</span></div>
      <div className="bep__result-row"><span>Biaya Tetap Bulanan</span><span>{formatRupiah(biayaTetap)}</span></div>
      <div className="bep__result-row bep__result-row--final">
        <span>BEP (Rupiah)</span>
        <span>{formatRupiah(hasil.bepRupiah)}/bulan</span>
      </div>
      <div className="bep__result-row bep__result-row--final">
        <span>BEP (Unit, estimasi)</span>
        <span>{bepUnitBulat.toLocaleString("id-ID")} unit/bulan</span>
      </div>
      <p className="bep__conclusion">
        Kamu perlu jual sekitar <strong>{bepUnitBulat.toLocaleString("id-ID")} unit</strong> (gabungan semua produk terpilih)
        atau mencapai pendapatan <strong>{formatRupiah(hasil.bepRupiah)}</strong> per bulan biar gak rugi.
      </p>
      <p className="bep__caveat">
        Catatan: angka unit gabungan ini estimasi dengan asumsi proporsi penjualan sama rata antar produk terpilih.
        Untuk angka paling akurat, gunakan mode <strong>Per Produk</strong>.
      </p>
    </div>
  );
}
