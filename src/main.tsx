import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Belt and braces for iOS Safari, which can still scroll, rubber-band or pinch-zoom a page that is
// `overflow: hidden`: cancel page-level touch moves and pinch gestures. The palette list and classifier drawer are the
// only place that legitimately scrolls; everything else (pads, sliders, keys) uses pointer events.
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.(".palette-modal__list, .drawer__list")) e.preventDefault();
  },
  { passive: false },
);
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
