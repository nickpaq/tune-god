// One place for haptic feedback. Progressive enhancement only: iOS Safari has no Vibration API, so there it does nothing (a Capacitor wrapper can
// install a native handler with `setHapticHandler`). A failure here is swallowed and never reaches the audio or the control that asked.
export type HapticKind = "light" | "medium" | "heavy" | "snap" | "success";

type Handler = (kind: HapticKind) => void;

/** Vibration patterns in ms for the browser fallback. */
export const VIBRATION: Record<HapticKind, number | number[]> = {
  light: 8,
  snap: 5,
  medium: 18,
  heavy: [24, 30, 24],
  success: [12, 40, 12],
};

const browserHandler: Handler = (kind) => {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(VIBRATION[kind]);
};

let handler: Handler = browserHandler;

/** Replaces the browser fallback (for example with Capacitor's Haptics plugin); null restores it. */
export function setHapticHandler(next: Handler | null): void {
  handler = next ?? browserHandler;
}

export function haptic(kind: HapticKind): void {
  try {
    handler(kind);
  } catch {
    // haptics are optional
  }
}
