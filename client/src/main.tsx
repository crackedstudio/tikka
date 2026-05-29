// Polyfill for 'global' - required by Node.js packages in browser
if (typeof global === "undefined") {
  (window as any).global = globalThis;
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ui/ErrorBoundary.tsx'
import { HelmetProvider } from 'react-helmet-async'
import './i18n'

// Initialize theme before rendering to prevent FOUC
const savedTheme = localStorage.getItem("tikka-theme");
if (
  savedTheme === "dark" ||
  (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
)

