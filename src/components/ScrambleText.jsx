import { useEffect, useRef, useState } from "react";

// Kumpulan karakter buat "acak-acakan" sebelum huruf aslinya nongol.
// Sengaja dicampur simbol biar kesannya kayak decoding, bukan cuma huruf random.
const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#&%$@ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function scrambledVersionOf(text) {
  return text
    .split("")
    .map((c) => (c === " " ? " " : randomChar()))
    .join("");
}

/**
 * Teks yang muncul dengan efek "acak dulu baru ke-decode" pas komponennya
 * pertama kali di-render (biasa dipakai buat headline halaman utama).
 *
 * Props:
 * - text     : teks final yang mau ditampilkan
 * - delay    : jeda sebelum animasi mulai (ms) — buat nge-stagger beberapa ScrambleText
 * - duration : lama total animasi per karakter (ms)
 * - as       : tag/komponen pembungkus (default "span")
 */
export default function ScrambleText({ text, delay = 0, duration = 900, className = "", as: Tag = "span", ...rest }) {
  const [display, setDisplay] = useState(() => scrambledVersionOf(text));
  const frameRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let startTime = null;

    // Tiap karakter dapat jendela waktu "mulai settle" & "selesai settle" yang
    // sedikit acak, biar hurufnya nggak ke-reveal rata kiri-ke-kanan kaku,
    // tapi tetep kelar bareng-bareng di sekitar `duration`.
    const queue = text.split("").map((char) => {
      const start = Math.random() * (duration * 0.5);
      const end = start + duration * 0.4 + Math.random() * (duration * 0.3);
      return { char, start, end };
    });

    function tick(timestamp) {
      if (cancelled) return;
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime - delay;

      let output = "";
      let allSettled = true;

      for (const { char, start, end } of queue) {
        if (char === " ") {
          output += " ";
          continue;
        }
        if (elapsed >= end) {
          output += char;
        } else {
          output += randomChar();
          allSettled = false;
        }
      }

      setDisplay(output);

      if (!allSettled) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, duration]);

  return (
    <Tag className={className} aria-label={text} {...rest}>
      {display}
    </Tag>
  );
}
