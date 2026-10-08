/** The app is meant to run from the Home Screen. Anywhere else (a browser tab) it shows the install page instead. */
export function isInstalled(env: { standalone?: boolean; displayStandalone?: boolean }): boolean {
  return env.standalone === true || env.displayStandalone === true;
}

/** True when the install page should replace the app. Skipped in dev builds and with `?nogate` in the address, so tests, previews and screenshots still open the app. */
export function needsInstallGate(): boolean {
  if (import.meta.env.DEV) return false;
  try {
    if (new URLSearchParams(location.search).has("nogate")) return false;
  } catch {
    /* no location: fall through */
  }
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  const displayStandalone = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  return !isInstalled({ standalone, displayStandalone });
}

/** True when the page runs from the Home Screen, where it is drawn under the status bar: only there does the logo go next to the clock. */
export function inStatusBar(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  const displayStandalone = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  return isInstalled({ standalone, displayStandalone });
}
