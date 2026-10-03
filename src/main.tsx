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

// Installed on iOS with a translucent status bar, the viewport units (and innerHeight) come out one status bar short, so
// the chassis ends early and the transport row is clipped. `navigator.standalone` is iOS-only; there the screen is the
// whole app, so size to it. iOS doesn't swap screen.width/height on rotation, so pick the side by orientation.
if ((navigator as Navigator & { standalone?: boolean }).standalone) {
  const fit = () => {
    const portrait = matchMedia("(orientation: portrait)").matches;
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    const h = Math.max(window.innerHeight, portrait ? long : short);
    document.documentElement.style.setProperty("--app-h", `${h}px`);
  };
  fit();
  addEventListener("resize", fit);
  addEventListener("orientationchange", fit);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
