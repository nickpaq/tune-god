import { useCallback, useEffect, useRef, useState } from "react";
import { playbackFor, type PadPlayback } from "./audio/padSettings";
import { Keyboard } from "./components/Keyboard";
import { appendPackToProject, buildPackProject, entriesOfDrop, findPackInEntries, findPackInFileList, type FoundPack } from "./audio/packProject";
import { assignFill, fillPlan, missingSlots } from "./audio/packFill";
import { displayName, packTags } from "./audio/sampleName";
import { packByteBudget, type PackMemory } from "./audio/samplePack";
import { PadPanel, type Pad } from "./components/PadPanel";
import { decodeNative, monoFromChannelData } from "./audio/decode";
import {
  parseKoalaProject,
  koalaPadToFile,
  isKoalaFile,
  trimRangeOf,
  type ParsedKoalaProject,
} from "./audio/koalaProject";
import { setReferencePitch, startPad, type PadHandle, type PadMode } from "./audio/player";
import { buildTunedKoala, downloadBlob, type GhostPadExport, type TunedSample } from "./audio/exportProject";
import { applyGainDb } from "./audio/gain";
import { balanceFromStats, FILE_CEILING_DB, type BalanceStats } from "./audio/loudness";
import { balancedSpread } from "./audio/spread";
import { CATEGORIES, categoryIndex, is808Name, isKitCategory, isTunedCategory, migrateCategory, type CategoryId } from "./audio/classify";
import { colorFor, paletteById, shade, DEFAULT_PALETTE_ID } from "./audio/palettes";
import { emptyPadInBank, movePad, nextEmptyPad, removePad, replaceMisfit } from "./audio/padMoves";
import { BUS_NAMES, CATEGORY_BUS } from "./audio/routing";
import { PalettePicker } from "./components/PalettePicker";
import { LayoutPicker } from "./components/LayoutPicker";
import { sortForSlot } from "./audio/swapOrder";
import { ExtraDrumsModal } from "./components/ExtraDrumsModal";
import { extraDrumCount, fillGhostSlot, withoutExtraDrums, type ExtraDrums } from "./audio/extraDrums";
import { SwapList } from "./components/SwapList";
import { TypeKeys } from "./components/TypeKeys";
import { Waveform } from "./components/Waveform";
import { LongSamplesModal } from "./components/LongSamplesModal";
import { arrangeFingerDrumming, EMPTY_PAD_LABEL } from "./audio/fingerDrumming";
import { FINGER_LAYOUTS, kitSlotCounts, layoutById } from "./audio/fingerLayouts";
import { makePlaceholderPad, placeholderColor } from "./audio/placeholderPads";
import { makeGhostPad } from "./audio/ghostPads";
import { GHOST_LABEL, makeGhostAudio } from "./audio/ghost";
import { padLabel } from "./audio/padLabels";
import { PadSymbol } from "./components/PadSymbol";
import { clearProjectFile, loadProjectFile, loadState, saveProjectFile, saveState, type SavedPad } from "./storage";
import { A4_REFERENCE_RANGE, clampA4Reference, NOTE_NAMES, referenceOffsetSemitones, semitonesToRatio, trimCents } from "./audio/theory";
import { nextAnalysisWorker, getRenderWorker } from "./workers/workerClient";
import { useOledCell } from "./components/useOledCell";
import { useSafeArea } from "./components/useSafeArea";
import { ACTIVE_MIX_PRESET, MASTER_STYLES, type MasterStyle } from "./audio/mixPresets";
import { planOrganize } from "./audio/organize";
import "./App.css";

const BANKS = ["A", "B", "C", "D"];
/** What the screen and the deck under it are doing: hot-swapping the selected pad's sound, choosing its sound type, or tuning. */
type Mode = "tune" | "type" | "swap";
const MODES: { id: Mode; label: string; aria: string }[] = [
  { id: "tune", label: "Tune", aria: "Tune mode" },
  { id: "type", label: "Type", aria: "Sound type mode" },
  { id: "swap", label: "Swap", aria: "Hot swap mode" },
];
/** How many edits undo can step back through. */
const MAX_HISTORY = 100;
/** Slider drags on the same control within this window count as one undo step. */
const COALESCE_MS = 1000;
/** A pad press that travels this far (CSS px) becomes a drag instead of a hit. */
const DRAG_THRESHOLD_PX = 40;
/** Hovering a bank button this long while dragging opens the all-pads view. */
const DWELL_MS = 350;

/** What undo/redo restores: the pad data plus the key it was tuned to. */
interface Snapshot {
  pads: Record<number, Pad>;
  hidden: Record<number, Pad>;
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
  "Your pads will be rearranged into the finger drumming layout: the kit on page A, everything else from page B on, and silent placeholder pads filling any gaps. Recorded patterns are corrected to follow their pads, so they will still play back as expected. You can undo this. Continue?";
const LAYOUT_SWITCH_WARNING =
  "Switching layouts rearranges your pads again, including any moves you made since applying the current layout. Recorded patterns are corrected to follow their pads and will still play back as expected. Continue?";
const LAYOUT_OFF_WARNING =
  "Turning this off removes the placeholder pads and puts every sound back where it was before the layout was applied. You will lose the layout and any changes you made since. Continue?";
/** Pad volume knob value for a dB level: plain linear amplitude (checked against a Koala project: -60 dB = 0.001, -6 dB = 0.501, 0 dB = 1, +6 dB = 1.995, -inf = 0). */
const volFromDb = (db: number) => 10 ** (db / 20);
/** Widest spread pan, in percent either side of centre. */
const MAX_SPREAD_PERCENT = 40;

/**
 * Total semitone shift for a pad: the shortest move (never more than 6 up or
 * down) from its exact detected pitch onto the target note, plus the manual trim.
 */
function shiftFor(pad: Pad, projectKey: number | null, a4: number): number {
  if (!pad.tune) return 0;
  const target = pad.keyPc ?? projectKey;
  let base = 0;
  if (target !== null && pad.detectedMidi != null) {
    base = (((target - pad.detectedMidi) % 12) + 12) % 12;
    if (base > 6) base -= 12;
    // The detected pitch is measured against A440; a different A4 reference moves the target note with it.
    base += referenceOffsetSemitones(a4);
  }
  return base + pad.semis + pad.cents / 100;
}

/** A sound from the project itself: not a silent placeholder and not a ghost copy the layout made. */
const isReal = (p: Pad) => !p.placeholder && !p.ghost;

/**
 * Preview only (the project's own play settings are untouched). Every pad plays while held and fades
 * out smoothly on release; bass, melodic and melodic loops also loop for as long as they are held.
 */
function padMode(pad: Pad): PadMode {
  return isTunedCategory(pad.category) ? "loop" : "hold";
}

/** A remembered category, brought up to date. The old single "hat" did not say open or closed, so the fresh guess decides. */
function rememberedCategory(id: string | undefined, guess: CategoryId): CategoryId {
  return id === "hat" && (guess === "openHat" || guess === "closedHat") ? guess : migrateCategory(id);
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

/** A sample longer than this is flagged on import: samples this long make export very slow. */
const MAX_SAMPLE_SECONDS = 60;

/** A pad's default Tune state: the user's manual choice if locked, else decided by its category: on for Bass and Melodic with a detected pitch. */
function tuneDefault(locked: boolean | undefined, current: boolean, category: CategoryId | undefined, detectedMidi: number | null | undefined, target: number | null): boolean {
  if (locked) return current;
  return target !== null && detectedMidi != null && isTunedCategory(category);
}

/** A menu switch: the same lit key as the ones under the piano, with its words (and a line of explanation) beside it. */
function Switch({ label, hint, on, disabled, onChange }: { label: string; hint?: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={`menu__switch${disabled ? " menu__switch--locked" : ""}`}>
      <div className="menu__switch-words">
        <span className="menu__switch-label">{label}</span>
        {hint && <span className="menu__switch-hint">{hint}</span>}
      </div>
      <button className={`cap cap--side${on ? " cap--on" : ""}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
        <span className="cap__led" />
        <span className="cap__legend">{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function App() {
  useOledCell();
  useSafeArea();
  // Read once: what the previous visit left behind.
  const saved = useRef(loadState()).current;
  const [pads, setPads] = useState<Record<number, Pad>>({});
  /** A sample pack's spare sounds (by original slot): not on any pad, offered in the hot-swap menu, and left out of the export. */
  const [hidden, setHidden] = useState<Record<number, Pad>>({});
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
  /** The Mix switch: levels (balance loudness, settings by sound type), bus routing with the bass sidechain, and the melodic spread. */
  const [mix, setMix] = useState(saved.mix ?? !!(saved.normalize || saved.routeBuses || saved.autoPlayback));
  const normalize = mix;
  const spread = mix;
  const routeBuses = mix;
  const autoPlayback = mix;
  /** The Organize switch: pad colours and labels are written on export. */
  const [organize, setOrganize] = useState(saved.organize ?? saved.autoColor ?? false);
  const autoColor = organize;
  /** Every sound's type is settled (by file name or by the user): Drum layouts unlocks. A project that already had its layout on counts. */
  const [organized, setOrganized] = useState(saved.organized ?? !!saved.layoutOn);
  /** While sorting the unknown sounds: their original slots in order and which one is up. The screen shows only that sound and the type keys. */
  const [focus, setFocus] = useState<{ queue: number[]; pos: number; started: boolean } | null>(null);
  /** A short message over the screen ("Sounds organized..."). */
  const [notice, setNotice] = useState("");
  /** Pre-rendered normalized audio per pad (by original slot, so it follows a moved pad); only used for playback while Normalize is on. */
  const [normalizedData, setNormalizedData] = useState<Record<number, Float32Array[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [masterChain, setMasterChain] = useState(saved.masterChain ?? true);
  const [masterStyle, setMasterStyle] = useState<MasterStyle>(saved.masterStyle ?? "loud");
  const [padSymbols, setPadSymbols] = useState(saved.padSymbols ?? true);
  const [packMemory, setPackMemory] = useState<PackMemory>(saved.packMemory ?? "auto");
  const [paletteId, setPaletteId] = useState(saved.paletteId ?? DEFAULT_PALETTE_ID);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  /** Set while the export is waiting for the answer about drums the layout has no slot for. */
  const [extraPrompt, setExtraPrompt] = useState(false);
  /** The mode keys: what the screen and the deck show. Swap is the resting mode; it needs the finger-drumming layout (see shownMode). */
  const [mode, setMode] = useState<Mode>("swap");
  /** Sounds (by original slot) that were over the length limit when the project was imported; the warning lists the ones still present. */
  const [longSamples, setLongSamples] = useState<number[]>([]);
  const [layout, setLayout] = useState<LayoutState>({ on: false, id: layoutById(saved.layoutId).id, pre: {} });
  const [toneOn, setToneOn] = useState(saved.toneOn ?? false);
  /** Whether a tapped key retunes every pad ("Tune all") or only the selected one. */
  const [tuneAll, setTuneAll] = useState(saved.tuneAll ?? true);
  const [a4, setA4] = useState(clampA4Reference(saved.a4 ?? 440));
  const [a4Text, setA4Text] = useState(String(clampA4Reference(saved.a4 ?? 440)));
  /** Ghost under the finger while a pad is being dragged, and the drop target under it ("kind:index"). */
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);
  const [hover, setHover] = useState("");
  /** The all-pads view that opens when a drag dwells over the bank buttons. */
  const [expanded, setExpanded] = useState(false);
  /** One record per finger/pointer holding a pad, so a second touch never disturbs the first. */
  const drags = useRef<Map<number, { from: number; x0: number; y0: number; active: boolean; hover: string; timer: number | null }>>(new Map());
  /** Always the latest pointer-release handler, for the window listeners that guarantee every release is seen. */
  const finishPointer = useRef<(pointerId: number, cancelled: boolean) => void>(() => {});
  const releasePad = useRef<Map<number, PadHandle>>(new Map());
  /** The sample dropped on HOLD; it loops until any pad is pressed. */
  const holdVoice = useRef<PadHandle | null>(null);
  /** The pad index the held voice is playing, so tuning changes can follow it. */
  const holdIndex = useRef<number | null>(null);
  const tunedTargetRef = useRef<number | null>(saved.tunedTarget ?? null);
  /** Per-pad choices from the last visit, applied as each pad finishes analysis. */
  const restorePads = useRef<Record<number, SavedPad>>(saved.pads ?? {});
  const loadToken = useRef(0);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastEdit = useRef({ key: "", time: 0 });
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistorySize({ undo: past.current.length, redo: future.current.length });
  const latest = useRef<Snapshot>({ pads: {}, hidden: {}, keyPc: null, tunedTarget: null, layout });
  latest.current = { pads, hidden, keyPc, tunedTarget, layout };
  const projectRef = useRef<ParsedKoalaProject | null>(null);
  /** The project file as last saved (its size counts against the memory budget when a pack is added). */
  const projectFile = useRef<File | null>(null);
  /** What the Add pack button says while a pack is being added. */
  const [addPackStatus, setAddPackStatus] = useState("");
  const packInput = useRef<HTMLInputElement>(null);
  const addPackInput = useRef<HTMLInputElement>(null);

  /** The sound type a dropped pack gave each pad (by pad number), used in place of the classifier's guess. */
  const categoryHints = useRef<Record<number, CategoryId>>({});
  /** Set while a freshly imported sample pack still needs its finger-drumming layout and Normalize switched on (they wait for analysis). */
  const packSetup = useRef(false);
  /** What the drop zone says while a pack is being measured and levelled. */
  const [importStatus, setImportStatus] = useState("");

  const loadProject = useCallback(async (file: File, restore = false, pack?: { categories: Record<number, CategoryId>; knobDb: Record<number, number>; is808: Record<number, true> }) => {
    const token = ++loadToken.current;
    setLoading(true);
    try {
      const project = await parseKoalaProject(file);
      if (token !== loadToken.current) return;
      projectRef.current = project;
      projectFile.current = file;
      categoryHints.current = pack?.categories ?? {};
      packSetup.current = !restore && !!pack;
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
      setHidden({});
      setNormalizedData({});
      setLongSamples([]);
      if (!restore) {
        // A new project's sounds have not been sorted yet.
        setFocus(null);
        setOrganized(false);
        setOrganize(false);
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

      // Pads numbered past the grid are a sample pack's hidden spare sounds, and on reopening the saved state says which sounds are spare.
      const isSpare = (pad: number) => {
        const saved = restore ? restorePads.current[pad] : undefined;
        return saved ? !!saved.hidden : pad >= 64;
      };
      const slots = project.pads.filter((p) => p.pad >= 0 && !(restore && restorePads.current[p.pad]?.deleted));
      setAnalyzing(slots.length);
      const tooLong: number[] = [];
      for (const ref of slots) {
        const spare = isSpare(ref.pad);
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        // Koala plays only between the pad's start and end points, so the preview and analysis get just that part.
        const range = trimRangeOf(project, ref.sampleId, decoded.channelData[0].length);
        if (range) decoded.channelData = decoded.channelData.map((ch) => ch.slice(range.start, range.end));
        // Pads the user moved on a previous visit go back where they were left.
        const at = spare ? -1 : restore ? restorePads.current[ref.pad]?.position ?? ref.pad : ref.pad;
        const pad: Pad = {
          index: at,
          origIndex: ref.pad,
          name: ref.fileName,
          sampleId: ref.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          knobDb: restore ? restorePads.current[ref.pad]?.knobDb : pack?.knobDb[ref.pad],
          is808: restore ? restorePads.current[ref.pad]?.is808 : pack?.is808[ref.pad],
          trimmedFrom: range?.start,
          tune: false,
          semis: 0,
          cents: 0,
        };
        if (spare) setHidden((prev) => ({ ...prev, [ref.pad]: pad }));
        else setPads((prev) => ({ ...prev, [at]: pad }));
        if (!spare && decoded.channelData[0].length / decoded.sampleRate > MAX_SAMPLE_SECONDS) tooLong.push(ref.pad);
        // Analysis runs on a worker while the next pad decodes.
        nextAnalysisWorker()
          .analyze(monoFromChannelData(pad.channelData), pad.sampleRate, ref.fileName)
          .catch(() => ({ midi: null, category: "other" as const, detail: undefined, centroid: undefined }))
          .then(({ midi: detectedMidi, category: guessed, detail, centroid }) => {
            if (token !== loadToken.current) return;
            const category = categoryHints.current[ref.pad] ?? guessed;
            const remembered = restorePads.current[ref.pad];
            const cat = remembered ? rememberedCategory(remembered.category, category) : category;
            const analysed = (cur: Pad): Pad => ({
              ...cur,
              detectedMidi,
              detail,
              centroid,
              ...(remembered
                ? {
                    tune: remembered.tune,
                    tuneLocked: remembered.tuneLocked,
                    keyPc: remembered.keyPc,
                    semis: remembered.semis,
                    cents: remembered.cents,
                    category: cat,
                  }
                : { category }),
              tune: tuneDefault(
                remembered?.tuneLocked || cur.tuneLocked,
                remembered?.tuneLocked ? remembered.tune : cur.tune,
                cat,
                detectedMidi,
                tunedTargetRef.current,
              ),
            });
            // The sound may sit on a pad or in the hot-swap pool, and may have been moved, swapped or deleted while it was analysing.
            setPads((prev) => {
              const slot = Object.keys(prev).find((k) => prev[Number(k)].origIndex === ref.pad);
              if (slot === undefined) return prev;
              return { ...prev, [Number(slot)]: analysed(prev[Number(slot)]) };
            });
            setHidden((prev) => (prev[ref.pad] ? { ...prev, [ref.pad]: analysed(prev[ref.pad]) } : prev));
            setAnalyzing((n) => n - 1);
          });
      }
      // A project reopened with its layout on gets its ghost snares and soft kicks remade from their source sounds.
      if (layoutOn && saved.layoutGhosts?.length) {
        setPads((prev) => {
          const next = { ...prev };
          for (const g of saved.layoutGhosts ?? []) {
            const source = Object.values(prev).find((p) => isReal(p) && p.origIndex === g.sourceOrigIndex);
            if (source && !next[g.index]) next[g.index] = makeGhostPad(g.index, g.kind, source);
          }
          return next;
        });
      }
      if (!restore && tooLong.length > 0) setLongSamples(tooLong);
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
    saveState({ mix, organize, organized, masterStyle, masterChain, padSymbols, packMemory, paletteId, toneOn, tuneAll, a4, bank, selected, keyPc, tunedTarget });
  }, [mix, organize, organized, masterStyle, masterChain, padSymbols, packMemory, paletteId, toneOn, tuneAll, a4, bank, selected, keyPc, tunedTarget]);

  // Pad choices are only saved once every pad has loaded, so a half-restored grid never overwrites them.
  useEffect(() => {
    if (analyzing > 0 || loading || Object.keys(pads).length === 0) return;
    const out: Record<number, SavedPad> = {};
    for (const p of Object.values(pads)) {
      if (!isReal(p)) continue;
      out[p.origIndex] = {
        tune: p.tune,
        tuneLocked: p.tuneLocked,
        keyPc: p.keyPc,
        semis: p.semis,
        cents: p.cents,
        category: p.category,
        knobDb: p.knobDb,
        is808: p.is808,
        position: p.index,
      };
    }
    for (const p of Object.values(hidden)) {
      out[p.origIndex] = { tune: p.tune, tuneLocked: p.tuneLocked, keyPc: p.keyPc, semis: p.semis, cents: p.cents, category: p.category, knobDb: p.knobDb, is808: p.is808, hidden: true };
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
      layoutGhosts: Object.values(pads).flatMap((p) => (p.ghost ? [{ index: p.index, kind: p.ghost.kind, sourceOrigIndex: p.ghost.sourceOrigIndex }] : [])),
      layoutPlaceholders: Object.values(pads).flatMap((p) => (p.placeholder ? [{ index: p.index, ...p.placeholder }] : [])),
    });
  }, [pads, hidden, analyzing, loading, layout]);

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
    setHidden({});
    setLayout((l) => ({ ...l, on: false, pre: {} }));
    setNormalizedData({});
    setLongSamples([]);
    setSelected(null);
    setKeyPc(null);
    setTunedTarget(null);
    tunedTargetRef.current = null;
    setProjectName(null);
    setAnalyzing(0);
    setLoading(false);
    setExpanded(false);
    setBank(0);
    saveState({ pads: {}, layoutOn: false, layoutPre: {}, layoutGhosts: [], layoutPlaceholders: [] });
    void clearProjectFile();
    setMenuOpen(false);
  };

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = Array.from(files ?? []).find(isKoalaFile);
    if (file) void loadProject(file);
  };

  /** Turns a sample pack into a project (a mix of its sound types across the pads) and loads it like any other. */
  const loadPack = async (find: () => Promise<FoundPack> | FoundPack) => {
    setLoading(true);
    try {
      const built = await buildPackProject(await find(), {
        kitSlots: kitSlotCounts(layoutById(layout.id)),
        byteBudget: packByteBudget(packMemory),
        measure: (input) => getRenderWorker().measure(input),
        onProgress: setImportStatus,
      });
      if (built) await loadProject(built.file, false, built);
      else window.alert("No audio files (wav, aiff, flac, mp3, ogg or m4a) were found in that folder.");
    } catch (err) {
      console.error(err);
    } finally {
      setImportStatus("");
      setLoading(false);
    }
  };

  // A new sample pack arrives measured and levelled already, so once its sounds are analysed it is switched to Normalize
  // and arranged into the finger-drumming layout (bank A the kit, the rest after it). Nothing to undo back to: history starts clean.
  useEffect(() => {
    if (!packSetup.current || loading || analyzing > 0 || Object.keys(pads).length === 0) return;
    packSetup.current = false;
    setMix(true);
    // A pack's folders already named every sound's type, so it counts as organized. The export writes each pad's colour and label for Koala only with Organize on.
    setOrganize(true);
    setOrganized(true);
    applyLayout(layout.id);
    past.current = [];
    future.current = [];
    syncHistory();
  });

  /**
   * Adds another sample pack to the project already loaded. Everything the user has stays exactly where it is; the new pack
   * only fills slots that are still missing a sound (placeholders and gaps in banks A to C, never bank D) and tops up the
   * hot-swap pool, all levelled against what is already in the project.
   */
  const addPack = async (find: () => Promise<FoundPack> | FoundPack) => {
    const project = projectRef.current;
    if (!project || !layout.on) return;
    const token = loadToken.current;
    setAddPackStatus("Reading…");
    try {
      const found = await find();
      const cur = latest.current;
      const lay = layoutById(layout.id);
      const missing = missingSlots(cur.pads, lay);
      const fill = fillPlan(missing, lay, Object.values(cur.hidden));
      const existing = [...Object.values(cur.pads).filter(isReal), ...Object.values(cur.hidden)].map((p) => ({ channelData: p.channelData, sampleRate: p.sampleRate, category: p.category }));
      const result = await appendPackToProject(project, found, {
        ...fill,
        byteBudget: Math.max(0, packByteBudget(packMemory) - (projectFile.current?.size ?? 0)),
        measure: (input) => getRenderWorker().measure(input),
        onProgress: setAddPackStatus,
        existing,
      });
      if (token !== loadToken.current) return;
      if (!result) {
        window.alert("Nothing in that folder was needed: every slot is filled and the swap lists are stocked, or it holds no usable audio.");
        return;
      }
      projectFile.current = result.file;
      void saveProjectFile(result.file);
      const forSlot = result.sounds.filter((x) => x.forSlot);
      const slotOf = assignFill(missing, lay, forSlot);
      // A sound chosen for a slot that no gap could take (say, a snare when no snare slot is open) joins the hot-swap pool instead.
      const placed = new Map<number, number>();
      for (const [slot, at] of slotOf) placed.set(forSlot[at].pad, slot);
      setAnalyzing((n) => n + result.sounds.length);
      for (const sound of result.sounds) {
        const ref = { pad: sound.pad, sampleId: sound.sampleId, fileName: sound.fileName };
        const slot = placed.get(sound.pad);
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        const pad: Pad = {
          index: slot ?? -1,
          origIndex: sound.pad,
          name: sound.fileName,
          sampleId: sound.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          knobDb: sound.knobDb,
          is808: sound.is808 || undefined,
          category: sound.category,
          tune: false,
          semis: 0,
          cents: 0,
        };
        categoryHints.current = { ...categoryHints.current, [sound.pad]: sound.category };
        if (slot === undefined) setHidden((prev) => ({ ...prev, [sound.pad]: pad }));
        else setPads((prev) => ({ ...prev, [slot]: pad }));
        nextAnalysisWorker()
          .analyze(monoFromChannelData(pad.channelData), pad.sampleRate, sound.fileName)
          .catch(() => ({ midi: null, category: "other" as const, detail: undefined, centroid: undefined }))
          .then(({ midi: detectedMidi, detail, centroid }) => {
            if (token !== loadToken.current) return;
            const analysed = (p: Pad): Pad => ({ ...p, detectedMidi, detail, centroid, tune: tuneDefault(p.tuneLocked, p.tune, p.category, detectedMidi, tunedTargetRef.current) });
            setPads((prev) => {
              const at = Object.keys(prev).find((k) => prev[Number(k)].origIndex === sound.pad);
              return at === undefined ? prev : { ...prev, [Number(at)]: analysed(prev[Number(at)]) };
            });
            setHidden((prev) => (prev[sound.pad] ? { ...prev, [sound.pad]: analysed(prev[sound.pad]) } : prev));
            setAnalyzing((n) => n - 1);
          });
      }
      // A ghost snare or soft kick slot that was waiting for its source sound gets its copy now that one has arrived.
      setPads((prev) => {
        const next = { ...prev };
        lay.slots.forEach((slotDef, i) => {
          if (!slotDef.ghostOf || (next[i] && !next[i].placeholder)) return;
          const source = lay.slots
            .map((s, j) => ({ s, j }))
            .filter(({ s, j }) => !s.ghostOf && s.category === slotDef.ghostOf && next[j] && isReal(next[j]))
            .map(({ j }) => next[j])[0];
          if (source) next[i] = makeGhostPad(i, slotDef.ghostOf === "snare" ? "ghostSnare" : "softKick", source);
        });
        return next;
      });
      // The new sounds are part of the project now; undo would only be able to take them away again.
      past.current = [];
      future.current = [];
      syncHistory();
    } catch (err) {
      console.error(err);
      window.alert("That pack could not be added.");
    } finally {
      setAddPackStatus("");
    }
  };

  /** A drop: a .koala file loads as a project, a folder as a sample pack. */
  const handleDrop = (data: DataTransfer) => {
    const file = Array.from(data.files).find(isKoalaFile);
    if (file) return void loadProject(file);
    // The entries have to be taken now; the list is empty once this handler returns.
    const entries = entriesOfDrop(data.items);
    if (entries.some((entry) => entry.isDirectory)) void loadPack(() => findPackInEntries(entries));
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
    setHidden(snap.hidden);
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
      .filter(isReal)
      .sort((a, b) => a.index - b.index);
    const { positions, placeholders, ghosts } = arrangeFingerDrumming(
      real.map((p) => ({ key: p.origIndex, category: p.category, midi: p.detectedMidi, centroid: p.centroid, is808: p.is808 })),
      layoutById(layoutId),
      // A sample pack keeps its loops and melodics on bank B, everything else on bank C, and bank D empty.
      { pack: Object.keys(latest.current.hidden).length > 0 },
    );
    const next: Record<number, Pad> = {};
    for (const p of real) {
      const index = positions.get(p.origIndex);
      if (index !== undefined) next[index] = { ...p, index };
    }
    for (const ph of placeholders) next[ph.index] = makePlaceholderPad(ph);
    for (const g of ghosts) {
      const source = real.find((p) => p.origIndex === g.sourceKey);
      if (source) next[g.index] = makeGhostPad(g.index, g.kind, source);
    }
    return next;
  };

  /** Applies a layout as one undo step, remembering where the sounds were so turning it off can put them back. */
  const applyLayout = (id: string) => {
    const cur = latest.current;
    const pre = cur.layout.on
      ? cur.layout.pre
      : Object.fromEntries(Object.values(cur.pads).filter(isReal).map((p) => [p.origIndex, p.index]));
    recordEdit();
    const arranged = arrangeInto(cur.pads, id);
    const spares = Object.values(cur.hidden);
    if (spares.length > 0) {
      // A sample pack fills its gaps (missing kit sounds, bank B and C slots) from its hot-swap spares straight away.
      const lay = layoutById(id);
      const missing = missingSlots(arranged, lay);
      const slotOf = assignFill(missing, lay, spares.map((p) => ({ category: p.category ?? "other", is808: p.is808 })));
      const used = new Set<number>();
      for (const [slot, at] of slotOf) {
        const spare = spares[at];
        arranged[slot] = { ...spare, index: slot, tune: tuneDefault(spare.tuneLocked, spare.tune, spare.category, spare.detectedMidi, tunedTarget) };
        used.add(spare.origIndex);
      }
      lay.slots.forEach((slotDef, i) => {
        if (!slotDef.ghostOf || (arranged[i] && !arranged[i].placeholder)) return;
        const source = lay.slots.map((s, j) => ({ s, j })).filter(({ s, j }) => !s.ghostOf && s.category === slotDef.ghostOf && arranged[j] && isReal(arranged[j])).map(({ j }) => arranged[j])[0];
        if (source) arranged[i] = makeGhostPad(i, slotDef.ghostOf === "snare" ? "ghostSnare" : "softKick", source);
      });
      if (used.size) setHidden((prev) => Object.fromEntries(Object.entries(prev).filter(([, p]) => !used.has(p.origIndex))));
    }
    setPads(arranged);
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
      if (!isReal(p)) continue;
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

  /** Changes a sound's type. Tune follows the new type unless the user set it by hand. */
  /**
   * In a sample pack, a sound re-typed by the user leaves its pad: it joins the hot-swap pool as a sound of its new type (so
   * it turns up in the swap list when a pad of that type is selected), and a spare of the pad's old type takes the pad's place,
   * so every area of the pads keeps its sounds. With no spare to give, the pad is left as a silent placeholder.
   */
  const retypeIntoPool = (pad: Pad, category: CategoryId) => {
    recordEdit();
    const spares = latest.current.hidden;
    const slot = layout.on && pad.index < 16 ? layoutById(layout.id).slots[pad.index] : undefined;
    // An 808 is a bass sound told apart by its name.
    const retyped: Pad = { ...pad, category, index: -1, is808: category === "bass" && is808Name(pad.name), ...(pad.tuneLocked ? {} : { tune: tuneDefault(false, false, category, pad.detectedMidi, tunedTarget) }) };
    const sameType = Object.values(spares).filter((p) => p.category === pad.category);
    const replacement = sameType.find((p) => !!p.is808 === !!pad.is808) ?? sameType[0];
    const nextSpares = { ...spares };
    if (replacement) delete nextSpares[replacement.origIndex];
    nextSpares[pad.origIndex] = retyped;
    setHidden(nextSpares);
    setPads((prev) => ({
      ...prev,
      [pad.index]: replacement
        ? { ...replacement, index: pad.index, tune: tuneDefault(replacement.tuneLocked, replacement.tune, replacement.category, replacement.detectedMidi, tunedTarget) }
        : makePlaceholderPad(slot ? { index: pad.index, kind: "missing", label: `add ${slot.label}` } : { index: pad.index, kind: "empty", label: EMPTY_PAD_LABEL }),
    }));
  };

  const classifyPad = (pad: Pad, category: CategoryId) => {
    if (pad.category === category) return;
    if (isReal(pad) && Object.keys(latest.current.hidden).length > 0) return retypeIntoPool(pad, category);
    const slot = layout.on && pad.index < 16 && !pad.placeholder && !pad.ghost ? layoutById(layout.id).slots[pad.index] : undefined;
    if (slot && slot.category !== category) {
      // The sound no longer belongs in its finger-drumming slot: a sound of the slot's type takes its place.
      recordEdit();
      setPads((prev) => {
        const retyped = { ...prev, [pad.index]: { ...prev[pad.index], category, ...(pad.tuneLocked ? {} : { tune: tuneDefault(false, false, category, pad.detectedMidi, tunedTarget) }) } };
        return replaceMisfit(retyped, pad.index, slot.category, slot.label);
      });
      return;
    }
    patchPad(pad.index, pad.tuneLocked ? { category } : { category, tune: tuneDefault(false, false, category, pad.detectedMidi, tunedTarget) });
  };

  const deletePad = (pad: Pad) => {
    recordEdit();
    setPads((prev) => removePad(prev, pad.index));
    setSelected((s) => (s === pad.index ? null : s));
  };

  /** What plays for a pad: its raw audio, or the normalized version once Normalize now has run. */
  const audioOf = (pad: Pad) => (normalize && normalizedData[pad.origIndex]) || pad.channelData;

  const pressPad = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    setSelected(index);
    if (pad.placeholder) return; // silent: nothing to play
    holdVoice.current?.release();
    holdVoice.current = null;
    holdIndex.current = null;
    releasePad.current.get(index)?.release();
    releasePad.current.set(
      index,
      startPad(
        index,
        audioOf(pad),
        pad.sampleRate,
        shiftFor(pad, tunedTarget, a4),
        pad.tune && toneOn ? (pad.keyPc ?? keyPc) : null,
        focus?.started ? "oneshot" : padMode(pad),
        undefined,
        normalize ? pad.knobDb : undefined,
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
      const list = Object.values(pads).filter(isReal);
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

  const endDrag = (d?: { timer: number | null }) => {
    if (d?.timer) clearTimeout(d.timer);
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the window listeners below still see the release */
    }
    drags.current.set(e.pointerId, { from: index, x0: e.clientX, y0: e.clientY, active: false, hover: "", timer: null });
    pressPad(index);
  };

  const onPadMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drags.current.get(e.pointerId);
    if (!d) return;
    if (!d.active) {
      if (!pads[d.from] || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX) return;
      d.active = true; // the sound keeps playing through the drag; the release at the end of the hold stops it
    }
    setDrag({ from: d.from, x: e.clientX, y: e.clientY });
    const target = targetAt(e.clientX, e.clientY);
    if (target === d.hover) return;
    d.hover = target;
    setHover(target);
    if (d.timer) clearTimeout(d.timer);
    d.timer = target.startsWith("bank:") ? window.setTimeout(() => setExpanded(true), DWELL_MS) : null;
  };

  /** Ends one pointer's hold. The pad always stops, unless that pointer dragged it onto HOLD. */
  finishPointer.current = (pointerId, cancelled) => {
    const d = drags.current.get(pointerId);
    if (!d) return;
    drags.current.delete(pointerId);
    liftPad(d.from);
    if (d.active && !cancelled) {
      if (d.hover === "hold:") holdPad(d.from);
      else dropOn(d.from, d.hover);
    }
    endDrag(d);
  };

  // Releases are caught on the window, so a lost capture, a re-render, or another pad being tapped can't strand a sound.
  useEffect(() => {
    const up = (e: PointerEvent) => finishPointer.current(e.pointerId, e.type === "pointercancel");
    const releaseAll = () => {
      for (const id of [...drags.current.keys()]) finishPointer.current(id, true);
    };
    const hidden = () => document.hidden && releaseAll();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  /** Plays a pad's sample on a loop until any pad is pressed; tuning changes retune it live. */
  const holdPad = (index: number) => {
    const pad = pads[index];
    if (!pad || pad.placeholder) return;
    holdVoice.current?.release();
    holdIndex.current = index;
    holdVoice.current = startPad(-2, audioOf(pad), pad.sampleRate, shiftFor(pad, tunedTarget, a4), null, "loop", undefined, normalize ? pad.knobDb : undefined);
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
    const held = holdIndex.current === null ? undefined : pads[holdIndex.current];
    if (held) holdVoice.current?.setShift(shiftFor(held, tunedTarget, a4));
  }, [pads, tunedTarget, a4]);

  useEffect(() => setReferencePitch(a4), [a4]);

  // Sorting: bring each unknown sound's pad up and play it once, so the user hears what they are naming.
  useEffect(() => {
    if (!focus?.started) return;
    const pad = Object.values(latest.current.pads).find((p) => isReal(p) && p.origIndex === focus.queue[focus.pos]);
    if (!pad) return;
    setSelected(pad.index);
    setBank(Math.floor(pad.index / 16));
    pressPad(pad.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.started, focus?.pos]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Ends the sorting: every sound has a type, so Drum layouts unlocks. */
  const finishOrganize = () => {
    setFocus(null);
    setOrganize(true);
    setOrganized(true);
    setNotice("Sounds sorted. Drum layouts is now available in the menu.");
  };

  /** Organize: file names settle the obvious sounds, then the rest are put to the user one at a time. */
  const startOrganize = () => {
    const list = Object.values(latest.current.pads)
      .filter(isReal)
      .sort((a, b) => a.index - b.index);
    const plan = planOrganize(list.map((p) => ({ key: p.origIndex, name: p.name, known: categoryHints.current[p.origIndex] !== undefined })));
    if (plan.byName.size > 0) {
      recordEdit();
      setPads((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([i, p]) => {
            const category = isReal(p) ? plan.byName.get(p.origIndex) : undefined;
            if (!category || p.category === category) return [i, p];
            return [i, { ...p, category, ...(p.tuneLocked ? {} : { tune: tuneDefault(false, false, category, p.detectedMidi, tunedTargetRef.current) }) }];
          }),
        ),
      );
    }
    if (plan.ask.length === 0) return finishOrganize();
    setMenuOpen(false);
    setMode("type");
    setFocus({ queue: plan.ask, pos: 0, started: false });
  };

  const toggleOrganize = (on: boolean) => {
    setOrganize(on);
    if (on && !organized) startOrganize();
  };

  /** The introduction was read: the first sound plays. */
  const beginSorting = () => setFocus((f) => (f ? { ...f, started: true } : f));

  /** "Not now" on the introduction: nothing is sorted, Organize goes back off. */
  const cancelIntro = () => {
    setFocus(null);
    setOrganize(false);
  };

  /** Stops whatever is still playing, with a short fade (sorting plays each sound through, so an answer has to cut it). */
  const cutAll = () => {
    for (const handle of releasePad.current.values()) handle.cut();
    releasePad.current.clear();
  };

  /** Next unknown sound, or the end of the sorting. */
  const nextFocus = () => {
    if (!focus) return;
    cutAll();
    if (focus.pos + 1 < focus.queue.length) setFocus({ ...focus, pos: focus.pos + 1 });
    else finishOrganize();
  };

  /** The trash key: the sound is deleted (undo brings it back) and the next one plays. */
  const trashFocused = (pad: Pad) => {
    deletePad(pad);
    nextFocus();
  };

  /** The skip key: the sound is marked as the unknown type ("Other") and the next one plays. */
  const skipFocused = (pad: Pad) => {
    classifyPad(pad, "other");
    nextFocus();
  };

  /** The cross: leave the sorting early. The sounds already sorted keep their types; Organize and Drum layouts stay off until it is done. */
  const leaveOrganize = () => {
    if (
      !window.confirm(
        "Sorting your sounds lets KoalaTune colour and label every pad and place each one in the right spot of a drum layout. Drum layouts stays locked until all of them are sorted.\n\nSounds you have already sorted keep their type. Leave anyway?",
      )
    )
      return;
    cutAll();
    setFocus(null);
    setOrganize(false);
  };

  /**
   * Picking a key retargets every pad. Pads whose Tune switch the user has set by hand keep it,
   * and every pad keeps its semitone/cents trim, so manual corrections survive a key change.
   * Tapping the key that is already selected switches tuning off, so every sound reverts to its original pitch.
   */
  const selectKey = (pc: number) => {
    if (!tuneAll) return selectKeyForPad(pc);
    recordEdit();
    const next = pc === keyPc ? null : pc;
    setKeyPc(next);
    setTunedTarget(next);
    tunedTargetRef.current = next;
    // A key for every pad replaces any key a single pad was given.
    setPads((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([i, p]) => {
          const plain = { ...p, keyPc: undefined };
          return [i, p.tuneLocked ? plain : { ...plain, tune: tuneDefault(false, false, p.category, p.detectedMidi, next) }];
        }),
      ),
    );
  };

  /** "Tune one": the key applies to the selected pad only. Tapping that pad's key again switches its tuning off. */
  const selectKeyForPad = (pc: number) => {
    const pad = selected !== null ? pads[selected] : undefined;
    if (!pad || !isReal(pad)) return;
    const same = pad.tune && (pad.keyPc ?? keyPc) === pc;
    patchPad(pad.index, same ? { tune: false, tuneLocked: true, keyPc: undefined } : { tune: true, tuneLocked: true, keyPc: pc });
  };

  /**
   * Bakes every tuned pad's shift into its audio (windowed-sinc resample) and downloads the
   * rebuilt project. With the normalize switch on, every sample is loudness-normalized and every pad volume knob set to a
   * loudness-balanced level (see audio/loudness.ts); the audio files themselves are not gain-changed.
   */
  const padsNow = pads;
  const exportProject = async (mode: ExtraDrums = "keep") => {
    const pads = mode === "delete" ? withoutExtraDrums(padsNow) : padsNow;
    const arrangement = arrangementOf(pads);
    const placeholderList = placeholdersOf(pads);
    const project = projectRef.current;
    if (!project) return;
    setExporting(true);
    try {
      const tuned: TunedSample[] = [];
      // Koala's pan runs 0..1 (0.5 = centre) for L100..R100, so N percent is N/200 off centre.
      const pans = new Map<number, number>();
      if (spread) {
        // Only melodic pads move; bass, drums and the rest stay centred.
        const tunedPads = Object.values(pads).filter((p) => p.category === "melodic" && isReal(p));
        const offsets = balancedSpread(tunedPads.length, MAX_SPREAD_PERCENT);
        tunedPads.forEach((p, i) => pans.set(p.sampleId, 0.5 + offsets[i] / 200));
      }
      const allPads = Object.values(pads).filter(isReal);
      // Every pad's final (tuned) audio, so loudness is measured on what Koala will actually play.
      // Only retimed pads hold new audio; the rest point at the pad's own data. Each pad is measured as
      // it is rendered, so the whole project is never shipped to the worker or copied at once.
      const rendered: { pad: Pad; channelData: Float32Array[]; retimed: boolean }[] = [];
      const stats: BalanceStats[] = [];
      let done = 0;
      for (const pad of allPads) {
        setExportProgress(`${done++}/${allPads.length}`);
        const shift = shiftFor(pad, tunedTarget, a4);
        const retimed = pad.tune && Math.abs(shift) >= 1e-6;
        if (!retimed && !normalize) continue;
        // The pad's audio was already cut to Koala's start/end points on load, so a stretched loop stays in time.
        const channelData = retimed
          ? limitPeak(await getRenderWorker().resamplePitch(pad.channelData, semitonesToRatio(shift)))
          : pad.channelData;
        if (normalize) stats.push(await getRenderWorker().measure({ channelData, sampleRate: pad.sampleRate, category: pad.category }));
        rendered.push({ pad, channelData, retimed });
      }
      // Files are loudness-normalized (quiet up, loud down); the mix goes on the pad knobs.
      const vols = new Map<number, number>();
      const gains = normalize ? balanceFromStats(stats, FILE_CEILING_DB) : null;
      rendered.forEach((r, i) => {
        if (gains) vols.set(r.pad.sampleId, volFromDb(gains.knobDb[i]));
        tuned.push({
          sampleId: r.pad.sampleId,
          sampleRate: r.pad.sampleRate,
          channelData: r.channelData,
          retimed: r.retimed,
          trimmedFrom: r.pad.trimmedFrom,
          gainDb: gains?.gainDb[i],
        });
      });
      // Ghost snares and soft kicks are made from their source's final audio (tuned and loudness-balanced), then quieted and dulled.
      const ghostExports: GhostPadExport[] = [];
      for (const gp of Object.values(pads).filter((p) => p.ghost)) {
        const source = allPads.find((p) => p.origIndex === gp.ghost!.sourceOrigIndex);
        if (!source) continue;
        const at = rendered.findIndex((r) => r.pad === source);
        let audio = at >= 0 ? rendered[at].channelData : source.channelData;
        if (gains && at >= 0) audio = applyGainDb(audio, gains.gainDb[at]);
        ghostExports.push({
          index: gp.index,
          label: GHOST_LABEL[gp.ghost!.kind],
          color: autoColor ? autoColorOf(gp) : undefined,
          sourceSampleId: source.sampleId,
          sampleRate: source.sampleRate,
          channelData: makeGhostAudio(audio, source.sampleRate, gp.ghost!.kind),
        });
      }
      rendered.length = 0;
      const buses = new Map<number, number>();
      if (routeBuses) {
        for (const p of allPads) buses.set(p.sampleId, CATEGORY_BUS[p.category ?? "other"]);
      }
      const playback = new Map<number, PadPlayback>();
      if (autoPlayback) {
        for (const p of allPads) {
          const settings = p.category ? playbackFor(p.category) : undefined;
          if (settings) playback.set(p.sampleId, settings);
        }
      }
      const colors = new Map<number, { color: string; label: string }>();
      if (autoColor) {
        for (const p of allPads) {
          // The label is what the pad's caption says in the app, without its number.
          if (p.category) colors.set(p.sampleId, { color: autoColorOf(p), label: captionOf(p) || labelOf(p) });
        }
      }
      const { blob, filename } = await buildTunedKoala(project, tuned, { vols, buses, busNames: routeBuses ? BUS_NAMES : undefined, sidechain: routeBuses, masterChain, masterStyle, arrangement, pans, colors, playback, placeholders: placeholderList, ghosts: ghostExports });
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  /** Original slot -> current slot (null = deleted), or undefined when nothing was moved or deleted. */
  const arrangementOf = (pads: Record<number, Pad>): Map<number, number | null> | undefined => {
    const project = projectRef.current;
    if (!project) return undefined;
    // Every sound in the project: those not on a pad (a sample pack's unchosen spares) map to null, so the export drops them.
    const slots = project.pads.filter((p) => p.pad >= 0);
    const now = new Map(Object.values(pads).filter(isReal).map((p) => [p.origIndex, p.index]));
    if (!slots.some((r) => now.get(r.pad) !== r.pad)) return undefined;
    return new Map(slots.map((r) => [r.pad, now.get(r.pad) ?? null]));
  };
  const arrangement = analyzing === 0 ? arrangementOf(pads) : undefined;

  const palette = paletteById(paletteId);
    const shownBank = bank;
  /** Palette colour for a sound, by its own category. Where it sits (including on a layout's slots) never changes it. */
  const autoColorOf = (p: Pad): string => {
    const base = colorFor(palette, p.category ?? "other");
    return p.ghost ? shade(base, 2) : base;
  };
  /** The words on a pad: its own category, keyword or ghost name. A layout slot never relabels a sound. */
  const labelOf = (p: Pad): string => (p.placeholder ? p.placeholder.label : p.ghost ? GHOST_LABEL[p.ghost.kind] : padLabel(p));
  const colorOfPad = (p: Pad) => (p.placeholder ? placeholderColor(p) : autoColorOf(p));
  /** The layout's silent pads, written into the exported project. */
  const placeholdersOf = (from: Record<number, Pad>) =>
    Object.values(from)
      .filter((p) => p.placeholder)
      .map((p) => ({ index: p.index, label: p.placeholder!.label, color: placeholderColor(p) }));
  const placeholderList = placeholdersOf(pads);
  const canExport =
    (arrangement !== undefined ||
      placeholderList.length > 0 ||
      Object.values(pads).some((p) => p.ghost) ||
      (normalize || autoColor || routeBuses || masterChain || autoPlayback ? Object.keys(pads).length > 0 : Object.values(pads).some((p) => p.tune))) &&
    analyzing === 0 &&
    !exporting;
  const hasProject = Object.keys(pads).length > 0;
  const longPads = Object.values(pads)
    .filter((p) => longSamples.includes(p.origIndex))
    .sort((a, b) => a.index - b.index);
  const selectedPad = selected !== null ? pads[selected] : undefined;

  /** Hot swap only exists with the finger-drumming layout; without it the screen starts on Tune. */
  const shownMode: Mode = focus ? "type" : mode === "swap" && !layout.on ? "tune" : mode;
  /** The note a pad is tuned to, or "--" when its tuning is off or there is no key yet. */
  const keyNameOf = (pad: Pad) => {
    const pc = pad.tune ? (pad.keyPc ?? keyPc) : null;
    return pc === null ? "--" : NOTE_NAMES[pc];
  };
  const padName = (pad: Pad) => `${BANKS[Math.floor(pad.index / 16)]}${(pad.index % 16) + 1}`;
  const panel = selectedPad && !selectedPad.placeholder && !selectedPad.ghost && (
    <PadPanel
      pad={selectedPad}
      keyName={keyNameOf(selectedPad)}
      autoShift={shiftFor({ ...selectedPad, semis: 0, cents: 0 }, tunedTarget, a4)}
      onChange={(patch) => {
        if ("tune" in patch) patchPad(selectedPad.index, { ...patch, tuneLocked: true });
        else patchPad(selectedPad.index, patch);
      }}
    />
  );
  /** The type the selected pad's slot wants: a finger-drumming slot's own type on bank A, otherwise the sound's own type. */
  const slotCategory = selectedPad && (layout.on && selectedPad.index < 16 ? layoutById(layout.id).slots[selectedPad.index]?.category : undefined) || selectedPad?.category;
  /** Swaps a hidden spare onto the selected pad; the sound it replaces goes back into the hot-swap menu, so the swap can be undone by swapping again. */
  const swapInHidden = (other: Pad, target: Pad) => {
    recordEdit();
    const incoming: Pad = { ...other, index: target.index, tune: tuneDefault(other.tuneLocked, other.tune, other.category, other.detectedMidi, tunedTarget) };
    setPads((prev) => ({ ...prev, [target.index]: incoming }));
    setHidden((prev) => {
      const next = { ...prev };
      delete next[other.origIndex];
      if (isReal(target)) next[target.origIndex] = { ...target, index: -1 };
      return next;
    });
  };
  /** Pack tags the project's sounds share ("Rio - ..."), left out of the names in the swap list. */
  const tags = packTags([...Object.values(pads).filter(isReal), ...Object.values(hidden)].map((p) => p.name));
  const swapList = selectedPad && (
    <SwapList
      slotLabel={selectedPad.ghost ? `${GHOST_LABEL[selectedPad.ghost.kind]} (made on export unless filled)` : `PAD ${(selectedPad.index % 16) + 1}`}
      candidates={sortForSlot(
        [
          // A pack's hidden spares: the same type as the slot, or for a drum slot any drum.
          ...Object.values(hidden).filter((p) => (isKitCategory(slotCategory) ? isKitCategory(p.category) : p.category === slotCategory)),
          ...Object.values(pads).filter((p) => isReal(p) && isKitCategory(p.category) && p.index >= 16 && p.index !== selectedPad.index && isKitCategory(slotCategory)),
        ],
        slotCategory,
      ).sort((a, b) => (slotCategory === "bass" ? Number(!!a.is808 !== !!selectedPad.is808) - Number(!!b.is808 !== !!selectedPad.is808) : 0))}
      audioOf={audioOf}
      nameOf={(p) => displayName(p.name, tags)}
      onSwap={(other) => {
        if (hidden[other.origIndex]) return swapInHidden(other, selectedPad);
        recordEdit();
        setPads((prev) => (selectedPad.ghost ? fillGhostSlot(prev, selectedPad.index, other.index) : movePad(prev, selectedPad.index, other.index)));
      }}
    />
  );

  /** The colour a loaded pad lights up in: its sound type's colour when auto-colour is on, else the default lilac. */
  /** The wording printed next to a pad's number: its placeholder or ghost label, else its sound type. */
  const captionOf = (pad: Pad | undefined): string => {
    if (!pad) return "";
    if (pad.placeholder || pad.ghost) return labelOf(pad);
    return isReal(pad) && pad.category ? CATEGORIES[categoryIndex(pad.category)].short : "";
  };
  /** The sound type a pad's symbol shows: real sounds and ghosts have one, silent placeholders none. */
  const symbolOf = (pad: Pad | undefined): CategoryId | undefined => {
    if (!pad || pad.placeholder) return undefined;
    if (pad.ghost) return pad.ghost.kind === "ghostSnare" ? "snare" : "kick";
    return pad.category;
  };
  const litColor = (pad: Pad) => (pad.placeholder ? placeholderColor(pad) : pad.category ? autoColorOf(pad) : "#b3a6f2");
  /** The note marked under the keys: the project key, or in "Tune one" the selected pad's own key. */
  const shownKey = tuneAll ? keyPc : selectedPad?.tune ? (selectedPad.keyPc ?? keyPc) : null;

  return (
    <div
      className="stage"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop(e.dataTransfer);
      }}
    >
      <div className="phone">
        {/* Outside the menu: closing the menu unmounts it, and an input that is gone never reports the folder that was picked. */}
        <input
          ref={addPackInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addPack(() => findPackInFileList(files));
          }}
        />
        {menuOpen && (
          <div className="menu">
            <button
              className="menu__button menu__button--primary"
              disabled={!canExport}
              onClick={() => {
                if (layout.on && extraDrumCount(pads) > 0) {
                  setMenuOpen(false);
                  setExtraPrompt(true);
                } else void exportProject();
              }}
            >
              {exporting ? `Exporting ${exportProgress || "…"}` : "Export"}
            </button>
            <div className="menu__row">
              <button className="menu__button" disabled={historySize.undo === 0 || analyzing > 0} onClick={undo}>
                Undo
              </button>
              <button className="menu__button" disabled={historySize.redo === 0 || analyzing > 0} onClick={redo}>
                Redo
              </button>
            </div>
            <Switch
              label="Mix"
              hint="Balances levels, routes sounds to buses (bass ducks to the kick), sets each sound type's settings and spreads melodic pads"
              on={mix}
              onChange={setMix}
            />
            <button className="menu__button" disabled={!mix || !hasProject || normalizing} onClick={normalizeNow}>
              {normalizing ? "Normalizing…" : "Normalize now"}
            </button>
            <Switch label="Master chain" hint="Heavy, warm glue, saturation and limiting on the main output" on={masterChain} onChange={setMasterChain} />
            <select
              className="menu__select"
              value={masterStyle}
              disabled={!masterChain}
              onChange={(e) => setMasterStyle(e.target.value as MasterStyle)}
              aria-label="Master chain style"
            >
              {MASTER_STYLES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Switch
              label="Organize"
              hint="Colours and labels the pads by sound type. Asks about any sound whose name does not say what it is"
              on={organize}
              disabled={!hasProject || analyzing > 0}
              onChange={toggleOrganize}
            />
            <Switch
              label="Drum layouts"
              hint={organized ? "Arranges the pads for finger drumming" : "Available once Organize has sorted every sound"}
              on={layout.on}
              disabled={!hasProject || analyzing > 0 || (!organized && !layout.on)}
              onChange={toggleLayout}
            />
            <select
              className="menu__select"
              value={layout.id}
              onChange={(e) => chooseLayout(e.target.value)}
              disabled={analyzing > 0 || (!organized && !layout.on)}
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
              disabled={!organized && !layout.on}
              onClick={() => {
                setLayoutPickerOpen(true);
                setMenuOpen(false);
              }}
            >
              Layouts
            </button>
            <button
              className="menu__button"
              disabled={!hasProject || !layout.on || analyzing > 0 || !!addPackStatus}
              title="Choose another sample pack folder. It only fills slots that are still missing a sound; everything you have stays as it is."
              onClick={() => {
                addPackInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Add pack"}
            </button>
            <Switch label="Show symbols on pads" on={padSymbols} onChange={setPadSymbols} />
            <label className="menu__a4">
              Sample pack memory
              <select
                className="menu__select"
                value={packMemory}
                onChange={(e) => setPackMemory(e.target.value as PackMemory)}
                aria-label="Sample pack memory"
              >
                <option value="low">Low (96 MB)</option>
                <option value="auto">Auto ({Math.round(packByteBudget("auto") / 1048576)} MB)</option>
                <option value="high">High ({Math.round(packByteBudget("high") / 1048576)} MB)</option>
              </select>
            </label>
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
            <button
              className="menu__button"
              onClick={() => {
                setPaletteOpen(true);
                setMenuOpen(false);
              }}
            >
              Color palette: {palette.name}
            </button>
            <div className="menu__version">
              KoalaTune v{__APP_VERSION__} · {__APP_BUILD__}
              <br />
              Mix preset: {ACTIVE_MIX_PRESET.name}
            </div>
          </div>
        )}

        <div className="upper">
        {/* Header: the mode keys on the left, the four banks in the middle and the menu on the right, each key in a tray. */}
        <div className="controls">
          <div className="tray">
            {MODES.map((m) => {
              const on = shownMode === m.id;
              return (
                <button
                  key={m.id}
                  className={`cap cap--mode${on ? " cap--on" : ""}`}
                  aria-label={m.aria}
                  aria-pressed={on}
                  disabled={m.id === "swap" && !layout.on}
                  title={m.id === "swap" && !layout.on ? "Hot swap needs the finger drumming layout (menu)" : undefined}
                  onClick={() => setMode(m.id)}
                >
                  <span className="cap__led" />
                  <span className="cap__legend">{m.label}</span>
                </button>
              );
            })}
          </div>
          <div className="tray">
            {BANKS.map((name, i) => {
              const hasSamples = Object.keys(pads).some((index) => Math.floor(Number(index) / 16) === i);
              const cls = ["cap", "cap--bank", shownBank === i && "cap--on", !hasSamples && "cap--empty", hover === `bank:${i}` && "cap--target"]
                .filter(Boolean)
                .join(" ");
              return (
                <button key={name} className={cls} aria-label={`Bank ${name}`} aria-pressed={shownBank === i} data-drop="bank" data-index={i} onClick={() => setBank(i)}>
                  <span className="cap__led" />
                  <span className="cap__legend">{name}</span>
                </button>
              );
            })}
          </div>
          <button className="cap cap--menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <svg viewBox="0 0 14 10" aria-hidden="true" className="cap--menu__glyph">
              <path d="M1 1h12M1 5h12M1 9h12" />
            </svg>
            <span className="cap__legend">Menu</span>
          </button>
        </div>

        {/* The screen: a black OLED in Silkscreen, with a title bar in inverse video. It grows over the deck's place in Swap mode. */}
        <div className={`screen-wrap screen-wrap--${shownMode}${focus?.started ? " screen-wrap--focus" : ""}`}>
          <section className="screen" aria-label={`Display: ${shownMode}`}>
            {focus?.started && (
              <div className="screen__sort">
                <button className="screen__sort-key" aria-label="Delete this sound" disabled={!selectedPad} onClick={() => selectedPad && trashFocused(selectedPad)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
                  </svg>
                  <span>Delete</span>
                </button>
                <button className="screen__sort-key" aria-label="Skip: mark this sound as unknown" disabled={!selectedPad} onClick={() => selectedPad && skipFocused(selectedPad)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 3.5l6 4.5-6 4.5zM12.5 3v10" />
                  </svg>
                  <span>Skip</span>
                </button>
              </div>
            )}
            <div className="oled">
              {selectedPad && (
                <div className="oled__head">
                  <span>{shownMode === "swap" ? "Hot swap" : shownMode === "type" ? "Sound type" : "Tune"}</span>
                  <span>{shownMode === "tune" && tuneAll ? "All pads" : shownMode === "tune" ? `Pad ${padName(selectedPad)}` : padName(selectedPad)}</span>
                </div>
              )}
              {!hasProject ? (
                <label className="dropzone">
                  <svg className="dropzone__ants" aria-hidden="true">
                    <rect className="dropzone__ants-base" pathLength="280" />
                    <rect className="dropzone__ants-dash" pathLength="280" />
                  </svg>
                  <input type="file" accept=".koala" hidden onChange={(e) => pickFile(e.target.files)} />
                  <input
                    type="file"
                    hidden
                    // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
                    webkitdirectory=""
                    ref={packInput}
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (list.length) void loadPack(() => findPackInFileList(list));
                    }}
                  />
                  <strong>{loading ? importStatus || "Loading…" : "Drop a .koala project"}</strong>
                  <span>or a sample pack folder</span>
                  <span>or tap to choose one</span>
                  <button
                    type="button"
                    className="dropzone__pack"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      packInput.current?.click();
                    }}
                  >
                    <span className="dropzone__long">Choose a pack folder</span>
                    <span className="dropzone__short">Pick a pack folder</span>
                  </button>
                </label>
              ) : !selectedPad ? (
                <div className="screen__message">
                  <strong>{projectName}</strong>
                  <span>{analyzing > 0 ? "Analyzing pads…" : "Tap a pad"}</span>
                </div>
              ) : shownMode === "swap" ? (
                swapList
              ) : !isReal(selectedPad) ? (
                <div className="screen__message">
                  <strong>{labelOf(selectedPad)}</strong>
                  <span>
                    {selectedPad.ghost
                      ? "Made on export unless filled"
                      : selectedPad.placeholder?.kind === "missing"
                        ? "Silent placeholder: drag a sound here"
                        : "Silent placeholder"}
                  </span>
                </div>
              ) : shownMode === "tune" ? (
                panel
              ) : (
                <div className="type-readout">
                  <div className="type-readout__name">{selectedPad.category ? CATEGORIES[categoryIndex(selectedPad.category)].label : "Analyzing…"}</div>
                  <div className="type-readout__sample">{displayName(selectedPad.name, tags)}</div>
                  <div className="type-readout__line">
                    <span>Key {keyNameOf(selectedPad)}</span>
                    <span>
                      {(() => {
                        const shift = selectedPad.tune ? shiftFor({ ...selectedPad, semis: 0, cents: 0 }, tunedTarget, a4) + trimCents(selectedPad.semis, selectedPad.cents) / 100 : 0;
                        return `${shift < 0 ? "-" : "+"}${Math.abs(shift).toFixed(2)}st`;
                      })()}
                    </span>
                  </div>
                  <Waveform channelData={selectedPad.channelData} />
                </div>
              )}
            </div>
          </section>

          {drag && !expanded && (
            <div className={`hold-zone${hover === "hold:" ? " hold-zone--target" : ""}`} data-drop="hold">
              HOLD
            </div>
          )}
          {drag && expanded && (
            <div className="drop-targets">
              <div className={`drop-target drop-target--trash${hover === "trash:" ? " drop-target--hot" : ""}`} data-drop="trash">
                🗑
              </div>
              <div className={`drop-target drop-target--unused${hover === "unused:" ? " drop-target--hot" : ""}`} data-drop="unused">
                Unused pad
              </div>
            </div>
          )}
        </div>

        {/* The deck under the screen: the sound type keys, or the piano with its two keys. Hot swap has none, its list takes the room. */}
        {shownMode === "type" && (
          <div className={`deck${focus?.started ? " deck--focus" : ""}`}>
            <TypeKeys
              pad={selectedPad && isReal(selectedPad) ? selectedPad : null}
              palette={palette}
              onClassify={(pad, category) => {
                classifyPad(pad, category);
                if (focus?.started) nextFocus();
              }}
            />
          </div>
        )}
        {shownMode === "tune" && (
          <div className="deck deck--tune">
            <Keyboard selected={shownKey} onSelect={selectKey} />
            <div className="deck__side">
              <button
                className={`cap cap--side${tuneAll ? " cap--on" : ""}`}
                aria-pressed={tuneAll}
                aria-label="Tune all pads or the selected pad only"
                onClick={() => setTuneAll((on) => !on)}
              >
                <span className="cap__led" />
                <span className="cap__legend">{tuneAll ? "All" : "One"}</span>
              </button>
              <button className={`cap cap--side${toneOn ? " cap--on" : ""}`} aria-pressed={toneOn} onClick={() => setToneOn((on) => !on)}>
                <span className="cap__led" />
                <span className="cap__legend">Tone</span>
              </button>
            </div>
          </div>
        )}

        </div>

        <div className="lower">
        <div className={`padzone${focus?.started ? " padzone--focus" : ""}`}>
          <div className={`pads${focus?.started ? " pads--focus" : ""}`}>
            {Array.from({ length: 16 }, (_, slot) => {
              const index = shownBank * 16 + slot;
              const pad = pads[index];
              const cls = [
                "pad",
                pad && "pad--loaded",
                pad?.placeholder && "pad--placeholder",
                pad?.tune && "pad--tuned",
                selected === index && "pad--selected",
                focus?.started && selected === index && "pad--focus",
                drag?.from === index && "pad--dragging",
                hover === `pad:${index}` && "pad--target",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={slot}
                  className={cls}
                  style={pad ? ({ "--c": litColor(pad) } as React.CSSProperties) : undefined}
                  data-drop="pad"
                  data-index={index}
                  onPointerDown={(e) => onPadDown(e, index)}
                  onPointerMove={onPadMove}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={`Pad ${slot + 1}`}
                >
                  <span className="pad__number">
                    <span key={captionOf(pad)}>
                      {slot + 1}
                      {captionOf(pad) && ` ${captionOf(pad)}`}
                    </span>
                  </span>
                  {padSymbols && symbolOf(pad) && <PadSymbol category={symbolOf(pad)!} />}
                </button>
              );
            })}
          </div>

          {drag && expanded && (
            <div className="allpads">
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
          )}
        </div>
        </div>

        {focus && !focus.started && (
          <div className="focus focus--intro" role="dialog" aria-label="Sort your sounds">
            <div className="focus__card">
              <div className="focus__title">Let's sort your sounds</div>
              <p>
                {focus.queue.length === 1 ? "One sound has a name" : `${focus.queue.length} sounds have names`} that don't say what{" "}
                {focus.queue.length === 1 ? "it is" : "they are"}. Each one plays all the way through. Tap the sound type that fits and the next one plays. Tap or hold its pad to hear it again.
              </p>
              <div className="focus__actions">
                <button className="menu__button" onClick={cancelIntro}>
                  Not now
                </button>
                <button className="menu__button menu__button--primary" onClick={beginSorting}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
        {focus?.started && (
          <div className="focus" role="dialog" aria-label="Sort your sounds">
            <button className="focus__close" aria-label="Leave sorting" onClick={leaveOrganize}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
            <div className="focus__text">
              <div className="focus__title">What kind of sound is this?</div>
              <div className="focus__name">{selectedPad ? displayName(selectedPad.name, tags) : ""}</div>
              <div className="focus__count">
                {focus.pos + 1} of {focus.queue.length}
              </div>
            </div>
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}

        {layoutPickerOpen && (
          <LayoutPicker
            palette={palette}
            selectedId={layout.id}
            onSelect={chooseLayout}
            onClose={() => setLayoutPickerOpen(false)}
          />
        )}

        {longPads.length > 0 && (
          <LongSamplesModal pads={longPads} maxSeconds={MAX_SAMPLE_SECONDS} onDelete={deletePad} onClose={() => setLongSamples([])} />
        )}

        {extraPrompt && (
          <ExtraDrumsModal
            count={extraDrumCount(pads)}
            onChoose={(mode) => {
              setExtraPrompt(false);
              void exportProject(mode);
            }}
            onCancel={() => setExtraPrompt(false)}
          />
        )}

        {paletteOpen && <PalettePicker selectedId={paletteId} onSelect={setPaletteId} onClose={() => setPaletteOpen(false)} />}
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
