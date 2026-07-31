import { Component } from "react";

// Kalau ada komponen di bawah pohon ini yang throw error yang nggak ketangkep
// (misal ngakses field yang undefined, dsb), React defaultnya bakal nge-unmount
// SELURUH tree dan nyisain layar putih kosong — nggak enak banget kalau kejadian
// pas lagi demo/pameran. ErrorBoundary ini nangkep error itu dan nampilin pesan
// yang jelas + tombol reload, daripada blank screen tanpa penjelasan.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Ada error yang nggak ketangkep:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "1rem",
          padding: "2rem", textAlign: "center", background: "#0b0b0f", color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Ada yang salah 😅</h2>
          <p style={{ margin: 0, color: "#a1a1aa", maxWidth: "360px", fontSize: "14px" }}>
            Halaman ini ketemu error yang nggak terduga. Data kamu aman, coba muat ulang halamannya.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.7rem 1.4rem", borderRadius: "8px", border: "none",
              background: "#e08e0b", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px",
            }}
          >
            Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
