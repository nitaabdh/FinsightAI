// /api/data.js — Vercel Serverless Function (dispatcher)
// Gabungan dari 6 endpoint lama (debts, notes, targets, transactions,
// chat-history, transfer-lintas-akun) jadi 1 function, biar nggak kepentok
// limit "12 Serverless Functions" di Vercel Hobby plan.
//
// Logic ASLI tiap resource SAMA SEKALI NGGAK DIUBAH — cuma dipindah ke folder
// api/_handlers/ (prefix underscore = nggak dihitung Vercel sebagai endpoint
// terpisah, sama kayak konvensi api/_lib/). File ini cuma nge-rutein request
// ke handler yang tepat berdasarkan query param ?resource=.
//
// URL LAMA TETAP JALAN PERSIS SEPERTI SEBELUMNYA — nggak ada satupun kode
// frontend yang perlu diubah. Vercel rewrites (lihat vercel.json) yang
// nerjemahin /api/debts -> /api/data?resource=debts di belakang layar, dst.
//
// Kalau mau manggil langsung (tanpa lewat rewrite lama), formatnya:
//   /api/data?resource=debts
//   /api/data?resource=notes&table=notes|cal_notes
//   /api/data?resource=targets
//   /api/data?resource=transactions
//   /api/data?resource=chat-history&mode=personal|umkm
//   /api/data?resource=transfer-lintas-akun

import debtsHandler from "./_handlers/debts.js";
import notesHandler from "./_handlers/notes.js";
import targetsHandler from "./_handlers/targets.js";
import transactionsHandler from "./_handlers/transactions.js";
import chatHistoryHandler from "./_handlers/chat-history.js";
import transferLintasAkunHandler from "./_handlers/transfer-lintas-akun.js";

// sizeLimit dinaikin dari default 1mb -> 5mb: riwayat chat AI Agent (banyak
// pesan sekaligus di-PUT tiap kali) yang tadinya baca body manual (bypass
// limit) sekarang ikut lewat bodyParser bawaan ini.
export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

const HANDLERS = {
  "debts": debtsHandler,
  "notes": notesHandler,
  "targets": targetsHandler,
  "transactions": transactionsHandler,
  "chat-history": chatHistoryHandler,
  "transfer-lintas-akun": transferLintasAkunHandler,
};

export default async function handler(req, res) {
  const resource = req.query.resource;
  const target = HANDLERS[resource];

  if (!target) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).json({ success: false, message: `Resource '${resource}' tidak dikenal.` });
  }

  return target(req, res);
}
