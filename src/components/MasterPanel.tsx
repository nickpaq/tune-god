import { useCallback, useEffect, useState } from "react";
import { Dropzone } from "./Dropzone";
import { PlayButton } from "./PlayButton";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { NOTE_NAMES, formatCents } from "../audio/theory";
import { togglePlayback } from "../audio/playback";
import { stripExtension } from "../audio/filename";
import { isKoalaFile } from "../audio/koalaProject";
import { clipboardReadSupported, findKoalaFileInFileList, readKoalaFileFromClipboard } from "../audio/clipboardImport";

export function MasterPanel() {
  const { state, dispatch } = useSamplesStore();
  const { loadMaster, loadKoalaProject } = useAppActions();
  const { master } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setError(null);
      try {
        if (isKoalaFile(files[0])) {
          await loadKoalaProject(files[0]);
        } else {
          await loadMaster(files[0]);
        }
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setBusy(false);
      }
    },
    [loadKoalaProject, loadMaster],
  );

  const handlePasteClick = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await readKoalaFileFromClipboard();
      await loadKoalaProject(file);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }, [loadKoalaProject]);

  // Native Cmd/Ctrl+V (or iOS's Edit menu paste) — a fallback alongside the
  // explicit button, since the Async Clipboard API's permission/type support
  // varies a lot across browsers.
  useEffect(() => {
    if (master) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      findKoalaFileInFileList(files).then((file) => {
        if (file) handleFiles([file]);
      });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [master, handleFiles]);

  if (!master) {
    return (
      <section className="panel">
        <Dropzone
          label="Drop your koala project file here to tune"
          allowKoala
          onFiles={handleFiles}
        />
        {clipboardReadSupported && (
          <button className="link-btn" onClick={handlePasteClick} disabled={busy}>
            📋 paste project from clipboard
          </button>
        )}
        {busy && <p className="muted">Analyzing…</p>}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const a = master.analysis;
  const tonic = master.overrideTonicPitchClass ?? a?.tonicPitchClass;
  const scale = master.overrideScale ?? a?.scale;

  return (
    <section className="panel">
      <div className="master-summary">
        <div>
          <PlayButton
            playing={playing}
            onClick={() =>
              setPlaying(togglePlayback("master", master.channelData, master.sampleRate, () => setPlaying(false)))
            }
          />
          <strong>{stripExtension(master.name)}</strong>
          <button className="link-btn" onClick={() => dispatch({ type: "CLEAR_MASTER" })}>
            ✕ clear
          </button>
        </div>
        {master.status === "analyzing" && <p className="muted">Analyzing…</p>}
        {a && (
          <div className="master-detail">
            <label>
              Key
              <select
                value={tonic}
                onChange={(e) =>
                  dispatch({
                    type: "SET_MASTER_OVERRIDE",
                    tonicPitchClass: Number(e.target.value),
                    scale,
                  })
                }
              >
                {NOTE_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scale
              <select
                value={scale}
                onChange={(e) =>
                  dispatch({
                    type: "SET_MASTER_OVERRIDE",
                    tonicPitchClass: tonic,
                    scale: e.target.value as "major" | "minor",
                  })
                }
              >
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </label>
            <span className="badge">{a.bpm.toFixed(1)} BPM</span>
            <span className="badge">tuning {formatCents(a.tuningOffsetCents)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
