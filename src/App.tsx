import { useCallback, useRef, useState } from "react";
import { Keyboard } from "./components/Keyboard";
import { PadPanel, type Pad } from "./components/PadPanel";
import { decodeFile, monoFromChannelData, cloneChannelData } from "./audio/decode";
import { parseKoalaProject, koalaPadToFile, isKoalaFile, type ParsedKoalaProject } from "./audio/koalaProject";
import { playPad } from "./audio/player";
import { buildTunedKoala, downloadBlob } from "./audio/exportProject";
import { NOTE_NAMES, semitonesToRatio } from "./audio/theory";
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

const PAD_COLS = [28, 245, 462, 679];
const PAD_ROWS = [991, 1198, 1406, 1613];
const PAD_W = 200;
const PAD_H = 190;
const BANKS = ["A", "B", "C", "D"];

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

function App() {
  const [pads, setPads] = useState<Record<number, Pad>>({});
  const [bank, setBank] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [keyPc, setKeyPc] = useState<number | null>(null);
  const [tunedTarget, setTunedTarget] = useState<number | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const loadToken = useRef(0);
  const projectRef = useRef<ParsedKoalaProject | null>(null);

  const loadProject = useCallback(async (file: File) => {
    const token = ++loadToken.current;
    setError(null);
    setLoading(true);
    try {
      const project = await parseKoalaProject(file);
      if (token !== loadToken.current) return;
      projectRef.current = project;
      setPads({});
      setSelected(null);
      setKeyPc(null);
      setTunedTarget(null);
      setProjectName(project.originalName.replace(/\.koala$/i, ""));
      setBank(Math.min(3, Math.floor(project.pads[0].pad / 16)));

      const slots = project.pads.filter((p) => p.pad >= 0 && p.pad < 64);
      setAnalyzing(slots.length);
      for (const ref of slots) {
        const buffer = await decodeFile(await koalaPadToFile(project, ref));
        if (token !== loadToken.current) return;
        const pad: Pad = {
          index: ref.pad,
          sampleId: ref.sampleId,
          sampleRate: buffer.sampleRate,
          channelData: cloneChannelData(buffer),
          tune: false,
          semis: 0,
          cents: 0,
        };
        setPads((prev) => ({ ...prev, [ref.pad]: pad }));
        // Analysis runs on a worker while the next pad decodes.
        nextAnalysisWorker()
          .detectMidi(monoFromChannelData(pad.channelData), pad.sampleRate)
          .catch(() => null)
          .then((detectedMidi) => {
            if (token !== loadToken.current) return;
            setPads((prev) => ({ ...prev, [ref.pad]: { ...prev[ref.pad], detectedMidi } }));
            setAnalyzing((n) => n - 1);
          });
      }
    } catch (err) {
      if (token === loadToken.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, []);

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = Array.from(files ?? []).find(isKoalaFile);
    if (file) void loadProject(file);
    else if (files && files.length) setError("Please choose a .koala project file.");
  };

  const patchPad = (index: number, patch: Partial<Pad>) =>
    setPads((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));

  const tapPad = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    setSelected(index);
    playPad(index, pad.channelData, pad.sampleRate, shiftFor(pad, tunedTarget));
  };

  const tuneAll = () => {
    if (keyPc === null) return;
    setTunedTarget(keyPc);
    setPads((prev) =>
      Object.fromEntries(Object.entries(prev).map(([i, p]) => [i, { ...p, tune: p.detectedMidi != null, semis: 0, cents: 0 }])),
    );
  };

  /** Bakes every tuned pad's shift into its audio (windowed-sinc resample) and downloads the rebuilt project. */
  const exportProject = async () => {
    const project = projectRef.current;
    if (!project) return;
    setExporting(true);
    setError(null);
    try {
      const tuned = [];
      for (const pad of Object.values(pads)) {
        const shift = shiftFor(pad, tunedTarget);
        if (!pad.tune || Math.abs(shift) < 1e-6) continue;
        const channelData = await getRenderWorker().resamplePitch(pad.channelData, semitonesToRatio(shift));
        tuned.push({ sampleId: pad.sampleId, sampleRate: pad.sampleRate, channelData });
      }
      const { blob, filename } = await buildTunedKoala(project, tuned);
      downloadBlob(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const canExport = Object.values(pads).some((p) => p.tune) && !exporting;
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
        {/* Hides the selection ring baked into the screenshot's pad 15 and its "C" bank highlight. */}
        <div className="cover" style={box(446, 1598, 230, 220)} />
        <div className="cover" style={box(288, 1826, 330, 100)} />
        <div className="cover" style={box(725, 1826, 175, 100)} />

        <section className="teal" style={box(13, 280, 888, 510)}>
          {selectedPad ? (
            <PadPanel pad={selectedPad} shift={shiftFor(selectedPad, tunedTarget)} onChange={(patch) => patchPad(selectedPad.index, patch)} />
          ) : hasProject ? (
            <div className="teal__message">
              <strong>{projectName}</strong>
              <span>{analyzing > 0 ? "Analyzing pads…" : "Tap a pad"}</span>
            </div>
          ) : (
            <label className="dropzone">
              <input type="file" accept=".koala" hidden onChange={(e) => pickFile(e.target.files)} />
              <strong>{loading ? "Loading…" : "Drop a .koala project"}</strong>
              <span>{error ?? "or tap to choose one"}</span>
            </label>
          )}
        </section>

        <section className="pink" style={box(19, 801, 875, 169)}>
          <Keyboard selected={keyPc} onSelect={setKeyPc} />
          <button className="tune-all" disabled={keyPc === null || !hasProject || analyzing > 0} onClick={tuneAll}>
            Tune all
            <small>{keyPc === null ? "pick a key" : `to ${NOTE_NAMES[keyPc]}`}</small>
          </button>
        </section>

        {Array.from({ length: 16 }, (_, slot) => {
          const index = bank * 16 + slot;
          const pad = pads[index];
          const cls = ["pad", pad && "pad--loaded", pad?.tune && "pad--tuned", selected === index && "pad--selected"]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={slot}
              className={cls}
              style={box(PAD_COLS[slot % 4], PAD_ROWS[Math.floor(slot / 4)], PAD_W, PAD_H)}
              onPointerDown={(e) => {
                e.preventDefault();
                tapPad(index);
              }}
              aria-label={`Pad ${slot + 1}`}
            />
          );
        })}

        <div className="banks" style={box(296, 1836, 315, 80)}>
          {BANKS.map((name, i) => (
            <button key={name} className={bank === i ? "bank bank--active" : "bank"} onClick={() => setBank(i)}>
              {name}
            </button>
          ))}
        </div>

        <button className="export" style={box(735, 1836, 155, 80)} disabled={!canExport} onClick={exportProject}>
          {exporting ? "…" : "Export"}
        </button>

        {error && hasProject && <div className="toast">{error}</div>}
      </div>
    </div>
  );
}

export default App;
