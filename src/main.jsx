import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Uygulama başlamadan önce boş bulut / eski cihaz verisi uyuşmazlığını gider.
// Böylece React effect'leri eski eleme/maç verilerini yeniden yazamaz.
import { supabase } from './supabase'

async function startApplication() {
  const root = createRoot(document.getElementById('root'))
  const tables = ['app_state', 'arena_state', 'fixtures', 'goal_scorers', 'teams']
  try {
    const results = await Promise.all(tables.map((table) =>
      supabase.from(table).select('*', { count: 'exact', head: true })
    ))
    const failure = results.find((result) => result.error)
    if (failure) throw failure.error
    // Bulut takım tablosu boşsa, diğer tablolar dolu olsa bile eski takım önbelleğini kaldır.
    if (results[4].count === 0) localStorage.removeItem('sscup-teams')
    if (results.every((result) => result.count === 0)) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sscup-')) localStorage.removeItem(key)
      }
    }
    root.render(<StrictMode><App /></StrictMode>)
  } catch (error) {
    console.error('Turnuva başlangıç kontrolü başarısız:', error)
    root.render(
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h2>Bulut bağlantısı kontrol edilemedi</h2>
        <p>Eski verilerin yanlışlıkla yüklenmemesi için uygulama başlatılmadı.</p>
        <button onClick={() => window.location.reload()}>Tekrar dene</button>
      </div>
    )
  }
}

startApplication()

// Eski PWA/service-worker cache'i yeni guvenlik ve fikstur kodunu tutmasin.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch (error) {
      console.warn('Eski PWA cache temizligi basarisiz:', error);
    }
  });
}
