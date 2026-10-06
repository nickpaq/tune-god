import { useCallback, useEffect, useRef, useState } from "react";
import { playbackFor, type PadPlayback } from "./audio/padSettings";
import { Keyboard } from "./components/Keyboard";
import { blankProject, entriesOfDrop, findPackInEntries, findPackInFileList, writeBankSounds, type FoundPack } from "./audio/packProject";
import { BANK_ZONES, bankTakes, MAX_LOAD_SECONDS, numberedLabel, placeBank, planBank, type BankLoad } from "./audio/bankLoad";
import { readAcapellaZip } from "./audio/acapella";
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
import { setReferencePitch, startPad, type PadHandle, type PadMode, type ReferenceTone } from "./audio/player";
import { buildTunedKoala, downloadBlob, masterEffectNames, type GhostPadExport, type TunedSample } from "./audio/exportProject";
import { applyGainDb } from "./audio/gain";
import { balanceFromStats, FILE_CEILING_DB, type BalanceStats } from "./audio/loudness";
import { balancedSpread } from "./audio/spread";
import { CATEGORIES, categoryIndex, isKitCategory, isTunedCategory, migrateCategory, type CategoryId } from "./audio/classify";
import { colorFor, paletteById, shade, DEFAULT_PALETTE_ID } from "./audio/palettes";
import { emptyPadInBank, movePad, nextEmptyPad, removePad } from "./audio/padMoves";
import { BUS_NAMES, CATEGORY_BUS } from "./audio/routing";
import { sortForSlot } from "./audio/swapOrder";
import { ExtraDrumsModal } from "./components/ExtraDrumsModal";
import { extraDrumCount, fillGhostSlot, withoutExtraDrums, type ExtraDrums } from "./audio/extraDrums";
import { SwapList } from "./components/SwapList";
import { TypeKeys } from "./components/TypeKeys";
import { Waveform } from "./components/Waveform";
import { LongSamplesModal } from "./components/LongSamplesModal";
import { layoutById } from "./audio/fingerLayouts";
import { makePlaceholderPad, placeholderColor } from "./audio/placeholderPads";
import { makeGhostPad } from "./audio/ghostPads";
import { freeSongSlots, makeSectionPads } from "./audio/songPads";
import { scalePlans } from "./audio/song/tapGrid";
import { checkStems } from "./audio/song/stems";
import { SongChopModal, type ChopSettings } from "./components/SongChopModal";
import { projectTimeSignature } from "./audio/koalaProject";
import { addSongSections, songTemplate, type SongExport, type SongTemplate } from "./audio/exportSong";
import { GHOST_LABEL, makeGhostAudio } from "./audio/ghost";
import { padLabel } from "./audio/padLabels";
import { PadSymbol } from "./components/PadSymbol";
import { clearProjectFile, loadProjectFile, loadState, saveProjectFile, saveState, type SavedPad } from "./storage";
import { A4_REFERENCE_RANGE, clampA4Reference, NOTE_NAMES, referenceOffsetSemitones, semitonesToRatio, splitTrim, trimCents, bassLiftSemitones } from "./audio/theory";
import { nextAnalysisWorker, getRenderWorker } from "./workers/workerClient";
import { useOledCell } from "./components/useOledCell";
import { SeqScreen, type SeqPad } from "./components/seq/SeqScreen";
import { useSafeArea } from "./components/useSafeArea";
import { SIDECHAIN_HINT, sidechainStatus } from "./audio/sidechain";
import { ACAPELLA_ICON, DRUM_ICON, K_ICON, KEYS_ICON } from "./components/dropIcons";
import { ACTIVE_MIX_PRESET, MASTER_STYLES, type MasterStyle } from "./audio/mixPresets";
import "./App.css";

const BANKS = ["A", "B", "C", "D"];
/** What the screen and the deck under it are doing: hot-swapping the selected pad's sound, choosing its sound type, or tuning. */
type Mode = "tune" | "type" | "swap";
const MODES: { id: Mode; label: string; aria: string }[] = [
  { id: "tune", label: "Tune", aria: "Tune mode" },
  { id: "type", label: "Type", aria: "Sound type mode" },
  { id: "swap", label: "Swap", aria: "Hot swap mode" },
];
/** How long the pad takes to slide onto its new pitch when the pitch slider is let go. */
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

/** Pad volume knob value for a dB level: plain linear amplitude (checked against a Koala project: -60 dB = 0.001, -6 dB = 0.501, 0 dB = 1, +6 dB = 1.995, -inf = 0). */
const volFromDb = (db: number) => 10 ** (db / 20);
/** Widest spread pan, in percent either side of centre. */
const MAX_SPREAD_PERCENT = 40;

/**
 * Total semitone shift for a pad: the shortest move (never more than 6 up or
 * down) from its exact detected pitch onto the target note, plus the manual trim.
 */
function shiftFor(pad: Pad, projectKey: number | null, a4: number, major = false): number {
  if (!pad.tune) return 0;
  let target = pad.keyPc ?? projectKey;
  // A loop's detected pitch is its key's relative minor. The key picked on the piano is a minor key (the default) or a major one, whose relative minor is a minor third below.
  if (target !== null && pad.category === "melodicLoop" && major) target = (target + 9) % 12;
  let base = 0;
  if (target !== null && pad.detectedMidi != null) {
    base = (((target - pad.detectedMidi) % 12) + 12) % 12;
    if (base > 6) base -= 12;
    // A loop is moved by whole semitones to the closest note of the key (no cents); anything it is off by, the user tweaks. A single sound's detected pitch
    // is measured against A440, so a different A4 reference moves the target note with it.
    if (pad.category === "melodicLoop") base = Math.round(base);
    else base += referenceOffsetSemitones(a4);
  }
  return base + pad.semis + pad.cents / 100;
}

/** A sound from the project itself: not a silent placeholder and not a ghost copy the layout made. */
const isReal = (p: Pad) => !p.placeholder && !p.ghost && !p.section;

/**
 * Preview only (the project's own play settings are untouched). Every pad plays while held and fades
 * out smoothly on release; bass, melodic and melodic loops also loop for as long as they are held.
 */
/**
 * The reference a pad is judged against. A single sound gets a sine on the key's note. A melodic loop gets a soft saw chord: the chord of the project's key
 * (minor, or major when the key is major), or with `relative` its relative key's chord (a minor key's relative major, a major key's relative minor), which
 * is what a loop in the other mode is tuned against.
 */
function referenceFor(pad: Pad, keyPc: number, major: boolean, relative: boolean): { pc: number; kind: ReferenceTone } {
  if (pad.category !== "melodicLoop") return { pc: keyPc, kind: "sine" };
  if (!major) return relative ? { pc: (keyPc + 3) % 12, kind: "major" } : { pc: keyPc, kind: "minor" };
  return relative ? { pc: (keyPc + 9) % 12, kind: "minor" } : { pc: keyPc, kind: "major" };
}

function padMode(pad: Pad): PadMode {
  if (pad.section) return "oneshot"; // a song section plays through, like it will in Koala
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

/** `scale` is how many screen cells one pixel of the art takes (2 for the small sort-key icons, 1 for the 20 x 20 start-screen icons). */
function PixelIcon({ rows, scale = 2 }: { rows: string[]; scale?: number }) {
  const cols = rows[0].length;
  return (
    <svg className="pixel-icon" viewBox={`0 0 ${cols} ${rows.length}`} style={{ width: `calc(var(--cell) * ${cols * scale})`, height: `calc(var(--cell) * ${rows.length * scale})` }} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
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
  /** The key picked on the piano is a major key (its melodic loops go to the relative minor a minor third below) instead of the default minor key. */
  const [keyMajor, setKeyMajor] = useState(saved.keyMajor ?? false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  /** "done/total" while an export is rendering, so a long high-quality render shows progress. */
  const [exportProgress, setExportProgress] = useState("");
  /**
   * The Organize switch: balances levels, routes sounds to buses, sets each sound type's settings, spreads the melodic pads and adds the master chain.
   * It never touches where a pad sits, what it says or what colour it is: the loaders (Load Bank A to D) place, label and colour every sound they bring in.
   */
  const [organize, setOrganize] = useState(saved.organizeOn ?? !!(saved.mix || saved.masterChainOn));
  const normalize = organize;
  const spread = organize;
  const routeBuses = organize;
  const autoPlayback = organize;
  const masterChain = organize;
  /** The Sidechain switch (the bass ducking to the kick); it needs a kick and a bass on the pads, so it stays locked until a drum kit and a bass are loaded. */
  const [sidechainOn, setSidechainOn] = useState(saved.sidechainOn ?? true);
  /** A short message over the screen ("Sounds organized..."). */
  const [notice, setNotice] = useState("");
  /** Pre-rendered normalized audio per pad (by original slot, so it follows a moved pad); only used for playback while Normalize is on. */
  const [normalizedData, setNormalizedData] = useState<Record<number, Float32Array[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  /** The sequencer screens (SEQ key). Interface only for now: nothing on them plays or records. */
  const [seqOpen, setSeqOpen] = useState(false);
  const [masterStyle, setMasterStyle] = useState<MasterStyle>(saved.masterStyle ?? "loud");
  const [padSymbols, setPadSymbols] = useState(saved.padSymbols ?? true);
  const [packMemory, setPackMemory] = useState<PackMemory>(saved.packMemory ?? "auto");
  /** Set while the export is waiting for the answer about drums the layout has no slot for. */
  const [extraPrompt, setExtraPrompt] = useState(false);
  /** The mode keys: what the screen and the deck show. Swap is the resting mode; it needs the finger-drumming layout (see shownMode). Null (a pressed key tapped again) is the plain waveform view. */
  const [mode, setMode] = useState<Mode | null>("swap");
  /** The looping pad and the reference tone on the key that play while the pitch slider is held. */
  const matchVoice = useRef<{ index: number; lift: number; handle: PadHandle } | null>(null);
  /** Sounds (by original slot) that were over the length limit when the project was imported; the warning lists the ones still present. */
  const [longSamples, setLongSamples] = useState<number[]>([]);
  const [layout, setLayout] = useState<LayoutState>({ on: false, id: layoutById(saved.layoutId).id, pre: {} });
  const [toneOn, setToneOn] = useState(saved.toneOn ?? false);
  /** Whether a tapped key retunes every pad ("Tune all") or only the selected one. */
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
  /** What the load buttons say while a bank is being loaded. */
  const [addPackStatus, setAddPackStatus] = useState("");
  const projectInput = useRef<HTMLInputElement>(null);
  /** The folder pickers of the four loaders (and the acapella file picker). They live outside the menu: closing the menu unmounts it. */
  const drumsInput = useRef<HTMLInputElement>(null);
  const loopsInput = useRef<HTMLInputElement>(null);
  const bassInput = useRef<HTMLInputElement>(null);
  const oneShotsInput = useRef<HTMLInputElement>(null);
  const acapellaInput = useRef<HTMLInputElement>(null);
  /** The stem's pad settings from the acapella zip being chopped (not in the project), for the export. */
  const acapellaTemplate = useRef<SongTemplate | undefined>(undefined);

  /** The sound type a dropped pack gave each pad (by pad number), used in place of the classifier's guess. */
  const categoryHints = useRef<Record<number, CategoryId>>({});
  /** What the drop zone says while a pack is being measured and levelled. */
  const [importStatus, setImportStatus] = useState("");

  const loadProject = useCallback(async (file: File, restore = false) => {
    const token = ++loadToken.current;
    setLoading(true);
    try {
      const project = await parseKoalaProject(file);
      if (token !== loadToken.current) return;
      projectRef.current = project;
      projectFile.current = file;
      categoryHints.current = {};
      past.current = [];
      future.current = [];
      lastEdit.current = { key: "", time: 0 };
      setHistorySize({ undo: 0, redo: 0 });
      // A project reopened with its layout on gets its silent placeholder pads back straight away.
      const layoutOn = restore && !!saved.layoutOn;
      setPads(
        {}, // silent placeholder pads are no longer brought back on reopening
      );
      setLayout((l) => ({ on: layoutOn, id: layoutById(layoutOn ? saved.layoutId : l.id).id, pre: layoutOn ? (saved.layoutPre ?? {}) : {} }));
      setHidden({});
      setNormalizedData({});
      setLongSamples([]);
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

      // Pads numbered past the grid are a sample pack's hidden spare sounds, and on reopening the saved state says which sounds are spare.
      const isSpare = (pad: number) => {
        const saved = restore ? restorePads.current[pad] : undefined;
        return saved ? !!saved.hidden : pad >= 64;
      };
      // Silent placeholder pads from an earlier export (every one plays silence.wav) are not sounds: they are left out, and the next export drops them.
      const slots = project.pads.filter((p) => p.pad >= 0 && p.fileName !== "silence.wav" && !(restore && restorePads.current[p.pad]?.deleted));
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
          label: ref.label || undefined,
          sampleId: ref.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          knobDb: restore ? restorePads.current[ref.pad]?.knobDb : undefined,
          is808: restore ? restorePads.current[ref.pad]?.is808 : undefined,
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
              // A sound reopened from a previous visit keeps exactly the Tune state it was left with; only a new sound is decided by analysis.
              tune: remembered
                ? remembered.tune
                : tuneDefault(cur.tuneLocked, cur.tune, cat, detectedMidi, tunedTargetRef.current),
            });
            // The sound may sit on a pad or in the hot-swap pool, and may have been moved, swapped or deleted while it was analysing.
            setPads((prev) => {
              const slot = Object.keys(prev).find((k) => prev[Number(k)].origIndex === ref.pad);
              if (slot === undefined) return prev;
              const done = analysed(prev[Number(slot)]);
              const next = { ...prev, [Number(slot)]: done };
              // Ghost snares and soft kicks rebuilt on reopening were made before their source was analysed, so they take its sound type now.
              for (const [k, g] of Object.entries(prev)) {
                if (g.ghost?.sourceOrigIndex === ref.pad) next[Number(k)] = { ...g, category: done.category };
              }
              return next;
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
    saveState({ organizeOn: organize, sidechainOn, masterStyle, padSymbols, packMemory, toneOn, a4, bank, selected, keyPc, tunedTarget, keyMajor });
  }, [organize, sidechainOn, masterStyle, padSymbols, packMemory, toneOn, a4, bank, selected, keyPc, tunedTarget, keyMajor]);

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

  /** Makes sure a project is open for a loader to write into: a blank one when nothing is. Returns whether one was started. */
  const ensureProject = async (): Promise<{ project: ParsedKoalaProject; started: boolean } | null> => {
    const started = !projectRef.current;
    if (started) {
      await loadProject(await blankProject());
      // Let the project's state settle before the loader reads it.
      await new Promise((resolve) => setTimeout(resolve));
    }
    return projectRef.current ? { project: projectRef.current, started } : null;
  };

  /** The bank that is shown once a loader has filled its pads. */
  const BANK_SHOWN: Record<BankLoad, number> = { drums: 0, loops: 1, bass: 1, oneShots: 2 };

  /**
   * Fills one bank from a folder (see bankLoad.ts for what each loader takes). Loading again replaces that bank's pads and spares and
   * leaves every other bank exactly as it is. The sounds are named by type and number ("Kick 1"), levelled against the rest of the
   * project, written into the project's zip, and put on their pads; what the pads cannot hold goes to the hot-swap pool.
   */
  const loadBank = async (bank: BankLoad, find: () => Promise<FoundPack> | FoundPack) => {
    if (addPackStatus || loading) return;
    setAddPackStatus("Reading…");
    try {
      const found = await find();
      const plan = planBank(bank, found.files);
      if (plan.problem) {
        window.alert(plan.problem);
        return;
      }
      const zone = BANK_ZONES[bank];
      const inZone = (p: Pad) => !p.section && p.index >= zone.start && p.index < zone.end;
      const opened = await ensureProject();
      if (!opened) return;
      const { project, started } = opened;
      const token = loadToken.current;
      const cur = latest.current;
      const lay = layoutById(layout.id);
      // What this load replaces: the real sounds on its pads, and the spares of its kind in the hot-swap pool.
      const replacedPads = Object.values(cur.pads).filter((p) => isReal(p) && inZone(p));
      const replacedSpares = Object.values(cur.hidden).filter((p) => (bank === "drums" ? isKitCategory(p.category) : bankTakes(bank, p.category)));
      const replaced = [...replacedPads, ...replacedSpares];
      const kept = [...Object.values(cur.pads).filter((p) => isReal(p) && !inZone(p)), ...Object.values(cur.hidden).filter((p) => !replacedSpares.includes(p))];
      const bytesOf = (p: Pad) => p.channelData.reduce((n, ch) => n + ch.length * 3, 0);
      const budget = Math.max(0, packByteBudget(packMemory) - Math.max(0, (projectFile.current?.size ?? 0) - replaced.reduce((n, p) => n + bytesOf(p), 0)));
      const result = await writeBankSounds(project, plan.groups, {
        existing: kept.map((p) => ({ channelData: p.channelData, sampleRate: p.sampleRate, category: p.category })),
        byteBudget: budget,
        maxSeconds: bank === "loops" || bank === "oneShots" ? MAX_LOAD_SECONDS : undefined,
        replace: replaced.map((p) => p.origIndex),
        measure: (input) => getRenderWorker().measure(input),
        onProgress: setAddPackStatus,
      });
      if (token !== loadToken.current) return;
      if (!result) {
        window.alert(`No sound in that folder could be loaded: they were too long (over ${MAX_LOAD_SECONDS} s), too big for the project size limit, or unreadable.`);
        return;
      }
      projectFile.current = result.file;
      void saveProjectFile(result.file);
      const placement = placeBank(bank, result.sounds.map((s) => ({ key: s.pad, category: s.category, is808: s.is808 })), lay);
      const fresh: Pad[] = [];
      for (const sound of result.sounds) {
        const ref = project.pads.find((p) => p.pad === sound.pad)!;
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        categoryHints.current = { ...categoryHints.current, [sound.pad]: sound.category };
        fresh.push({
          index: placement.positions.get(sound.pad) ?? -1,
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
        });
      }
      const onPads = fresh.filter((p) => p.index >= 0);
      const spares = fresh.filter((p) => p.index < 0);
      setPads((prev) => {
        const next: Record<number, Pad> = {};
        for (const p of Object.values(prev)) if (!inZone(p)) next[p.index] = p;
        for (const p of onPads) next[p.index] = p;
        if (bank === "drums") {
          for (const ph of placement.placeholders) next[ph.index] = makePlaceholderPad(ph);
          for (const g of placement.ghosts) {
            const source = onPads.find((p) => p.origIndex === g.sourceKey);
            if (source) next[g.index] = makeGhostPad(g.index, g.kind, source);
          }
        }
        return next;
      });
      setHidden((prev) => ({ ...Object.fromEntries(Object.entries(prev).filter(([, p]) => !replacedSpares.some((r) => r.origIndex === p.origIndex))), ...Object.fromEntries(spares.map((p) => [p.origIndex, p])) }));
      if (bank === "drums") setLayout({ on: true, id: lay.id, pre: {} });
      // A project this load started gets Organize too.
      if (started) setOrganize(true);
      setSelected(null);
      setBank(BANK_SHOWN[bank]);
      setAnalyzing((n) => n + fresh.length);
      if (result.skipped > 0) setNotice(`${result.skipped} file${result.skipped === 1 ? "" : "s"} skipped: too long, too big for the project size limit or unreadable`);
      for (const pad of fresh) {
        nextAnalysisWorker()
          .analyze(monoFromChannelData(pad.channelData), pad.sampleRate, pad.name, pad.category === "melodicLoop")
          .catch(() => ({ midi: null, category: "other" as const, detail: undefined, centroid: undefined }))
          .then(({ midi: detectedMidi, detail, centroid }) => {
            if (token !== loadToken.current) return;
            const analysed = (p: Pad): Pad => ({ ...p, detectedMidi, detail, centroid, tune: tuneDefault(p.tuneLocked, p.tune, p.category, detectedMidi, tunedTargetRef.current) });
            setPads((prev) => {
              const at = Object.keys(prev).find((k) => prev[Number(k)].origIndex === pad.origIndex);
              return at === undefined ? prev : { ...prev, [Number(at)]: analysed(prev[Number(at)]) };
            });
            setHidden((prev) => (prev[pad.origIndex] ? { ...prev, [pad.origIndex]: analysed(prev[pad.origIndex]) } : prev));
            setAnalyzing((n) => n - 1);
          });
      }
      // The new sounds are part of the project now; undo would only be able to take them away again.
      past.current = [];
      future.current = [];
      syncHistory();
    } catch (err) {
      console.error(err);
      window.alert("That folder could not be loaded.");
    } finally {
      setAddPackStatus("");
      setImportStatus("");
    }
  };

  /**
   * Bank D: takes the song and its vocal stem out of an acapella Koala project and opens the chop editor on them. The project itself is not
   * loaded; only the two sounds are read, and the sections the chop makes go on bank D.
   */
  const loadAcapella = async (file: File) => {
    if (addPackStatus || loading) return;
    setAddPackStatus("Reading…");
    try {
      const result = await readAcapellaZip(file);
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      const { song, vocals, beatsPerBar, template } = result.acapella;
      acapellaTemplate.current = template;
      setMenuOpen(false);
      setChop({ song, vocals, beatsPerBar });
    } catch (err) {
      console.error(err);
      window.alert("That acapella project could not be read.");
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
    if (!entries.some((entry) => entry.isDirectory)) return;
    // A dropped folder is a drum pack for bank A.
    void loadBank("drums", () => findPackInEntries(entries));
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

  const patchPad = (index: number, patch: Partial<Pad>) => {
    recordEdit("semis" in patch || "cents" in patch ? `${index}:trim` : "");
    setPads((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  };

  /** Changes a sound's type in place. Tune follows the new type unless the user set it by hand. The pad stays where it is: only the loaders place sounds. */
  const classifyPad = (pad: Pad, category: CategoryId) => {
    if (pad.category === category) return;
    patchPad(pad.index, pad.tuneLocked ? { category } : { category, tune: tuneDefault(false, false, category, pad.detectedMidi, tunedTarget) });
  };

  /** The song being chopped (the cuts are found on it) and its vocal stem (what is cut), with the project's beats per bar, while the chop editor is open. */
  const [chop, setChop] = useState<{ song: Pad; vocals: Pad; beatsPerBar: number } | null>(null);
  /**
   * Starts the a cappella chop for a long sound. It needs the song and its vocal stem from Koala's stem split, named like the song with VOCALS after
   * it and left exactly as the split made them, so this checks for them first and says what to do if they are not right.
   */
  const openChop = async (pad: Pad) => {
    const check = checkStems(pad, Object.values(pads).filter(isReal));
    if (!check.ok) {
      window.alert(check.message);
      return;
    }
    const project = projectRef.current;
    const { beatsPerBar } = project ? await projectTimeSignature(project) : { beatsPerBar: 4 };
    acapellaTemplate.current = undefined;
    setChop({ song: check.song, vocals: check.vocals, beatsPerBar });
  };

  /** The song sections as the export writes them: their pads, audio, bars, labels, colours and the tempo. */
  const songExportOf = (sectionPads: Pad[]): SongExport | undefined => {
    const sorted = [...sectionPads].sort((a, b) => a.section!.number - b.section!.number);
    if (!sorted.length) return undefined;
    return {
      bpm: sorted[0].section!.bpm,
      beatsPerBar: sorted[0].section!.beatsPerBar,
      sampleRate: sorted[0].sampleRate,
      sourceSampleId: sorted[0].section!.sourceSampleId,
      template: acapellaTemplate.current,
      bars: 8,
      sections: sorted.map((p) => ({ index: p.index, label: labelOf(p), channelData: p.channelData, bars: p.section!.bars, color: autoColorOf(p) })),
    };
  };

  /**
   * Writes the sections into a fresh copy of the project, exactly as the export will (a WAV, a pad with stretch and a pattern each, and the tempo),
   * and reads it back. Returns what went wrong, or null when every section is in. Nothing in the app or the original file is changed.
   */
  const trialWriteSections = async (sections: Pad[], sourceSampleId: number): Promise<string | null> => {
    if (!projectFile.current) return null;
    const project = await parseKoalaProject(projectFile.current);
    const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));
    const template = acapellaTemplate.current ?? songTemplate(samplerJson, sourceSampleId);
    // The project's own pads are moved and kept by the export's arrangement, so here only the sections are checked.
    samplerJson.pads = [];
    const song = songExportOf(sections)!;
    const added = await addSongSections(project, samplerJson, song, template);
    if (added < sections.length) {
      return `the project has room for only ${added} of the ${sections.length} patterns (Koala has 32 pattern slots; free some and chop again)`;
    }
    const sequence = JSON.parse((await project.zip.file("sequence.json")?.async("string")) ?? "{}");
    const base = project.padBase;
    for (const s of song.sections) {
      const pad = samplerJson.pads.find((p: any) => Number(p.pad) - base === s.index);
      if (!pad || !project.zip.file(`sampler/${pad.sampleId}.wav`)) return `${s.label} was not written`;
      const held = (sequence.sequences ?? []).some((q: any) => (q?.noteSequence?.pattern?.notes ?? []).some((n: any) => Number(n.num) === s.index + base));
      if (!held) return `${s.label} got no pattern`;
    }
    return null;
  };

  /** While a chop is being made: a second press of Chop does nothing. */
  const chopping = useRef(false);

  /**
   * The a cappella chop, in this order, and each step only once the one before it is done:
   *  1. the vocal stem is cut at the song's chop points into section pads (on free pads, the fourth bank first);
   *  2. the sections are written into a copy of the Koala project the way the export writes them, and checked;
   *  3. the sections are put on their pads.
   * Nothing else changes: the song, the vocal stem, the key and the layout stay as they were. If step 1 or 2 fails nothing at all is changed. The sections keep their own label and colour and are left alone by organizing, tuning and mixing.
   */
  const chopSong = async (song: Pad, vocals: Pad, settings: ChopSettings) => {
    if (chopping.current) return;
    chopping.current = true;
    try {
      // 1. Cut. The cuts were found on the song; the stem may be at another sample rate, so the sections are put on the stem's own frames.
      const plans = scalePlans(settings.plans, song.sampleRate, vocals.sampleRate);
      // The sections go on bank D (the chop is the only thing that ever does), and a new chop replaces the last one.
      const opened = await ensureProject();
      if (!opened) return;
      if (opened.started) setOrganize(true);
      const without = Object.fromEntries(Object.entries(latest.current.pads).filter(([, p]) => !p.section));
      const { pads: sections } = makeSectionPads(vocals, plans, settings.bpm, settings.beatsPerBar, freeSongSlots(without), palette.colors);
      if (sections.length === 0) {
        window.alert("There is no free pad for the sections on Bank D, so nothing was changed. Delete a few pads there and chop again.");
        return;
      }
      // 2. Write them into a copy of the project and check every one went in.
      let problem: string | null;
      try {
        problem = await trialWriteSections(sections, vocals.sampleId);
      } catch (err) {
        console.error(err);
        problem = "the project file could not be written";
      }
      if (problem) {
        window.alert(`The chop could not be written into the Koala project: ${problem}. Nothing was changed: the song and its vocals are still there.`);
        return;
      }
      recordEdit();
      // 3. Fill the pads. The song, its vocals, the key and the drum layout are left as they were.
      const grid: Record<number, Pad> = { ...without };
      for (const section of sections) grid[section.index] = section;
      setPads(grid);
      setSelected(null);
      setBank(3);
      setChop(null);
      setLongSamples([]);
    } finally {
      chopping.current = false;
    }
  };

  const deletePad = (pad: Pad) => {
    recordEdit();
    setPads((prev) => removePad(prev, pad.index));
    setSelected((s) => (s === pad.index ? null : s));
  };

  /** What plays for a pad: its raw audio, or the normalized version once Normalize now has run. */
  const audioOf = (pad: Pad) => (normalize && normalizedData[pad.origIndex]) || pad.channelData;

  /** The reference chord is the project key's own on every grab; the Minor and Major squares (dragging up) swap it for the relative key's until the slider is let go. */
  const [refRelative, setRefRelativeState] = useState(false);
  const refRelativeRef = useRef(false);
  const setRefRelative = (flag: boolean) => {
    if (refRelativeRef.current === flag) return;
    refRelativeRef.current = flag;
    setRefRelativeState(flag);
    const match = matchVoice.current;
    const pad = match ? latest.current.pads[match.index] : undefined;
    const key = pad ? (pad.keyPc ?? latest.current.keyPc) : null;
    if (match && pad && key !== null) {
      const ref = referenceFor(pad, key, keyMajor, flag);
      match.handle.setTone(ref.pc, ref.kind);
    }
  };

  const pressPad = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    stopMatch();
    setSelected(index);
    if (pad.placeholder) return; // silent: nothing to play
    holdVoice.current?.release();
    holdVoice.current = null;
    holdIndex.current = null;
    releasePad.current.get(index)?.release();
    const toneKey = pad.keyPc ?? keyPc;
    const toneRef = pad.tune && toneOn && toneKey !== null ? referenceFor(pad, toneKey, keyMajor, false) : null;
    releasePad.current.set(
      index,
      startPad(
        index,
        audioOf(pad),
        pad.sampleRate,
        shiftFor(pad, tunedTarget, a4, keyMajor),
        toneRef ? toneRef.pc : null,
        padMode(pad),
        undefined,
        normalize ? pad.knobDb : undefined,
        0,
        toneRef ? toneRef.kind : "sine",
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
    holdVoice.current = startPad(-2, audioOf(pad), pad.sampleRate, shiftFor(pad, tunedTarget, a4, keyMajor), null, "loop", undefined, normalize ? pad.knobDb : undefined);
  };

  /**
   * Pitch slider grabbed: the selected pad loops at its current tuning (bass lifted by octaves to sit near the tone) with a steady tone on its key,
   * for as long as the slider is held. Sliding repitches the sound, never the tone.
   */
  const startMatch = () => {
    const pad = selected !== null ? pads[selected] : undefined;
    const pc = pad ? (pad.keyPc ?? keyPc) : null;
    if (!pad || !isReal(pad) || pc === null) return;
    holdVoice.current?.release();
    holdVoice.current = null;
    holdIndex.current = null;
    releasePad.current.get(pad.index)?.release();
    releasePad.current.delete(pad.index);
    const shift = shiftFor(pad, tunedTarget, a4, keyMajor);
    const soundsAt = pad.detectedMidi != null ? pad.detectedMidi + shift : null;
    // The lift lives only in this preview voice, and goes with it when the slider is let go.
    const lift = pad.category === "bass" && soundsAt !== null ? bassLiftSemitones(soundsAt, pc) : 0;
    // Grabbing the slider always starts on the project key's own chord.
    refRelativeRef.current = false;
    setRefRelativeState(false);
    const ref = referenceFor(pad, pc, keyMajor, false);
    matchVoice.current = {
      lift,
      index: pad.index,
      handle: startPad(pad.index, audioOf(pad), pad.sampleRate, shift + lift, ref.pc, "loop", undefined, normalize ? pad.knobDb : undefined, 0, ref.kind),
    };
  };

  /**
   * The pitch slider moved: the selected pad's own pitch (its trim, tuning goes on with it) follows the slider, and the sound that is playing
   * bends with it so the change is heard as it happens.
   */
  const moveTrim = (cents: number) => {
    const pad = selected !== null ? latest.current.pads[selected] : undefined;
    if (!pad || !isReal(pad)) return;
    const trim = Math.max(-1200, Math.min(1200, cents));
    patchPad(pad.index, { ...splitTrim(trim), tune: true, tuneLocked: true });
    const match = matchVoice.current;
    if (match) match.handle.setShift(shiftFor({ ...pad, ...splitTrim(trim), tune: true }, latest.current.tunedTarget, a4, keyMajor) + match.lift);
  };

  /** The slider was let go (or the pad or screen changed): the sound and the tone fade out. The pad keeps the pitch it was left at. */
  const stopMatch = () => {
    const match = matchVoice.current;
    matchVoice.current = null;
    refRelativeRef.current = false;
    setRefRelativeState(false);
    match?.handle.release();
  };

  // Leaving the pad or the Tune screen mid-hold stops the preview.
  useEffect(() => () => stopMatch(), [selected, mode]);

  const liftPad = (index: number) => {
    releasePad.current.get(index)?.release();
    releasePad.current.delete(index);
  };

  // Slider and key changes retune any pad that is currently held, so tuning is audible live.
  useEffect(() => {
    for (const [index, handle] of releasePad.current) {
      const pad = pads[index];
      if (pad) handle.setShift(shiftFor(pad, tunedTarget, a4, keyMajor));
    }
    const held = holdIndex.current === null ? undefined : pads[holdIndex.current];
    if (held) holdVoice.current?.setShift(shiftFor(held, tunedTarget, a4, keyMajor));
  }, [pads, tunedTarget, a4, keyMajor]);

  useEffect(() => setReferencePitch(a4), [a4]);

  // Sorting: bring each unknown sound's pad up and play it once, so the user hears what they are naming.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /**
   * Picking a key retargets every pad. Pads whose Tune switch the user has set by hand keep it,
   * and every pad keeps its semitone/cents trim, so manual corrections survive a key change.
   * Tapping the key that is already selected switches tuning off, so every sound reverts to its original pitch.
   */
  const selectKey = (pc: number) => {
    applyProjectKey(pc === keyPc ? null : pc);
  };

  /** Sets the project key (null = none) for every pad. */
  const applyProjectKey = (next: number | null) => {
    recordEdit();
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

  /** The key a sound is in: its detected pitch to the nearest note, against the A4 reference. */
  const matchProjectToKey = (pad: Pad) => {
    if (pad.detectedMidi == null) return;
    applyProjectKey((((Math.round(pad.detectedMidi - referenceOffsetSemitones(a4)) % 12) + 12) % 12));
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
    if (!projectRef.current) return;
    setExporting(true);
    try {
      // The export writes into the project's zip (audio, mixer, sequence), so each export starts from a fresh read of the project file. Exporting twice
      // from one zip used to carry the first export's master chain, bus plugins and remapped patterns into the second.
      const project = projectFile.current ? await parseKoalaProject(projectFile.current) : projectRef.current;
      if (masterChain) {
        const there = await masterEffectNames(project);
        if (there.length > 0 && !window.confirm(`Your project already has effects on the master: ${there.join(", ")}.\n\nThe master chain replaces them. Export anyway?`)) return;
      }
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
        const shift = shiftFor(pad, tunedTarget, a4, keyMajor);
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
          color: autoColorOf(gp),
          sourceSampleId: source.sampleId,
          sampleRate: source.sampleRate,
          channelData: makeGhostAudio(audio, source.sampleRate, gp.ghost!.kind),
        });
      }
      rendered.length = 0;
      const songExport = songExportOf(Object.values(pads).filter((p) => p.section));
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
      // The pads the loaders made (Kick 1, Snare 2, Loop 3...) are written with the colour and label they show in the app; a sound from a project that was
      // opened keeps the colour and label it already had.
      const colors = new Map<number, { color: string; label: string }>();
      for (const p of allPads) {
        // The label is what the pad's caption says in the app, without its number.
        if (p.category && numberedLabel(p)) colors.set(p.sampleId, { color: autoColorOf(p), label: captionOf(p) || labelOf(p) });
      }
      const { blob, filename } = await buildTunedKoala(project, tuned, { vols, buses, busNames: routeBuses ? BUS_NAMES : undefined, sidechain: sidechainActive, masterChain, masterStyle, arrangement, pans, colors, playback, ghosts: ghostExports, song: songExport });
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

  const palette = paletteById(DEFAULT_PALETTE_ID);
    const shownBank = bank;
  /** Palette colour for a sound, by its own category. Where it sits (including on a layout's slots) never changes it. */
  const autoColorOf = (p: Pad): string => {
    // A section of a chopped song keeps the palette colour it was given when it was picked.
    if (p.section) return p.section.color ?? palette.colors[(p.section.colorIndex ?? 0) % palette.colors.length];
    const base = colorFor(palette, p.category ?? "other");
    return p.ghost ? shade(base, 2) : base;
  };
  /** The words on a pad: its own category, keyword or ghost name. A layout slot never relabels a sound. */
  /** A section of a chopped song: the vocal label and its number, "Vox 1". */
  const sectionLabel = (p: Pad): string => `${CATEGORIES[categoryIndex("vox")].label} ${p.section!.number}`;
  const labelOf = (p: Pad): string => (p.placeholder ? p.placeholder.label : p.ghost ? GHOST_LABEL[p.ghost.kind] : p.section ? sectionLabel(p) : (numberedLabel(p)?.label ?? padLabel(p)));
  const colorOfPad = (p: Pad) => (p.placeholder ? placeholderColor(p) : autoColorOf(p));
  const hasProject = Object.keys(pads).length > 0;
  /** The 16 pads of a bank as the sequencer shows them: the app's own labels and colours, or null where there is no sound. */
  const seqPadsOfBank = (b: number): (SeqPad | null)[] =>
    Array.from({ length: 16 }, (_, slot) => {
      const p = pads[b * 16 + slot];
      return p && !p.placeholder ? { label: captionOf(p) || labelOf(p), color: litColor(p) } : null;
    });
  /** The loaders have already placed, labelled and coloured every sound, so a project with sounds in it can always be exported. */
  const canExport = hasProject && analyzing === 0 && !exporting;
  /** Worked out from the sounds on the pads every time, so a hot swap or a new drum kit locks or unlocks the sidechain at once. Spares do not count. */
  const sidechain = sidechainStatus(Object.values(pads).filter(isReal).map((p) => p.category), organize);
  const sidechainReady = sidechain.ready;
  const sidechainActive = sidechainReady && sidechainOn;
  const longPads = Object.values(pads)
    .filter((p) => longSamples.includes(p.origIndex))
    .sort((a, b) => a.index - b.index);
  const selectedPad = selected !== null ? pads[selected] : undefined;

  /** Hot swap only exists with the finger-drumming layout; without it the screen starts on Tune. */
  /** Hot swap works on a drum layout, or once a loader has left spare sounds to swap in. */
  const canSwap = layout.on || Object.keys(hidden).length > 0;
  const shownMode: Mode | null = mode === null ? null : mode === "swap" && !canSwap ? "tune" : mode;
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
      autoShift={shiftFor({ ...selectedPad, semis: 0, cents: 0 }, tunedTarget, a4, keyMajor)}
      needsKey={(selectedPad.keyPc ?? keyPc) === null}
      chords={
        selectedPad.category === "melodicLoop" && (selectedPad.keyPc ?? keyPc) !== null
          ? [referenceFor(selectedPad, (selectedPad.keyPc ?? keyPc)!, keyMajor, false), referenceFor(selectedPad, (selectedPad.keyPc ?? keyPc)!, keyMajor, true)].map((r) => `${NOTE_NAMES[r.pc]} ${r.kind}`) as [string, string]
          : null
      }
      relative={refRelative}
      onRelative={setRefRelative}
      onTrim={moveTrim}
      onHoldStart={startMatch}
      onHoldEnd={stopMatch}
      onChange={(patch) => {
        if ("tune" in patch) patchPad(selectedPad.index, { ...patch, tuneLocked: true });
        else patchPad(selectedPad.index, patch);
      }}
    />
  );
  /** The type the selected pad's slot wants: a finger-drumming slot's own type on bank A, otherwise the sound's own type. */
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
  /** The hot-swap list for a pad: the sounds that can take its place. Used by the Swap screen and by the sequencer's Sounds page. */
  const swapListFor = (target: Pad) => {
    /** The type the target's slot wants: a finger-drumming slot's own type on bank A, otherwise the sound's own type. */
    const slotCategory = (layout.on && target.index < 16 ? layoutById(layout.id).slots[target.index]?.category : undefined) || target.category;
    return (
    <SwapList
      slotLabel={target.ghost ? `${GHOST_LABEL[target.ghost.kind]} (made on export unless filled)` : `PAD ${(target.index % 16) + 1}`}
      candidates={sortForSlot(
        [
          // A pack's hidden spares: the same type as the slot, or for a drum slot any drum.
          ...Object.values(hidden).filter((p) => (isKitCategory(slotCategory) ? isKitCategory(p.category) : p.category === slotCategory)),
          ...Object.values(pads).filter((p) => isReal(p) && isKitCategory(p.category) && p.index >= 16 && p.index !== target.index && isKitCategory(slotCategory)),
        ],
        slotCategory,
      ).sort((a, b) => (slotCategory === "bass" ? Number(!!a.is808 !== !!target.is808) - Number(!!b.is808 !== !!target.is808) : 0))}
      audioOf={audioOf}
      nameOf={(p) => displayName(p.name, tags)}
      onSwap={(other) => {
        if (hidden[other.origIndex]) return swapInHidden(other, target);
        recordEdit();
        setPads((prev) => (target.ghost ? fillGhostSlot(prev, target.index, other.index) : movePad(prev, target.index, other.index)));
      }}
    />
  );
  };
  const swapList = selectedPad && swapListFor(selectedPad);


  /** The colour a loaded pad lights up in: its sound type's colour when auto-colour is on, else the default lilac. */
  /** The wording printed next to a pad's number: its placeholder or ghost label, else its sound type. */
  const captionOf = (pad: Pad | undefined): string => {
    if (!pad) return "";
    if (pad.section) return `${CATEGORIES[categoryIndex("vox")].short} ${pad.section.number}`;
    if (pad.placeholder || pad.ghost) return labelOf(pad);
    return isReal(pad) && pad.category ? (numberedLabel(pad)?.caption ?? CATEGORIES[categoryIndex(pad.category)].short) : "";
  };
  /** The sound type a pad's symbol shows: real sounds and ghosts have one, silent placeholders none. */
  const symbolOf = (pad: Pad | undefined): CategoryId | undefined => {
    if (!pad || pad.placeholder) return undefined;
    if (pad.ghost) return pad.ghost.kind === "ghostSnare" ? "snare" : "kick";
    return pad.category;
  };
  const litColor = (pad: Pad) => (pad.placeholder ? placeholderColor(pad) : pad.category ? autoColorOf(pad) : "#b3a6f2");
  /** The note marked under the keys: the project key. */
  const shownKey = keyPc;

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
          ref={drumsInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void loadBank("drums", () => findPackInFileList(files));
          }}
        />
        <input
          ref={loopsInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void loadBank("loops", () => findPackInFileList(files));
          }}
        />
        <input
          ref={bassInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void loadBank("bass", () => findPackInFileList(files));
          }}
        />
        <input
          ref={oneShotsInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void loadBank("oneShots", () => findPackInFileList(files));
          }}
        />
        <input
          ref={acapellaInput}
          type="file"
          accept=".koala,.zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void loadAcapella(file);
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
            <button className="menu__button" disabled={!hasProject && !loading} onClick={clearProject}>
              Clear project
            </button>
            <Switch
              label="Organize"
              hint="Levels, each sound type's settings, bus routing, the melodic spread and the master chain. Never moves, labels or colours pads: the Load Bank steps do that"
              on={organize}
              disabled={!hasProject}
              onChange={setOrganize}
            />
            <button className="menu__button" disabled={!organize || !hasProject || normalizing} onClick={normalizeNow}>
              {normalizing ? "Normalizing…" : "Normalize now"}
            </button>
            <select
              className="menu__select"
              value={masterStyle}
              disabled={!organize}
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
              label="Sidechain"
              hint={SIDECHAIN_HINT[sidechain.blocker ?? "ready"]}
              on={sidechainReady && sidechainOn}
              disabled={!sidechainReady}
              onChange={setSidechainOn}
            />
            <button
              className="menu__button"
              disabled={analyzing > 0 || loading || !!addPackStatus}
              title="Choose a drum pack with subfolders (Kicks, Snares, Hi Hats...). Sounds are taken by subfolder name: 10 kicks, 10 snares, 5 closed and 5 open hats, 5 of every other drum type, named Kick 1, Snare 2 and so on."
              onClick={() => {
                drumsInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Load Bank A: Drums"}
            </button>
            <button
              className="menu__button"
              disabled={analyzing > 0 || loading || !!addPackStatus}
              title="Choose a folder that holds only sound files, no subfolders. 12 are taken at random for the top three rows of Bank B (sounds over 30 seconds are skipped) and tuned by default."
              onClick={() => {
                loopsInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Load Bank B: Melodic Loops"}
            </button>
            <button
              className="menu__button"
              disabled={analyzing > 0 || loading || !!addPackStatus}
              title="Choose a folder that holds only sound files, no subfolders. 16 are taken at random for Bank C (sounds over 30 seconds are skipped) and tuned by default."
              onClick={() => {
                oneShotsInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Load Bank C: One Shots"}
            </button>
            <button
              className="menu__button"
              disabled={analyzing > 0 || loading || !!addPackStatus}
              title="Choose a drum pack with 808 or bass subfolders. Two basses and two 808s fill the bottom row of Bank B and are tuned by default."
              onClick={() => {
                bassInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Load Bank B: 808 & Bass"}
            </button>
            <button
              className="menu__button"
              disabled={analyzing > 0 || loading || !!addPackStatus}
              title="Choose a Koala project that holds only a song and its vocal stem. It is not opened as the project: its two sounds go to the chop editor, and the sections go on Bank D."
              onClick={() => {
                acapellaInput.current?.click();
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Load Bank D: Acapella (Koala project)"}
            </button>
            <Switch label="Show symbols on pads" on={padSymbols} onChange={setPadSymbols} />
            <label className="menu__a4">
              Project size limit
              <select
                className="menu__select"
                value={packMemory}
                onChange={(e) => setPackMemory(e.target.value as PackMemory)}
                aria-label="Project size limit"
              >
                <option value="low">Low (96 MB)</option>
                <option value="auto">Default ({Math.round(packByteBudget("auto") / 1048576)} MB)</option>
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
            <div className="menu__version">
              KoalaTune v{__APP_VERSION__} · {__APP_BUILD__}
              <br />
              Mix preset: {ACTIVE_MIX_PRESET.name}
            </div>
          </div>
        )}

        {seqOpen ? (
          <SeqScreen padsOfBank={seqPadsOfBank} soundsFor={(bank, slot) => (pads[bank * 16 + slot] ? swapListFor(pads[bank * 16 + slot]) : null)} onBack={() => setSeqOpen(false)} />
        ) : (
        <>
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
                  disabled={m.id === "swap" && !canSwap}
                  title={m.id === "swap" && !canSwap ? "Hot swap needs the finger drumming layout or a loaded bank (menu)" : undefined}
                  onClick={() => setMode(on ? null : m.id)}
                >
                  <span className="cap__led" />
                  <span className="cap__legend">{m.label}</span>
                </button>
              );
            })}
            <button className="cap cap--mode" aria-label="Sequencer" onClick={() => { setMenuOpen(false); setSeqOpen(true); }}>
              <span className="cap__led" />
              <span className="cap__legend">Seq</span>
            </button>
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
        <div className={`screen-wrap screen-wrap--${shownMode ?? "swap"}`}>
          <section className="screen" aria-label={`Display: ${shownMode ?? "sample"}`}>
            <div className="oled">
              {selectedPad && (
                <div className="oled__head">
                  <span>{shownMode === "swap" ? "Hot swap" : shownMode === "type" ? "Sound type" : shownMode === "tune" ? "Tune" : "Sample"}</span>
                  <span>{shownMode === "tune" ? "All pads" : padName(selectedPad)}</span>
                </div>
              )}
              {!hasProject ? (
                <div className="dropzone">
                  <svg className="dropzone__ants" aria-hidden="true">
                    <rect className="dropzone__ants-base" pathLength="280" />
                    <rect className="dropzone__ants-dash" pathLength="280" />
                  </svg>
                  <input ref={projectInput} type="file" accept=".koala" hidden onChange={(e) => pickFile(e.target.files)} />
                  {loading || addPackStatus ? (
                    <strong>{loading ? importStatus || "Loading…" : addPackStatus}</strong>
                  ) : (
                    <div className="dropzone__choices">
                      {[
                        { icon: K_ICON, label: "Project", aria: "Open a .koala project", input: projectInput },
                        { icon: DRUM_ICON, label: "Drums", aria: "Load Bank A: Drums", input: drumsInput },
                        { icon: KEYS_ICON, label: "Loops", aria: "Load Bank B: Melodic Loops", input: loopsInput },
                        { icon: ACAPELLA_ICON, label: "Acapella", aria: "Load Bank D: Acapella (Koala project)", input: acapellaInput },
                      ].map((choice) => (
                        <button key={choice.label} type="button" className="dropzone__btn" aria-label={choice.aria} onClick={() => choice.input.current?.click()}>
                          <PixelIcon rows={choice.icon} scale={1} />
                          <span>{choice.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                    {selectedPad.section
                      ? `${selectedPad.section.bars} bars, ${selectedPad.section.bpm.toFixed(2)} BPM`
                      : selectedPad.ghost
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
                        const shift = selectedPad.tune ? shiftFor({ ...selectedPad, semis: 0, cents: 0 }, tunedTarget, a4, keyMajor) + trimCents(selectedPad.semis, selectedPad.cents) / 100 : 0;
                        return `${shift < 0 ? "-" : "+"}${Math.abs(shift).toFixed(3)}st`;
                      })()}
                    </span>
                  </div>
                  <Waveform channelData={selectedPad.channelData} />
                  {shownMode === null && selectedPad.category === "melodicLoop" && (
                    <button className="type-readout__match" disabled={selectedPad.detectedMidi == null} onClick={() => matchProjectToKey(selectedPad)}>
                      {selectedPad.detectedMidi == null ? "No key detected" : "Match project to key"}
                    </button>
                  )}
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

        {/* The deck under the screen: the sound type keys, or the piano with its two keys. Hot swap has none, its list takes the room, and so
            does the empty start screen (nothing to type or tune yet), whose drop zone needs the height to fit its text. */}
        {hasProject && shownMode === "type" && (
          <div className="deck">
            <TypeKeys
              pad={selectedPad && isReal(selectedPad) ? selectedPad : null}
              palette={palette}
              onClassify={classifyPad}
            />
          </div>
        )}
        {hasProject && shownMode === "tune" && (
          <div className="deck deck--tune">
            <Keyboard selected={shownKey} onSelect={selectKey} />
            <div className="deck__side">
              <button
                className={`cap cap--side${keyMajor ? " cap--on" : ""}`}
                aria-pressed={keyMajor}
                aria-label={`The project key is ${keyMajor ? "major" : "minor"}: tap to switch`}
                title="The project key: minor (default) or major. It sets the chord a melodic loop is played against and where the loop is moved to (a major key takes it to its relative minor, a minor third below)."
                onClick={() => setKeyMajor(!keyMajor)}
              >
                <span className="cap__led" />
                <span className="cap__legend">{keyMajor ? "Major" : "Minor"}</span>
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
        <div className="padzone">
          <div className="pads">
            {Array.from({ length: 16 }, (_, slot) => {
              const index = shownBank * 16 + slot;
              const pad = pads[index];
              const cls = [
                "pad",
                pad && "pad--loaded",
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
                      {/* A sound's own name ("Loop 6", "Kick 1") already numbers it; the pad number is only for pads with nothing to say. */}
                      {captionOf(pad) || slot + 1}
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
        </>
        )}

        {notice && <div className="notice">{notice}</div>}

        {longPads.length > 0 && (
          <LongSamplesModal pads={longPads} maxSeconds={MAX_SAMPLE_SECONDS} onDelete={deletePad} onChop={openChop} onClose={() => setLongSamples([])} />
        )}

        {chop && (
          <SongChopModal
            pad={chop.song}
            palette={palette}
            beatsPerBar={chop.beatsPerBar}
            freeSlots={freeSongSlots(Object.fromEntries(Object.entries(pads).filter(([, p]) => !p.section))).length}
            onConfirm={(settings) => chopSong(chop.song, chop.vocals, settings)}
            onClose={() => setChop(null)}
          />
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
