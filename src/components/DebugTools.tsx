import { Component, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type ErrorInfo } from 'react';
import { clearDebug, debugSnapshot, makeDebugReport, openDebug, recordDebug, subscribeDebug } from '../diagnostics';
import { audioDebugState } from '../audio/decode';
import { useModalFocus } from './useModalFocus';
import './DebugTools.css';
function DebugPanel({ onClose }: { onClose: () => void }) {
  const ref = useModalFocus(onClose);
  const entries = useSyncExternalStore(subscribeDebug, debugSnapshot);
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const report = useMemo(() => makeDebugReport(audioDebugState()), [entries, revision]);
  const refresh = () => setRevision((value) => value + 1);
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tune-god-debug.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('Report downloaded.');
  };
  return <div className="debug-backdrop"><section ref={ref} className="debug-panel" role="dialog" aria-modal="true" aria-labelledby="debug-title">
    <header><h2 id="debug-title">Debug info</h2><button onClick={onClose}>Close</button></header>
    <p>Reproduce the failure, then copy or download this report. Logs stay on this device; reopening keeps recent events. Reports include error text, which may contain file names. No audio is included.</p>
    <div className="debug-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(report); setStatus('Report copied.'); } catch { setStatus('Copy unavailable. Select the report below or download it.'); } }}>Copy report</button><button onClick={download}>Download</button><button onClick={refresh}>Refresh</button><button onClick={() => { clearDebug(); setStatus('Debug log cleared.'); }}>Clear log</button></div>
    <p role="status">{status || `${entries.filter((e) => e.level === 'error').length} errors · v${__APP_VERSION__} · ${__APP_BUILD__}`}</p>
    <textarea className="debug-report" aria-label="Debug report" readOnly value={report} spellCheck={false} />
  </section></div>;
}
export function DebugTools() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const show = () => setOpen(true); window.addEventListener('tunegod:open-debug', show); return () => window.removeEventListener('tunegod:open-debug', show); }, []);
  return open ? <DebugPanel onClose={() => setOpen(false)} /> : null;
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { recordDebug('React crash', `${error.stack ?? error.message}\n${info.componentStack ?? ''}`); }
  render() {
    return this.state.failed ? <div className="debug-crash"><h1>Tune God hit an error</h1><p>Open debug info to save a report before reloading.</p><button onClick={openDebug}>Open debug info</button><button onClick={() => location.reload()}>Reload app</button></div> : this.props.children;
  }
}
