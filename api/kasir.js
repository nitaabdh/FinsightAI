// /api/kasir.js — Vercel Serverless Function (dispatcher)
// Gabungan dari 3 endpoint lama (kasir-login, kasir-pin, kasir-checkout) jadi
// 1 function, biar nggak kepentok limit "12 Serverless Functions" di Vercel
// Hobby plan.
//
// Logic ASLI tiap action SAMA SEKALI NGGAK DIUBAH — cuma dipindah ke folder
// api/_handlers/. File ini cuma nge-rutein request ke handler yang tepat
// berdasarkan query param ?action=.
//
// URL LAMA TETAP JALAN PERSIS SEPERTI SEBELUMNYA — nggak ada satupun kode
// frontend yang perlu diubah. Vercel rewrites (lihat vercel.json) yang
// nerjemahin /api/kasir-login -> /api/kasir?action=login di belakang layar, dst.
//
// Kalau mau manggil langsung (tanpa lewat rewrite lama), formatnya:
//   /api/kasir?action=login
//   /api/kasir?action=pin
//   /api/kasir?action=checkout
//   /api/kasir?action=rekap

import loginHandler from "./_handlers/kasir-login.js";
import pinHandler from "./_handlers/kasir-pin.js";
import checkoutHandler from "./_handlers/kasir-checkout.js";
import rekapHandler from "./_handlers/kasir-rekap.js";

const HANDLERS = {
  login: loginHandler,
  pin: pinHandler,
  checkout: checkoutHandler,
  rekap: rekapHandler,
};

export default async function handler(req, res) {
  const action = req.query.action;
  const target = HANDLERS[action];

  if (!target) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).json({ success: false, message: `Action '${action}' tidak dikenal.` });
  }

  return target(req, res);
}
