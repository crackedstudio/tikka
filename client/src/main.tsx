// Polyfill for 'global' - required by Node.js packages in browser
if (typeof global === "undefined") {
  (window as any).global = globalThis;
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ui/ErrorBoundary.tsx'
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

// Load Vercel observability only in production builds, not in test or dev.
// import.meta.env.PROD is false during `vite dev` and vitest runs.
const isProd = import.meta.env.PROD && import.meta.env.MODE !== 'test';

const analyticsModule = isProd ? await import('@vercel/analytics/react') : null;
const speedInsightsModule = isProd ? await import('@vercel/speed-insights/react') : null;
const Analytics = analyticsModule?.Analytics ?? null;
const SpeedInsights = speedInsightsModule?.SpeedInsights ?? null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      {Analytics && <Analytics />}
      {SpeedInsights && <SpeedInsights />}
    </ErrorBoundary>
  </StrictMode>,
)

