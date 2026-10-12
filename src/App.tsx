import { openDebug, recordDebug } from "./diagnostics";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { resolvePlayback, type PadPlayback } from "./audio/padSettings";
import { Keyboard } from "./components/Keyboard";
import {
  acapellaProjectFromAudio,
  guessAcapellaRoles,
  blankProject,
  entriesOfDrop,
  findPackInEntries,
  findPackInFileList,
  findPackInFileListAsync,
  writeBankSounds,
  type FoundPack,
} from "./audio/packProject";
import {
  BANK_ZONES,
  bankTakes,
  MAX_LOAD_SECONDS,
  numberedLabel,
  placeBank,
  planBank,
  type BankLoad,
} from "./audio/bankLoad";
import { displayName, packTags } from "./audio/sampleName";
import { packByteBudget, PROJECT_BYTE_BUDGET, projectNameForFiles, type PackFile, type PackMemory } from "./audio/samplePack";
import { PadPanel, type Pad } from "./components/PadPanel";
import { decodeNative, monoFromChannelData } from "./audio/decode";
import {
  parseKoalaProject,
  koalaPadToFile,
  isKoalaFile,
  trimRangeOf,
  type ParsedKoalaProject,
} from "./audio/koalaProject";
import {
  setReferencePitch,
  startPad,
  type PadHandle,
  type PadMode,
  type ReferenceTone,
} from "./audio/player";
import {
  buildTunedKoala,
  downloadBlob,
  masterEffectNames,
  type GhostPadExport,
  type TunedSample,
} from "./audio/exportProject";
import { applyGainDb } from "./audio/gain";
import { pitchKnobFor, shiftFor, snapSemitones } from "./audio/shift";
import {
  fadeIn,
  fadeMsFor,
  kickTransientMs,
  medianTransientMs,
} from "./audio/kickTransient";
import {
  balanceFromStats,
  FILE_CEILING_DB,
  type BalanceStats,
} from "./audio/loudness";
import { balancedSpread } from "./audio/spread";
import {
  CATEGORIES,
  categoryIndex,
  is808Name,
  isKitCategory,
  isTunedCategory,
  migrateCategory,
  type CategoryId,
} from "./audio/classify";
import {
  chopColor,
  colorFor,
  darker,
  paletteById,
  shade,
  DEFAULT_PALETTE_ID,
} from "./audio/palettes";
import { applyIconLinks, applyScheme } from "./audio/theme";
import { SchemeModal } from "./components/SchemeModal";
import {
  CHOP_BANK_START,
  emptyPadInBank,
  movePad,
  nextEmptyPad,
  PADS_PER_BANK,
  removePad,
} from "./audio/padMoves";
import { BUS_NAMES, CATEGORY_BUS } from "./audio/routing";
import { chooseShuffleSound } from "./audio/shufflePad";
import { copyProjectPad } from "./audio/copyProjectPad";
import { sortForSlot } from "./audio/swapOrder";
import { ExtraDrumsModal } from "./components/ExtraDrumsModal";
import {
  extraDrumCount,
  fillGhostSlot,
  withoutExtraDrums,
  type ExtraDrums,
} from "./audio/extraDrums";
import { SwapList } from "./components/SwapList";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { PlaybackEditor } from "./components/PlaybackEditor";
import { LayoutEditor } from "./components/LayoutEditor";
import { correctSample, refreshLibraryAsync, type LibraryProgress, type LibraryIndex } from "./audio/libraryIndex";
import { type SampleClassification } from "./audio/sampleClassification";
import { matchingTemplateLabel, type AdditionalBanks } from "./audio/kitGeneration";
import { loadLibraryIndex, saveLibraryIndex } from "./storage";
import { SampleLibraryModal } from "./components/SampleLibraryModal";
import { TypeKeys } from "./components/TypeKeys";
import { Waveform } from "./components/Waveform";
import { LongSamplesModal } from "./components/LongSamplesModal";
import { layoutById, type FingerLayout } from "./audio/fingerLayouts";
import { makePlaceholderPad, placeholderColor } from "./audio/placeholderPads";
import { makeGhostPad } from "./audio/ghostPads";
import { makeSectionPads } from "./audio/songPads";
import { scalePlans } from "./audio/song/tapGrid";
import { checkStems, findAcapellaPair } from "./audio/song/stems";
import { SongChopModal, type ChopSettings } from "./components/SongChopModal";
import { PadAllocator } from "./components/PadAllocator";
import { destinationPads } from "./audio/chopDestinations";
import { copyProblem, protectedCopy } from "./audio/sourceProtect";
import { validateChopExport } from "./audio/chopValidation";
import { koalaPitch } from "./audio/pitchWrap";
import { haptic } from "./audio/haptics";
import { projectTimeSignature } from "./audio/koalaProject";
import {
  addSongSections,
  isEmpty as sequenceIsEmpty,
  SEQUENCE_SLOTS,
  songTemplate,
  type SongExport,
  type SongTemplate,
} from "./audio/exportSong";
import {
  addChopperPad,
  CHOPPER_MAX_SLICES,
  CHOPPER_MAX_TOTAL,
  fitPlans,
  sliceLayout,
  type ChopperExport,
} from "./audio/exportChopper";
import { keyOffset } from "./audio/song/keyOffset";
import { ScrubField } from "./components/ScrubField";
import { PixelIcon } from "./components/PixelIcon";
import { AcapellaFilesModal } from "./components/AcapellaFilesModal";
import { AcapellaModeModal, type ChopMode } from "./components/AcapellaModeModal";
import { packArrangement, type WorkspaceResult } from "./audio/song/sectionWorkspace";
import { PatternMaker } from "./components/PatternMaker";
import { patternBars, slotNotes, STEPS_PER_BEAT } from "./audio/song/patternMaker";
import { CHOPPER_MIN_SECONDS, ChopperSourceModal } from "./components/ChopperSourceModal";
import { GHOST_LABEL, makeGhostAudio } from "./audio/ghost";
import { padLabel } from "./audio/padLabels";
import { PadButton } from "./components/PadButton";
import {
  clearProjectFile,
  loadProjectFile,
  loadState,
  saveProjectFile,
  saveState,
  type SavedPad,
  loadSampleLibrary,
  MAX_FAVORITES,
  MAX_FAVORITE_BYTES,
  recordImportedSamples,
  setSampleFavorite,
  type SampleLibraryRecord,
} from "./storage";
import {
  A4_REFERENCE_RANGE,
  clampA4Reference,
  NOTE_NAMES,
  referenceOffsetSemitones,
  semitonesToRatio,
  splitTrim,
  trimCents,
  bassLiftSemitones,
} from "./audio/theory";
import { nextAnalysisWorker, getRenderWorker } from "./workers/workerClient";
import { useOledCell } from "./components/useOledCell";
import { resetStoredType } from "./audio/seq/session";
import { encodeWav } from "./audio/wavEncode";
import { SeqScreen, type SeqPad } from "./components/seq/SeqScreen";
import { useSafeArea } from "./components/useSafeArea";
import { SIDECHAIN_HINT, sidechainStatus } from "./audio/sidechain";
import {
  ACAPELLA_ICON,
  DELETE_ICON,
  DRUM_ICON,
  FOLDER_ICON,
  SHUFFLE_ICON,
  K_ICON,
  LOCK_ICON,
  UNLOCK_ICON,
} from "./components/dropIcons";
import {
  ACTIVE_MIX_PRESET,
  MASTER_STYLES,
  type MasterStyle,
} from "./audio/mixPresets";
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
/** The key the pad picker's preview voice plays under (startPad keys voices by pad number; real pads are 0 to 63), and the longest a preview plays. */
const PREVIEW_PAD = -3;
const PREVIEW_MAX_MS = 4000;
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

/** A sound from the project itself: not a silent placeholder and not a ghost copy the layout made. */
const isReal = (p: Pad) =>
  !p.placeholder && !p.ghost && !p.section && !p.chopper;

/**
 * Preview only (the project's own play settings are untouched). Every pad plays while held and fades
 * out smoothly on release; bass, melodic and melodic loops also loop for as long as they are held.
 */
/**
 * The reference a pad is judged against. A single sound gets a sine on the key's note. A melodic loop gets a soft saw chord: the chord of the project's key
 * (minor, or major when the key is major), or with `relative` its relative key's chord (a minor key's relative major, a major key's relative minor), which
 * is what a loop in the other mode is tuned against.
 */
function referenceFor(
  pad: Pad,
  keyPc: number,
  major: boolean,
  relative: boolean,
): { pc: number; kind: ReferenceTone } {
  if (pad.category !== "melodicLoop") return { pc: keyPc, kind: "sine" };
  if (!major)
    return relative
      ? { pc: (keyPc + 3) % 12, kind: "major" }
      : { pc: keyPc, kind: "minor" };
  return relative
    ? { pc: (keyPc + 9) % 12, kind: "minor" }
    : { pc: keyPc, kind: "major" };
}

function padMode(pad: Pad): PadMode {
  // A song section previews like a melodic loop: it loops while held and stops on release. (In Koala it is written as a one-shot, see exportSong.ts.)
  if (pad.section) return "loop";
  if (pad.chopper) return "hold"; // the chopper plays the whole sample once while held; its chops are played in Koala
  return isTunedCategory(pad.category) ? "loop" : "hold";
}

/** A remembered category, brought up to date. The old single "hat" did not say open or closed, so the fresh guess decides. */
function rememberedCategory(
  id: string | undefined,
  guess: CategoryId,
): CategoryId {
  return id === "hat" && (guess === "openHat" || guess === "closedHat")
    ? guess
    : migrateCategory(id);
}

/** A sample longer than this is flagged on import: samples this long make export very slow. */
const MAX_SAMPLE_SECONDS = 60;
/** Stable id of the chopper pad (above the section pads' ids). */
const CHOPPER_ORIG_INDEX = 3500;

/** A pad's default Tune state: the user's manual choice if locked, else decided by its category: on for Bass and Melodic with a detected pitch. */
function tuneDefault(
  locked: boolean | undefined,
  current: boolean,
  category: CategoryId | undefined,
  detectedMidi: number | null | undefined,
  target: number | null,
): boolean {
  if (locked) return current;
  return target !== null && detectedMidi != null && isTunedCategory(category);
}


/** A menu switch: the same lit key as the ones under the piano, with its words (and a line of explanation) beside it. */
function Switch({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={`menu__switch${disabled ? " menu__switch--locked" : ""}`}>
      <div className="menu__switch-words">
        <span className="menu__switch-label">{label}</span>
        {hint && <span className="menu__switch-hint">{hint}</span>}
      </div>
      <button
        className={`cap cap--side${on ? " cap--on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
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
  const [selected, setSelected] = useState<number | null>(
    saved.selected ?? null,
  );
  const [keyPc, setKeyPc] = useState<number | null>(saved.keyPc ?? null);
  const [tunedTarget, setTunedTarget] = useState<number | null>(
    saved.tunedTarget ?? null,
  );
  /** The key picked on the piano is a major key (its melodic loops go to the relative minor a minor third below) instead of the default minor key. */
  const [keyMajor, setKeyMajor] = useState(saved.keyMajor ?? false);
  /** The project's tempo: the menu edits it, the Tune screen's stretch button and the sequencer's tempo read it, and the export writes it to the project's sequence. */
  const [projectBpm, setProjectBpm] = useState(saved.bpm ?? 120);
  const [, setBpmText] = useState(String(saved.bpm ?? 120));
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  useEffect(() => { recordDebug("App state", `loading=${loading} analyzing=${analyzing} exporting=${exporting} normalizing=${normalizing} pads=${Object.keys(pads).length} bank=${bank + 1}`, "info"); }, [loading, analyzing, exporting, normalizing, Object.keys(pads).length, bank]);
  /** "done/total" while an export is rendering, so a long high-quality render shows progress. */
  const [exportProgress, setExportProgress] = useState("");
  /**
   * The Organize switch: balances levels, routes sounds to buses, sets each sound type's settings, spreads the melodic pads and adds the master chain.
   * It never touches where a pad sits, what it says or what colour it is: the loaders (Load Bank A to D) place, label and colour every sound they bring in.
   */
  const [organize, setOrganize] = useState(
    saved.organizeOn ?? !!(saved.mix || saved.masterChainOn),
  );
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
  const [normalizedData, setNormalizedData] = useState<
    Record<number, Float32Array[]>
  >({});
  const [menuOpen, setMenuOpen] = useState(false);
  /** Temporarily disabled: live-input performance needs a later sequencer port. Keep the screen code for that work. */
  const [seqOpen, setSeqOpen] = useState(false);
  const seqBeatsPerBar = 4;
  const [masterStyle, setMasterStyle] = useState<MasterStyle>(
    saved.masterStyle ?? "loud",
  );
  const [padSymbols, setPadSymbols] = useState(saved.padSymbols ?? true);
  const [packMemory, setPackMemory] = useState<PackMemory>(
    saved.packMemory === "low" ? "low" : "auto",
  );
  /** Set while the export is waiting for the answer about drums the layout has no slot for. */
  const [extraPrompt, setExtraPrompt] = useState(false);
  /** The mode keys: what the screen and the deck show. Swap is the resting mode; it needs the finger-drumming layout (see shownMode). Null (a pressed key tapped again) is the plain waveform view. */
  const [mode, setMode] = useState<Mode | null>("swap");
  /** The looping pad and the reference tone on the key that play while the pitch slider is held. */
  const matchVoice = useRef<{
    index: number;
    lift: number;
    handle: PadHandle;
  } | null>(null);
  /** Sounds (by original slot) that were over the length limit when the project was imported; the warning lists the ones still present. */
  const [longSamples, setLongSamples] = useState<number[]>([]);
  const [layout, setLayout] = useState<LayoutState>({
    on: false,
    id: saved.layoutId ?? layoutById(null).id,
    pre: {},
  });
  const [toneOn, setToneOn] = useState(saved.toneOn ?? false);
  /** The reference tone's volume knob, 0 to 1: 0.5 is the level the tone is matched to, so the multiplier is twice the knob. */
  const [toneVolume, setToneVolume] = useState(saved.toneVolume ?? 0.5);
  /** The colour scheme: the pad, type and chop colours, the lamps and the menu's tint (palettes.ts, theme.ts). */
  const [paletteId, setPaletteId] = useState(
    paletteById(saved.paletteId ?? DEFAULT_PALETTE_ID).id,
  );
  const palette = paletteById(paletteId);
  const [schemeOpen, setSchemeOpen] = useState(false);
  /** The icon the page offers to the browser and to iOS's Add to Home Screen: dark (the default) or light (iconLinks in theme.ts). */
  const [iconLight, setIconLight] = useState(saved.iconLight ?? false);
  useLayoutEffect(() => applyIconLinks(iconLight), [iconLight]);
  useLayoutEffect(
    () => applyScheme(palette, document.documentElement),
    [palette],
  );
  /** Whether a tapped key retunes every pad ("Tune all") or only the selected one. */
  const [a4, setA4] = useState(Math.round(clampA4Reference(saved.a4 ?? 440)));
  const [, setA4Text] = useState(String(Math.round(clampA4Reference(saved.a4 ?? 440))));
  /** Ghost under the finger while a pad is being dragged, and the drop target under it ("kind:index"). */
  const [drag, setDrag] = useState<{
    from: number;
    x: number;
    y: number;
  } | null>(null);
  const [hover, setHover] = useState("");
  /** The all-pads view that opens when a drag dwells over the bank buttons. */
  const [expanded, setExpanded] = useState(false);
  /** One record per finger/pointer holding a pad, so a second touch never disturbs the first. */
  const drags = useRef<
    Map<
      number,
      {
        from: number;
        x0: number;
        y0: number;
        active: boolean;
        hover: string;
        timer: number | null;
      }
    >
  >(new Map());
  /** Always the latest pointer-release handler, for the window listeners that guarantee every release is seen. */
  const finishPointer = useRef<(pointerId: number, cancelled: boolean) => void>(
    () => {},
  );
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
  const syncHistory = () =>
    setHistorySize({ undo: past.current.length, redo: future.current.length });
  const latest = useRef<Snapshot>({
    pads: {},
    hidden: {},
    keyPc: null,
    tunedTarget: null,
    layout,
  });
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
  /** The two audio files picked for acapella mode, waiting for the user to confirm which is the song and which the vocal. */
  const [roleAsk, setRoleAsk] = useState<{ song: File; stem: File } | null>(null);
  /** The stem's pad settings from the acapella zip being chopped (not in the project), for the export. */
  const acapellaTemplate = useRef<SongTemplate | undefined>(undefined);

  /** The sound type a dropped pack gave each pad (by pad number), used in place of the classifier's guess. */
  const categoryHints = useRef<Record<number, CategoryId>>({});
  /** What the drop zone says while a pack is being measured and levelled. */
  const [importStatus, setImportStatus] = useState("");
  const [sampleLibrary, setSampleLibrary] = useState<SampleLibraryRecord[]>([]);
  const [favoritePads, setFavoritePads] = useState<Pad[]>([]);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex | null>(null);
  const libraryFiles = useRef<FoundPack | null>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const refreshOnReconnect = useRef(false);
  const [libraryToolsOpen, setLibraryToolsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexProgress, setIndexProgress] = useState<LibraryProgress | null>(null);
  const [kitReport, setKitReport] = useState<{ filled: number; requested: number; shortages: string[] } | null>(null);
  const [indexReused, setIndexReused] = useState(0);
  const [additionalBanks, setAdditionalBanks] = useState<AdditionalBanks>(saved.additionalBanks ?? 0);
  const [typeSettings, setTypeSettings] = useState<Partial<Record<CategoryId, PadPlayback>>>(saved.typeSettings ?? {});
  const [playbackEditorOpen, setPlaybackEditorOpen] = useState(false);
  const [balancePacks, setBalancePacks] = useState(saved.balancePacks ?? true);
  const [templates, setTemplates] = useState<FingerLayout[]>(saved.customTemplates ?? []);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [activeLayout, setActiveLayout] = useState<FingerLayout>(() => saved.customTemplates?.find((t) => t.id === saved.layoutId) ?? layoutById(saved.layoutId));
  const getLayout = (id: string | null | undefined) => id === activeLayout.id ? activeLayout : templates.find((t) => t.id === id) ?? layoutById(id);
  useEffect(() => { saveState({ additionalBanks, balancePacks, customTemplates: templates, typeSettings }); }, [additionalBanks, balancePacks, templates, typeSettings]);
  useEffect(() => {
    if (!saved.libraryIndexId) return;
    let cancelled = false;
    void loadLibraryIndex(saved.libraryIndexId).then((index) => { if (!cancelled && index) { setLibraryIndex(index); setLibraryOpen(true); } });
    return () => { cancelled = true; };
  }, [saved.libraryIndexId]);
  const connectLibrary = async (input: FoundPack | File[], force = false) => {
    if (indexBusy) return;
    setIndexBusy(true);
    setLibraryError("");
    setLibraryOpen(true);
    setIndexProgress({ stage: "Reading file names and folder paths", processed: 0, total: Array.isArray(input) ? input.length : input.files.length, percent: 0 });
    try {
      const found = Array.isArray(input) ? await findPackInFileListAsync(input, (processed, total) => setIndexProgress({ stage: "Reading file names and folder paths", processed, total, percent: total ? 15 * processed / total : 0 })) : input;
      const previous = libraryIndex?.name === found.name ? libraryIndex : await loadLibraryIndex(`library:${found.name}`);
      const refreshed = await refreshLibraryAsync(found.name, found.files, previous, force, setIndexProgress);
      libraryFiles.current = { name: found.name, files: refreshed.files };
      setLibraryIndex(refreshed.index); setIndexReused(refreshed.reused);
      saveState({ libraryIndexId: refreshed.index.id });
      setIndexProgress({ stage: "Saving metadata on this device", processed: refreshed.index.samples.length, total: refreshed.index.samples.length, percent: 95 });
      if (!await saveLibraryIndex(refreshed.index)) setNotice("Index is available this session, but device storage could not save it.");
      setIndexProgress({ stage: force ? "Refresh complete" : "Files connected", processed: refreshed.index.samples.length, total: refreshed.index.samples.length, percent: 100 });
    } catch (error) {
      recordDebug("App operation", error);
      setIndexProgress(null);
      setLibraryError("Could not reconnect this folder. Choose your packs folder again.");
      setNotice(error instanceof Error ? error.message : "Could not index this folder.");
    } finally { setIndexBusy(false); }
  };
  const correctLibrarySample = (id: string, classification: SampleClassification) => {
    if (!libraryIndex) return;
    const next = correctSample(libraryIndex, id, classification);
    setLibraryIndex(next);
    if (libraryFiles.current) libraryFiles.current.files = libraryFiles.current.files.map((file) => file.libraryId === id ? { ...file, classification: next.samples.find((sample) => sample.id === id)!.classification } : file);
    void saveLibraryIndex(next).then((ok) => { if (!ok) setNotice("Correction could not be saved on this device."); });
  };
  const [sampleLibraryOpen, setSampleLibraryOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const records = await loadSampleLibrary();
      if (cancelled) return;
      setSampleLibrary(records);
      const favorites: Pad[] = [];
      for (const [i, record] of records.entries()) {
        if (!record.favorite || !record.audio || !record.sampleRate) continue;
        try {
          const decoded = await decodeNative(new File([record.audio], record.name, { type: "audio/wav" }));
          favorites.push({
            index: -1,
            origIndex: -100000 - i,
            libraryId: record.id,
            favorite: true,
            name: record.name,
            sourcePath: record.sourcePath,
            sampleId: -1,
            sampleRate: record.sampleRate || decoded.sampleRate,
            channelData: decoded.channelData,
            category: record.category,
            is808: record.is808,
            tune: false,
            semis: 0,
            cents: 0,
          });
        } catch (error) { recordDebug("App operation", error);
          // A corrupt cached favorite is omitted from playable hot-swap candidates.
        }
      }
      if (!cancelled) setFavoritePads(favorites);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadProject = useCallback(
    async (file: File, restore = false, ignoreLong = false) => {
      if (file.size > PROJECT_BYTE_BUDGET) {
        setNotice("This project exceeds the 512 MB limit. Open a smaller project or generate a smaller kit.");
        return;
      }
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
        setLayout((l) => ({
          on: layoutOn,
          id: layoutOn ? saved.layoutId ?? l.id : l.id,
          pre: layoutOn ? (saved.layoutPre ?? {}) : {},
        }));
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
          // The project's own tempo becomes the project tempo.
          const { bpm } = await projectTimeSignature(project);
          if (token !== loadToken.current) return;
          setProjectBpm(bpm);
          setBpmText(String(bpm));
        }
        setProjectName(project.originalName.replace(/\.koala$/i, ""));

        // Pads numbered past the grid are a sample pack's hidden spare sounds, and on reopening the saved state says which sounds are spare.
        const isSpare = (pad: number) => {
          const saved = restore ? restorePads.current[pad] : undefined;
          return saved ? !!saved.hidden : pad >= 64;
        };
        // Silent placeholder pads from an earlier export (every one plays silence.wav) are not sounds: they are left out, and the next export drops them.
        const slots = project.pads.filter(
          (p) =>
            p.pad >= 0 &&
            p.fileName !== "silence.wav" &&
            !(restore && restorePads.current[p.pad]?.deleted),
        );
        setAnalyzing(slots.length);
        const tooLong: number[] = [];
        for (const ref of slots) {
          const spare = isSpare(ref.pad);
          const decoded = await decodeNative(
            await koalaPadToFile(project, ref),
          );
          if (token !== loadToken.current) return;
          // Koala plays only between the pad's start and end points, so the preview and analysis get just that part.
          const range = trimRangeOf(
            project,
            ref.sampleId,
            decoded.channelData[0].length,
          );
          if (range)
            decoded.channelData = decoded.channelData.map((ch) =>
              ch.slice(range.start, range.end),
            );
          // Pads the user moved on a previous visit go back where they were left.
          const at = spare
            ? -1
            : restore
              ? (restorePads.current[ref.pad]?.position ?? ref.pad)
              : ref.pad;
          const pad: Pad = {
            index: at,
            origIndex: ref.pad,
            name: ref.fileName,
            sourcePath: ref.sourcePath,
            label: ref.label || undefined,
            sampleId: ref.sampleId,
            sampleRate: decoded.sampleRate,
            channelData: decoded.channelData,
            knobDb: restore ? restorePads.current[ref.pad]?.knobDb : undefined,
            is808: restore ? restorePads.current[ref.pad]?.is808 : undefined,
            libraryId: (restore ? restorePads.current[ref.pad]?.libraryId : undefined) ?? ref.libraryId,
            classification: ref.classification,
            playback: ref.playback,
            favorite: restore ? restorePads.current[ref.pad]?.favorite : undefined,
            trimmedFrom: range?.start,
            tune: false,
            semis: 0,
            cents: 0,
          };
          if (spare) setHidden((prev) => ({ ...prev, [ref.pad]: pad }));
          else setPads((prev) => ({ ...prev, [at]: pad }));
          if (
            !spare &&
            decoded.channelData[0].length / decoded.sampleRate >
              MAX_SAMPLE_SECONDS
          )
            tooLong.push(ref.pad);
          // Analysis runs on a worker while the next pad decodes.
          nextAnalysisWorker()
            .analyze(
              monoFromChannelData(pad.channelData),
              pad.sampleRate,
              pad.sourcePath ?? ref.fileName,
              false,
              categoryHints.current[ref.pad] ?? ref.classification?.category ?? (restore ? restorePads.current[ref.pad]?.category : undefined),
            )
            .catch(() => ({
              midi: null,
              category: "other" as const,
              detail: undefined,
              centroid: undefined,
              bpm: null,
              named: false,
            }))
            .then(
              ({
                midi: detectedMidi,
                category: guessed,
                detail,
                centroid,
                bpm,
                named,
              }) => {
                if (token !== loadToken.current) return;
                const category = categoryHints.current[ref.pad] ?? guessed;
                const remembered = restorePads.current[ref.pad];
                const cat = remembered
                  ? rememberedCategory(remembered.category, category)
                  : category;
                const analysed = (cur: Pad): Pad => ({
                  ...cur,
                  detectedMidi,
                  detail,
                  centroid,
                  bpm: bpm ?? undefined,
                  keyFromName: named,
                  ...(remembered
                    ? {
                        tune: remembered.tune,
                        tuneLocked: remembered.tuneLocked,
                        keyPc: remembered.keyPc,
                        semis: remembered.semis,
                        cents: remembered.cents,
                        stretch: remembered.stretch,
                        locked: remembered.locked,
                        category: cat,
                        label: remembered.label ?? ref.label,
                        classification: remembered.classification ?? ref.classification,
                        playback: remembered.playback ?? ref.playback,
                      }
                    : { category }),
                  // A sound reopened from a previous visit keeps exactly the Tune state it was left with; only a new sound is decided by analysis.
                  tune: remembered
                    ? remembered.tune
                    : tuneDefault(
                        cur.tuneLocked,
                        cur.tune,
                        cat,
                        detectedMidi,
                        tunedTargetRef.current,
                      ),
                });
                // The sound may sit on a pad or in the hot-swap pool, and may have been moved, swapped or deleted while it was analysing.
                setPads((prev) => {
                  const slot = Object.keys(prev).find(
                    (k) => prev[Number(k)].origIndex === ref.pad,
                  );
                  if (slot === undefined) return prev;
                  const done = analysed(prev[Number(slot)]);
                  const next = { ...prev, [Number(slot)]: done };
                  // Ghost snares and soft kicks rebuilt on reopening were made before their source was analysed, so they take its sound type now.
                  for (const [k, g] of Object.entries(prev)) {
                    if (g.ghost?.sourceOrigIndex === ref.pad)
                      next[Number(k)] = { ...g, category: done.category };
                  }
                  return next;
                });
                setHidden((prev) =>
                  prev[ref.pad]
                    ? { ...prev, [ref.pad]: analysed(prev[ref.pad]) }
                    : prev,
                );
                setAnalyzing((n) => n - 1);
              },
            );
        }
        // A project reopened with its layout on gets its ghost snares and soft kicks remade from their source sounds.
        if (layoutOn && saved.layoutGhosts?.length) {
          setPads((prev) => {
            const next = { ...prev };
            for (const g of saved.layoutGhosts ?? []) {
              const source = Object.values(prev).find(
                (p) => isReal(p) && p.origIndex === g.sourceOrigIndex,
              );
              if (source && !next[g.index])
                next[g.index] = makeGhostPad(g.index, g.kind, source);
            }
            return next;
          });
        }
        // The acapella chopper works on a long song, so it never asks about the length limit.
        if (!restore && !ignoreLong && tooLong.length > 0)
          setLongSamples(tooLong);
      } catch (err) {
        // Not a usable project: stay on the drop screen rather than showing an error.
        console.error(err);
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [saved],
  );

  // Reopen the last project, if there was one.
  useEffect(() => {
    void loadProjectFile().then((file) => {
      if (file) void loadProject(file, true);
    });
  }, [loadProject]);

  useEffect(() => {
    saveState({
      organizeOn: organize,
      sidechainOn,
      masterStyle,
      padSymbols,
      packMemory,
      paletteId,
      iconLight,
      toneOn,
      toneVolume,
      a4,
      bank,
      selected,
      keyPc,
      tunedTarget,
      keyMajor,
      bpm: projectBpm,
    });
  }, [
    organize,
    sidechainOn,
    masterStyle,
    padSymbols,
    packMemory,
    paletteId,
    iconLight,
    toneOn,
    toneVolume,
    a4,
    bank,
    selected,
    keyPc,
    tunedTarget,
    keyMajor,
    projectBpm,
  ]);

  // Pad choices are only saved once every pad has loaded, so a half-restored grid never overwrites them.
  useEffect(() => {
    if (
      analyzing > 0 ||
      loading ||
      (Object.keys(pads).length === 0 && Object.keys(hidden).length === 0)
    )
      return;
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
        label: p.label,
        classification: p.classification,
        playback: p.playback,
        knobDb: p.knobDb,
        is808: p.is808,
        libraryId: p.libraryId,
        favorite: p.favorite,
        stretch: p.stretch,
        locked: p.locked,
        position: p.index,
      };
    }
    for (const p of Object.values(hidden)) {
      out[p.origIndex] = {
        tune: p.tune,
        tuneLocked: p.tuneLocked,
        keyPc: p.keyPc,
        semis: p.semis,
        cents: p.cents,
        category: p.category,
        label: p.label,
        classification: p.classification,
        playback: p.playback,
        knobDb: p.knobDb,
        is808: p.is808,
        libraryId: p.libraryId,
        favorite: p.favorite,
        stretch: p.stretch,
        hidden: true,
      };
    }
    // Sounds the user deleted stay deleted when the project is reopened.
    for (const ref of projectRef.current?.pads ?? []) {
      if (!(ref.pad in out))
        out[ref.pad] = { tune: false, semis: 0, cents: 0, deleted: true };
    }
    restorePads.current = out;
    saveState({
      pads: out,
      layoutId: layout.id,
      layoutOn: layout.on,
      layoutPre: layout.pre,
      layoutGhosts: Object.values(pads).flatMap((p) =>
        p.ghost
          ? [
              {
                index: p.index,
                kind: p.ghost.kind,
                sourceOrigIndex: p.ghost.sourceOrigIndex,
              },
            ]
          : [],
      ),
      layoutPlaceholders: Object.values(pads).flatMap((p) =>
        p.placeholder ? [{ index: p.index, ...p.placeholder }] : [],
      ),
    });
  }, [pads, hidden, analyzing, loading, layout]);

  /** Unloads the project and forgets it, so the app opens on the drop screen next time. Settings stay. */
  const clearProject = () => {
    if (
      !window.confirm(
        "Clear the loaded project? Your tuning edits for it will be lost.",
      )
    )
      return;
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
    saveState({
      pads: {},
      layoutOn: false,
      layoutPre: {},
      layoutGhosts: [],
      layoutPlaceholders: [],
    });
    void clearProjectFile();
    setMenuOpen(false);
  };

  /**
   * Opening a .koala project from the start screen leaves it exactly as it is: no long-sample question, and every menu option goes back off
   * (Organize and Sidechain apply only if the user switches them on again after this load).
   */
  const openKoalaProject = (file: File) => {
    setOrganize(false);
    setSidechainOn(false);
    void loadProject(file, false, true);
  };

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = Array.from(files ?? []).find(isKoalaFile);
    if (file) openKoalaProject(file);
  };

  /** Makes sure a project is open for a loader to write into: a blank one when nothing is. Returns whether one was started. */
  const ensureProject = async (): Promise<{
    project: ParsedKoalaProject;
    started: boolean;
  } | null> => {
    const started = !projectRef.current;
    if (started) {
      await loadProject(await blankProject());
      // Let the project's state settle before the loader reads it.
      await new Promise((resolve) => setTimeout(resolve));
    }
    return projectRef.current ? { project: projectRef.current, started } : null;
  };

  /** The bank that is shown once a loader has filled its pads. */
  const BANK_SHOWN: Record<BankLoad, number> = {
    drums: 0,
    loops: 1,
    bass: 1,
    oneShots: 2,
    kit: 0,
  };

  /**
   * Fills one bank from a folder (see bankLoad.ts for what each loader takes). Loading again replaces that bank's pads and spares and
   * leaves every other bank exactly as it is. The sounds are named by type and number ("Kick 1"), levelled against the rest of the
   * project, written into the project's zip, and put on their pads; what the pads cannot hold goes to the hot-swap pool.
   */
  const loadBank = async (
    bank: BankLoad,
    find: () => Promise<FoundPack> | FoundPack,
  ) => {
    if (addPackStatus || loading) return;
    setAddPackStatus("Reading…");
    try {
      const found = await find();
      const plan = planBank(bank, found.files, Math.random, { layout: activeLayout, additionalBanks, balancePacks });
      if (plan.problem) {
        window.alert(plan.problem);
        return;
      }
      const zone = BANK_ZONES[bank];
      const inZone = (p: Pad) =>
        !p.section && !p.chopper && p.index >= zone.start && p.index < zone.end;
      const opened = await ensureProject();
      if (!opened) return;
      const { project, started } = opened;
      const token = loadToken.current;
      const cur = latest.current;
      const lay = activeLayout;
      // What this load replaces: the real sounds on its pads, and the spares of its kind in the hot-swap pool.
      // A locked pad keeps its sound: it is not replaced, and what the pack brings for its place goes to the hot-swap options instead.
      const lockedSlots = new Set(
        Object.values(cur.pads)
          .filter((p) => p.locked && inZone(p))
          .map((p) => p.index),
      );
      const replacedPads = Object.values(cur.pads).filter(
        (p) => isReal(p) && inZone(p) && !p.locked,
      );
      const replacedSpares = Object.values(cur.hidden).filter((p) =>
        bank === "drums"
          ? isKitCategory(p.category)
          : bankTakes(bank, p.category),
      );
      const replaced = [...replacedPads, ...replacedSpares];
      const kept = [
        ...Object.values(cur.pads).filter(
          (p) => isReal(p) && (!inZone(p) || p.locked),
        ),
        ...Object.values(cur.hidden).filter((p) => !replacedSpares.includes(p)),
      ];
      const bytesOf = (p: Pad) =>
        p.channelData.reduce((n, ch) => n + ch.length * 3, 0);
      const budget = Math.max(
        0,
        packByteBudget(packMemory) -
          Math.max(
            0,
            (projectFile.current?.size ?? 0) -
              replaced.reduce((n, p) => n + bytesOf(p), 0),
          ),
      );
      const excludedIds = new Set(kept.flatMap((pad) => pad.libraryId ? [pad.libraryId] : []));
      const groups = plan.groups.map((group) => ({ ...group, candidates: group.candidates.filter((file) => !file.libraryId || !excludedIds.has(file.libraryId)) }));
      const result = await writeBankSounds(project, groups, {
        existing: kept.map((p) => ({
          channelData: p.channelData,
          sampleRate: p.sampleRate,
          category: p.category,
        })),
        byteBudget: budget,
        maxSeconds:
          bank === "loops" || bank === "oneShots"
            ? MAX_LOAD_SECONDS
            : undefined,
        replace: replaced.map((p) => p.origIndex),
        measure: (input) => getRenderWorker().measure(input),
        onProgress: setAddPackStatus,
      });
      if (token !== loadToken.current) return;
      if (!result) {
        if (bank === "kit") {
          libraryFiles.current = null;
          setLibraryError("No samples could be loaded. Reconnect your packs folder and try again.");
          setLibraryToolsOpen(false);
          setLibraryOpen(true);
        } else window.alert(`No sound in that folder could be loaded: they were too long (bass/808 one-shots: 5 s; melodic one-shots: 6 s; loops: ${MAX_LOAD_SECONDS} s), marked as loops for a one-shot slot, too big for the project size limit, or unreadable.`);
        return;
      }
      // The first load into a new project names it: "TuneGod - All Kits" for a whole library, "TuneGod - {pack}" for one pack.
      const named = started ? projectNameForFiles(found.files) : null;
      const savedFile = named ? new File([result.file], `${named}.koala`, { type: result.file.type }) : result.file;
      if (named) {
        project.originalName = `${named}.koala`;
        setProjectName(named);
      }
      projectFile.current = savedFile;
      void saveProjectFile(savedFile);
      const placement = placeBank(
        bank,
        result.sounds.map((s) => ({
          key: s.pad,
          category: s.category,
          is808: s.is808,
          classification: s.classification,
          identity: s.libraryId,
        })),
        lay,
        { additionalBanks, locked: lockedSlots, excluded: new Set(kept.flatMap((pad) => pad.libraryId ? [pad.libraryId] : [])) },
      );
      const fresh: Pad[] = [];
      for (const sound of result.sounds) {
        const ref = project.pads.find((p) => p.pad === sound.pad)!;
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        categoryHints.current = {
          ...categoryHints.current,
          [sound.pad]: sound.category,
        };
        fresh.push({
          index: lockedSlots.has(placement.positions.get(sound.pad) ?? -1)
            ? -1
            : (placement.positions.get(sound.pad) ?? -1),
          origIndex: sound.pad,
          name: sound.fileName,
          label: (bank === "kit" || bank === "drums") && (placement.positions.get(sound.pad) ?? 64) < 16 ? matchingTemplateLabel(lay.slots[placement.positions.get(sound.pad)!], sound) : undefined,
          sourcePath: sound.sourcePath,
          sampleId: sound.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          knobDb: sound.knobDb,
          is808: sound.is808 || undefined,
          libraryId: sound.libraryId,
          favorite: sound.favorite,
          category: sound.category,
          classification: sound.classification,
          tune: false,
          semis: 0,
          cents: 0,
        });
      }
      if (bank === "kit" || bank === "drums") setKitReport({ filled: placement.positions.size + [...lockedSlots].filter((index) => index < (bank === "kit" ? (additionalBanks + 1) * 16 : 16)).length, requested: bank === "kit" ? (additionalBanks + 1) * 16 : 16, shortages: placement.shortages?.map((gap) => `${String.fromCharCode(65 + Math.floor(gap.index / 16))}${gap.index % 16 + 1} · ${gap.label}`) ?? [] });
      const onPads = fresh.filter((p) => p.index >= 0);
      const spares = fresh.filter((p) => p.index < 0);
      setSampleLibrary(await loadSampleLibrary());
      setPads((prev) => {
        const next: Record<number, Pad> = {};
        for (const p of Object.values(prev))
          if (!inZone(p) || p.locked) next[p.index] = p;
        for (const p of onPads) next[p.index] = p;
        if (bank === "drums") {
          for (const ph of placement.placeholders)
            if (!lockedSlots.has(ph.index))
              next[ph.index] = makePlaceholderPad(ph);
          for (const g of placement.ghosts) {
            const source = onPads.find((p) => p.origIndex === g.sourceKey);
            if (source && !lockedSlots.has(g.index))
              next[g.index] = makeGhostPad(g.index, g.kind, source);
          }
        }
        return next;
      });
      setHidden((prev) => ({
        ...Object.fromEntries(
          Object.entries(prev).filter(
            ([, p]) => !replacedSpares.some((r) => r.origIndex === p.origIndex),
          ),
        ),
        ...Object.fromEntries(spares.map((p) => [p.origIndex, p])),
      }));
      if (bank === "drums" || bank === "kit")
        setLayout({ on: true, id: lay.id, pre: {} });
      // A project this load started gets Organize too.
      if (started) setOrganize(true);
      setSelected(null);
      setBank(BANK_SHOWN[bank]);
      setAnalyzing((n) => n + fresh.length);
      if (placement.shortages?.length) {
        setNotice(`Missing ${placement.shortages.length} requested pads: ${placement.shortages.map((gap) => `${String.fromCharCode(65 + Math.floor(gap.index / 16))}${gap.index % 16 + 1} ${gap.label}`).join(", ")}. No substitute sounds used.${result.skipped ? ` ${result.skipped} files skipped.` : ""}`);
      } else if (result.skipped > 0)
        setNotice(
          `${result.skipped} file${result.skipped === 1 ? "" : "s"} skipped: too long, too big for the project size limit or unreadable`,
        );
      for (const pad of fresh) {
        nextAnalysisWorker()
          .analyze(
            monoFromChannelData(pad.channelData),
            pad.sampleRate,
            pad.sourcePath ?? pad.name,
            pad.category === "melodicLoop",
            pad.category,
          )
          .catch(() => ({
            midi: null,
            category: "other" as const,
            detail: undefined,
            centroid: undefined,
            bpm: null,
            named: false,
          }))
          .then(({ midi: detectedMidi, detail, centroid, bpm, named }) => {
            if (token !== loadToken.current) return;
            const analysed = (p: Pad): Pad => ({
              ...p,
              detectedMidi,
              detail,
              centroid,
              bpm: bpm ?? undefined,
              keyFromName: named,
              stretch: p.stretch,
              tune: tuneDefault(
                p.tuneLocked,
                p.tune,
                p.category,
                detectedMidi,
                tunedTargetRef.current,
              ),
            });
            setPads((prev) => {
              const at = Object.keys(prev).find(
                (k) => prev[Number(k)].origIndex === pad.origIndex,
              );
              return at === undefined
                ? prev
                : { ...prev, [Number(at)]: analysed(prev[Number(at)]) };
            });
            setHidden((prev) =>
              prev[pad.origIndex]
                ? { ...prev, [pad.origIndex]: analysed(prev[pad.origIndex]) }
                : prev,
            );
            setAnalyzing((n) => n - 1);
          });
      }
      // The new sounds are part of the project now; undo would only be able to take them away again.
      past.current = [];
      future.current = [];
      syncHistory();
    } catch (err) {
      console.error(err);
      if (bank === "kit") {
        libraryFiles.current = null;
        setLibraryError("Could not load the kit. Reconnect your packs folder and try again.");
        setLibraryToolsOpen(false);
        setLibraryOpen(true);
      } else window.alert("That folder could not be loaded.");
    } finally {
      setAddPackStatus("");
      setImportStatus("");
    }
  };

  /** The Acapella / Chopper button asks which mode first. */
  const [modeAsk, setModeAsk] = useState(false);
  /** Chopper mode's list of samples over 10 seconds. */
  const [sourcePick, setSourcePick] = useState<"chopper" | "synced" | null>(
    null,
  );
  /** The mode chosen while the Koala project picker is open, and then while that project loads: the mode starts as soon as the project is in. */
  const pickedMode = useRef<ChopMode | null>(null);
  const acapellaPending = useRef<ChopMode | null>(null);

  /** The sound a pad was dragged onto the Chopper zone with, while the mode is being asked. */
  const [chopTarget, setChopTarget] = useState<Pad | null>(null);

  const askChopMode = (target?: Pad) => {
    setMenuOpen(false);
    setChopTarget(target ?? null);
    setModeAsk(true);
  };

  /**
   * A pad was dragged onto the Chopper zone. Chopper mode takes it as the sample to chop (it must be over 10 seconds). Acapella mode looks for its pair by
   * label: the pad and a pad labelled like it with VOCALS after it (or, when it is the stem, the song it is named after).
   */
  const chopPad = async (mode: ChopMode, pad: Pad) => {
    if (addPackStatus || loading || analyzing > 0) return;
    if (mode === "chopper" || mode === "synced") {
      if (pad.channelData[0].length / pad.sampleRate < CHOPPER_MIN_SECONDS)
        return void window.alert(
          `${mode === "synced" ? "Synced" : "Chopper"} mode needs a sample over ${CHOPPER_MIN_SECONDS} seconds.`,
        );
      return void (await (mode === "synced"
        ? launchSynced(pad)
        : launchChopper(pad)));
    }
    const cur = latest.current;
    const check = checkStems(pad, [
      ...Object.values(cur.pads).filter(isReal),
      ...Object.values(cur.hidden),
    ]);
    if (!check.ok) return void window.alert(check.message);
    await launchAcapella(check.song, check.vocals);
  };

  /** A mode was chosen. With no project open a Koala project is picked first and opened like any other (a long song is fine: the 60 s limit is ignored). */
  const chooseChopMode = (mode: ChopMode) => {
    setModeAsk(false);
    const target = chopTarget;
    setChopTarget(null);
    if (target) return void chopPad(mode, target);
    const open =
      Object.keys(latest.current.pads).length > 0 ||
      Object.keys(latest.current.hidden).length > 0;
    if (open) return void beginChop(mode);
    pickedMode.current = mode;
    // Acapella mode takes a .koala project or audio files (the song and its stem, picked together); chopper and synced mode take one audio file.
    // Acapella mode's picker has no type filter: iOS shows only audio when the filter lists audio next to .koala and greys the project out
    // (loadAcapella sorts the picked files by extension).
    if (acapellaInput.current) {
      if (mode === "acapella") acapellaInput.current.removeAttribute("accept");
      else
        acapellaInput.current.accept =
          "audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg";
      acapellaInput.current.multiple = mode === "acapella";
    }
    acapellaInput.current?.click();
  };

  /**
   * Chopper mode with an audio file and no project open: the file is the sample to chop. A blank project is started (the export writes the new
   * project from it) and the chop editor opens on the file.
   */
  const loadChopperAudio = async (
    file: File,
    mode: "chopper" | "synced" = "chopper",
  ) => {
    pickedMode.current = null;
    const modeName = mode === "synced" ? "Synced" : "Chopper";
    let audio: Awaited<ReturnType<typeof decodeNative>>;
    try {
      audio = await decodeNative(file);
    } catch (error) { recordDebug("App operation", error);
      return void window.alert("That audio file could not be read.");
    }
    if (
      audio.channelData.length === 0 ||
      audio.channelData[0].length / audio.sampleRate < CHOPPER_MIN_SECONDS
    )
      return void window.alert(
        `${modeName} mode needs a sample over ${CHOPPER_MIN_SECONDS} seconds.`,
      );
    const opened = await ensureProject();
    if (!opened) return;
    const { project } = opened;
    const used = [
      ...project.pads.map((p) => p.sampleId),
      ...((project.samplerJson?.samples ?? []) as any[]).map((s) => s.id),
    ].filter((id): id is number => typeof id === "number");
    const song: Pad = {
      index: -1,
      origIndex: CHOPPER_ORIG_INDEX,
      name: file.name.replace(/\.[^.]+$/, ""),
      sampleId: Math.max(0, ...used) + 1,
      sampleRate: audio.sampleRate,
      channelData: audio.channelData,
      category: "melodic",
      tune: false,
      semis: 0,
      cents: 0,
    };
    await (mode === "synced" ? launchSynced(song) : launchChopper(song));
  };

  const loadAcapella = async (picked: File[]) => {
    if (addPackStatus || loading) return;
    if (pickedMode.current === "chopper" || pickedMode.current === "synced") {
      const mode = pickedMode.current;
      const audio = picked.find((f) => !isKoalaFile(f));
      if (!audio) {
        pickedMode.current = null;
        return void window.alert(
          `${mode === "synced" ? "Synced" : "Chopper"} mode needs an audio file.`,
        );
      }
      return void (await loadChopperAudio(audio, mode));
    }
    // Acapella mode: a Koala project, or the song and its vocal stem as two audio files (the user is shown both and can swap which is which).
    const project = picked.find(isKoalaFile);
    if (!project) {
      if (picked.length !== 2) {
        pickedMode.current = null;
        return void window.alert("Acapella mode needs two audio files: the song and its vocal stem. Pick both together, or open a Koala project that already holds them.");
      }
      return void setRoleAsk(guessAcapellaRoles(picked));
    }
    return void (await openAcapellaFile(project));
  };

  /** The two files were picked and the user has settled which is the song and which the vocal: make the project and open it. */
  const finishAcapellaRoles = async (song: File, stem: File) => {
    setRoleAsk(null);
    const made = await acapellaProjectFromAudio([song, stem], { song, stem });
    if ("problem" in made) {
      pickedMode.current = null;
      return void window.alert(made.problem);
    }
    await openAcapellaFile(made.file);
  };

  const openAcapellaFile = async (file: File) => {
    acapellaPending.current = pickedMode.current ?? "acapella";
    pickedMode.current = null;
    await loadProject(file, false, true);
    await new Promise((resolve) => setTimeout(resolve));
    if (
      Object.keys(latest.current.pads).length === 0 &&
      Object.keys(latest.current.hidden).length === 0
    ) {
      acapellaPending.current = null;
      window.alert("That file could not be opened as a Koala project.");
    }
  };

  const beginChop = async (mode: ChopMode) => {
    if (addPackStatus || loading || analyzing > 0) return;
    if (mode === "chopper" || mode === "synced")
      return void setSourcePick(mode);
    await startAcapella();
  };

  /**
   * Acapella mode: the song and its vocal stem are looked for in bank D's first two slots, then anywhere else in the project (a pad labelled like the
   * song and one labelled like the song with VOCALS after it). With no pair the user is told both are needed.
   */
  const startAcapella = async () => {
    const cur = latest.current;
    const onPads = Object.values(cur.pads)
      .filter(isReal)
      .sort((a, b) => a.index - b.index);
    const found = findAcapellaPair(
      cur.pads[CHOP_BANK_START],
      cur.pads[CHOP_BANK_START + 1],
      [...onPads, ...Object.values(cur.hidden)],
    );
    if (!found.ok) {
      window.alert(found.message);
      return;
    }
    await launchAcapella(found.song, found.vocals);
  };

  useEffect(() => {
    const mode = acapellaPending.current;
    if (!mode || loading || analyzing > 0 || !hasProject) return;
    acapellaPending.current = null;
    void beginChop(mode);
    // starts once, when the picked project has finished loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, analyzing, pads, hidden]);

  /** A drop: a .koala file loads as a project, a folder as a sample pack. */
  const handleDrop = (data: DataTransfer) => {
    const file = Array.from(data.files).find(isKoalaFile);
    if (file) return openKoalaProject(file);
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
    const same =
      key !== "" &&
      lastEdit.current.key === key &&
      now - lastEdit.current.time < COALESCE_MS;
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
    setLayout((l) => ({
      ...snap.layout,
      id: snap.layout.on ? snap.layout.id : l.id,
    }));
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

  /** Sets the project tempo (the menu, a project that was opened and a chopped song all come through here). */
  const changeBpm = (bpm: number) => {
    const clamped = Math.min(300, Math.max(20, Math.round(bpm * 100) / 100));
    setProjectBpm(clamped);
    setBpmText(String(clamped));
  };

  const patchPad = (index: number, patch: Partial<Pad>) => {
    recordEdit("semis" in patch || "cents" in patch ? `${index}:trim` : "");
    setPads((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  };

  /** Changes a sound's type in place. Tune follows the new type unless the user set it by hand. The pad stays where it is: only the loaders place sounds. */
  const classifyPad = (pad: Pad, category: CategoryId) => {
    if (pad.libraryId && libraryIndex?.samples.some((sample) => sample.id === pad.libraryId)) correctLibrarySample(pad.libraryId, { category, confidence: 1, needsReview: false, evidence: "correction" });
    if (pad.category === category) return;
    resetStoredType(
      projectFile.current
        ? `${projectFile.current.name}:${projectFile.current.size}`
        : "current",
      pad.index,
      category,
      pad.channelData[0].length / pad.sampleRate,
      projectBpm,
      Object.values(pads).find((p) => p.category === "kick")?.index,
    );
    patchPad(
      pad.index,
      pad.tuneLocked
        ? { category, label: undefined, classification: { category, confidence: 1, needsReview: false, evidence: "correction" } }
        : {
            category,
            label: undefined,
            classification: { category, confidence: 1, needsReview: false, evidence: "correction" },
            tune: tuneDefault(
              false,
              false,
              category,
              pad.detectedMidi,
              tunedTarget,
            ),
          },
    );
  };

  /** The sound being chopped (the cuts are found on it), and in acapella mode its vocal stem (what is cut), with the project's beats per bar, while the chop editor is open. */
  const [chop, setChop] = useState<{
    mode: ChopMode;
    song: Pad;
    vocals: Pad;
    beatsPerBar: number;
  } | null>(null);
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
    await launchAcapella(check.song, check.vocals);
  };

  const beatsPerBarOfProject = async () => {
    const project = projectRef.current;
    return project ? (await projectTimeSignature(project)).beatsPerBar : 4;
  };

  /** Opens the chop editor in acapella mode. The chops overwrite everything on bank D, so the user is warned when something is there. */
  const launchAcapella = async (song: Pad, vocals: Pad) => {
    const beatsPerBar = await beatsPerBarOfProject();
    acapellaTemplate.current = undefined;
    setMenuOpen(false);
    setLongSamples([]);
    setChop({ mode: "acapella", song, vocals, beatsPerBar });
  };

  /**
   * Opens the chop editor in synced mode: acapella mode without the acapella. The sample is its own song, so the markers are placed on it and the same
   * sample is cut into the section pads. Like acapella mode it overwrites bank D (locked pads excepted).
   */
  const launchSynced = async (song: Pad) => {
    const beatsPerBar = await beatsPerBarOfProject();
    acapellaTemplate.current = undefined;
    setSourcePick(null);
    setMenuOpen(false);
    setLongSamples([]);
    setChop({ mode: "synced", song, vocals: song, beatsPerBar });
  };

  /** Opens the chop editor in chopper mode on the sample that was picked (the song itself is the sound that is cut). */
  const launchChopper = async (song: Pad) => {
    const beatsPerBar = await beatsPerBarOfProject();
    setSourcePick(null);
    setMenuOpen(false);
    setChop({ mode: "chopper", song, vocals: song, beatsPerBar });
  };

  /** The song sections as the export writes them: their pads, audio, bars, labels, colours and the tempo. */
  const songExportOf = (sectionPads: Pad[]): SongExport | undefined => {
    const sorted = [...sectionPads].sort(
      (a, b) => a.section!.number - b.section!.number,
    );
    if (!sorted.length) return undefined;
    // No bpm: acapella mode never touches the project's tempo (the sections are stretched to whatever it is). Each pad's pitch knob gets the key move plus
    // its own trim (the same number the pad plays at in the app); the audio is never repitched.
    return {
      pattern: sorted[0].section!.pattern,
      beatsPerBar: sorted[0].section!.beatsPerBar,
      sampleRate: sorted[0].sampleRate,
      sourceSampleId: sorted[0].section!.sourceSampleId,
      template: acapellaTemplate.current,
      bars: 8,
      sections: sorted.map((p) => ({
        index: p.index,
        label: labelOf(p),
        channelData: p.channelData,
        bars: p.section!.bars,
        beats: p.section!.beats,
        startBeat: p.section!.startBeat,
        pitch: shiftFor(p, tunedTarget, a4, keyMajor),
        color: autoColorOf(p),
        bus: CATEGORY_BUS.melodic,
      })),
    };
  };

  /**
   * Writes the sections into a fresh copy of the project, exactly as the export will (a WAV, a pad with stretch and a pattern each, and the tempo),
   * and reads it back. Returns what went wrong, or null when every section is in. Nothing in the app or the original file is changed.
   */
  const trialWriteSections = async (
    sections: Pad[],
    sourceSampleId: number,
    /** The app's pads once the chop is on them, less the sections: what stays beside the chops. */
    remaining: Record<number, Pad>,
    destinations: number[],
  ): Promise<string | null> => {
    if (!projectFile.current) return null;
    const project = await parseKoalaProject(projectFile.current);
    const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));
    const template =
      acapellaTemplate.current ?? songTemplate(samplerJson, sourceSampleId);
    // The pads that stay, on the slots they have in the app (the export moves them the same way), so the mute group and the slots the chops need
    // are judged against the real neighbours. The destinations are not among them: what was on them is replaced.
    const base = project.padBase;
    const now = new Map(
      Object.values(remaining)
        .filter(isReal)
        .map((p) => [p.origIndex, p.index]),
    );
    samplerJson.pads = (samplerJson.pads ?? [])
      .filter((sp: any) => now.has(Number(sp.pad) - base))
      .map((sp: any) => {
        const slot = now.get(Number(sp.pad) - base)! + base;
        return { ...sp, pad: typeof sp.pad === "string" ? String(slot) : slot };
      });
    const padsBefore = JSON.parse(JSON.stringify(samplerJson.pads));
    const sequenceBefore = JSON.parse(
      (await project.zip.file("sequence.json")?.async("string")) ?? "{}",
    );
    const song = songExportOf(sections)!;
    const added = await addSongSections(project, samplerJson, song, template);
    if (added < sections.length) {
      return song.pattern === "single"
        ? "the project has no free pattern (Koala has 32 pattern slots; free one and chop again)"
        : `the project has room for only ${added} of the ${sections.length} patterns (Koala has 32 pattern slots; free some and chop again)`;
    }
    const sequence = JSON.parse(
      (await project.zip.file("sequence.json")?.async("string")) ?? "{}",
    );
    const problems = validateChopExport({
      samplerJson,
      sequence,
      padBase: base,
      chops: song.sections.map((s) => ({ index: s.index, label: s.label })),
      pattern: song.pattern ?? "multiple",
      destinations,
      padsBefore,
      sequencesBefore: sequenceBefore.sequences ?? [],
      zipHas: (id) => !!project.zip.file(`sampler/${id}.wav`),
    });
    return problems.length ? problems.join("; ") : null;
  };

  /** The chopper pad whose pattern the pattern maker is making, while it is open. */
  const [makerPad, setMakerPad] = useState<number | null>(null);

  /** Done in the pattern maker: the sequence goes on the chopper pad (checked by writing it into a copy of the project first). */
  const finishMaker = async ({ slots, chops, grid, rhythm }: WorkspaceResult) => {
    const selected = latest.current.pads[makerPad ?? -1];
    const pad = selected?.chopper?.page ? latest.current.pads[48] : selected;
    if (!pad?.chopper?.maker) return void setMakerPad(null);
    const slices = Math.max(1, new Set(slots.flatMap(s => s.kind === 'chop' ? [`${s.chop}:${s.steps}`] : [])).size);
    const next: Pad = { ...pad, chopper: { ...pad.chopper, slices, maker: { ...pad.chopper.maker, slots, chops, grid, rhythm } } };
    let result: Awaited<ReturnType<typeof trialWriteChopper>>;
    try {
      result = await trialWriteChopper(next);
    } catch (err) {
      console.error(err);
      result = {
        problem:
          err instanceof Error
            ? err.message
            : "the project file could not be written",
      };
    }
    if ("problem" in result)
      return void window.alert(
        `The pattern could not be written into the Koala project: ${result.problem}.`,
      );
    recordEdit();
    setPads((prev) => installChopperPages(prev, next));
    setMakerPad(null);
    setNotice(
      `Pattern made on the chopper (Bank D pad ${(next.index % PADS_PER_BANK) + 1}): ${slots.length} slot${slots.length === 1 ? "" : "s"}, ${patternBars(slots, next.chopper!.beatsPerBar)} bars at ${next.chopper!.bpm.toFixed(2)} BPM.`,
    );
  };

  /** Bank D holds consecutive pages of the same editable arrangement. */
  const installChopperPages = (
    previous: Record<number, Pad>,
    pad: Pad,
  ): Record<number, Pad> => {
    const slices = pad.chopper!.maker?.slots?.length
      ? Math.max(
          1,
          new Set(
            pad.chopper!.maker!.slots!.flatMap((s) =>
              s.kind === "chop" ? [`${s.chop}:${s.steps}`] : [],
            ),
          ).size,
        )
      : pad.chopper!.slices;
    const count = Math.max(1, Math.ceil(slices / CHOPPER_MAX_SLICES));
    if (count > 16)
      throw new Error("Bank D is full (2032 unique chops maximum).");
    const next = Object.fromEntries(
      Object.entries(previous).filter(([, p]) => !p.chopper && !p.section),
    );
    for (let page = 0; page < count; page++) {
      const index = 48 + page;
      if (next[index])
        throw new Error(
          `Bank D pad ${page + 1} is occupied. Free it before saving the arrangement.`,
        );
      next[index] = {
        ...pad,
        index,
        origIndex: CHOPPER_ORIG_INDEX + page,
        chopper: {
          ...pad.chopper!,
          page,
          slices: Math.min(
            CHOPPER_MAX_SLICES,
            slices - page * CHOPPER_MAX_SLICES,
          ),
        },
      };
    }
    return next;
  };

  /** The pad picker for acapella and synced mode's chops: the chop it is for, and how many patterns Koala still has room for. */
  const [allocate, setAllocate] = useState<{
    job: { mode: ChopMode; song: Pad; vocals: Pad; beatsPerBar: number };
    settings: ChopSettings;
    patternSlots: number;
  } | null>(null);
  const previewVoice = useRef<PadHandle | null>(null);
  const previewTimer = useRef(0);

  /** Opens the pad picker once the editor's export button was pressed. */
  const openAllocator = async (
    job: { mode: ChopMode; song: Pad; vocals: Pad; beatsPerBar: number },
    settings: ChopSettings,
  ) => {
    let patternSlots = SEQUENCE_SLOTS;
    try {
      if (projectFile.current) {
        const project = await parseKoalaProject(projectFile.current);
        const text = await project.zip.file("sequence.json")?.async("string");
        const list: any[] = text ? (JSON.parse(text).sequences ?? []) : [];
        patternSlots = Math.max(
          0,
          SEQUENCE_SLOTS - list.filter((q) => !sequenceIsEmpty(q)).length,
        );
      }
    } catch (err) {
      console.error(err);
    }
    setAllocate({ job, settings, patternSlots });
  };

  /** Plays the sample on a pad as it is in the project (the pad's audio is already decoded, so a tap starts it at once); long ones stop after a few seconds. */
  const previewPad = (index: number) => {
    const pad = latest.current.pads[index];
    if (!pad || pad.placeholder) return;
    previewVoice.current?.release();
    window.clearTimeout(previewTimer.current);
    const cur = latest.current;
    previewVoice.current = startPad(
      PREVIEW_PAD,
      pad.channelData,
      pad.sampleRate,
      shiftFor(pad, cur.tunedTarget, a4, keyMajor),
      null,
      "hold",
    );
    previewTimer.current = window.setTimeout(() => {
      previewVoice.current?.release();
      previewVoice.current = null;
    }, PREVIEW_MAX_MS);
  };
  const stopPreview = () => {
    window.clearTimeout(previewTimer.current);
    previewVoice.current?.release();
    previewVoice.current = null;
  };

  /** While a chop is being made: a second press of Chop does nothing. */
  const chopping = useRef(false);

  /** The chopper pad as the export writes it. */
  const chopperExportOf = (pad: Pad): ChopperExport => {
    const chopper = pad.chopper!;
    const maker = chopper.maker;
    const packed = maker?.slots?.length
      ? packArrangement(
          pad.channelData,
          maker.chops,
          maker.slots,
          maker.beatFrames,
          pad.sampleRate,
        )
      : null;
    return {
      index: 48,
      label: labelOf(pad),
      color: autoColorOf(pad),
      bus: CATEGORY_BUS.melodic,
      sampleId: chopper.sourceSampleId,
      sampleRate: pad.sampleRate,
      channelData: packed?.channelData ?? pad.channelData,
      independentSample: !!packed,
      layout: packed?.layout ?? chopper.layout,
      beatsPerBar: chopper.beatsPerBar,
      pitch: chopper.pitch,
      pattern:
        packed && maker?.slots
          ? {
              notes: packed.notes,
              bars: patternBars(maker.slots, chopper.beatsPerBar),
              gate: true,
            }
          : undefined,
    };
  };

  /** Writes the chopper into a fresh copy of the project as the export will and reads it back: how many patterns it got, or what went wrong. */
  const trialWriteChopper = async (
    pad: Pad,
  ): Promise<{ patterns: number } | { problem: string }> => {
    installChopperPages(latest.current.pads, pad);
    if (!projectFile.current)
      return {
        patterns: chopperExportOf(pad).pattern
          ? 1
          : pad.chopper!.layout.sections.length,
      };
    const project = await parseKoalaProject(projectFile.current);
    const samplerJson = JSON.parse(JSON.stringify(project.samplerJson));
    samplerJson.pads = [];
    const patterns = await addChopperPad(
      project,
      samplerJson,
      chopperExportOf(pad),
    );
    if (!samplerJson.pads.some((p: any) => p.synth === "CHOPPER"))
      return { problem: "the chopper pad was not written" };
    if (
      patterns === 0 &&
      (pad.chopper!.layout.sections.length > 0 ||
        pad.chopper!.maker?.slots?.length)
    )
      return {
        problem:
          "the project has no free pattern (Koala has 32 pattern slots; free some and chop again)",
      };
    // The pattern maker's arrangement is read back out of the written sequence.json: one note on the chopper per chop slot, or nothing is kept.
    const maker = pad.chopper!.maker;
    if (maker?.slots?.length) {
      const wanted = slotNotes(maker.slots, maker.chops).length;
      const sequence = JSON.parse(
        (await project.zip.file("sequence.json")?.async("string")) ?? "{}",
      );
      const written = (sequence.sequences ?? [])
        .flatMap((q: any) => q?.noteSequence?.pattern?.notes ?? [])
        .filter(
          (n: any) =>
            Number(n.num) >= 48 + project.padBase &&
            Number(n.num) < 64 + project.padBase,
        ).length;
      if (written !== wanted)
        return {
          problem: `the pattern holds ${written} notes on the chopper instead of ${wanted}`,
        };
    }
    return { patterns };
  };

  /**
   * The chop, in this order, and each step only once the one before it is done:
   *  1. the pads are made from the cuts (acapella mode: the vocal stem cut into section pads that overwrite bank D; chopper mode: one chopper pad);
   *  2. they are written into a copy of the Koala project the way the export writes them, and checked;
   *  3. they are put on their pads.
   * If step 1 or 2 fails nothing at all is changed. Nothing is tuned: when a key was picked on the piano, Koala's pitch knob on the new pads is set to
   * move the song into it (the audio is never altered). Acapella mode never touches the project's tempo; chopper mode sets it to the sample's.
   */
  const chopSong = async (job: { mode: ChopMode; song: Pad; vocals: Pad }, settings: ChopSettings, openMaker = false, destinations: number[] = []) => {
    if (chopping.current) return;
    chopping.current = true;
    try {
      const opened = await ensureProject();
      if (!opened) return;
      if (opened.started) setOrganize(true);
      const cur = latest.current;
      const offset = keyOffset(settings.key, cur.tunedTarget, keyMajor);
      const pitchNote =
        offset !== 0
          ? ` Pitched ${offset > 0 ? "+" : ""}${offset} on Koala's pitch knob to match the key.`
          : "";

      if (job.mode === "chopper") {
        const song = job.song;
        const total = song.channelData[0].length;
        const plans = settings.maker
          ? settings.plans
          : fitPlans(settings.plans, total);
        // A new chop replaces the last one: the old chopper (or sections) go, and the chopper takes the first free pad of bank D.
        const without = Object.fromEntries(
          Object.entries(cur.pads).filter(([, p]) => !p.section && !p.chopper),
        );
        const slot = without[48] ? undefined : 48;
        if (slot === undefined || plans.length === 0) {
          window.alert(
            "There is no free pad on Bank D for the chopper, so nothing was changed. Delete a pad there and chop again.",
          );
          return;
        }
        const layout = sliceLayout(plans, total);
        // The chopper is not stretched: it plays at the sample's own tempo, and a pitch change speeds it up or slows it down by the same amount.
        const tempo = Math.min(
          300,
          Math.max(
            20,
            Math.round(settings.bpm * 2 ** (offset / 12) * 100) / 100,
          ),
        );
        const pad: Pad = {
          index: slot,
          origIndex: CHOPPER_ORIG_INDEX,
          name: `${song.name} chopper`,
          sampleId: song.sampleId,
          sampleRate: song.sampleRate,
          channelData: song.channelData,
          category: "melodic",
          tune: false,
          semis: 0,
          cents: 0,
          chopper: {
            sourceSampleId: song.sampleId,
            slices: settings.maker
              ? Math.max(
                  1,
                  new Set(
                    settings.maker.slots.flatMap((s) =>
                      s.kind === "chop" ? [`${s.chop}:${s.steps}`] : [],
                    ),
                  ).size,
                )
              : layout.starts.length,
            bpm: tempo,
            beatsPerBar: settings.beatsPerBar,
            pitch: offset,
            layout,
            maker: {
              beatFrames: (60 * song.sampleRate) / settings.bpm,
              grid: settings.maker?.grid ?? settings.grid,
              rhythm: settings.maker?.rhythm,
              slots: settings.maker?.slots,
              chops:
                settings.maker?.chops ??
                plans.map((plan, i) => ({
                  slice: layout.sections[i].slice,
                  start: plan.start,
                  length: plan.length,
                  bars: plan.bars,
                  steps: Math.max(
                    1,
                    Math.round(
                      (plan.length / ((60 * song.sampleRate) / settings.bpm)) *
                        STEPS_PER_BEAT,
                    ),
                  ),
                  barIndex: plan.barIndex ?? 0,
                  colorIndex: plan.colorIndex ?? i,
                  color: chopColor(palette.colors, plan.colorIndex ?? i),
                })),
            },
          },
        };
        let result: Awaited<ReturnType<typeof trialWriteChopper>>;
        try {
          result = await trialWriteChopper(pad);
        } catch (err) {
          console.error(err);
          result = {
            problem:
              err instanceof Error
                ? err.message
                : "the project file could not be written",
          };
        }
        if ("problem" in result) {
          window.alert(
            `The chop could not be written into the Koala project: ${result.problem}. Nothing was changed.`,
          );
          return;
        }
        recordEdit();
        setPads(installChopperPages(without, pad));
        // The project tempo becomes the sample's (at its pitch): the chopper does not stretch.
        changeBpm(tempo);
        setSelected(null);
        setBank(3);
        setChop(null);
        if (openMaker) {
          setMakerPad(slot);
          return;
        }
        const missing = settings.maker ? 0 : layout.sections.length - result.patterns;
        setNotice(
          `Chopper on pad ${(slot % PADS_PER_BANK) + 1} of Bank D: ${pad.chopper!.slices} chops. The project tempo is now ${tempo} BPM.${pitchNote}${missing > 0 ? ` ${missing} chop${missing === 1 ? "" : "s"} got no pattern (32 slots) but still play from the pad.` : ""}`,
        );
        return;
      }

      // Acapella and synced mode. The cuts were found on the song; the stem may be at another sample rate, so the sections are put on the stem's own frames.
      const { song, vocals } = job;
      if (destinations.length === 0) {
        window.alert("No pads were chosen for the chops, so nothing was changed.");
        return;
      }
      // The sound being cut is copied first when one of its own pads is a destination, the copy is checked, and every chop is cut from the copy: nothing
      // is cut from audio that was overwritten, and the app's pads are not touched until the finished project has been checked.
      const sourcePads = Object.values(cur.pads).filter(
        (p) =>
          p.channelData[0] === vocals.channelData[0] ||
          p.channelData[0] === song.channelData[0],
      );
      const sourceHit = [vocals.index, song.index, ...sourcePads.map((p) => p.index)].some(
        (i) => destinations.includes(i),
      );
      let source = vocals;
      if (sourceHit) {
        source = protectedCopy(vocals);
        const bad = copyProblem(vocals, source);
        if (bad) {
          window.alert(`The chop was stopped before anything was overwritten: ${bad}. Nothing was changed.`);
          return;
        }
      }
      const plans = scalePlans(
        settings.plans,
        song.sampleRate,
        vocals.sampleRate,
      ).slice(0, destinations.length);
      // Only the chosen pads are replaced (locked pads are never offered). The pads of an earlier chop that were not chosen go: one chop is kept at a time,
      // and the pad picker said so.
      const without = Object.fromEntries(
        Object.entries(cur.pads).filter(
          ([, p]) => !destinations.includes(p.index) && (p.locked || !p.section),
        ),
      );
      const { pads: made } = makeSectionPads(
        source,
        plans,
        settings.bpm,
        settings.beatsPerBar,
        destinations,
        palette.colors,
      );
      const sections = made.map((p) => ({
        ...p,
        section: {
          ...p.section!,
          pitch: offset,
          key: settings.key,
          pattern: settings.pattern ?? "multiple",
          ...(job.mode === "synced" ? { synced: true } : {}),
        },
      }));
      if (sections.length === 0) {
        window.alert(
          "There are no sections to put on the pads, so nothing was changed.",
        );
        return;
      }
      let problem: string | null;
      try {
        problem = await trialWriteSections(
          sections,
          vocals.sampleId,
          without,
          destinations,
        );
      } catch (err) {
        console.error(err);
        problem = "the project file could not be written";
      }
      if (problem) {
        window.alert(
          `The chop could not be written into the Koala project: ${problem}. Nothing was changed: the song and its vocals are still there.`,
        );
        return;
      }
      // Every check passed on the copy: only now do the pads change.
      const grid: Record<number, Pad> = { ...without };
      for (const section of sections) grid[section.index] = section;
      const changed = Object.keys({ ...cur.pads, ...grid }).filter(
        (k) => cur.pads[+k] !== grid[+k],
      );
      if (changed.some((k) => !destinations.includes(+k) && !cur.pads[+k]?.section)) {
        window.alert("The chop was stopped: it would have changed a pad that was not chosen. Nothing was changed.");
        return;
      }
      recordEdit();
      setPads(grid);
      setSelected(null);
      setBank(Math.floor(destinations[0] / PADS_PER_BANK));
      setChop(null);
      setLongSamples([]);
      // With no key picked there is nothing built yet to keep in time with, so the project takes the acapella's tempo (the pitch knobs stay at 0). With a key
      // picked the project's tempo is left alone and the chops are stretched to it.
      const keyless = cur.tunedTarget === null;
      if (keyless) changeBpm(settings.bpm);
      const octaveOff = sections.filter(
        (p) => !koalaPitch(shiftFor(p, cur.tunedTarget, a4, keyMajor)).exact,
      ).length;
      haptic("success");
      setNotice(
        `${sections.length} chop${sections.length === 1 ? "" : "s"} on ${destinations.length === 1 ? "one pad" : `${sections.length} pads`}, ${settings.pattern === "single" ? "in one pattern" : "a pattern each"}, ${keyless ? `and the project tempo is now ${Math.round(settings.bpm * 100) / 100} BPM (no key was picked, so the pitch knobs are at 0)` : "stretched to the project's tempo"}.${pitchNote}${octaveOff ? ` ${octaveOff} chop${octaveOff === 1 ? " is" : "s are"} more than 12 semitones from the key, so Koala's knob plays the same note in another octave.` : ""}`,
      );
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
  const audioOf = (pad: Pad) =>
    (normalize && normalizedData[pad.origIndex]) || pad.channelData;

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
    const toneRef =
      pad.tune && toneOn && toneKey !== null
        ? referenceFor(pad, toneKey, keyMajor, false)
        : null;
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
        toneVolume * 2,
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
        list.map((p) => ({
          channelData: p.channelData,
          sampleRate: p.sampleRate,
          category: p.category,
        })),
        FILE_CEILING_DB,
      );
      setNormalizedData(
        Object.fromEntries(
          list.map((p, i) => [
            p.origIndex,
            applyGainDb(p.channelData, gainDb[i] + knobDb[i]),
          ]),
        ),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setNormalizing(false);
    }
  };

  /** Which drop target ("kind:index") is under the point, if any. */
  const targetAt = (x: number, y: number): string => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-drop]");
    return el ? `${el.dataset.drop}:${el.dataset.index ?? ""}` : "";
  };

  const endDrag = (d?: { timer: number | null }) => {
    if (d?.timer) clearTimeout(d.timer);
    setDrag(null);
    setExpanded(false);
    setHover("");
  };

  const copyingPad = useRef(false);
  const copyToEmptyPad = async (from: number, to: number) => {
    const source = latest.current.pads[from];
    const destination = latest.current.pads[to];
    const project = projectRef.current;
    if (copyingPad.current || !project || !source || !isReal(source) || (destination && !destination.placeholder) || destination?.locked) return;
    const extraBytes = source.channelData.reduce((sum, channel) => sum + channel.length * 3, 0) + 44;
    if ((projectFile.current?.size ?? 0) + extraBytes > PROJECT_BYTE_BUDGET) {
      setNotice("Copying this pad would exceed the 512 MB project limit. Remove a sample first.");
      return;
    }
    copyingPad.current = true;
    try {
      const result = await copyProjectPad(project, source.origIndex);
      if (projectRef.current !== project || latest.current.pads[from] !== source || latest.current.pads[to] !== destination) return;
      recordEdit();
      projectRef.current = result.project;
      projectFile.current = result.file;
      void saveProjectFile(result.file);
      const copy: Pad = { ...source, index: to, origIndex: result.ref.pad, sampleId: result.ref.sampleId, playback: source.playback ? structuredClone(source.playback) : undefined };
      setPads((prev) => ({ ...prev, [to]: copy }));
      setSelected(to);
      setBank(Math.floor(to / PADS_PER_BANK));
    } catch (error) {
      recordDebug("App operation", error);
      setNotice(error instanceof Error ? error.message : "Could not copy that sound.");
    } finally { copyingPad.current = false; }
  };

  /** Dragging onto an empty pad copies; occupied pads swap. */
  const dropOn = (from: number, target: string) => {
    const [kind, rest] = target.split(":");
    const cur = latest.current.pads;
    let next = cur;
    let dest: number | null = null;
    if (kind === "pad" || kind === "cell") dest = Number(rest);
    else if (kind === "bank") dest = emptyPadInBank(cur, Number(rest));
    else if (kind === "unused") dest = nextEmptyPad(cur, bank);
    if (dest !== null && dest !== from && (!cur[dest] || cur[dest].placeholder) && cur[from] && isReal(cur[from])) {
      void copyToEmptyPad(from, dest);
      return;
    }
    if (kind === "lock") {
      // The lock zone toggles the pad's lock; nothing moves.
      recordEdit();
      setPads((prev) =>
        prev[from]
          ? { ...prev, [from]: { ...prev[from], locked: !prev[from].locked } }
          : prev,
      );
      return;
    }
    if (kind === "chop") {
      // The chopper zone chops the dragged sound: acapella or chopper mode is asked, and acapella mode looks for its pair.
      const dragged = cur[from];
      if (!dragged || !isReal(dragged))
        setNotice("Only a sound from the project can be chopped");
      else askChopMode(dragged);
      return;
    }
    if (kind === "trash" && cur[from]?.locked) {
      setNotice("That pad is locked: unlock it first to delete it");
      return;
    }
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

  const onPadDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (error) { recordDebug("App operation", error);
      /* the window listeners below still see the release */
    }
    drags.current.set(e.pointerId, {
      from: index,
      x0: e.clientX,
      y0: e.clientY,
      active: false,
      hover: "",
      timer: null,
    });
    pressPad(index);
  };

  const onPadMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drags.current.get(e.pointerId);
    if (!d) return;
    if (!d.active) {
      if (
        !pads[d.from] ||
        Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX
      )
        return;
      d.active = true; // the sound keeps playing through the drag; the release at the end of the hold stops it
    }
    setDrag({ from: d.from, x: e.clientX, y: e.clientY });
    const target = targetAt(e.clientX, e.clientY);
    if (target === d.hover) return;
    d.hover = target;
    setHover(target);
    if (d.timer) clearTimeout(d.timer);
    d.timer = target.startsWith("bank:")
      ? window.setTimeout(() => setExpanded(true), DWELL_MS)
      : null;
  };

  /** End the pad preview, then apply the selected drag action. */
  finishPointer.current = (pointerId, cancelled) => {
    const d = drags.current.get(pointerId);
    if (!d) return;
    drags.current.delete(pointerId);
    liftPad(d.from);
    if (d.active && !cancelled) {
      if (d.hover === "shuffle:") void shufflePad(d.from);
      else dropOn(d.from, d.hover);
    }
    endDrag(d);
  };

  // Releases are caught on the window, so a lost capture, a re-render, or another pad being tapped can't strand a sound.
  useEffect(() => {
    const up = (e: PointerEvent) =>
      finishPointer.current(e.pointerId, e.type === "pointercancel");
    const releaseAll = () => {
      for (const id of [...drags.current.keys()])
        finishPointer.current(id, true);
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
    const lift =
      pad.category === "bass" && soundsAt !== null
        ? bassLiftSemitones(soundsAt, pc)
        : 0;
    // Grabbing the slider always starts on the project key's own chord.
    refRelativeRef.current = false;
    setRefRelativeState(false);
    // The Tone key switches the tone for the slider as well as for a tapped pad: off, the sound plays alone.
    const ref = toneOn ? referenceFor(pad, pc, keyMajor, false) : null;
    matchVoice.current = {
      lift,
      index: pad.index,
      handle: startPad(
        pad.index,
        audioOf(pad),
        pad.sampleRate,
        shift + lift,
        ref ? ref.pc : null,
        "loop",
        undefined,
        normalize ? pad.knobDb : undefined,
        0,
        ref ? ref.kind : "sine",
        toneVolume * 2,
      ),
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
    if (match)
      match.handle.setShift(
        shiftFor(
          { ...pad, ...splitTrim(trim), tune: true },
          latest.current.tunedTarget,
          a4,
          keyMajor,
        ) + match.lift,
      );
  };

  /** The tone's volume knob turned: the tones that are playing follow it at once. */
  const changeToneVolume = (volume: number) => {
    setToneVolume(volume);
    matchVoice.current?.handle.setToneVolume(volume * 2);
    for (const handle of releasePad.current.values())
      handle.setToneVolume(volume * 2);
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
    const held =
      holdIndex.current === null ? undefined : pads[holdIndex.current];
    if (held)
      holdVoice.current?.setShift(shiftFor(held, tunedTarget, a4, keyMajor));
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
          return [
            i,
            p.tuneLocked
              ? plain
              : {
                  ...plain,
                  tune: tuneDefault(
                    false,
                    false,
                    p.category,
                    p.detectedMidi,
                    next,
                  ),
                },
          ];
        }),
      ),
    );
  };

  /** The key a sound is in: its detected pitch to the nearest note, against the A4 reference. */
  const matchProjectToKey = (pad: Pad) => {
    if (pad.detectedMidi == null) return;
    applyProjectKey(
      ((Math.round(pad.detectedMidi - referenceOffsetSemitones(a4)) % 12) +
        12) %
        12,
    );
  };

  /**
   * Rebuilds the project and downloads it. Every file is peak-normalized and the mix is on each pad's Koala volume knob (audio/loudness.ts); every
   * tuning is written to the pitch knob (audio/shift.ts). Only 808 and bass audio is rendered: onto its nearest semitone, then faded in under the kick.
   */
  const padsNow = pads;
  /** An 808 is a bass sound by the name or by the loader's flag. */
  const isEight = (p: Pad) =>
    p.category === "bass" && (!!p.is808 || is808Name(p.name));
  /** The 808s' fade-in, in ms: the length of the kicks' main transient, with the Sidechain switch on. Null when it is off or there is no kick and 808 to work from. */
  const fadeFor = (list: Pad[]): number | null => {
    if (!sidechainActive || !list.some(isEight)) return null;
    const ms = medianTransientMs(
      list
        .filter((p) => p.category === "kick")
        .map((p) =>
          kickTransientMs(
            p.channelData,
            p.sampleRate,
            ACTIVE_MIX_PRESET.buses.fade808.withinDb,
          ),
        ),
    );
    return ms === null
      ? null
      : fadeMsFor(
          ms,
          ACTIVE_MIX_PRESET.buses.fade808.minMs,
          ACTIVE_MIX_PRESET.buses.fade808.maxMs,
        );
  };
  const exportProject = async (mode: ExtraDrums = "keep") => {
    const pads = mode === "delete" ? withoutExtraDrums(padsNow) : padsNow;
    const arrangement = arrangementOf(pads);
    if (!projectRef.current) return;
    setExporting(true);
    try {
      // The export writes into the project's zip (audio, mixer, sequence), so each export starts from a fresh read of the project file. Exporting twice
      // from one zip used to carry the first export's master chain, bus plugins and remapped patterns into the second.
      const project = projectFile.current
        ? await parseKoalaProject(projectFile.current)
        : projectRef.current;
      if (masterChain) {
        const there = await masterEffectNames(project);
        if (
          there.length > 0 &&
          !window.confirm(
            `Your project already has effects on the master: ${there.join(", ")}.\n\nThe master chain replaces them. Export anyway?`,
          )
        )
          return;
      }
      const tuned: TunedSample[] = [];
      // Koala's pan runs 0..1 (0.5 = centre) for L100..R100, so N percent is N/200 off centre.
      const pans = new Map<number, number>();
      if (spread) {
        // Only melodic pads move; bass, drums and the rest stay centred.
        const tunedPads = Object.values(pads).filter(
          (p) => p.category === "melodic" && isReal(p),
        );
        const offsets = balancedSpread(tunedPads.length, MAX_SPREAD_PERCENT);
        tunedPads.forEach((p, i) =>
          pans.set(p.sampleId, 0.5 + offsets[i] / 200),
        );
      }
      const allPads = Object.values(pads).filter(isReal);
      // Every file is rendered to its final audio and peak-normalized; the mix is on the Koala volume knob, and every tuning on the pitch knob.
      // The only audio that is changed is 808 and bass (resampled onto their nearest semitone, then faded in under the kick) and it is measured as it is
      // rendered, so the whole project is never shipped to the worker or copied at once.
      const fade = fadeFor(allPads);
      const rendered: {
        pad: Pad;
        channelData: Float32Array[];
        retimed: boolean;
      }[] = [];
      const stats: BalanceStats[] = [];
      const pitches = new Map<number, number>();
      let done = 0;
      for (const pad of allPads) {
        setExportProgress(`${done++}/${allPads.length}`);
        const shift = shiftFor(pad, tunedTarget, a4, keyMajor);
        const snap = snapSemitones(pad);
        const retimed = Math.abs(snap) >= 0.005;
        if (pad.tune || pad.tuneLocked || snap !== 0)
          pitches.set(pad.sampleId, pitchKnobFor(pad, shift));
        // The pad's audio was already cut to Koala's start/end points on load, so a stretched loop stays in time.
        let channelData = retimed
          ? await getRenderWorker().resamplePitch(
              pad.channelData,
              semitonesToRatio(snap),
            )
          : pad.channelData;
        if (fade && isEight(pad))
          channelData = fadeIn(channelData, pad.sampleRate, fade);
        stats.push(
          await getRenderWorker().measure({
            channelData,
            sampleRate: pad.sampleRate,
            category: pad.category,
          }),
        );
        rendered.push({ pad, channelData, retimed });
      }
      const vols = new Map<number, number>();
      const gains = balanceFromStats(stats, FILE_CEILING_DB);
      rendered.forEach((r, i) => {
        vols.set(r.pad.sampleId, volFromDb(gains.knobDb[i]));
        tuned.push({
          sampleId: r.pad.sampleId,
          sampleRate: r.pad.sampleRate,
          channelData: r.channelData,
          retimed: r.retimed,
          trimmedFrom: r.pad.trimmedFrom,
          gainDb: gains.gainDb[i],
        });
      });
      // Ghost snares and soft kicks are made from their source's final audio (tuned and loudness-balanced), then quieted and dulled.
      const ghostExports: GhostPadExport[] = [];
      for (const gp of Object.values(pads).filter((p) => p.ghost)) {
        const source = allPads.find(
          (p) => p.origIndex === gp.ghost!.sourceOrigIndex,
        );
        if (!source) continue;
        const at = rendered.findIndex((r) => r.pad === source);
        let audio = at >= 0 ? rendered[at].channelData : source.channelData;
        if (at >= 0) audio = applyGainDb(audio, gains.gainDb[at]);
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
      const songExport = songExportOf(
        Object.values(pads).filter((p) => p.section),
      );
      const chopperPad = Object.values(pads).find((p) => p.chopper);
      const padPlayback = new Map<number, PadPlayback>();
      const classifications = new Map<number, unknown>();
      const padOverrides = new Map<number, PadPlayback | null>();
      for (const p of allPads) {
        // The playback rules by sound type are written on every export; only the per-pad EQ is Organize's.
        const settings = p.category ? resolvePlayback(p.category, typeSettings[p.category], p.playback, p.stretch) : undefined;
        padOverrides.set(p.origIndex, p.playback || p.stretch !== undefined ? { ...p.playback, ...(p.stretch !== undefined ? { stretch: p.stretch ? settings?.stretch : "off" as const } : {}) } : null);
        if (p.classification) classifications.set(p.origIndex, { ...p.classification, category: p.category });
        if (settings) padPlayback.set(p.origIndex, autoPlayback ? settings : { ...settings, eq: undefined });
      }
      // The pads the loaders made (Kick 1, Snare 2, Loop 3...) are written with the colour and label they show in the app; a sound from a project that was
      // opened keeps the colour and label it already had.
      // Loops are written stretched, as long (in beats) as they are at their own tempo; Koala then plays them at the project's tempo. A loop whose name
      // states no tempo is stretched to its length at the project tempo, rounded to whole bars. One-shots are never stretched.
      const stretch = new Map<number, number>();
      const beatsPerBar = await beatsPerBarOfProject();
      for (const p of allPads) {
        const seconds = p.channelData[0].length / p.sampleRate;
        const settings = padPlayback.get(p.origIndex);
        if (settings?.stretch && settings.stretch !== "off") {
          const beats = p.bpm
            ? seconds * (p.bpm / 60)
            : seconds * (projectBpm / 60);
          stretch.set(
            p.sampleId,
            p.bpm || beats < beatsPerBar
              ? Math.max(1, Math.round(beats))
              : Math.round(beats / beatsPerBar) * beatsPerBar,
          );
        }
      }
      const colors = new Map<number, { color: string; label: string }>();
      for (const p of allPads) {
        // The label is what the pad's caption says in the app, without its number.
        if (p.category && numberedLabel(p))
          colors.set(p.sampleId, {
            color: autoColorOf(p),
            label: captionOf(p) || labelOf(p),
          });
      }
      const { blob, filename } = await buildTunedKoala(project, tuned, {
        bpm: projectBpm,
        stretch,
        vols,
        pitches,
        busNames: BUS_NAMES,
        busEffects: routeBuses,
        masterChain,
        masterStyle,
        arrangement,
        pans,
        colors,
        padPlayback,
        classifications,
        padOverrides,
        ghosts: ghostExports,
        song: songExport,
        chopper: chopperPad ? chopperExportOf(chopperPad) : undefined,
      });
      downloadBlob(blob, filename);
      haptic("success");
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  /** Original slot -> current slot (null = deleted), or undefined when nothing was moved or deleted. */
  const arrangementOf = (
    pads: Record<number, Pad>,
  ): Map<number, number | null> | undefined => {
    const project = projectRef.current;
    if (!project) return undefined;
    // Every sound in the project: those not on a pad (a sample pack's unchosen spares) map to null, so the export drops them.
    const slots = project.pads.filter((p) => p.pad >= 0);
    const now = new Map(
      Object.values(pads)
        .filter(isReal)
        .map((p) => [p.origIndex, p.index]),
    );
    if (!slots.some((r) => now.get(r.pad) !== r.pad)) return undefined;
    return new Map(slots.map((r) => [r.pad, now.get(r.pad) ?? null]));
  };

  const shownBank = bank;
  /** Palette colour for a sound, by its own category. Where it sits (including on a layout's slots) never changes it. */
  const autoColorOf = (p: Pad): string => {
    if (p.chopper) return p.chopper.color ?? colorFor(palette, "melodic");
    // A section of a chopped song takes the colour its place in the chop had, from the scheme in use.
    if (p.section) return chopColor(palette.colors, p.section.colorIndex ?? 0);
    const base = colorFor(palette, p.category ?? "other");
    if (p.ghost) return shade(base, 2);
    // A key read from the file name is a sure one: the pad is a slightly darker shade. A key that was only detected leaves the normal shade.
    return p.keyFromName ? darker(base) : base;
  };
  /** Generated Bank A sounds keep their template labels; other sounds show their numbered Type or detail. */
  /** A section of a chopped song: the vocal label and its number, "Vox 1". */
  const sectionLabel = (p: Pad): string =>
    `${p.section!.synced ? "Chop" : CATEGORIES[categoryIndex("vox")].label} ${p.section!.number}`;
  // Validate saved labels too, so projects generated before this fix display correctly.
  const templateLabelOf = (p: Pad): string | undefined => {
    if (!p.libraryId || !p.label) return undefined;
    const slot = getLayout(layout.id).slots.find((slot) => slot.label === p.label);
    return slot && p.category ? matchingTemplateLabel(slot, { category: p.category, classification: p.classification }) : p.label;
  };
  const labelOf = (p: Pad): string =>
    p.placeholder
      ? p.placeholder.label
      : p.ghost
        ? GHOST_LABEL[p.ghost.kind]
        : p.chopper
          ? "Chopper"
          : p.section
            ? sectionLabel(p)
            : (templateLabelOf(p) ?? numberedLabel(p)?.label ?? padLabel(p));
  const colorOfPad = (p: Pad) =>
    p.placeholder ? placeholderColor(p) : autoColorOf(p);
  const hasProject =
    Object.keys(pads).length > 0 || Object.keys(hidden).length > 0;
  /** The 16 pads of a bank as the sequencer shows them: the app's own labels and colours, or null where there is no sound. */
  const seqPadsOfBank = (b: number): (SeqPad | null)[] =>
    Array.from({ length: 16 }, (_, slot) => {
      const p = pads[b * 16 + slot];
      return p && !p.placeholder
        ? {
            pad: { ...p, channelData: audioOf(p) },
            label: captionOf(p) || labelOf(p),
            color: litColor(p),
            symbol: padSymbols ? symbolOf(p) : undefined,
            shift: p.tune
              ? shiftFor(p, tunedTarget, a4, keyMajor)
              : p.semis + p.cents / 100,
          }
        : null;
    });
  /** The loaders have already placed, labelled and coloured every sound, so a project with sounds in it can always be exported. */
  const canExport = hasProject && analyzing === 0 && !exporting;
  /** Worked out from the sounds on the pads every time, so a hot swap or a new drum kit locks or unlocks the sidechain at once. Spares do not count. */
  const sidechain = sidechainStatus(
    Object.values(pads)
      .filter(isReal)
      .map((p) => p.category),
    organize,
  );
  const sidechainReady = sidechain.ready;
  const sidechainActive = sidechainReady && sidechainOn;
  const longPads = Object.values(pads)
    .filter((p) => longSamples.includes(p.origIndex))
    .sort((a, b) => a.index - b.index);
  const selectedPad = selected !== null ? pads[selected] : undefined;

  /** Hot swap only exists with the finger-drumming layout; without it the screen starts on Tune. */
  /** Hot swap works on a drum layout, or once a loader has left spare sounds to swap in. */
  const canSwap = layout.on || Object.keys(hidden).length > 0;
  const shownMode: Mode | null =
    mode === null ? null : mode === "swap" && !canSwap ? "tune" : mode;
  /** The note a pad is tuned to, or "--" when its tuning is off or there is no key yet. */
  const keyNameOf = (pad: Pad) => {
    const pc = pad.tune ? (pad.keyPc ?? keyPc) : null;
    return pc === null ? "--" : NOTE_NAMES[pc];
  };
  const tags = packTags(
    [...Object.values(pads).filter(isReal), ...Object.values(hidden)].map(
      (p) => p.name,
    ),
  );
  const padName = (pad: Pad) =>
    `${BANKS[Math.floor(pad.index / 16)]}${(pad.index % 16) + 1}`;
  const panel = selectedPad &&
    !selectedPad.placeholder &&
    !selectedPad.ghost && (
      <PadPanel
        pad={selectedPad}
        name={labelOf(selectedPad)}
        keyName={keyNameOf(selectedPad)}
        autoShift={shiftFor(
          { ...selectedPad, semis: 0, cents: 0 },
          tunedTarget,
          a4,
          keyMajor,
        )}
        needsKey={(selectedPad.keyPc ?? keyPc) === null}
        chords={
          selectedPad.category === "melodicLoop" &&
          (selectedPad.keyPc ?? keyPc) !== null
            ? ([
                referenceFor(
                  selectedPad,
                  (selectedPad.keyPc ?? keyPc)!,
                  keyMajor,
                  false,
                ),
                referenceFor(
                  selectedPad,
                  (selectedPad.keyPc ?? keyPc)!,
                  keyMajor,
                  true,
                ),
              ].map((r) => `${NOTE_NAMES[r.pc]} ${r.kind}`) as [string, string])
            : null
        }
        relative={refRelative}
        onRelative={setRefRelative}
        toneVolume={toneVolume}
        onToneVolume={changeToneVolume}
        onFavorite={() => toggleFavorite(selectedPad, !selectedPad.favorite)}
        toneOn={toneOn}
        projectBpm={projectBpm}
        onTrim={moveTrim}
        onHoldStart={startMatch}
        onHoldEnd={stopMatch}
        onChange={(patch) => {
          if ("tune" in patch)
            patchPad(selectedPad.index, { ...patch, tuneLocked: true });
          else patchPad(selectedPad.index, patch);
        }}
      />
    );
  /** The type the selected pad's slot wants: a finger-drumming slot's own type on bank A, otherwise the sound's own type. */
  /** Swaps a hidden spare onto the selected pad; the sound it replaces goes back into the hot-swap menu, so the swap can be undone by swapping again. */
  const swapInHidden = (other: Pad, target: Pad) => {
    recordEdit();
    const incoming: Pad = {
      ...other,
      index: target.index,
      tune: tuneDefault(
        other.tuneLocked,
        other.tune,
        other.category,
        other.detectedMidi,
        tunedTarget,
      ),
    };
    setPads((prev) => ({ ...prev, [target.index]: incoming }));
    setHidden((prev) => {
      const next = { ...prev };
      delete next[other.origIndex];
      if (isReal(target)) next[target.origIndex] = { ...target, index: -1 };
      return next;
    });
  };
  const toggleFavorite = async (pad: Pad, favorite: boolean) => {
    const sourcePad = pad;
    pad = { ...pad, libraryId: pad.libraryId ?? `favorite:${crypto.randomUUID()}` };
    const matches = (candidate: Pad) => candidate.libraryId === pad.libraryId || (!sourcePad.libraryId && candidate.origIndex === sourcePad.origIndex);
    const old = sampleLibrary.find((r) => r.id === pad.libraryId);
    const audio = favorite
      ? await encodeWav({ sampleRate: pad.sampleRate, channelData: audioOf(pad), bitDepth: 24 })
      : undefined;
    if (audio) {
      // Favorites are kept on the device, but only a few sounds: never whole batches.
      const kept = sampleLibrary.filter((r) => r.favorite && r.audio && r.id !== pad.libraryId);
      const bytes = kept.reduce((n, r) => n + (r.audio?.size ?? 0), audio.size);
      if (kept.length >= MAX_FAVORITES || bytes > MAX_FAVORITE_BYTES)
        return void window.alert(`Favorites keep their audio on this device, so they are limited to ${MAX_FAVORITES} sounds or ${MAX_FAVORITE_BYTES / 1024 / 1024} MB. Remove a favorite first.`);
    }
    if (!old && favorite) {
      await recordImportedSamples([{
        id: pad.libraryId!, name: pad.name, sourcePath: pad.sourcePath,
        pack: libraryIndex?.samples.find((sample) => sample.id === pad.libraryId)?.pack ?? pad.sourcePath?.split("/").slice(0, -1).join("/") ?? "(favorite)", category: pad.category ?? "other", is808: pad.is808,
        importedAt: Date.now(), favorite: true, audio, sampleRate: pad.sampleRate,
      }]);
    } else await setSampleFavorite(pad.libraryId!, favorite, audio, pad.sampleRate);
    setPads((prev) => Object.fromEntries(Object.entries(prev).map(([key, p]) => [key, matches(p) ? { ...p, libraryId: pad.libraryId, favorite } : p])));
    setHidden((prev) => Object.fromEntries(Object.entries(prev).map(([key, p]) => [key, matches(p) ? { ...p, libraryId: pad.libraryId, favorite } : p])));
    setFavoritePads((prev) => {
      if (!favorite) return prev.filter((p) => p.libraryId !== pad.libraryId);
      const exists = prev.some((p) => p.libraryId === pad.libraryId);
      return exists ? prev.map((p) => p.libraryId === pad.libraryId ? { ...p, favorite: true } : p) : [...prev, { ...pad, index: -1, favorite: true }];
    });
    setSampleLibrary(await loadSampleLibrary());
  };
  const insertFavorite = async (other: Pad, target: Pad) => {
    const record = sampleLibrary.find((r) => r.id === other.libraryId);
    if (!record?.audio) return void window.alert("This favorite has no stored audio. Favorite it again from a loaded sound.");
    const opened = await ensureProject();
    if (!opened) return;
    const candidate: PackFile<() => Promise<File>> = {
      folders: [record.pack, record.category], name: record.name, source: async () => new File([record.audio!], record.name, { type: "audio/wav" }), size: record.audio.size,
      libraryId: record.id, favorite: true, sourceName: record.name, sourcePack: record.pack, sourcePath: record.sourcePath,
    };
    const used = Object.values(latest.current.pads).filter(isReal).concat(Object.values(latest.current.hidden));
    const result = await writeBankSounds(opened.project, [{ category: record.category, is808: record.is808, candidates: [candidate], want: 1 }], {
      existing: used.map((p) => ({ channelData: audioOf(p), sampleRate: p.sampleRate, category: p.category })),
      byteBudget: Math.max(0, packByteBudget(packMemory) - (projectFile.current?.size ?? 0)),
      measure: (input) => getRenderWorker().measure(input),
    });
    if (!result) return void window.alert("There is not enough room in this project to add that favorite. Increase the project size limit or free space by removing samples.");
    const written = result.sounds[0];
    const ref = opened.project.pads.find((p) => p.pad === written.pad);
    if (!ref) return;
    const decoded = await decodeNative(await koalaPadToFile(opened.project, ref));
    const incoming: Pad = { index: target.index, origIndex: written.pad, libraryId: written.libraryId, favorite: true, name: written.fileName, sourcePath: written.sourcePath, sampleId: written.sampleId, sampleRate: decoded.sampleRate, channelData: decoded.channelData, category: written.category, is808: written.is808 || undefined, tune: tuneDefault(false, false, written.category, undefined, tunedTarget), semis: 0, cents: 0 };
    recordEdit();
    projectFile.current = result.file;
    void saveProjectFile(result.file);
    setPads((prev) => ({ ...prev, [target.index]: incoming }));
    if (isReal(target)) setHidden((prev) => ({ ...prev, [target.origIndex]: { ...target, index: -1 } }));
    setAnalyzing((n) => n + 1);
    nextAnalysisWorker().analyze(monoFromChannelData(incoming.channelData), incoming.sampleRate, incoming.name, false, incoming.category).then((analysis) => {
      setPads((prev) => prev[incoming.index]?.origIndex === incoming.origIndex ? { ...prev, [incoming.index]: { ...prev[incoming.index], detectedMidi: analysis.midi, centroid: analysis.centroid } } : prev);
      setAnalyzing((n) => Math.max(0, n - 1));
    }).catch(() => setAnalyzing((n) => Math.max(0, n - 1)));
  };
  /** Use the same candidate pool for the hot-swap list and the pad shuffle action. */
  const hotSwapSounds = (target: Pad) => {
    const slotCategory = (layout.on && target.index < 16 ? getLayout(layout.id).slots[target.index]?.category : undefined) || target.category;
    const eligible = (pad: Pad) => isKitCategory(slotCategory) ? isKitCategory(pad.category) : pad.category === slotCategory;
    const loadedIds = new Set([...Object.values(pads), ...Object.values(hidden)].map((pad) => pad.libraryId));
    return [
      ...Object.values(hidden).filter(eligible),
      ...favoritePads.filter((pad) => eligible(pad) && !loadedIds.has(pad.libraryId)),
      ...Object.values(pads).filter((pad) => isReal(pad) && isKitCategory(pad.category) && pad.index >= 16 && pad.index !== target.index && isKitCategory(slotCategory)),
    ];
  };
  const shufflePad = async (index: number) => {
    const target = latest.current.pads[index];
    if (!target || !isReal(target)) return;
    if (target.locked) return setNotice("Unlock this pad before shuffling it.");
    const other = chooseShuffleSound(target, hotSwapSounds(target));
    if (!other) return setNotice("No other sound of this Type is available in hot swap.");
    try {
      if (other.libraryId && other.origIndex <= -100000) await insertFavorite(other, target);
      else if (hidden[other.origIndex]) swapInHidden(other, target);
      else { recordEdit(); setPads((prev) => target.ghost ? fillGhostSlot(prev, target.index, other.index) : movePad(prev, target.index, other.index)); }
    } catch (error) { recordDebug("App operation", error); setNotice("Could not load that sound. Reconnect its sample folder or save it as a favorite again."); }
  };
  /** Pack tags the project's sounds share ("Rio - ..."), left out of the names in the swap list. */
  /** The hot-swap list for a pad: the sounds that can take its place. Used by the Swap screen and by the sequencer's Sounds page. */
  const swapListFor = (target: Pad) => {
    /** The type the target's slot wants: a finger-drumming slot's own type on bank A, otherwise the sound's own type. */
    const slotCategory =
      (layout.on && target.index < 16
        ? getLayout(layout.id).slots[target.index]?.category
        : undefined) || target.category;
    return (
      <SwapList
        slotLabel={
          target.ghost
            ? `${GHOST_LABEL[target.ghost.kind]} (made on export unless filled)`
            : `PAD ${(target.index % 16) + 1}`
        }
        candidates={sortForSlot(
          hotSwapSounds(target),
          slotCategory,
        ).sort((a, b) =>
          slotCategory === "bass"
            ? Number(!!a.is808 !== !!target.is808) -
              Number(!!b.is808 !== !!target.is808)
            : 0,
        ).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))}
        audioOf={audioOf}
        nameOf={(p) => displayName(p.name, tags)}
        onFavorite={toggleFavorite}
        onSwap={(other) => {
          if (other.libraryId && other.origIndex <= -100000) return void insertFavorite(other, target);
          if (hidden[other.origIndex]) return swapInHidden(other, target);
          recordEdit();
          setPads((prev) =>
            target.ghost
              ? fillGhostSlot(prev, target.index, other.index)
              : movePad(prev, target.index, other.index),
          );
        }}
      />
    );
  };
  const swapList = selectedPad && swapListFor(selectedPad);

  /** The colour a loaded pad lights up in: its sound type's colour when auto-colour is on, else the default lilac. */
  /** The wording printed next to a pad's number: its placeholder or ghost label, else its sound type. */
  const captionOf = (pad: Pad | undefined): string => {
    if (!pad) return "";
    if (pad.section)
      return `${CATEGORIES[categoryIndex("vox")].short} ${pad.section.number}`;
    if (pad.chopper) return "Chopper";
    if (pad.placeholder || pad.ghost) return labelOf(pad);
    return isReal(pad) && pad.category
      ? (templateLabelOf(pad) ?? numberedLabel(pad)?.caption ??
          CATEGORIES[categoryIndex(pad.category)].short)
      : "";
  };
  /** The sound type a pad's symbol shows: real sounds and ghosts have one, silent placeholders none. */
  const symbolOf = (pad: Pad | undefined): CategoryId | undefined => {
    if (!pad || pad.placeholder) return undefined;
    if (pad.ghost) return pad.ghost.kind === "ghostSnare" ? "snare" : "kick";
    return pad.category;
  };
  const litColor = (pad: Pad) =>
    pad.placeholder
      ? placeholderColor(pad)
      : pad.category
        ? autoColorOf(pad)
        : "#b3a6f2";
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
        <input ref={libraryInput} type="file" hidden
          // @ts-expect-error browser directory picker
          webkitdirectory="" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) { const force = refreshOnReconnect.current; refreshOnReconnect.current = false; void connectLibrary(files, force); } }} />
        <input
          ref={drumsInput}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in React's input typings, but Safari and Chrome both support it
          webkitdirectory=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length)
              void loadBank("drums", () => findPackInFileList(files));
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
            if (files.length)
              void loadBank("loops", () => findPackInFileList(files));
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
            if (files.length)
              void loadBank("bass", () => findPackInFileList(files));
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
            if (files.length)
              void loadBank("oneShots", () => findPackInFileList(files));
          }}
        />
        <input
          ref={acapellaInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void loadAcapella(files);
          }}
        />
        {menuOpen && (
          <div className="menu">
            <label className="menu__a4">
              Project BPM
              <ScrubField label="Project BPM" value={projectBpm} text={String(projectBpm)} min={20} max={300} perPx={0.02} wholePerPx={1 / 14} onChange={(v) => setProjectBpm(Math.round(v * 100) / 100)} />
            </label>
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
              <button
                className="menu__button"
                disabled={historySize.undo === 0 || analyzing > 0}
                onClick={undo}
              >
                Undo
              </button>
              <button
                className="menu__button"
                disabled={historySize.redo === 0 || analyzing > 0}
                onClick={redo}
              >
                Redo
              </button>
            </div>
            <button
              className="menu__button"
              disabled={!hasProject && !loading}
              onClick={clearProject}
            >
              Clear project
            </button>
            <button className="menu__button" onClick={() => { setMenuOpen(false); setLibraryOpen(true); }}>Library · select packs & generate</button>
            <details className="menu__library-tools"><summary>Library tools</summary>
              <button className="menu__button" disabled={indexBusy} onClick={() => { refreshOnReconnect.current = true; setMenuOpen(false); setLibraryToolsOpen(false); setLibraryOpen(true); libraryInput.current?.click(); }}>Reconnect & refresh files</button>
              <p>Reselect the folder to include added or removed samples.</p>
              <button className="menu__button" onClick={() => { setMenuOpen(false); setLibraryToolsOpen(true); }}>Edit sample Types</button>
            </details>
            <label className="menu__a4">Additional banks to fill<select aria-label="Additional banks to fill" value={additionalBanks} onChange={(event) => setAdditionalBanks(Number(event.target.value) as AdditionalBanks)}><option value={0}>0 · A only (16 / 64)</option><option value={1}>1 · A + hybrid B (32 / 64)</option><option value={2}>2 · A + instruments B + loops C (48 / 64)</option></select></label>
            <Switch label="Balance across packs" on={balancePacks} onChange={setBalancePacks}/>
            <button className="menu__button" onClick={() => { setMenuOpen(false); setLayoutEditorOpen(true); }}>Edit Bank A layout</button>
            <button className="menu__button" onClick={() => { setMenuOpen(false); setPlaybackEditorOpen(true); }}>Koala Type & pad settings</button>
            <button className="menu__button" onClick={() => setSampleLibraryOpen(true)}>
              Favorites on device ({sampleLibrary.length})
            </button>
            <Switch
              label="Organize"
              hint="Levels, each sound type's settings, bus routing, the melodic spread and the master chain. Never moves, labels or colours pads: the Load Bank steps do that"
              on={organize}
              disabled={!hasProject}
              onChange={setOrganize}
            />
            <button
              className="menu__button"
              disabled={!organize || !hasProject || normalizing}
              onClick={normalizeNow}
            >
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
              title="Choose sample packs and generate a kit. Reconnect your packs folder if its files are unavailable."
              onClick={() => {
                setLibraryToolsOpen(false);
                setLibraryOpen(true);
                setMenuOpen(false);
              }}
            >
              {addPackStatus || "Generate kit · choose packs"}
            </button>
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
              title="Chop a long sample on Bank D, in acapella mode (a song and its VOCALS stem, chopped onto the pads you pick, stretched to the project), synced mode (the same, cutting the sample itself) or chopper mode (any sample over 10 seconds, 127 chops per pad, duplicating the pad past that). With no project open it asks for a Koala project first."
              onClick={() => askChopMode()}
            >
              {addPackStatus || "Load Bank D: Chopper"}
            </button>
            <button
              className="menu__button"
              title="Choose the colour scheme: the pad, sound-type and chop colours, the lamps and the menu all follow it."
              onClick={() => {
                setSchemeOpen(true);
                setMenuOpen(false);
              }}
            >
              Colour scheme: {palette.name}
            </button>
            <Switch
              label="Show symbols on pads"
              on={padSymbols}
              onChange={setPadSymbols}
            />
            <label className="menu__a4">
              Project size limit
              <select
                className="menu__select"
                value={packMemory}
                onChange={(e) => setPackMemory(e.target.value as PackMemory)}
                aria-label="Project size limit"
              >
                <option value="low">Low (96 MB)</option>
                <option value="auto">
                  Default ({Math.round(packByteBudget("auto") / 1048576)} MB)
                </option>
              </select>
            </label>
            <label className="menu__a4">
              A4 reference (Hz)
              <ScrubField label="A4 reference (Hz)" value={a4} text={String(a4)} min={A4_REFERENCE_RANGE.min} max={A4_REFERENCE_RANGE.max} perPx={0.05} onChange={(v) => setA4(Math.round(v))} onDoubleTap={() => setA4(440)} />
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
            <button className="menu__button" onClick={() => { setMenuOpen(false); openDebug(); }}>Debug info · copy error report</button>
            <div className="menu__version">
              tunegod v{__APP_VERSION__} · {__APP_BUILD__}
              <br />
              Mix preset: {ACTIVE_MIX_PRESET.name}
            </div>
          </div>
        )}

        {playbackEditorOpen && <PlaybackEditor pad={selectedPad ?? null} settings={typeSettings} onClose={() => setPlaybackEditorOpen(false)} onType={(category, value) => setTypeSettings((prev) => ({ ...prev, [category]: value }))} onPad={(value) => { if (selectedPad) patchPad(selectedPad.index, { playback: value, stretch: value?.stretch ? value.stretch !== "off" : undefined }); }}/>}
        {(libraryOpen || libraryToolsOpen) && <LibraryBrowser error={libraryError} tools={libraryToolsOpen} progress={indexProgress} key={libraryIndex?.id ?? "none"} report={kitReport} onRead={async (id) => { const file = libraryFiles.current?.files.find((file) => file.libraryId === id); if (!file) throw new Error("Reselect the library folder to audition samples."); return decodeNative(await file.source()); }} index={libraryIndex} connected={!!libraryFiles.current} reused={indexReused} busy={indexBusy || !!addPackStatus} palette={palette} onChoose={() => { refreshOnReconnect.current = false; libraryInput.current?.click(); }} onCorrect={correctLibrarySample} onClose={() => { setLibraryOpen(false); setLibraryToolsOpen(false); }} onGenerate={(packs) => { const found = libraryFiles.current; if (!found) return; setLibraryOpen(false); void loadBank("kit", () => ({ ...found, files: found.files.filter((file) => packs.includes(file.sourcePack ?? "")) })); }}/>}
        {layoutEditorOpen && <LayoutEditor layout={activeLayout} templates={templates} onClose={() => setLayoutEditorOpen(false)} onSelect={(template) => setActiveLayout(template)} onSave={(template) => { setTemplates((prev) => [...prev.filter((old) => old.id !== template.id), template]); setActiveLayout(template); saveState({ layoutId: template.id }); }} onApply={(template) => { const applied = template.id === "horizontal" ? { ...template, id: "custom:active" } : template; setActiveLayout(applied); setTemplates((prev) => [...prev.filter((old) => old.id !== applied.id), applied]); setLayout((prev) => ({ ...prev, id: applied.id })); setLayoutEditorOpen(false); setNotice("Layout ready for the next kit generation."); }}/>}
        {sampleLibraryOpen && (
          <SampleLibraryModal
            records={sampleLibrary}
            onClose={() => setSampleLibraryOpen(false)}
            onFavorite={(record) => {
              const pad = [...Object.values(pads), ...Object.values(hidden), ...favoritePads].find((p) => p.libraryId === record.id);
              if (pad) void toggleFavorite(pad, false);
              else void setSampleFavorite(record.id, false).then(async () => {
                setSampleLibrary(await loadSampleLibrary());
                setFavoritePads((prev) => prev.filter((p) => p.libraryId !== record.id));
              });
            }}
          />
        )}

        {seqOpen ? (
          <SeqScreen
            bpm={projectBpm}
            beatsPerBar={seqBeatsPerBar}
            projectId={
              projectFile.current
                ? `${projectFile.current.name}:${projectFile.current.size}`
                : "current"
            }
            onPitch={(index, pitch) =>
              patchPad(index, {
                semis: Math.trunc(pitch),
                cents: Math.round((pitch - Math.trunc(pitch)) * 100),
              })
            }
            padsOfBank={seqPadsOfBank}
            soundsFor={(bank, slot) =>
              pads[bank * 16 + slot]
                ? swapListFor(pads[bank * 16 + slot])
                : null
            }
            onBack={() => setSeqOpen(false)}
          />
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
                        title={
                          m.id === "swap" && !canSwap
                            ? "Hot swap needs the finger drumming layout or a loaded bank (menu)"
                            : undefined
                        }
                        onClick={() => setMode(on ? null : m.id)}
                      >
                        <span className="cap__led" />
                        <span className="cap__legend">{m.label}</span>
                      </button>
                    );
                  })}
                  {/* Sequencer entry point is disabled until its live-input port is ready. */}
                </div>
                <div className="tray">
                  {BANKS.map((name, i) => {
                    const hasSamples = Object.keys(pads).some(
                      (index) => Math.floor(Number(index) / 16) === i,
                    );
                    const cls = [
                      "cap",
                      "cap--bank",
                      shownBank === i && "cap--on",
                      !hasSamples && "cap--empty",
                      hover === `bank:${i}` && "cap--target",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={name}
                        className={cls}
                        aria-label={`Bank ${name}`}
                        aria-pressed={shownBank === i}
                        data-drop="bank"
                        data-index={i}
                        onClick={() => setBank(i)}
                      >
                        <span className="cap__led" />
                        <span className="cap__legend">{name}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="cap cap--menu"
                  aria-label="Menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <svg
                    viewBox="0 0 14 10"
                    aria-hidden="true"
                    className="cap--menu__glyph"
                  >
                    <path d="M1 1h12M1 5h12M1 9h12" />
                  </svg>
                  <span className="cap__legend">Menu</span>
                </button>
              </div>

              {/* The screen: a black OLED in Silkscreen, with a title bar in inverse video. It grows over the deck's place in Swap mode. */}
              <div
                className={`screen-wrap screen-wrap--${shownMode ?? "swap"}`}
              >
                <section
                  className="screen"
                  aria-label={`Display: ${shownMode ?? "sample"}`}
                >
                  <div className="oled">
                    {selectedPad && (
                      <div className="oled__head">
                        <span>
                          {shownMode === "swap"
                            ? "Hot swap"
                            : shownMode === "type"
                              ? "Sound type"
                              : shownMode === "tune"
                                ? "Tune"
                                : "Sample"}
                        </span>
                        <span>
                          {shownMode === "tune"
                            ? "All pads"
                            : padName(selectedPad)}
                        </span>
                      </div>
                    )}
                    {!hasProject ? (
                      <div className="dropzone">
                        <svg className="dropzone__ants" aria-hidden="true">
                          <rect
                            className="dropzone__ants-base"
                            pathLength="280"
                          />
                          <rect
                            className="dropzone__ants-dash"
                            pathLength="280"
                          />
                        </svg>
                        <input
                          ref={projectInput}
                          type="file"
                          accept=".koala"
                          hidden
                          onChange={(e) => pickFile(e.target.files)}
                        />
                        {loading || addPackStatus ? (
                          <strong>
                            {loading
                              ? importStatus || "Loading…"
                              : addPackStatus}
                          </strong>
                        ) : (
                          <div className="dropzone__choices">
                            {[
                              {
                                icon: K_ICON,
                                label: "Project",
                                aria: "Open a .koala project",
                                input: projectInput,
                              },
                              {
                                icon: DRUM_ICON,
                                label: "Drums",
                                aria: "Load Bank A: Drums",
                                input: drumsInput,
                              },
                              {
                                icon: FOLDER_ICON,
                                label: "Kit",
                                aria: "Load a kit folder (all sound types)",
                                input: libraryInput,
                              },
                              {
                                icon: ACAPELLA_ICON,
                                label: "Chopper",
                                aria: "Load Bank D: Chopper",
                                input: null,
                              },
                            ].map((choice) => (
                              <button
                                key={choice.label}
                                type="button"
                                className="dropzone__btn"
                                aria-label={choice.aria}
                                onClick={() =>
                                  choice.label === "Kit"
                                    ? setLibraryOpen(true)
                                    : choice.input
                                    ? choice.input.current?.click()
                                    : askChopMode()
                                }
                              >
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
                        <span>
                          {analyzing > 0 ? "Analyzing pads…" : "Tap a pad"}
                        </span>
                      </div>
                    ) : shownMode === "swap" ? (
                      swapList
                    ) : !isReal(selectedPad) ? (
                      <div className="screen__message">
                        <strong>{labelOf(selectedPad)}</strong>
                        <span>
                          {selectedPad.chopper
                            ? `${selectedPad.chopper.slices} chops, ${selectedPad.chopper.bpm.toFixed(2)} BPM`
                            : selectedPad.section
                              ? `${selectedPad.section.bars} bars, ${selectedPad.section.bpm.toFixed(2)} BPM`
                              : selectedPad.ghost
                                ? "Made on export unless filled"
                                : selectedPad.placeholder?.kind === "missing"
                                  ? "Silent placeholder: drag a sound here"
                                  : "Silent placeholder"}
                        </span>
                        {selectedPad.chopper?.maker && (
                          <button
                            className="type-readout__match"
                            onClick={() => setMakerPad(48)}
                          >
                            Edit chop pattern
                          </button>
                        )}
                      </div>
                    ) : shownMode === "tune" ? (
                      panel
                    ) : (
                      <div className="type-readout">
                        <div className="type-readout__name">
                          {selectedPad.category
                            ? CATEGORIES[categoryIndex(selectedPad.category)]
                                .label
                            : "Analyzing…"}
                        </div>
                        <div className="type-readout__sample">
                          {displayName(selectedPad.name, tags)}
                        </div>
                        <div className="type-readout__line">
                          <span>Key {keyNameOf(selectedPad)}</span>
                          <span>
                            {(() => {
                              const shift = selectedPad.tune
                                ? shiftFor(
                                    { ...selectedPad, semis: 0, cents: 0 },
                                    tunedTarget,
                                    a4,
                                    keyMajor,
                                  ) +
                                  trimCents(
                                    selectedPad.semis,
                                    selectedPad.cents,
                                  ) /
                                    100
                                : 0;
                              return `${shift < 0 ? "-" : "+"}${Math.abs(shift).toFixed(3)}st`;
                            })()}
                          </span>
                        </div>
                        <Waveform channelData={selectedPad.channelData} />
                        {shownMode === null &&
                          selectedPad.category === "melodicLoop" && (
                            <button
                              className="type-readout__match"
                              disabled={selectedPad.detectedMidi == null}
                              onClick={() => matchProjectToKey(selectedPad)}
                            >
                              {selectedPad.detectedMidi == null
                                ? "No key detected"
                                : "Match project to key"}
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </section>

                {drag && !expanded && (
                  // Drag actions: shuffle, delete, lock/unlock or chop.
                  <section className="screen screen--drag" aria-hidden="true">
                    <div
                      className="oled"
                      ref={(el) => {
                        if (el)
                          el.dataset.tight =
                            document.querySelector<HTMLElement>(
                              ".screen:not(.screen--drag) .oled",
                            )?.dataset.tight ?? "";
                      }}
                    >
                      <div className="dropzone">
                        <svg className="dropzone__ants" aria-hidden="true">
                          <rect
                            className="dropzone__ants-base"
                            pathLength="280"
                          />
                          <rect
                            className="dropzone__ants-dash"
                            pathLength="280"
                          />
                        </svg>
                        <div className="dropzone__choices">
                          {(
                            [
                              { kind: "shuffle", word: "Shuffle", icon: SHUFFLE_ICON },
                              {
                                kind: "trash",
                                word: "Delete",
                                icon: DELETE_ICON,
                              },
                              {
                                kind: "lock",
                                word: pads[drag.from]?.locked
                                  ? "Unlock"
                                  : "Lock",
                                icon: pads[drag.from]?.locked
                                  ? UNLOCK_ICON
                                  : LOCK_ICON,
                              },
                              {
                                kind: "chop",
                                word: "Chopper",
                                icon: ACAPELLA_ICON,
                              },
                            ] as const
                          ).map((zone) => (
                            <div
                              key={zone.kind}
                              className={`dropzone__btn${hover === `${zone.kind}:` ? " dropzone__btn--on" : ""}`}
                              data-drop={zone.kind}
                            >
                              <PixelIcon rows={zone.icon} scale={1} />
                              <span>{zone.word}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )}
                {drag && expanded && (
                  <div className="drop-targets">
                    <div
                      className={`drop-target drop-target--trash${hover === "trash:" ? " drop-target--hot" : ""}`}
                      data-drop="trash"
                    >
                      🗑 Delete
                    </div>
                    <div
                      className={`drop-target drop-target--unused${hover === "unused:" ? " drop-target--hot" : ""}`}
                      data-drop="unused"
                    >
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
                    pad={
                      selectedPad && isReal(selectedPad) ? selectedPad : null
                    }
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
                      <span className="cap__legend">
                        {keyMajor ? "Major" : "Minor"}
                      </span>
                    </button>
                    <button
                      className={`cap cap--side${toneOn ? " cap--on" : ""}`}
                      aria-pressed={toneOn}
                      onClick={() => setToneOn((on) => !on)}
                    >
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
                      pad?.locked && "pad--locked",
                      selected === index && "pad--selected",
                      drag?.from === index && "pad--dragging",
                      hover === `pad:${index}` && "pad--target",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <PadButton
                        key={slot}
                        className={cls}
                        style={
                          pad
                            ? ({ "--c": litColor(pad) } as React.CSSProperties)
                            : undefined
                        }
                        data-drop="pad"
                        data-index={index}
                        onPointerDown={(e) => onPadDown(e, index)}
                        onPointerMove={onPadMove}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label={`Pad ${slot + 1}`}

                        caption={captionOf(pad)}
                        slot={slot}
                        symbol={padSymbols ? symbolOf(pad) : undefined}
                        locked={pad?.locked}
                      />
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
                                  drag.from === index &&
                                    "allpads__cell--source",
                                  hover === `cell:${index}` &&
                                    "allpads__cell--target",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                style={
                                  pad
                                    ? { background: colorOfPad(pad) }
                                    : undefined
                                }
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
          <LongSamplesModal
            pads={longPads}
            maxSeconds={MAX_SAMPLE_SECONDS}
            onDelete={deletePad}
            onChop={openChop}
            onClose={() => setLongSamples([])}
          />
        )}

        {roleAsk && (
          <AcapellaFilesModal
            song={roleAsk.song}
            stem={roleAsk.stem}
            onSwap={() => setRoleAsk({ song: roleAsk.stem, stem: roleAsk.song })}
            onCancel={() => {
              setRoleAsk(null);
              pickedMode.current = null;
            }}
            onUse={() => void finishAcapellaRoles(roleAsk.song, roleAsk.stem)}
          />
        )}

        {modeAsk && (
          <AcapellaModeModal
            onChoose={chooseChopMode}
            onCancel={() => {
              setModeAsk(false);
              setChopTarget(null);
            }}
          />
        )}

        {sourcePick && (
          <ChopperSourceModal
            pads={[
              ...Object.values(pads).filter(isReal),
              ...Object.values(hidden),
            ]
              .filter(
                (p) =>
                  p.channelData[0].length / p.sampleRate >= CHOPPER_MIN_SECONDS,
              )
              .sort(
                (a, b) =>
                  b.channelData[0].length / b.sampleRate -
                  a.channelData[0].length / a.sampleRate,
              )}
            onPick={(pad) =>
              void (sourcePick === "synced"
                ? launchSynced(pad)
                : launchChopper(pad))
            }
            onCancel={() => setSourcePick(null)}
          />
        )}

        {chop && (
          <SongChopModal
            pad={chop.song}
            palette={palette}
            beatsPerBar={chop.beatsPerBar}
            freeSlots={
              chop.mode === "chopper" ? CHOPPER_MAX_TOTAL - 2 : PADS_PER_BANK
            }
            unit={chop.mode === "chopper" ? "chop" : "pattern"}
            pitchForKey={(key) => keyOffset(key, tunedTarget, keyMajor)}
            acapella={chop.mode === "acapella"}
            onConfirm={(settings, openMaker) =>
              chop.mode === "chopper"
                ? chopSong(chop, settings, openMaker)
                : openAllocator(chop, settings)
            }
            onClose={() => setChop(null)}
          />
        )}

        {allocate && (
          <PadAllocator
            pads={destinationPads(pads, (p) => labelOf(p))}
            chopsMarked={allocate.settings.plans.length}
            patternSlots={allocate.patternSlots}
            pattern={allocate.settings.pattern ?? "multiple"}
            earlierChop={Object.values(pads)
              .filter((p) => p.section && !p.locked)
              .map((p) => p.index)}
            onPreview={previewPad}
            onCancel={() => {
              stopPreview();
              setAllocate(null);
            }}
            onConfirm={(destinations) => {
              stopPreview();
              const { job, settings } = allocate;
              setAllocate(null);
              void chopSong(job, settings, false, destinations);
            }}
          />
        )}

        {makerPad !== null && pads[makerPad]?.chopper?.maker && (
          <PatternMaker
            channelData={pads[makerPad].channelData}
            sampleRate={pads[makerPad].sampleRate}
            beatFrames={pads[makerPad].chopper!.maker!.beatFrames}
            chops={pads[makerPad].chopper!.maker!.chops.map((c) => ({
              ...c,
              color: chopColor(palette.colors, c.colorIndex),
            }))}
            beatsPerBar={pads[makerPad].chopper!.beatsPerBar}
            initial={pads[makerPad].chopper!.maker!.slots ?? []}
            colors={palette.colors}
            grid={pads[makerPad].chopper!.maker!.grid}
            rhythm={pads[makerPad].chopper!.maker!.rhythm}
            pitch={pads[makerPad].chopper!.pitch}
            onDone={finishMaker}
            onClose={() => setMakerPad(null)}
          />
        )}

        {schemeOpen && (
          <SchemeModal
            currentId={palette.id}
            onPick={(p) => setPaletteId(p.id)}
            iconLight={iconLight}
            onIconLight={setIconLight}
            onClose={() => setSchemeOpen(false)}
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
