# FinSight AI 💰
**Platform Keuangan Cerdas dengan AI Agent**

---

## 🚀 Cara Menjalankan

### 1. Install dependencies
```bash
npm install
```

### 2. Jalankan di browser
```bash
npm start
```
Buka di browser: `http://localhost:3000`

---

## 📁 Struktur Folder

```
src/
├── context/
│   └── AuthContext.jsx      ← Manajemen auth & sesi user
├── components/
│   └── ProtectedRoute.jsx   ← Penjaga halaman (wajib login)
├── pages/
│   ├── LandingPage.jsx/.css ← Halaman utama (pilih mode)
│   ├── AuthPage.jsx/.css    ← Login & Register (2 mode)
│   ├── DashboardUMKM.jsx    ← Dashboard mode UMKM
│   └── DashboardPersonal.jsx← Dashboard mode Pribadi
├── App.jsx                  ← Routing utama
├── index.js                 ← Entry point
└── index.css                ← Design system & global styles
```

---

## 📅 Progress Pembangunan

### ✅ Minggu 1 — Fondasi
- [x] Struktur folder & design system
- [x] Landing page dengan pilih mode
- [x] Register & Login (UMKM & Pribadi terpisah)
- [x] Auth context + localStorage
- [x] Protected routes
- [x] Routing dasar

### 🔄 Minggu 2 — Dashboard & CRUD (Coming Soon)
- [ ] Dashboard UMKM lengkap
- [ ] Dashboard Pribadi lengkap
- [ ] Form catat transaksi
- [ ] Riwayat & filter transaksi
- [ ] Grafik dengan Chart.js

### ⏳ Minggu 3 — AI Agent
- [ ] Integrasi Claude API
- [ ] Chat UI
- [ ] Function Calling / Tool Use

### ⏳ Minggu 4 — Telegram Bot
- [ ] Setup Telegraf.js
- [ ] Commands dasar
- [ ] Koneksi ke data

### ⏳ Minggu 5 — Polish
- [ ] Responsive design
- [ ] Export PDF/CSV
- [ ] Bug fixing

### ⏳ Minggu 6 — Deploy
- [ ] Deploy ke Vercel
- [ ] Testing akhir
- [ ] Persiapan presentasi

---

## 🔧 Teknologi
- **Frontend**: React 18 + React Router v6
- **Storage**: localStorage (migrasi ke Firebase di masa depan)
- **AI**: Claude API (Haiku) — *akan ditambahkan Minggu 3*
- **Bot**: Telegraf.js — *akan ditambahkan Minggu 4*
- **Deploy**: Vercel

---

## 💡 Catatan untuk Migrasi ke Firebase
Semua operasi data ada di `src/context/AuthContext.jsx` bagian `storage`.
Untuk migrasi, cukup ganti implementasi fungsi `getUser`, `setUser`, `getUsers`, `saveUsers`
tanpa perlu mengubah komponen lainnya.
