import { formatRibuan, unformatRibuan } from "../utils/umkmCalc";

/**
 * Input Rupiah dengan titik ribuan otomatis saat ngetik.
 * Value yang dikirim ke onChange TETAP angka murni (string digit tanpa titik),
 * jadi komponen ini bisa langsung gantiin <input type="number"> di form manapun
 * tanpa perlu ubah cara parent nyimpen/ngitung datanya.
 *
 * Pemakaian:
 *   <RupiahInput className="kalkharga__input" value={form.biaya}
 *     onChange={(v) => setForm(p => ({ ...p, biaya: v }))} />
 */
export default function RupiahInput({ value, onChange, className, placeholder = "0", ...rest }) {
  const handleChange = (e) => {
    const raw = unformatRibuan(e.target.value);
    onChange(raw);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      placeholder={placeholder}
      value={formatRibuan(value)}
      onChange={handleChange}
      {...rest}
    />
  );
}
