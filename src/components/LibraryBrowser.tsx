import { getAudioContext } from "../audio/decode";
import { useSoundPreview } from "./useSoundPreview";
import { useModalFocus } from "./useModalFocus";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, type CategoryId } from "../audio/classify";
import { libraryPacks, type LibraryProgress, type LibraryIndex } from "../audio/libraryIndex";
import {
  SUBTYPES,
  type SampleClassification,
} from "../audio/sampleClassification";
import { colorFor, type Palette } from "../audio/palettes";

export function LibraryBrowser({
  progress,
  report,
  onRead,
  index,
  connected,
  reused,
  busy,
  palette,
  onChoose,
  onRefresh,
  onGenerate,
  onCorrect,
  onClose,
}: {
  progress: LibraryProgress | null;
  report: { filled: number; requested: number; shortages: string[] } | null;
  onRead: (
    id: string,
  ) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
  index: LibraryIndex | null;
  connected: boolean;
  reused: number;
  busy: boolean;
  palette: Palette;
  onChoose: () => void;
  onRefresh: () => void;
  onGenerate: (packs: string[]) => void;
  onCorrect: (id: string, value: SampleClassification) => void;
  onClose: () => void;
}) {
  const dialog = useModalFocus(onClose);
  const preview = useSoundPreview();
  const previewToken = useRef(0);
  const [previewError, setPreviewError] = useState("");
  useEffect(
    () => () => {
      previewToken.current++;
    },
    [],
  );
  const audition = async (id: string) => {
    const key = index?.samples.findIndex((sample) => sample.id === id) ?? -1;
    const token = ++previewToken.current;
    if (preview.playing === key) {
      preview.stop();
      return;
    }
    void getAudioContext().resume();
    preview.stop();
    setPreviewError("");
    try {
      const audio = await onRead(id);
      if (token === previewToken.current)
        preview.toggle(key, audio.channelData, audio.sampleRate);
    } catch (error) {
      if (token === previewToken.current)
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Could not preview this sample.",
        );
    }
  };
  const [selected, setSelected] = useState<string[] | null>(null);
  const [review, setReview] = useState(false);
  const [query, setQuery] = useState("");
  const packs = useMemo(() => (index ? libraryPacks(index) : []), [index]);
  const allPacks = useMemo(() => packs.map((pack) => pack.id), [packs]);
  const chosen = selected ?? allPacks;
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const visible =
    index?.samples
      .filter(
        (sample) =>
          (!review || sample.classification.needsReview) &&
          chosenSet.has(sample.pack) &&
          sample.path.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 100) ?? [];
  return (
    <div className="sample-library-backdrop">
      <section
        ref={dialog}
        className="sample-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
      >
        <header className="sample-library__header">
          <h2 id="library-title">Sample library</h2>
          <button onClick={onClose} aria-label="Close library">
            ×
          </button>
        </header>
        <p>
          Select your library folder each session to reconnect its files. The
          saved index contains metadata, not audio.
        </p>
        <div className="library-actions">
          <button onClick={onChoose} disabled={busy}>
            Select folder
          </button>
          <button onClick={onRefresh} disabled={!connected || busy}>
            Refresh index
          </button>
        </div>
        {progress && (
          <div className="library-progress" aria-busy={busy}>
            <p role="status" aria-live="polite">{progress.stage} · {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} files</p>
            <progress aria-label="Library indexing progress" max={100} value={progress.percent} />
            <p>Reading names, folders and file metadata. Audio is analyzed only when you generate a kit or preview a sample.</p>
          </div>
        )}
        {previewError && <p role="status">{previewError}</p>}
        {report && (
          <details>
            <summary>
              Last kit: {report.filled} / {report.requested} pads ·{" "}
              {report.shortages.length} shortages
            </summary>
            {report.shortages.map((shortage) => (
              <div key={shortage}>{shortage}</div>
            ))}
          </details>
        )}
        {index && !busy && (
          <>
            <p>
              {index.name} · {index.samples.length} samples · {reused} restored
              {!connected ? " · Reselect folder to generate" : ""}
            </p>
            <div className="library-actions">
              <button onClick={() => setSelected(packs.map((pack) => pack.id))}>
                All packs
              </button>
              <button onClick={() => setSelected([])}>Clear selection</button>
            </div>
            <div className="library-packs">
              {packs.map((pack) => {
                const counts = new Map<CategoryId, number>();
                for (const sample of pack.samples)
                  counts.set(
                    sample.classification.category,
                    (counts.get(sample.classification.category) ?? 0) + 1,
                  );
                const colors = [...counts]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([category]) => colorFor(palette, category));
                return (
                  <label key={pack.id} className="library-pack">
                    <input
                      type="checkbox"
                      checked={chosen.includes(pack.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...chosen, pack.id]
                            : chosen.filter((id) => id !== pack.id),
                        )
                      }
                    />
                    <span
                      style={{
                        background: `linear-gradient(90deg, ${(colors.length === 1 ? [colors[0], colors[0]] : colors).join(", ")})`,
                      }}
                      className="library-pack__color"
                    />
                    <span>
                      {pack.name} ({pack.samples.length})
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              className="menu__button menu__button--primary"
              disabled={!connected || busy || !chosen.length}
              onClick={() => onGenerate(chosen)}
            >
              Generate kit from selected packs
            </button>
            <label className="library-pack">
              <input
                type="checkbox"
                checked={review}
                onChange={(event) => setReview(event.target.checked)}
              />
              Needs review (
              {index.samples.filter((s) => s.classification.needsReview).length}
              )
            </label>
            <input
              aria-label="Search sample paths"
              placeholder="Search paths"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="sample-library__rows">
              {visible.map((sample) => (
                <div className="library-sample" key={sample.id}>
                  <strong title={sample.path}>{sample.path}</strong>
                  <small>
                    {Math.round(sample.classification.confidence * 100)}% ·{" "}
                    {sample.classification.evidence}
                    {sample.bpm ? ` · ${sample.bpm} BPM` : ""}
                    {sample.key ? ` · ${sample.key}` : ""}
                  </small>
                  <div className="library-actions">
                    <button
                      disabled={!connected}
                      aria-label={`Preview ${sample.name}`}
                      onClick={() => void audition(sample.id)}
                    >
                      ♪ Preview
                    </button>
                    <select
                      aria-label={`Type for ${sample.name}`}
                      value={sample.classification.category}
                      onChange={(event) =>
                        onCorrect(sample.id, {
                          ...sample.classification,
                          category: event.target.value as CategoryId,
                          subtype: undefined,
                        })
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Subtype for ${sample.name}`}
                      value={sample.classification.subtype ?? ""}
                      onChange={(event) =>
                        onCorrect(sample.id, {
                          ...sample.classification,
                          subtype: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">Any subtype</option>
                      {SUBTYPES[sample.classification.category]?.map(
                        (subtype) => (
                          <option key={subtype}>{subtype}</option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
              ))}
              {visible.length === 100 && (
                <p>Showing the first 100 results. Search to narrow the list.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
