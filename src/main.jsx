import { Component } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("S&S CUP ekran hatası:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", padding: 24, background: "#07101f", color: "white", fontFamily: "system-ui" }}>
        <h2 style={{ color: "#f4c95d" }}>S&S CUP Yönetim</h2>
        <p>Telefon ekranı açılırken bir hata oluştu. Sayfayı bir kez yenileyin.</p>
        <button onClick={() => window.location.reload()} style={{ padding: "12px 18px", borderRadius: 10, border: 0, fontWeight: 800 }}>Yenile</button>
        <pre style={{ marginTop: 18, whiteSpace: "pre-wrap", opacity: .75, fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

// Eski PWA/service-worker önbelleği özellikle telefonda eski build'i tutabiliyor.
// Yeni uygulama açıldıktan sonra kayıtları ve Cache Storage'ı güvenli şekilde temizle.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch (error) {
      console.warn("Eski PWA cache temizliği başarısız:", error);
    }
  });
}
