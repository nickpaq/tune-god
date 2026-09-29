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
import { startPad, type PadHandle } from "./audio/player";
import { buildTunedKoala, downloadBlob } from "./audio/exportProject";
import { normalizeWithGain } from "./audio/gain";
import { balancedSpread } from "./audio/spread";
import { categoryLabel, isTunedCategory, CATEGORIES, type CategoryId } from "./audio/classify";
import { colorFor, paletteById, textColorOn, DEFAULT_PALETTE_ID } from "./audio/palettes";
import { PalettePicker } from "./components/PalettePicker";
import { loadProjectFile, loadState, saveProjectFile, saveState, type SavedPad } from "./storage";
import { semitonesToRatio } from "./audio/theory";
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
/** Peak level every sample is normalized to on export. */
const EXPORT_GAIN_DB = -6;
/** Widest spread pan, in percent either side of centre. */
const MAX_SPREAD_PERCENT = 40;

/**
 * Total semitone shift for a pad: the shortest move (never more than 6 up or
 * down) from its exact detected pitch onto the target note, plus the manual trim.
 */
function shiftFor(pad: Pad, target: number | null): number {
  if (!pad.tune) return 0;
  let base = 0;
  if (target !== null && pad.detectedMidi != null) {
    base = (((target - pad.detectedMidi) % 12) + 12) % 12;
    if (base > 6) base -= 12;
  }
  return base + pad.semis + pad.cents / 100;
}

/** Older saves may hold category ids that no longer exist. */
function validCategory(id: CategoryId | undefined): CategoryId {
  return CATEGORIES.some((c) => c.id === id) ? (id as CategoryId) : "other";
}

/** Resampling can overshoot full scale by a hair on loud samples; scale down only then, so the WAV never clips. */
function limitPeak(channelData: Float32Array[]): Float32Array[] {
  let peak = 0;
  for (const data of channelData) for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak <= 1) return channelData;
  return channelData.map((data) => data.map((v) => v / peak));
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
  /** "done/total" while an export is rendering, so a long high-quality render shows progress. */
  const [exportProgress, setExportProgress] = useState("");
  const [normalize, setNormalize] = useState(saved.normalize ?? false);
  const [spread, setSpread] = useState(saved.spread ?? false);
  /** Pre-rendered normalized audio per pad index; only used for playback while Normalize is on. */
  const [normalizedData, setNormalizedData] = useState<Record<number, Float32Array[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoColor, setAutoColor] = useState(saved.autoColor ?? false);
  const [paletteId, setPaletteId] = useState(saved.paletteId ?? DEFAULT_PALETTE_ID);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toneOn, setToneOn] = useState(saved.toneOn ?? false);
  const releasePad = useRef<Map<number, PadHandle>>(new Map());
  const tunedTargetRef = useRef<number | null>(saved.tunedTarget ?? null);
  /** Per-pad choices from the last visit, applied as each pad finishes analysis. */
  const restorePads = useRef<Record<number, SavedPad>>(saved.pads ?? {});
  const loadToken = useRef(0);
  const projectRef = useRef<ParsedKoalaProject | null>(null);

  const loadProject = useCallback(async (file: File, restore = false) => {
    const token = ++loadToken.current;
    setLoading(true);
    try {
      const project = await parseKoalaProject(file);
      if (token !== loadToken.current) return;
      projectRef.current = project;
      setPads({});
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

      const slots = project.pads.filter((p) => p.pad >= 0 && p.pad < 64);
      setAnalyzing(slots.length);
      for (const ref of slots) {
        const decoded = await decodeNative(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        const pad: Pad = {
          index: ref.pad,
          sampleId: ref.sampleId,
          sampleRate: decoded.sampleRate,
          channelData: decoded.channelData,
          tune: false,
          semis: 0,
          cents: 0,
        };
        setPads((prev) => ({ ...prev, [ref.pad]: pad }));
        // Analysis runs on a worker while the next pad decodes.
        nextAnalysisWorker()
          .analyze(monoFromChannelData(pad.channelData), pad.sampleRate, ref.fileName)
          .catch(() => ({ midi: null, category: "other" as const }))
          .then(({ midi: detectedMidi, category }) => {
            if (token !== loadToken.current) return;
            setPads((prev) => {
              const remembered = restorePads.current[ref.pad];
              const cur = prev[ref.pad];
              return {
                ...prev,
                [ref.pad]: {
                  ...cur,
                  detectedMidi,
                  ...(remembered ? { ...remembered, category: validCategory(remembered.category) } : { category }),
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
  }, []);

  // Reopen the last project, if there was one.
  useEffect(() => {
    void loadProjectFile().then((file) => {
      if (file) void loadProject(file, true);
    });
  }, [loadProject]);

  useEffect(() => {
    saveState({ normalize, spread, autoColor, paletteId, toneOn, bank, selected, keyPc, tunedTarget });
  }, [normalize, spread, autoColor, paletteId, toneOn, bank, selected, keyPc, tunedTarget]);

  // Pad choices are only saved once every pad has loaded, so a half-restored grid never overwrites them.
  useEffect(() => {
    if (analyzing > 0 || loading || Object.keys(pads).length === 0) return;
    const out: Record<number, SavedPad> = {};
    for (const p of Object.values(pads)) {
      out[p.index] = { tune: p.tune, tuneLocked: p.tuneLocked, semis: p.semis, cents: p.cents, category: p.category };
    }
    restorePads.current = out;
    saveState({ pads: out });
  }, [pads, analyzing, loading]);

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = Array.from(files ?? []).find(isKoalaFile);
    if (file) void loadProject(file);
  };

  const patchPad = (index: number, patch: Partial<Pad>) =>
    setPads((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));

  const pressPad = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    setSelected(index);
    releasePad.current.get(index)?.release();
    releasePad.current.set(
      index,
      startPad(
        index,
        (normalize && normalizedData[index]) || pad.channelData,
        pad.sampleRate,
        shiftFor(pad, tunedTarget),
        toneOn ? keyPc : null,
      ),
    );
  };

  /** Renders every pad at the export level so taps are audibly level-matched. */
  const normalizeNow = () => {
    setNormalizedData(
      Object.fromEntries(
        Object.values(pads).map((p) => [p.index, normalizeWithGain(p.channelData, EXPORT_GAIN_DB)]),
      ),
    );
  };

  const liftPad = (index: number) => {
    releasePad.current.get(index)?.release();
    releasePad.current.delete(index);
  };

  // Slider and key changes retune any pad that is currently held, so tuning is audible live.
  useEffect(() => {
    for (const [index, handle] of releasePad.current) {
      const pad = pads[index];
      if (pad) handle.setShift(shiftFor(pad, tunedTarget));
    }
  }, [pads, tunedTarget]);

  const toggleAutoColor = (on: boolean) => {
    if (on && !window.confirm("Auto-color pads will replace the existing pad colors and color labels in your project when you export. Continue?")) return;
    setAutoColor(on);
  };

  /**
   * Picking a key retargets every pad. Pads whose Tune switch the user has set by hand keep it,
   * and every pad keeps its semitone/cents trim, so manual corrections survive a key change.
   */
  const selectKey = (pc: number) => {
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
   * rebuilt project. With the normalize switch on, every sample is also peak-normalized to
   * EXPORT_GAIN_DB and its pad gain knob reset to zero.
   */
  const exportProject = async () => {
    const project = projectRef.current;
    if (!project) return;
    setExporting(true);
    try {
      const tuned = [];
      // Koala's pan runs 0..1 (0.5 = centre) for L100..R100, so N percent is N/200 off centre.
      const pans = new Map<number, number>();
      if (spread) {
        // Only melodic pads move; bass, drums and the rest stay centred.
        const tunedPads = Object.values(pads).filter((p) => p.category === "melodic");
        const offsets = balancedSpread(tunedPads.length, MAX_SPREAD_PERCENT);
        tunedPads.forEach((p, i) => pans.set(p.sampleId, 0.5 + offsets[i] / 200));
      }
      const allPads = Object.values(pads);
      let done = 0;
      for (const pad of allPads) {
        setExportProgress(`${done++}/${allPads.length}`);
        const shift = shiftFor(pad, tunedTarget);
        const retimed = pad.tune && Math.abs(shift) >= 1e-6;
        if (!retimed && !normalize) continue;
        let channelData = retimed
          ? await getRenderWorker().resamplePitch(pad.channelData, semitonesToRatio(shift))
          : pad.channelData;
        if (retimed && !normalize) channelData = limitPeak(channelData);
        tuned.push({
          sampleId: pad.sampleId,
          sampleRate: pad.sampleRate,
          channelData: normalize ? normalizeWithGain(channelData, EXPORT_GAIN_DB) : channelData,
          retimed,
        });
      }
      const colors = new Map<number, { color: string; label: string }>();
      if (autoColor) {
        for (const p of Object.values(pads)) {
          if (p.category) colors.set(p.sampleId, { color: colorFor(palette, p.category), label: categoryLabel(p.category) });
        }
      }
      const { blob, filename } = await buildTunedKoala(project, tuned, { resetGain: normalize, pans, colors });
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  const palette = paletteById(paletteId);
  const canExport =
    (normalize || autoColor ? Object.keys(pads).length > 0 : Object.values(pads).some((p) => p.tune)) &&
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
        <div className="cover" style={box(18, 1826, 265, 100)} />
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
          ☰
        </button>
        {menuOpen && (
          <div className="menu" style={{ top: `${(268 / H) * 100}%`, right: `${((W - RIGHT) / W) * 100}%` }}>
            <label>
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
              Normalize −6 dB
            </label>
            <button className="menu__button" disabled={!normalize || !hasProject} onClick={normalizeNow}>
              Normalize now
            </button>
            <label>
              <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
              Spread melodic pads
            </label>
            <label>
              <input type="checkbox" checked={autoColor} onChange={(e) => toggleAutoColor(e.target.checked)} />
              Auto-color pads by sound type
            </label>
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
          {selectedPad ? (
            <PadPanel
              pad={selectedPad}
              autoColor={autoColor}
              autoShift={shiftFor(
                { ...selectedPad, semis: 0, cents: 0 },
                tunedTarget,
              )}
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
            pad?.tune && "pad--tuned",
            selected === index && "pad--selected",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={slot}
              className={cls}
              style={{
                ...box(PAD_COLS[slot % 4], PAD_ROWS[Math.floor(slot / 4)], PAD_W, PAD_H),
                ...(pad && autoColor
                  ? (() => {
                      const bg = colorFor(palette, pad.category ?? "other");
                      return { background: bg, color: textColorOn(bg) };
                    })()
                  : null),
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                pressPad(index);
              }}
              onPointerUp={() => liftPad(index)}
              onPointerCancel={() => liftPad(index)}
              aria-label={`Pad ${slot + 1}`}
            />
          );
        })}

        <div className="banks" style={box(296, 1836, 315, 80)}>
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
              <button key={name} className={cls} onClick={() => setBank(i)}>
                {name}
              </button>
            );
          })}
        </div>

        <button
          className={`tone${toneOn ? " tone--on" : ""}`}
          style={box(LEFT, 1836, 245, 80)}
          aria-pressed={toneOn}
          onClick={() => setToneOn((on) => !on)}
        >
          Tone
        </button>


        {paletteOpen && (
          <PalettePicker selectedId={paletteId} onSelect={setPaletteId} onClose={() => setPaletteOpen(false)} />
        )}

        <button
          className="export"
          style={box(RIGHT - 155, 1836, 155, 80)}
          disabled={!canExport}
          onClick={exportProject}
        >
          {exporting ? exportProgress || "…" : "Export"}
        </button>
      </div>
    </div>
  );
}

export default App;
