import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import { App } from './App'
import { applySharedView } from './store/useBodyStore'

// Offline support applies to production builds only, because it would serve stale files during development.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // When a new version takes over from an old one, files already loaded may be old, so the page loads once more. A first visit
  // has no old version, and does not need this.
  const hadOldVersion = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOldVersion || reloading) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The app works normally without offline support.
    })
  })
}

applySharedView()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
