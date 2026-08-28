import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const isDesktopManager = (() => {
  try {
    const ua = navigator?.userAgent || ''
    return /Electron/i.test(ua) || window.location.protocol === 'file:'
  } catch {
    return false
  }
})()

// ACIL GUVENLIK: Web/PWA daima salt-okunur Canli Takip.
// Eski mobil admin yetkisini de temizle. EXE bundan etkilenmez.
if (!isDesktopManager) {
  try {
    localStorage.removeItem('sscup-mobile-admin-authorized')
    const params = new URLSearchParams(window.location.search)
    const page = params.get('page')
    if (page !== 'takip' && page !== 'public') {
      window.history.replaceState({}, '', `${window.location.pathname}?page=takip${window.location.hash || ''}`)
    }
  } catch (error) {
    console.warn('Web guvenlik kilidi uygulanamadi:', error)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
