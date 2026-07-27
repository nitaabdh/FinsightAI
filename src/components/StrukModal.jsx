import { useState } from "react";
import { formatRupiah } from "../utils/umkmCalc";
import { isBluetoothPrintSupported, buildReceiptBytes, printViaBluetooth } from "../utils/thermalPrint";
import { Printer, Bluetooth, X } from "lucide-react";
import "./StrukModal.css";

// Modal struk — dipanggil abis checkout sukses. 2 cara cetak:
// 1. "Print Biasa" — window.print() ke tampilan struk ini (CSS @media print
//    nyembunyiin semua elemen lain). Jalan di SEMUA device/browser, hasilnya
//    bisa ke printer apa aja yang udah ke-pairing di OS, atau disave jadi PDF.
// 2. "Cetak ke Printer Bluetooth" — cuma muncul kalau browser support Web
//    Bluetooth (Chrome/Edge Android & Desktop, NGGAK akan pernah muncul di
//    Safari/iPhone). Connect langsung ke printer thermal, kirim perintah ESC/POS.
export default function StrukModal({ receipt, onClose }) {
  const [btPrinting, setBtPrinting] = useState(false);
  const [btError, setBtError] = useState("");

  const handlePrintBiasa = () => {
    window.print();
  };

  const handlePrintBluetooth = async () => {
    if (btPrinting) return;
    setBtPrinting(true);
    setBtError("");
    try {
      const bytes = buildReceiptBytes(receipt);
      await printViaBluetooth(bytes);
    } catch (err) {
      setBtError(err.message || "Gagal nyambung ke printer. Pastiin printer nyala & Bluetooth aktif.");
    } finally {
      setBtPrinting(false);
    }
  };

  return (
    <div className="struk-modal-overlay" onClick={onClose}>
      <div className="struk-modal" onClick={e => e.stopPropagation()}>
        <button className="struk-modal__close" onClick={onClose}><X size={16} /></button>

        {/* Ini bagian yang keprint / ke-capture struktur-nya — id ini yang
            disembunyiin/dimunculin lewat CSS @media print di StrukModal.css */}
        <div id="struk-print-area" className="struk-receipt">
          <p className="struk-receipt__toko">{receipt.namaToko}</p>
          {receipt.alamat && <p className="struk-receipt__alamat">{receipt.alamat}</p>}
          <p className="struk-receipt__tanggal">{receipt.tanggal}</p>
          <div className="struk-receipt__divider" />
          {receipt.items.map((it, idx) => (
            <div key={idx} className="struk-receipt__item">
              <p className="struk-receipt__item-nama">{it.produkNama}</p>
              <div className="struk-receipt__item-row">
                <span>{it.qty} x {formatRupiah(it.hargaSatuan)}</span>
                <span>{formatRupiah(it.subtotal)}</span>
              </div>
            </div>
          ))}
          <div className="struk-receipt__divider" />
          <div className="struk-receipt__total">
            <span>TOTAL</span>
            <span>{formatRupiah(receipt.total)}</span>
          </div>
          {receipt.footerText && <p className="struk-receipt__footer">{receipt.footerText}</p>}
        </div>

        {btError && <p className="struk-modal__error">{btError}</p>}

        <div className="struk-modal__actions">
          <button className="struk-modal__btn struk-modal__btn--primary" onClick={handlePrintBiasa}>
            <Printer size={16} /> Print Biasa
          </button>
          {isBluetoothPrintSupported() && (
            <button className="struk-modal__btn struk-modal__btn--sec" onClick={handlePrintBluetooth} disabled={btPrinting}>
              <Bluetooth size={16} /> {btPrinting ? "Menyambungkan..." : "Cetak ke Printer Bluetooth"}
            </button>
          )}
        </div>
        {!isBluetoothPrintSupported() && (
          <p className="struk-modal__hint">
            Cetak langsung ke printer Bluetooth cuma bisa lewat Chrome di Android/Desktop — nggak tersedia di browser ini.
          </p>
        )}
      </div>
    </div>
  );
}
