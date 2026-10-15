import { installDiagnostics } from './diagnostics'
import { AppErrorBoundary, DebugTools } from './components/DebugTools'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-semi-condensed/500.css'
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource/barlow-semi-condensed/700.css'
import '@fontsource/silkscreen/400.css'
import '@fontsource/silkscreen/700.css'
import './index.css'
import App from './App.tsx'
import { InstallGate } from './components/InstallGate.tsx'
import { inStatusBar, needsInstallGate } from './installGate.ts'

installDiagnostics();

// Belt and braces for iOS Safari, which can still scroll, rubber-band or pinch-zoom a page that is
// `overflow: hidden`: cancel page-level touch moves and pinch gestures outside scrollable panels.
// Pads, sliders and keys continue to use pointer events.
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as Element | null)?.closest?.(".palette-modal__list, .swap-list__rows, .chop__scroll, .menu, .sample-library, .folder-types .sample-library__rows, .scan-report, .debug-report")) e.preventDefault();
  },
  { passive: false },
);
// iOS shows its magnifier and selection handles on a press-and-hold of anything it can treat as text, whatever user-select says. Selection is cancelled
// everywhere but in text fields and the report panels, and a touch that starts on a pad is taken over (pads use pointer events, so nothing is lost), which
// also stops iOS's own long-press recognisers from starting on the pads.
const TEXT_AREAS = "input, textarea, .scan-report, .debug-report";
document.addEventListener("selectstart", (e) => {
  if (!(e.target as Element | null)?.closest?.(TEXT_AREAS) && !(e.target instanceof Text && e.target.parentElement?.closest(TEXT_AREAS))) e.preventDefault();
});
document.addEventListener(
  "touchstart",
  (e) => {
    if ((e.target as Element | null)?.closest?.(".pads .pad, .seq .pad, .seq-pad")) e.preventDefault();
  },
  { passive: false },
);
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DebugTools />
    {needsInstallGate() ? (
      <InstallGate />
    ) : (
      <>
        <AppErrorBoundary><App /></AppErrorBoundary>
        {inStatusBar() && <img className="status-mark" src="/logo-mark-outline.png" alt="" aria-hidden="true" />}
      </>
    )}
  </StrictMode>,
)
