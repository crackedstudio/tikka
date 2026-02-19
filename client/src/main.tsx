// Polyfill for 'global' - required by Node.js packages in browser
if (typeof global === "undefined") {
    (window as any).global = globalThis;
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
