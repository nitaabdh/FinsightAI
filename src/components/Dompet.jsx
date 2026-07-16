import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { genId, formatRupiah } from "../utils/umkmCalc";
import CountUp from "./CountUp";
import { getTransactions, computeKasStats, getKasEmoji } from "../utils/storage";
import "./Dompet.css";

import { Pencil, Trash2, Wallet } from "lucide-react";
const JENIS_OPTIONS = ["Tunai", "Bank", "E-Wallet", "QRIS", "Lainnya"];
const emptyForm = { nama: "", jenis: "Tunai", catatan: "" };

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("finsight_token");
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return res.json();
}

// Halaman "Dompet" — daftar semua wadah uang (kas tunai, rekening bank, e-wallet, QRIS, dll)
// beserta saldo REAL-nya. Saldo dihitung dari SEMUA transaksi (pemasukan/pengeluaran/transfer)
// pakai computeKasStats yang sama dengan Dashboard & Laporan — jadi nggak akan pernah beda angka.
//
// Kenapa perlu halaman ini padahal saldo per kas udah ada di Dashboard?
// 1. Supaya bisa DAFTARIN dompet baru (misal "QRIS") SEBELUM pernah dipakai transaksi apapun —
//    biar langsung muncul di dropdown pilihan kas pas nyatet transaksi/transfer.
// 2. Tempat ngasih catatan per dompet (misal nomor rekening, link akun e-wallet, dll).
export default function Dompet({ mode = "umkm" }) {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [list, setList]         = useState([]); // dompet yang terdaftar (dari tabel dompet)
  const [transactions, setTransactions] = useState([]);
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [error, setError]       = useState("");
  const [delId, setDelId]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false); // guard tombol Simpan/Tambah biar nggak keklik dobel

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      // Daftar dompet TIDAK dipisah per mode dengan sengaja — dompet fisik (misal
      // rekening BCA) bisa aja dipakai buat nyatet transaksi usaha & pribadi sekaligus.
      apiFetch(`/api/umkm?table=dompet`),
      // Pakai getTransactions (bukan fetch mentah) — biar field kasTujuan ke-normalize
      // dengan benar, kalau nggak, saldo transfer ke dompet lain bisa nyasar ke "Kas Tunai".
      getTransactions(user.id, mode),
    ]).then(([dompetRes, txData]) => {
      if (dompetRes.success) setList(dompetRes.data);
      setTransactions(txData);
    }).finally(() => setLoading(false));
  }, [user, mode]);

  const resetForm = () => { setForm(emptyForm); setEditId(null); setError(""); setShowForm(false); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setError("");
  };

  // Saldo real per dompet — dihitung dari histori transaksi (bukan disimpan manual),
  // biar nggak pernah "nyasar"/nggak sinkron kalau ada transaksi baru.
  const kasStats = computeKasStats(transactions);
  const saldoOf = (nama) => {
    const found = kasStats.find(k => k.nama.toLowerCase().trim() === nama.toLowerCase().trim());
    return found ? found.saldo : 0;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const { nama, jenis, catatan } = form;
    if (!nama.trim()) return setError("Nama dompet tidak boleh kosong.");
    const dup = list.find(d => d.id !== editId && d.nama.toLowerCase().trim() === nama.toLowerCase().trim());
    if (dup) return setError("Udah ada dompet dengan nama itu.");

    const payloadData = { nama: nama.trim(), jenis, catatan: catatan.trim() };

    setSubmitting(true);
    try {
      if (editId) {
        const r = await apiFetch(`/api/umkm?table=dompet`, { method: "PUT", body: JSON.stringify({ id: editId, ...payloadData }) });
        if (r.success) setList(p => p.map(it => it.id === editId ? r.data : it));
        else { setError(r.message || "Gagal menyimpan perubahan."); return; }
      } else {
        const r = await apiFetch(`/api/umkm?table=dompet`, { method: "POST", body: JSON.stringify({ id: genId(), ...payloadData, createdAt: Date.now() }) });
        if (r.success) setList(p => [r.data, ...p]);
        else { setError(r.message || "Gagal menyimpan dompet."); return; }
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (it) => {
    setForm({ nama: it.nama, jenis: it.jenis || "Lainnya", catatan: it.catatan || "" });
    setEditId(it.id);
    setError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const handleDel = async (id) => {
    await apiFetch(`/api/umkm?table=dompet&id=${id}`, { method: "DELETE" });
    setList(p => p.filter(it => it.id !== id));
    setDelId(null);
    if (editId === id) resetForm();
  };

  // Gabungkan dompet TERDAFTAR dengan dompet yang MUNCUL di histori transaksi tapi belum
  // sempat didaftarin manual (misal ketik custom pas nyatet transaksi) — biar semua kelihatan.
  const namaTerdaftar = new Set(list.map(d => d.nama.toLowerCase().trim()));
  const dompetDariTransaksi = kasStats
    .filter(k => !namaTerdaftar.has(k.nama.toLowerCase().trim()) && k.nama !== "Non-Kas (Kerugian Stok)")
    .map(k => ({ id: `auto-${k.nama}`, nama: k.nama, jenis: "Lainnya", catatan: "", belumTerdaftar: true }));

  const semuaDompet = [...list, ...dompetDariTransaksi];
  const totalSaldo = semuaDompet.reduce((s, d) => s + saldoOf(d.nama), 0);

  return (
    <div className="dompet">
      {semuaDompet.length > 0 && (
        <div className="dompet__total">
          <span className="dompet__total-label">Total Saldo Semua Dompet</span>
          <span className="dompet__total-value"><CountUp value={totalSaldo} format={formatRupiah} /></span>
        </div>
      )}

      {!showForm ? (
        <button className="dompet__btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setShowForm(true)}>
          + Tambah Dompet
        </button>
      ) : (
        <div className="dompet__form" ref={formRef}>
          <h3 className="dompet__form-title">{editId ? "Edit Dompet" : "+ Tambah Dompet Baru"}</h3>
          <div className="dompet__grid stagger-list">
            <div className="dompet__field dompet__field--wide">
              <label className="dompet__label">Nama Dompet</label>
              <input className="dompet__input" type="text" name="nama"
                placeholder="Misal: QRIS, GoPay, BCA Toko" value={form.nama} onChange={handleChange} />
            </div>
            <div className="dompet__field">
              <label className="dompet__label">Jenis</label>
              <select className="dompet__input" name="jenis" value={form.jenis} onChange={handleChange}>
                {JENIS_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
          </div>
          <div className="dompet__field">
            <label className="dompet__label">Catatan (opsional)</label>
            <input className="dompet__input" type="text" name="catatan"
              placeholder="Misal: no. rekening, akun a.n. siapa, dll" value={form.catatan} onChange={handleChange} />
          </div>
          {error && <p className="dompet__error">{error}</p>}
          <div className="dompet__form-actions">
            <button className="dompet__btn-sec" onClick={resetForm} disabled={submitting}>Batal</button>
            <button className="dompet__btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Menyimpan..." : (editId ? "Simpan Perubahan" : "+ Tambah Dompet")}
            </button>
          </div>
        </div>
      )}

      <div className="dompet__grid-cards stagger-list">
        {loading ? (
          <div className="dompet__empty"><p>⏳</p><p>Memuat data dompet...</p></div>
        ) : semuaDompet.length === 0 ? (
          <div className="dompet__empty">
            <p><Wallet size={14} /></p>
            <p>Belum ada dompet tercatat.</p>
            <p>Tambahkan dari form di atas — misal "QRIS", "GoPay", atau rekening bank kamu.</p>
          </div>
        ) : (
          semuaDompet.map(it => {
            const saldo = saldoOf(it.nama);
            return (
              <div key={it.id} className="dompet__card">
                {!it.belumTerdaftar && (
                  <div className="dompet__card-actions">
                    <button className="dompet__item-edit" onClick={() => openEdit(it)} title="Edit"><Pencil size={14} /></button>
                    <button className="dompet__item-del" onClick={() => setDelId(it.id)} title="Hapus"><Trash2 size={14} /></button>
                  </div>
                )}
                <span className="dompet__card-icon"></span>
                <p className="dompet__card-nama">{it.nama}</p>
                <p className={"dompet__card-saldo" + (saldo < 0 ? " dompet__item-saldo--neg" : "")}>
                  {formatRupiah(saldo)}
                </p>
                <div className="dompet__card-footer">
                  <span className="dompet__item-kategori">{it.jenis}</span>
                  {it.belumTerdaftar && <span className="dompet__card-auto">otomatis dari transaksi</span>}
                </div>
                {it.catatan && <p className="dompet__card-catatan">{it.catatan}</p>}
              </div>
            );
          })
        )}
      </div>

      {delId && (
        <div className="dompet__modal-overlay" onClick={() => setDelId(null)}>
          <div className="dompet__modal" onClick={e => e.stopPropagation()}>
            <h4 className="dompet__modal-title">Hapus dompet ini?</h4>
            <p className="dompet__modal-sub">
              Ini cuma ngehapus dari daftar dompet — riwayat transaksi yang udah kepakai nama dompet ini TETAP aman, nggak ikut kehapus.
              {(() => {
                const target = semuaDompet.find(d => d.id === delId);
                const hasHistory = target && kasStats.some(k => k.nama.toLowerCase().trim() === target.nama.toLowerCase().trim());
                return hasHistory
                  ? " Karena dompet ini masih punya riwayat transaksi, dia bakal MUNCUL LAGI di daftar sebagai \"otomatis dari transaksi\" (cuma nggak bisa diedit/dikasih catatan lagi)."
                  : "";
              })()}
            </p>
            <div className="dompet__modal-actions">
              <button className="dompet__btn-sec" onClick={() => setDelId(null)}>Batal</button>
              <button className="dompet__btn-danger" onClick={() => handleDel(delId)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
