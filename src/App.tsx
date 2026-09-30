import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "./components/Keyboard";
import { PadPanel, type Pad } from "./components/PadPanel";
import { decodeNative, monoFromChannelData } from "./audio/decode";
import {
  parseKoalaProject,
  koalaPadToFile,
  isKoalaFile,
  type ParsedKoalaProject,
} from "./audio/koalaProject";
import { setReferencePitch, startPad, type PadHandle, type PadMode } from "./audio/player";
import { buildTunedKoala, downloadBlob, type TunedSample } from "./audio/exportProject";
import { applyGainDb } from "./audio/gain";
import { balancedSpread } from "./audio/spread";
import { categoryLabel, isTunedCategory, CATEGORIES, type CategoryId } from "./audio/classify";
import { colorFor, paletteById, textColorOn, DEFAULT_PALETTE_ID } from "./audio/palettes";
import { emptyPadInBank, movePad, nextEmptyPad, removePad } from "./audio/padMoves";
import { BUS_NAMES, CATEGORY_BUS } from "./audio/routing";
import { PalettePicker } from "./components/PalettePicker";
import { LayoutPicker } from "./components/LayoutPicker";
import { arrangeFingerDrumming } from "./audio/fingerDrumming";
import { FINGER_LAYOUTS, layoutById, layoutSlotAt } from "./audio/fingerLayouts";
import { makePlaceholderPad, placeholderColor } from "./audio/placeholderPads";
import { isDrumCategory } from "./audio/drumRoles";
import { roleColors } from "./audio/roleColors";
import { clearProjectFile, loadProjectFile, loadState, saveProjectFile, saveState, type SavedPad } from "./storage";
import { A4_REFERENCE_RANGE, clampA4Reference, referenceOffsetSemitones, semitonesToRatio } from "./audio/theory";
import { nextAnalysisWorker, getRenderWorker } from "./workers/workerClient";
import background from "./assets/koala-empty.jpg";
import "./App.css";

// Everything is positioned in the screenshot's own pixel space (919 x 1999)
// and converted to percentages, so the overlay scales with the background.
const W = 919;
const H = 1999;
const box = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / W) * 100}%`,
  top: `${(y / H) * 100}%`,
  width: `${(w / W) * 100}%`,
  height: `${(h / H) * 100}%`,
});

// Every pane shares one left/right edge, and the pad grid spans exactly that width.
const LEFT = 20;
const RIGHT = 899;
const CONTENT_W = RIGHT - LEFT;
const PAD_GAP = 17;
const PAD_W = (CONTENT_W - 3 * PAD_GAP) / 4;
const PAD_COLS = [0, 1, 2, 3].map((c) => LEFT + c * (PAD_W + PAD_GAP));
const PAD_ROWS = [991, 1198, 1406, 1613];
const PAD_H = 190;
const BANKS = ["A", "B", "C", "D"];
// Bottom row: undo/redo circles at the left, banks in the middle, Tone and Export (same size) at the right.
const BAR_Y = 1836;
const BAR_H = 80;
const BAR_GAP = 17;
const UNDO_X = LEFT;
const REDO_X = UNDO_X + BAR_H + BAR_GAP;
const BTN_W = 158;
const EXPORT_X = RIGHT - BTN_W;
const TONE_X = EXPORT_X - BAR_GAP - BTN_W;
const BANKS_X = REDO_X + BAR_H + BAR_GAP;
const BANKS_W = TONE_X - BAR_GAP - BANKS_X;
/** How many edits undo can step back through. */
const MAX_HISTORY = 100;
/** Slider drags on the same control within this window count as one undo step. */
const COALESCE_MS = 1000;
/** A pad press that travels this far (CSS px) becomes a drag instead of a hit. */
const DRAG_THRESHOLD_PX = 12;
/** Hovering a bank button this long while dragging opens the all-pads view. */
const DWELL_MS = 350;

/** What undo/redo restores: the pad data plus the key it was tuned to. */
interface Snapshot {
  pads: Record<number, Pad>;
  keyPc: number | null;
  tunedTarget: number | null;
  layout: LayoutState;
}

/** The finger-drumming layout: whether it is applied, which one, and where every sound sat before (original slot -> slot). */
interface LayoutState {
  on: boolean;
  id: string;
  pre: Record<number, number>;
}

const LAYOUT_ON_WARNING =
  "Your pads will be rearranged into the finger drumming layout: drums on banks A and B, everything else on C and D, and silent placeholder pads filling any gaps. Recorded patterns are corrected to follow their pads, so they will still play back as expected. You can undo this. Continue?";
const LAYOUT_SWITCH_WARNING =
  "Switching layouts rearranges your pads again, including any moves you made since applying the current layout. Recorded patterns are corrected to follow their pads and will still play back as expected. Continue?";
const LAYOUT_OFF_WARNING =
  "Turning this off removes the placeholder pads and puts every sound back where it was before the layout was applied. You will lose the layout and any changes you made since. Continue?";
/** Small padding: the loudest peak in any exported file, so a pad knob at 0 dB plays at this level. */
const FILE_CEILING_DB = -1;
/** Pad volume knob value for a dB level: plain linear amplitude (checked against a Koala project: -60 dB = 0.001, -6 dB = 0.501, 0 dB = 1, +6 dB = 1.995, -inf = 0). */
const volFromDb = (db: number) => 10 ** (db / 20);
/** Widest spread pan, in percent either side of centre. */
const MAX_SPREAD_PERCENT = 40;

/**
 * Total semitone shift for a pad: the shortest move (never more than 6 up or
 * down) from its exact detected pitch onto the target note, plus the manual trim.
 */
function shiftFor(pad: Pad, target: number | null, a4: number): number {
  if (!pad.tune) return 0;
  let base = 0;
  if (target !== null && pad.detectedMidi != null) {
    base = (((target - pad.detectedMidi) % 12) + 12) % 12;
    if (base > 6) base -= 12;
    // The detected pitch is measured against A440; a different A4 reference moves the target note with it.
    base += referenceOffsetSemitones(a4);
  }
  return base + pad.semis + pad.cents / 100;
}

/** Untuned sounds and drums up to this long play whole when tapped; longer ones play only while held. */
const ONE_SHOT_MAX_SECONDS = 2;

/**
 * Only tuned pitched sounds loop while held, which is what makes the tuning audible. Everything
 * else plays once: a short sound plays to its end, a long one (a loop, FX, a vocal) stops on release.
 */
function padMode(pad: Pad): PadMode {
  const drum = pad.category === "kick" || pad.category === "snare" || pad.category === "hat" || pad.category === "perc";
  if (pad.tune && !drum) return "loop";
  const seconds = (pad.channelData[0]?.length ?? 0) / pad.sampleRate;
  return seconds <= ONE_SHOT_MAX_SECONDS ? "oneShot" : "hold";
}

/** Older saves may hold category ids that no longer exist. */
function validCategory(id: CategoryId | undefined): CategoryId {
  return CATEGORIES.some((c) => c.id === id) ? (id as CategoryId) : "other";
}

/** Without normalize, scales down (never up) only if a resampled peak passes FILE_CEILING_DB. */
function limitPeak(channelData: Float32Array[]): Float32Array[] {
  const ceiling = 10 ** (FILE_CEILING_DB / 20);
  let peak = 0;
  for (const data of channelData) for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak <= ceiling) return channelData;
  const gain = ceiling / peak;
  return channelData.map((data) => data.map((v) => v * gain));
}

/** A pad's default Tune state: the user's manual choice if locked, else on for bass/melodic with a detected pitch. */
function tuneDefault(locked: boolean | undefined, current: boolean, category: CategoryId | undefined, detectedMidi: number | null | undefined, target: number | null): boolean {
  if (locked) return current;
  return target !== null && detectedMidi != null && isTunedCategory(category);
}

function App() {
  // Read once: what the previous visit left behind.
  const saved = useRef(loadState()).current;
  const [pads, setPads] = useState<Record<number, Pad>>({});
  const [bank, setBank] = useState(saved.bank ?? 0);
  const [selected, setSelected] = useState<number | null>(saved.selected ?? null);
  const [keyPc, setKeyPc] = useState<number | null>(saved.keyPc ?? null);
  const [tunedTarget, setTunedTarget] = useState<number | null>(saved.tunedTarget ?? null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  /** "done/total" while an export is rendering, so a long high-quality render shows progress. */
  const [exportProgress, setExportProgress] = useState("");
  const [normalize, setNormalize] = useState(saved.normalize ?? false);
  const [spread, setSpread] = useState(saved.spread ?? false);
  /** Pre-rendered normalized audio per pad (by original slot, so it follows a moved pad); only used for playback while Normalize is on. */
  const [normalizedData, setNormalizedData] = useState<Record<number, Float32Array[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoColor, setAutoColor] = useState(saved.autoColor ?? false);
  const [routeBuses, setRouteBuses] = useState(saved.routeBuses ?? false);
  const [paletteId, setPaletteId] = useState(saved.paletteId ?? DEFAULT_PALETTE_ID);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutState>({ on: false, id: layoutById(saved.layoutId).id, pre: {} });
  const [toneOn, setToneOn] = useState(saved.toneOn ?? false);
  const [a4, setA4] = useState(clampA4Reference(saved.a4 ?? 440));
  const [a4Text, setA4Text] = useState(String(clampA4Reference(saved.a4 ?? 440)));
  /** Ghost under the finger while a pad is being dragged, and the drop target under it ("kind:index"). */
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);
  const [hover, setHover] = useState("");
  /** The all-pads view that opens when a drag dwells over the bank buttons. */
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ from: number; x0: number; y0: number; active: boolean; hover: string; timer: number | null } | null>(null);
  const releasePad = useRef<Map<number, PadHandle>>(new Map());
  const tunedTargetRef = useRef<number | null>(saved.tunedTarget ?? null);
  /** Per-pad choices from the last visit, applied as each pad finishes analysis. */
  const restorePads = useRef<Record<number, SavedPad>>(saved.pads ?? {});
  const loadToken = useRef(0);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastEdit = useRef({ key: "", time: 0 });
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistorySize({ undo: past.current.length, redo: future.current.length });
  const latest = useRef<Snapshot>({ pads: {}, keyPc: null, tunedTarget: null, layout });
  latest.current = { pads, keyPc, tunedTarget, layout };
  const projectRef = useRef<ParsedKoalaProject | null>(null);

  const loadProject = useCallback(async (file: File, restore = false) => {
    const token = ++loadToken.current;
    setLoading(true);
    try {
      const project = await parseKoalaProject(file);
      if (token !== loadToken.current) return;
      projectRef.current = project;
      past.current = [];
      future.current = [];
      lastEdit.current = { key: "", time: 0 };
      setHistorySize({ undo: 0, redo: 0 });
      // A project reopened with its layout on gets its silent placeholder pads back straight away.
      const layoutOn = restore && !!saved.layoutOn;
      setPads(
        layoutOn ? Object.fromEntries((saved.layoutPlaceholders ?? []).map((ph) => [ph.index, makePlaceholderPad(ph)])) : {},
      );
      setLayout((l) => ({ on: layoutOn, id: layoutById(layoutOn ? saved.layoutId : l.id).id, pre: layoutOn ? (saved.layoutPre ?? {}) : {} }));
      setNormalizedData({});
      if (!restore) {
        setSelected(null);
        setKeyPc(null);
        setTunedTarget(null);
        tunedTargetRef.current = null;
        restorePads.current = {};
        setBank(Math.min(3, Math.floor(project.pads[0].pad / 16)));
        void saveProjectFile(file);
        saveState({ pads: {} });
      }
      setProjectName(project.originalName.replace(/\.koala$/i, ""));

      const slots = project.pads.filter(
        (p) => p.pad >= 0 && p.pad < 64 && !(restore && restorePads.current[p.pad]?.deleted),
      );
      setAnalyzing(slots.length);
      for (const ref of slots) {
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        // Pads the user moved on a previous visit go back where they were left.
        const at = restore ? restorePads.current[ref.pad]?.position ?? ref.pad : ref.pad;
        const pad: Pad = {
          index: at,
          origIndex: ref.pad,
          sampleId: ref.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          tune: false,
          semis: 0,
          cents: 0,
        };
        setPads((prev) => ({ ...prev, [at]: pad }));
        // Analysis runs on a worker while the next pad decodes.
        nextAnalysisWorker()
          .analyze(monoFromChannelData(pad.channelData), pad.sampleRate, ref.fileName)
          .catch(() => ({ midi: null, category: "other" as const, role: undefined, centroid: undefined }))
          .then(({ midi: detectedMidi, category, role, centroid }) => {
            if (token !== loadToken.current) return;
            setPads((prev) => {
              const remembered = restorePads.current[ref.pad];
              const cur = prev[at];
              return {
                ...prev,
                [at]: {
                  ...cur,
                  detectedMidi,
                  drumRole: role,
                  centroid,
                  ...(remembered
                    ? {
                        tune: remembered.tune,
                        tuneLocked: remembered.tuneLocked,
                        semis: remembered.semis,
                        cents: remembered.cents,
                        category: validCategory(remembered.category),
                      }
                    : { category }),
                  tune: tuneDefault(
                    remembered?.tuneLocked || cur.tuneLocked,
                    remembered?.tuneLocked ? remembered.tune : cur.tune,
                    remembered ? validCategory(remembered.category) : category,
                    detectedMidi,
                    tunedTargetRef.current,
                  ),
                },
              };
            });
            setAnalyzing((n) => n - 1);
          });
      }
    } catch (err) {
      // Not a usable project: stay on the drop screen rather than showing an error.
      console.error(err);
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, [saved]);

  // Reopen the last project, if there was one.
  useEffect(() => {
    void loadProjectFile().then((file) => {
      if (file) void loadProject(file, true);
    });
  }, [loadProject]);

  useEffect(() => {
    saveState({ normalize, spread, autoColor, routeBuses, paletteId, toneOn, a4, bank, selected, keyPc, tunedTarget });
  }, [normalize, spread, autoColor, routeBuses, paletteId, toneOn, a4, bank, selected, keyPc, tunedTarget]);

  // Pad choices are only saved once every pad has loaded, so a half-restored grid never overwrites them.
  useEffect(() => {
    if (analyzing > 0 || loading || Object.keys(pads).length === 0) return;
    const out: Record<number, SavedPad> = {};
    for (const p of Object.values(pads)) {
      if (p.placeholder) continue;
      out[p.origIndex] = {
        tune: p.tune,
        tuneLocked: p.tuneLocked,
        semis: p.semis,
        cents: p.cents,
        category: p.category,
        position: p.index,
      };
    }
    // Sounds the user deleted stay deleted when the project is reopened.
    for (const ref of projectRef.current?.pads ?? []) {
      if (!(ref.pad in out)) out[ref.pad] = { tune: false, semis: 0, cents: 0, deleted: true };
    }
    restorePads.current = out;
    saveState({
      pads: out,
      layoutId: layout.id,
      layoutOn: layout.on,
      layoutPre: layout.pre,
      layoutPlaceholders: Object.values(pads).flatMap((p) => (p.placeholder ? [{ index: p.index, ...p.placeholder }] : [])),
    });
  }, [pads, analyzing, loading, layout]);

  /** Unloads the project and forgets it, so the app opens on the drop screen next time. Settings stay. */
  const clearProject = () => {
    if (!window.confirm("Clear the loaded project? Your tuning edits for it will be lost.")) return;
    loadToken.current++; // abandons any load or analysis still in flight
    for (const handle of releasePad.current.values()) handle.release();
    releasePad.current.clear();
    projectRef.current = null;
    past.current = [];
    future.current = [];
    lastEdit.current = { key: "", time: 0 };
    restorePads.current = {};
    setHistorySize({ undo: 0, redo: 0 });
    setPads({});
    setLayout((l) => ({ ...l, on: false, pre: {} }));
    setNormalizedData({});
    setSelected(null);
    setKeyPc(null);
    setTunedTarget(null);
    tunedTargetRef.current = null;
    setProjectName(null);
    setAnalyzing(0);
    setLoading(false);
    setExpanded(false);
    setBank(0);
    saveState({ pads: {}, layoutOn: false, layoutPre: {}, layoutPlaceholders: [] });
    void clearProjectFile();
    setMenuOpen(false);
  };

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = Array.from(files ?? []).find(isKoalaFile);
    if (file) void loadProject(file);
  };

  /**
   * Call just before a user edit: saves the current state as an undo step. Edits sharing a `key`
   * within COALESCE_MS (a slider drag) collapse into one step. Not recorded while pads are still
   * loading, so undo can never roll back the analysis results.
   */
  const recordEdit = (key = "") => {
    if (analyzing > 0) return;
    const now = Date.now();
    const same = key !== "" && lastEdit.current.key === key && now - lastEdit.current.time < COALESCE_MS;
    lastEdit.current = { key, time: now };
    if (same) return;
    past.current.push(latest.current);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    syncHistory();
  };

  const restore = (snap: Snapshot) => {
    setPads(snap.pads);
    setLayout((l) => ({ ...snap.layout, id: snap.layout.on ? snap.layout.id : l.id }));
    setKeyPc(snap.keyPc);
    setTunedTarget(snap.tunedTarget);
    tunedTargetRef.current = snap.tunedTarget;
    lastEdit.current = { key: "", time: 0 };
    syncHistory();
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev || analyzing > 0) return;
    future.current.push(latest.current);
    restore(prev);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next || analyzing > 0) return;
    past.current.push(latest.current);
    restore(next);
  };

  /** Every pad rearranged into `layoutId`, with placeholder pads in the gaps. Earlier placeholders are dropped first. */
  const arrangeInto = (cur: Record<number, Pad>, layoutId: string): Record<number, Pad> => {
    const real = Object.values(cur)
      .filter((p) => !p.placeholder)
      .sort((a, b) => a.index - b.index);
    const { positions, placeholders } = arrangeFingerDrumming(
      real.map((p) => ({ key: p.origIndex, category: p.category, role: p.drumRole, midi: p.detectedMidi, centroid: p.centroid })),
      layoutById(layoutId),
    );
    const next: Record<number, Pad> = {};
    for (const p of real) {
      const index = positions.get(p.origIndex);
      if (index !== undefined) next[index] = { ...p, index };
    }
    for (const ph of placeholders) next[ph.index] = makePlaceholderPad(ph);
    return next;
  };

  /** Applies a layout as one undo step, remembering where the sounds were so turning it off can put them back. */
  const applyLayout = (id: string) => {
    const cur = latest.current;
    const pre = cur.layout.on
      ? cur.layout.pre
      : Object.fromEntries(Object.values(cur.pads).filter((p) => !p.placeholder).map((p) => [p.origIndex, p.index]));
    recordEdit();
    setPads(arrangeInto(cur.pads, id));
    setLayout({ on: true, id, pre });
    setSelected(null);
    setBank(0);
  };

  /** Removes the placeholder pads and returns every remaining sound to its pre-layout slot. */
  const removeLayout = () => {
    const cur = latest.current;
    recordEdit();
    const next: Record<number, Pad> = {};
    for (const p of Object.values(cur.pads)) {
      if (p.placeholder) continue;
      const wanted = cur.layout.pre[p.origIndex] ?? p.index;
      const index = next[wanted] ? (nextEmptyPad(next, 0) ?? wanted) : wanted;
      next[index] = { ...p, index };
    }
    setPads(next);
    setLayout((l) => ({ ...l, on: false, pre: {} }));
    setSelected(null);
    setBank(0);
  };

  const toggleLayout = (on: boolean) => {
    if (on) {
      if (window.confirm(LAYOUT_ON_WARNING)) applyLayout(layout.id);
    } else if (window.confirm(LAYOUT_OFF_WARNING)) removeLayout();
  };

  const chooseLayout = (id: string) => {
    if (!layout.on) setLayout((l) => ({ ...l, id }));
    else if (id !== layout.id && window.confirm(LAYOUT_SWITCH_WARNING)) applyLayout(id);
  };

  const patchPad = (index: number, patch: Partial<Pad>) => {
    recordEdit("semis" in patch || "cents" in patch ? `${index}:trim` : "");
    setPads((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  };

  const pressPad = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    setSelected(index);
    if (pad.placeholder) return; // silent: nothing to play
    releasePad.current.get(index)?.release();
    releasePad.current.set(
      index,
      startPad(
        index,
        (normalize && normalizedData[pad.origIndex]) || pad.channelData,
        pad.sampleRate,
        shiftFor(pad, tunedTarget, a4),
        pad.tune && toneOn ? keyPc : null,
        padMode(pad),
      ),
    );
  };

  /**
   * Previews what Koala will play: each pad's loudness-normalized audio at its mix knob level.
   * Measured on the untuned audio, so it can differ from the export by a fraction of a dB where tuning changes a pad.
   */
  const normalizeNow = async () => {
    setNormalizing(true);
    try {
      const list = Object.values(pads).filter((p) => !p.placeholder);
      const { gainDb, knobDb } = await getRenderWorker().balance(
        list.map((p) => ({ channelData: p.channelData, sampleRate: p.sampleRate, category: p.category })),
        FILE_CEILING_DB,
      );
      setNormalizedData(
        Object.fromEntries(list.map((p, i) => [p.origIndex, applyGainDb(p.channelData, gainDb[i] + knobDb[i])])),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setNormalizing(false);
    }
  };

  /** Which drop target ("kind:index") is under the point, if any. */
  const targetAt = (x: number, y: number): string => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    return el ? `${el.dataset.drop}:${el.dataset.index ?? ""}` : "";
  };

  const endDrag = () => {
    if (dragRef.current?.timer) clearTimeout(dragRef.current.timer);
    dragRef.current = null;
    setDrag(null);
    setExpanded(false);
    setHover("");
  };

  /** Applies a drop: onto a pad or cell (move/swap), a bank button or "unused" (first free pad), or the trash. */
  const dropOn = (from: number, target: string) => {
    const [kind, rest] = target.split(":");
    const cur = latest.current.pads;
    let next = cur;
    let dest: number | null = null;
    if (kind === "pad" || kind === "cell") dest = Number(rest);
    else if (kind === "bank") dest = emptyPadInBank(cur, Number(rest));
    else if (kind === "unused") dest = nextEmptyPad(cur, bank);
    if (kind === "trash") next = removePad(cur, from);
    else if (dest !== null) next = movePad(cur, from, dest);
    if (next === cur) return;
    recordEdit();
    setPads(next);
    if (kind === "trash") {
      setSelected((s) => (s === from ? null : s));
    } else if (dest !== null) {
      setSelected(dest);
      setBank(Math.floor(dest / 16));
    }
  };

  const onPadDown = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { from: index, x0: e.clientX, y0: e.clientY, active: false, hover: "", timer: null };
    pressPad(index);
  };

  const onPadMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      if (!pads[d.from] || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      liftPad(d.from);
    }
    setDrag({ from: d.from, x: e.clientX, y: e.clientY });
    const target = targetAt(e.clientX, e.clientY);
    if (target === d.hover) return;
    d.hover = target;
    setHover(target);
    if (d.timer) clearTimeout(d.timer);
    d.timer = target.startsWith("bank:") ? window.setTimeout(() => setExpanded(true), DWELL_MS) : null;
  };

  const onPadUp = (index: number) => {
    const d = dragRef.current;
    if (d?.active) dropOn(d.from, d.hover);
    else liftPad(index);
    endDrag();
  };

  const liftPad = (index: number) => {
    releasePad.current.get(index)?.release();
    releasePad.current.delete(index);
  };

  // Slider and key changes retune any pad that is currently held, so tuning is audible live.
  useEffect(() => {
    for (const [index, handle] of releasePad.current) {
      const pad = pads[index];
      if (pad) handle.setShift(shiftFor(pad, tunedTarget, a4));
    }
  }, [pads, tunedTarget, a4]);

  useEffect(() => setReferencePitch(a4), [a4]);

  const toggleAutoColor = (on: boolean) => {
    if (on && !window.confirm("Auto-color pads will replace the existing pad colors and color labels in your project when you export. Continue?")) return;
    setAutoColor(on);
  };

  /**
   * Picking a key retargets every pad. Pads whose Tune switch the user has set by hand keep it,
   * and every pad keeps its semitone/cents trim, so manual corrections survive a key change.
   */
  const selectKey = (pc: number) => {
    recordEdit();
    setKeyPc(pc);
    setTunedTarget(pc);
    tunedTargetRef.current = pc;
    setPads((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([i, p]) => [i, p.tuneLocked ? p : { ...p, tune: tuneDefault(false, false, p.category, p.detectedMidi, pc) }]),
      ),
    );
  };

  /**
   * Bakes every tuned pad's shift into its audio (windowed-sinc resample) and downloads the
   * rebuilt project. With the normalize switch on, every sample is loudness-normalized and every pad volume knob set to a
   * loudness-balanced level (see audio/loudness.ts); the audio files themselves are not gain-changed.
   */
  const exportProject = async () => {
    const project = projectRef.current;
    if (!project) return;
    setExporting(true);
    try {
      const tuned: TunedSample[] = [];
      // Koala's pan runs 0..1 (0.5 = centre) for L100..R100, so N percent is N/200 off centre.
      const pans = new Map<number, number>();
      if (spread) {
        // Only melodic pads move; bass, drums and the rest stay centred.
        const tunedPads = Object.values(pads).filter((p) => p.category === "melodic" && !p.placeholder);
        const offsets = balancedSpread(tunedPads.length, MAX_SPREAD_PERCENT);
        tunedPads.forEach((p, i) => pans.set(p.sampleId, 0.5 + offsets[i] / 200));
      }
      const allPads = Object.values(pads).filter((p) => !p.placeholder);
      // Every pad's final (tuned) audio, so loudness is measured on what Koala will actually play.
      const rendered: { pad: Pad; channelData: Float32Array[]; retimed: boolean }[] = [];
      let done = 0;
      for (const pad of allPads) {
        setExportProgress(`${done++}/${allPads.length}`);
        const shift = shiftFor(pad, tunedTarget, a4);
        const retimed = pad.tune && Math.abs(shift) >= 1e-6;
        if (!retimed && !normalize) continue;
        const channelData = retimed
          ? limitPeak(await getRenderWorker().resamplePitch(pad.channelData, semitonesToRatio(shift)))
          : pad.channelData;
        rendered.push({ pad, channelData, retimed });
      }
      // Files are loudness-normalized (quiet up, loud down); the mix goes on the pad knobs.
      const vols = new Map<number, number>();
      const gains = normalize
        ? await getRenderWorker().balance(
            rendered.map((r) => ({ channelData: r.channelData, sampleRate: r.pad.sampleRate, category: r.pad.category })),
            FILE_CEILING_DB,
          )
        : null;
      rendered.forEach((r, i) => {
        if (gains) vols.set(r.pad.sampleId, volFromDb(gains.knobDb[i]));
        tuned.push({
          sampleId: r.pad.sampleId,
          sampleRate: r.pad.sampleRate,
          channelData: gains ? applyGainDb(r.channelData, gains.gainDb[i]) : r.channelData,
          retimed: r.retimed,
        });
      });
      const buses = new Map<number, number>();
      if (routeBuses) {
        for (const p of allPads) buses.set(p.sampleId, CATEGORY_BUS[p.category ?? "other"]);
      }
      const colors = new Map<number, { color: string; label: string }>();
      if (autoColor) {
        for (const p of allPads) {
          if (p.category) colors.set(p.sampleId, { color: autoColorOf(p), label: drumSlotOf(p)?.label ?? categoryLabel(p.category) });
        }
      }
      const { blob, filename } = await buildTunedKoala(project, tuned, { vols, buses, busNames: routeBuses ? BUS_NAMES : undefined, arrangement, pans, colors, placeholders: placeholderList });
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  /** Original slot -> current slot (null = deleted), or undefined when nothing was moved or deleted. */
  const arrangementOf = (): Map<number, number | null> | undefined => {
    const project = projectRef.current;
    if (!project) return undefined;
    const slots = project.pads.filter((p) => p.pad >= 0 && p.pad < 64);
    const now = new Map(Object.values(pads).filter((p) => !p.placeholder).map((p) => [p.origIndex, p.index]));
    if (!slots.some((r) => now.get(r.pad) !== r.pad)) return undefined;
    return new Map(slots.map((r) => [r.pad, now.get(r.pad) ?? null]));
  };
  const arrangement = analyzing === 0 ? arrangementOf() : undefined;

  const palette = paletteById(paletteId);
  const drumColors = roleColors(palette);
  /**
   * With a layout applied, with auto-color on, a drum on bank A or B shows its slot's role colour and label, exactly as the
   * layout preview does. This is only how the pad looks in Koala; its category (tuning, buses) is unchanged.
   */
  const drumSlotOf = (p: Pad) =>
    autoColor && layout.on && !p.placeholder && isDrumCategory(p.category) ? layoutSlotAt(layoutById(layout.id), p.index) : undefined;
  /** Palette colour for a sound: by category, or its slot's role colour for drums on the layout's banks. */
  const autoColorOf = (p: Pad): string => {
    const slot = drumSlotOf(p);
    return slot ? drumColors[slot.role] : colorFor(palette, p.category ?? "other");
  };
  const colorOfPad = (p: Pad) => (p.placeholder ? placeholderColor(p) : autoColorOf(p));
  /** The layout's silent pads, written into the exported project. */
  const placeholderList = Object.values(pads)
    .filter((p) => p.placeholder)
    .map((p) => ({ index: p.index, label: p.placeholder!.label, color: placeholderColor(p) }));
  const canExport =
    (arrangement !== undefined ||
      placeholderList.length > 0 ||
      (normalize || autoColor || routeBuses ? Object.keys(pads).length > 0 : Object.values(pads).some((p) => p.tune))) &&
    analyzing === 0 &&
    !exporting;
  const hasProject = Object.keys(pads).length > 0;
  const selectedPad = selected !== null ? pads[selected] : undefined;

  return (
    <div
      className="stage"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files);
      }}
    >
      <div className="phone" style={{ backgroundImage: `url(${background})` }}>
        {/* Hides what's baked into the screenshot: the screenshot's pad grid, the "C" bank highlight, MUTE/SOLO and SAMPLES. */}
        <div className="cover" style={box(0, 975, W, 845)} />
        <div className="cover" style={box(446, 1598, 230, 220)} />
        <div className="cover" style={box(288, 1826, 330, 100)} />
        <div className="cover" style={box(725, 1826, 175, 100)} />
        <div className="cover" style={box(0, 1826, W, 100)} />
        {/* The screenshot's baked-in Dynamic Island and home indicator. */}
        <div className="cover" style={box(0, 0, W, 90)} />
        <div className="cover" style={box(0, 1940, W, 59)} />

        <button
          className="menu-button"
          style={box(RIGHT - 75, 195, 75, 65)}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Export options"
          aria-expanded={menuOpen}
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        {menuOpen && (
          <div className="menu" style={{ top: `${(268 / H) * 100}%`, right: `${((W - RIGHT) / W) * 100}%` }}>
            <label>
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
              Balance loudness
            </label>
            <button className="menu__button" disabled={!normalize || !hasProject || normalizing} onClick={normalizeNow}>
              {normalizing ? "Normalizing…" : "Normalize now"}
            </button>
            <label>
              <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
              Spread melodic pads
            </label>
            <label>
              <input type="checkbox" checked={autoColor} onChange={(e) => toggleAutoColor(e.target.checked)} />
              Auto-color pads by sound type
            </label>
            <label>
              <input type="checkbox" checked={routeBuses} onChange={(e) => setRouteBuses(e.target.checked)} />
              Route pads to buses by sound type
            </label>
            <label>
              <input
                type="checkbox"
                checked={layout.on}
                disabled={!hasProject || analyzing > 0}
                onChange={(e) => toggleLayout(e.target.checked)}
              />
              Finger drumming layout
            </label>
            <select
              className="menu__select"
              value={layout.id}
              onChange={(e) => chooseLayout(e.target.value)}
              disabled={analyzing > 0}
              aria-label="Finger drumming layout"
            >
              {FINGER_LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              className="menu__button"
              onClick={() => {
                setLayoutPickerOpen(true);
                setMenuOpen(false);
              }}
            >
              Layouts
            </button>
            <label className="menu__a4">
              A4 reference (Hz)
              <input
                type="number"
                inputMode="decimal"
                min={A4_REFERENCE_RANGE.min}
                max={A4_REFERENCE_RANGE.max}
                step={0.1}
                value={a4Text}
                onChange={(e) => {
                  setA4Text(e.target.value);
                  const hz = parseFloat(e.target.value);
                  if (Number.isFinite(hz) && hz >= A4_REFERENCE_RANGE.min && hz <= A4_REFERENCE_RANGE.max) setA4(hz);
                }}
                onBlur={() => setA4Text(String(a4))}
              />
            </label>
            {a4 !== 440 && (
              <button
                className="menu__button"
                onClick={() => {
                  setA4(440);
                  setA4Text("440");
                }}
              >
                Reset to A440
              </button>
            )}
            <button className="menu__button" disabled={!hasProject && !loading} onClick={clearProject}>
              Clear project
            </button>
            {autoColor && (
              <button
                className="menu__button"
                onClick={() => {
                  setPaletteOpen(true);
                  setMenuOpen(false);
                }}
              >
                Color palette: {palette.name}
              </button>
            )}
          </div>
        )}

        <section className="teal" style={box(LEFT, 280, CONTENT_W, 510)}>
          {selectedPad?.placeholder ? (
            <div className="teal__message">
              <strong>{selectedPad.placeholder.label}</strong>
              <span>{selectedPad.placeholder.kind === "missing" ? "Silent placeholder: drag a sound here" : "Silent placeholder"}</span>
            </div>
          ) : selectedPad ? (
            <PadPanel
              pad={selectedPad}
              autoColor={autoColor}
              autoShift={shiftFor({ ...selectedPad, semis: 0, cents: 0 }, tunedTarget, a4)}
              onChange={(patch) => {
                if ("tune" in patch) patchPad(selectedPad.index, { ...patch, tuneLocked: true });
                else if (patch.category && !selectedPad.tuneLocked) {
                  patchPad(selectedPad.index, {
                    ...patch,
                    tune: tuneDefault(false, false, patch.category, selectedPad.detectedMidi, tunedTarget),
                  });
                } else patchPad(selectedPad.index, patch);
              }}
            />
          ) : hasProject ? (
            <div className="teal__message">
              <strong>{projectName}</strong>
              <span>{analyzing > 0 ? "Analyzing pads…" : "Tap a pad"}</span>
            </div>
          ) : (
            <label className="dropzone">
              <input
                type="file"
                accept=".koala"
                hidden
                onChange={(e) => pickFile(e.target.files)}
              />
              <strong>{loading ? "Loading…" : "Drop a .koala project"}</strong>
              <span>or tap to choose one</span>
            </label>
          )}
        </section>

        <section className="pink" style={box(LEFT, 806, CONTENT_W, 169)}>
          <Keyboard selected={keyPc} onSelect={selectKey} />
        </section>

        {Array.from({ length: 16 }, (_, slot) => {
          const index = bank * 16 + slot;
          const pad = pads[index];
          const cls = [
            "pad",
            pad && "pad--loaded",
            pad && autoColor && "pad--colored",
            pad?.placeholder && "pad--placeholder",
            pad?.tune && "pad--tuned",
            selected === index && "pad--selected",
            drag?.from === index && "pad--dragging",
            hover === `pad:${index}` && "pad--target",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={slot}
              className={cls}
              style={{
                ...box(PAD_COLS[slot % 4], PAD_ROWS[Math.floor(slot / 4)], PAD_W, PAD_H),
                ...(pad?.placeholder
                  ? { background: placeholderColor(pad), color: "#fff" }
                  : pad && autoColor
                  ? (() => {
                      const bg = autoColorOf(pad);
                      return { background: bg, color: textColorOn(bg) };
                    })()
                  : null),
              }}
              data-drop="pad"
              data-index={index}
              onPointerDown={(e) => onPadDown(e, index)}
              onPointerMove={onPadMove}
              onPointerUp={() => onPadUp(index)}
              onPointerCancel={() => {
                liftPad(index);
                endDrag();
              }}
              aria-label={`Pad ${slot + 1}`}
            >
              {pad?.placeholder && <span className="pad__label">{pad.placeholder.label}</span>}
            </button>
          );
        })}

        <div className="banks" style={box(BANKS_X, BAR_Y, BANKS_W, BAR_H)}>
          {BANKS.map((name, i) => {
            const hasSamples = Object.keys(pads).some(
              (index) => Math.floor(Number(index) / 16) === i,
            );
            const cls = [
              "bank",
              bank === i && "bank--active",
              !hasSamples && "bank--empty",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={name}
                className={`${cls}${hover === `bank:${i}` ? " bank--target" : ""}`}
                data-drop="bank"
                data-index={i}
                onClick={() => setBank(i)}
              >
                {name}
              </button>
            );
          })}
        </div>

        <button
          className="history-button"
          style={box(UNDO_X, BAR_Y, BAR_H, BAR_H)}
          disabled={historySize.undo === 0 || analyzing > 0}
          onClick={undo}
          aria-label="Undo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" />
          </svg>
        </button>
        <button
          className="history-button"
          style={box(REDO_X, BAR_Y, BAR_H, BAR_H)}
          disabled={historySize.redo === 0 || analyzing > 0}
          onClick={redo}
          aria-label="Redo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -3)" />
          </svg>
        </button>

        <button
          className={`tone${toneOn ? " tone--on" : ""}`}
          style={box(TONE_X, BAR_Y, BTN_W, BAR_H)}
          aria-pressed={toneOn}
          onClick={() => setToneOn((on) => !on)}
        >
          Tone
        </button>


        {drag && expanded && (
          <>
            <div className="allpads" style={box(LEFT, 985, CONTENT_W, 835)}>
              {BANKS.map((name, b) => (
                <div key={name} className="allpads__bank">
                  <span className="allpads__label">{name}</span>
                  <div className="allpads__grid">
                    {Array.from({ length: 16 }, (_, slot) => {
                      const index = b * 16 + slot;
                      const pad = pads[index];
                      return (
                        <div
                          key={slot}
                          className={[
                            "allpads__cell",
                            pad && "allpads__cell--filled",
                            drag.from === index && "allpads__cell--source",
                            hover === `cell:${index}` && "allpads__cell--target",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={pad ? { background: colorOfPad(pad) } : undefined}
                          data-drop="cell"
                          data-index={index}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div
              className={`drop-target drop-target--trash${hover === "trash:" ? " drop-target--hot" : ""}`}
              style={box(LEFT, 850, 250, 110)}
              data-drop="trash"
            >
              🗑
            </div>
            <div
              className={`drop-target drop-target--unused${hover === "unused:" ? " drop-target--hot" : ""}`}
              style={box(RIGHT - 330, 850, 330, 110)}
              data-drop="unused"
            >
              Unused pad
            </div>
          </>
        )}

        {layoutPickerOpen && (
          <LayoutPicker
            palette={autoColor ? palette : paletteById(DEFAULT_PALETTE_ID)}
            selectedId={layout.id}
            onSelect={chooseLayout}
            onClose={() => setLayoutPickerOpen(false)}
          />
        )}

        {paletteOpen && (
          <PalettePicker selectedId={paletteId} onSelect={setPaletteId} onClose={() => setPaletteOpen(false)} />
        )}

        <button
          className="export"
          style={box(EXPORT_X, BAR_Y, BTN_W, BAR_H)}
          disabled={!canExport}
          onClick={exportProject}
        >
          {exporting ? exportProgress || "…" : "Export"}
        </button>
      </div>
      {drag && pads[drag.from] && (
        <div
          className="drag-ghost"
          style={{
            left: drag.x,
            top: drag.y,
            background: colorOfPad(pads[drag.from]),
          }}
        />
      )}
    </div>
  );
}

export default App;
