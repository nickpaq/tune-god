import { useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { useSoundPreview } from "./useSoundPreview";
import { useModalFocus } from "./useModalFocus";
import { CATEGORIES, categoryLabel, type CategoryId } from "../audio/classify";
import { libraryPacks, type LibraryProgress, type LibraryIndex } from "../audio/libraryIndex";
import type { SampleClassification } from "../audio/sampleClassification";
import { colorFor, type Palette } from "../audio/palettes";

export function LibraryBrowser({ error, tools = false, progress, report, onRead, index, connected, reused, busy, palette, onChoose, onGenerate, onCorrect, onClose }: {
  error: string;
  tools?: boolean;
  progress: LibraryProgress | null;
  report: { filled: number; requested: number; shortages: string[] } | null;
  onRead: (id: string) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
  index: LibraryIndex | null;
  connected: boolean;
  reused: number;
  busy: boolean;
  palette: Palette;
  onChoose: () => void;
  onGenerate: (packs: string[]) => void;
  onCorrect: (id: string, value: SampleClassification) => void;
  onClose: () => void;
}) {
  const dialog = useModalFocus(onClose);
  const preview = useSoundPreview();
  const previewToken = useRef(0);
  useEffect(() => () => { previewToken.current++; }, []);
  const [previewError, setPreviewError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const packs = useMemo(() => (index ? libraryPacks(index).map((pack) => {
    const counts = new Map<CategoryId, number>();
    for (const sample of pack.samples) counts.set(sample.classification.category, (counts.get(sample.classification.category) ?? 0) + 1);
    return { ...pack, types: [...counts].sort((a,b) => b[1] - a[1]).map(([category]) => ({ category, label: categoryLabel(category), color: colorFor(palette, category) })) };
  }) : []), [index, palette]);
  const chosen = packs.filter((pack) => selected.includes(pack.id)).map((pack) => pack.id);
  const chosenSet = new Set(chosen);
  const visible = tools ? index?.samples.filter((sample) => sample.path.toLowerCase().includes(query.toLowerCase())).slice(0,100) ?? [] : [];
  const audition = async (id: string) => {
    const token = ++previewToken.current;
    const key = index?.samples.findIndex((sample) => sample.id === id) ?? -1;
    if (preview.playing === key) return preview.stop();
    void getAudioContext().resume();
    preview.stop();
    setPreviewError("");
    try { const audio = await onRead(id); if (token === previewToken.current) preview.toggle(key, audio.channelData, audio.sampleRate); }
    catch (error) { if (token === previewToken.current) setPreviewError(error instanceof Error ? error.message : "Could not preview this sample."); }
  };
  return (
    <div className={`sample-library-backdrop${tools ? "" : " sample-library-backdrop--packs"}`}>
      <section ref={dialog} className={`sample-library ${tools ? "sample-library--tools" : "sample-library--packs"}`} role="dialog" aria-modal="true" aria-labelledby="library-title">
        <header className="sample-library__header">
          <h2 id="library-title">{tools ? "Sample Types" : "Sample library"}</h2>
          <button onClick={onClose} aria-label="Close library">×</button>
        </header>
        {tools ? <>
          <p>Choose a Type for each sound. This determines which preset pads it can fill.</p>
          {report && <details><summary>Last kit: {report.filled} / {report.requested} pads · {report.shortages.length} shortages</summary>{report.shortages.map((shortage) => <div key={shortage}>{shortage}</div>)}</details>}
          <input aria-label="Search sample paths" placeholder="Search samples" value={query} onChange={(event) => setQuery(event.target.value)} />
          {previewError && <p role="status">{previewError}</p>}
          <div className="sample-library__rows">
            {visible.map((sample) => <div className="library-sample" key={sample.id}>
              <strong title={sample.path}>{sample.name}</strong>
              <small>{sample.pack}</small>
              <div className="library-actions">
                <button disabled={!connected || busy} aria-label={`Preview ${sample.name}`} onClick={() => void audition(sample.id)}>♪ Preview</button>
                <select disabled={busy} aria-label={`Type for ${sample.name}`} value={sample.classification.category} onChange={(event) => onCorrect(sample.id, { ...sample.classification, category: event.target.value as CategoryId })}>
                  {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </div>
            </div>)}
            {visible.length === 100 && <p>Showing the first 100 samples. Search to narrow the list.</p>}
            {!index && <p>Reconnect a sample folder from the library first.</p>}
          </div>
        </> : <>
          <p>{connected ? "A: MPC drums · B/C: mixed sounds · D: chops. Choose your packs." : "Reconnect your sample folder, then choose your packs."}</p>
          {error && <p role="alert">{error}</p>}
          <div className="library-actions">
            <button className="menu__button" onClick={onChoose} disabled={busy}>Reconnect files</button>
            <button className="menu__button" onClick={() => setSelected(packs.map((pack) => pack.id))} disabled={busy || !packs.length}>Select all</button>
          </div>
          {busy && progress && <div className="library-progress" aria-busy="true">
            <p role="status" aria-live="polite">{progress.stage} · {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} files</p>
            <progress aria-label="Library indexing progress" max={100} value={progress.percent} />
          </div>}
          {index && <p className="library-summary" role="status">{index.name} · {packs.length.toLocaleString()} packs{progress?.percent === 100 ? ` · ${progress.stage}` : ""}</p>}
          <div className="library-packs" role="group" aria-label="Sample packs">
            {packs.map((pack) => <label key={pack.id} className="library-pack">
              <input type="checkbox" aria-label={pack.name} disabled={busy} checked={chosenSet.has(pack.id)} onChange={(event) => setSelected(event.target.checked ? [...chosen, pack.id] : chosen.filter((id) => id !== pack.id))} />
              <span className="library-pack__types" role="img" aria-label={`Contains ${pack.types.map((type) => type.label).join(", ")}`} title={pack.types.map((type) => type.label).join(", ")}>
                {pack.types.map((type) => <span key={type.category} className="library-pack__dot" style={{ backgroundColor: type.color }} aria-hidden="true" />)}
              </span>
              <span>{pack.name}</span>
            </label>)}
            {!packs.length && !busy && <p>{index ? "No sample packs found in this folder." : "Your packs will appear here."}</p>}
          </div>
          <footer className="library-generate">
            <p>{chosen.length.toLocaleString()} {chosen.length === 1 ? "pack" : "packs"} selected{!connected && index ? " · Reconnect files to generate" : ""}</p>
            <button className="menu__button menu__button--primary" disabled={!connected || busy || !chosen.length} onClick={() => onGenerate(chosen)}>Generate kit</button>
          </footer>
        </>}
        {tools && index && <small>{index.samples.length.toLocaleString()} samples · {reused.toLocaleString()} reused</small>}
      </section>
    </div>
  );
}
