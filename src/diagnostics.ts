/** Bounded, device-local diagnostics. Never stores audio, project contents or app settings. */
export interface DebugEntry { time: string; level: 'info' | 'error'; source: string; message: string }
const KEY = 'tune-god:debug:v1';
const LIMIT = 80;
const listeners = new Set<() => void>();
export function debugText(value: unknown): string {
  let text: string;
  try { text = value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ''}` : String(value); }
  catch { text = '[unreadable error]'; }
  return text.replace(/https?:\/\/[^\s)]+/g, (url) => url.split(/[?#]/)[0])
    .replace(/(bearer\s+|(?:token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 2000);
}
let entries: DebugEntry[] = [];
try {
  const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  if (Array.isArray(saved)) entries = saved.filter((e) => e && typeof e.time === 'string' && typeof e.source === 'string' && typeof e.message === 'string' && ['info', 'error'].includes(e.level)).slice(-LIMIT).map((e) => ({ time: e.time.slice(0, 40), level: e.level, source: debugText(e.source), message: debugText(e.message) }));
} catch { /* Storage may be blocked; in-memory reporting still works. */ }
function publish() {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* Never let diagnostics break the app. */ }
  listeners.forEach((listener) => listener());
}
export function recordDebug(source: string, value: unknown, level: DebugEntry['level'] = 'error') {
  entries = [...entries, { time: new Date().toISOString(), source: debugText(source), message: debugText(value), level }].slice(-LIMIT);
  publish();
}
export const subscribeDebug = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const debugSnapshot = () => entries;
export function clearDebug() { entries = []; publish(); }
export function openDebug() { window.dispatchEvent(new Event('tunegod:open-debug')); }
let installed = false;
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    recordDebug('Browser error', event.error ?? event.message ?? 'A resource failed to load');
  }, true);
  window.addEventListener('unhandledrejection', (event) => recordDebug('Unhandled promise', event.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => { recordDebug('Console error', args.map(debugText).join(' ')); original(...args); };
  document.addEventListener('visibilitychange', () => recordDebug('App visibility', document.visibilityState, 'info'));
  window.addEventListener('online', () => recordDebug('Network', 'Online', 'info'));
  window.addEventListener('offline', () => recordDebug('Network', 'Offline', 'info'));
  recordDebug('Session started', `v${__APP_VERSION__} · ${__APP_BUILD__}`, 'info');
}
export function watchWorker(worker: Worker, name: string): Worker {
  worker.addEventListener('error', (event) => recordDebug(`${name} worker`, event.message));
  worker.addEventListener('messageerror', () => recordDebug(`${name} worker`, 'Could not deserialize worker response'));
  return worker;
}
export function makeDebugReport(state: Record<string, unknown>): string {
  return JSON.stringify({ app: 'Tune God', version: __APP_VERSION__, build: __APP_BUILD__, capturedAt: new Date().toISOString(), environment: { browser: navigator.userAgent, online: navigator.onLine, installed: (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches, viewport: `${innerWidth} × ${innerHeight}`, dpr: devicePixelRatio, visibility: document.visibilityState, serviceWorker: navigator.serviceWorker?.controller ? 'Controlled' : 'Not controlled' }, state, entries }, null, 2);
}
