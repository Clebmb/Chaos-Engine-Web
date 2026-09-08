import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './themes.css'
import App from './App.tsx'
import { installTooltipClamp } from './lib/tooltipClamp'

// Keep every `?` info bubble inside the viewport, app-wide.
installTooltipClamp()

// Installable, offline-capable PWA. Registered only in production builds
// so the dev server's HMR traffic never fights the cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed', err)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
