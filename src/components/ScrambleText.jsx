import { useEffect, useRef, useState } from "react";

// Kumpulan karakter buat "acak-acakan" sebelum huruf aslinya nongol.
const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#&%$@ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function buildOutput(text, revealCount) {
  return text
    .split("")
    .map((c, i) => (c === " " || i < revealCount ? c : randomChar()))
    .join("");
}

/**
 * Teks yang muncul dengan efek "acak dulu baru ke-decode" pas komponennya
 * pertama kali di-render (biasa dipakai buat headline halaman utama).
 *
 * Beda sama animasi angka (CountUp) yang emang butuh smooth per-frame buat
 * kesan "gerak", scramble text ini SENGAJA dibikin step-based (bukan
 * requestAnimationFrame per-frame) karena:
 *  - teks besar + font proporsional -> tiap ganti karakter bikin lebar teks
 *    berubah -> browser reflow. Makin sering ganti, makin berat.
 *  - jumlah update dikit (± 10x total) udah cukup buat kesan "decoding",
 *    nggak butuh 60x/detik kayak animasi gerak.
 * Selama proses acak, font dipaksa monospace (biar lebar tiap karakter
 * SAMA -> nggak ada reflow) dan class gradient (kalau ada) DITUNDA sampai
 * teks kelar settle -> menghindari repaint mahal dari background-clip:text
 * yang berubah tiap step.
 *
 * Props:
 * - text     : teks final yang mau ditampilkan
 * - delay    : jeda sebelum animasi mulai (ms) — buat nge-stagger beberapa ScrambleText
 * - duration : lama total animasi (ms)
 * - as       : tag pembungkus (default "span")
 */
export default function ScrambleText({ text, delay = 0, duration = 700, className = "", as: Tag = "span", ...rest }) {
  const [display, setDisplay] = useState(() => buildOutput(text, 0));
  const [settled, setSettled] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSettled(false);

    // Total step dikunci kecil (bukan tergantung panjang teks / fps) —
    // ini kunci utamanya biar ringan: cuma segini kali React re-render,
    // titik. Cukup buat kesan "acak lalu ke-decode" tanpa bikin browser megap.
    const STEPS = 9;
    const stepInterval = Math.max(30, Math.round(duration / STEPS));

    function scheduleStep(step) {
      timeoutRef.current = setTimeout(() => {
        if (cancelled) return;

        const revealCount = Math.round((step / STEPS) * text.length);
        setDisplay(buildOutput(text, revealCount));

        if (step >= STEPS) {
          setDisplay(text); // pastiin hasil akhir 100% presisi, bukan hasil rounding
          setSettled(true);
          return;
        }
        scheduleStep(step + 1);
      }, step === 0 ? delay : stepInterval);
    }

    scheduleStep(0);
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, delay, duration]);

  return (
    <Tag
      className={settled ? className : "scramble-text--running"}
      style={settled ? undefined : { fontFamily: "monospace" }}
      aria-label={text}
      {...rest}
    >
      {display}
    </Tag>
  );
}
