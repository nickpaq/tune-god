import { useCallback, useEffect, useRef, useState } from "react";
import { Dropzone } from "./Dropzone";
import { PlayButton } from "./PlayButton";
import { MasterGrid } from "./MasterGrid";
import { PrecisionSlider } from "./PrecisionSlider";
import { ReferenceTone } from "./ReferenceTone";
import { useSamplesStore } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { NOTE_NAMES, formatSignedSemitones, formatSignedCents } from "../audio/theory";
import { playMasterLoop, playTone, type MasterSessionHandle, type ToneHandle } from "../audio/playback";
import { stripExtension } from "../audio/filename";
import { isKoalaFile } from "../audio/koalaProject";
import { findKoalaFileInFileList } from "../audio/clipboardImport";

/** Trim shown as signed semitones.cents, e.g. "+1.07" = up 1 semitone 7 cents. */
function formatTrim(offset: number): string {
  return `${offset > 0 ? "+" : ""}${offset.toFixed(2)}`;
}

export function MasterPanel() {
  const { state, dispatch } = useSamplesStore();
  const { loadMaster, loadKoalaProject } = useAppActions();
  const { master } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [balance, setBalance] = useState(50); // 0 = drone only, 100 = master only
  const [semitoneVal, setSemitoneVal] = useState(0);
  const [centsVal, setCentsVal] = useState(0);
  const sessionRef = useRef<MasterSessionHandle | null>(null);
  /** Standalone drone note, used when the keyboard is pressed while the master loop isn't playing. */
  const standaloneToneRef = useRef<ToneHandle | null>(null);

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

  useEffect(
    () => () => {
      sessionRef.current?.stop();
      standaloneToneRef.current?.stop();
    },
    [],
  );

  if (!master) {
    return (
      <section className="panel">
        <Dropzone
          label="Drop your koala project file here to tune"
          allowKoala
          onFiles={handleFiles}
        />
        {busy && <p className="muted">Analyzing…</p>}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const { tonicPitchClass: tonic, scale, bpm, tonicFrequencyHz } = master;
  const trimSemitones = semitoneVal + centsVal / 100;
  const hasKey = tonic !== undefined && scale !== undefined && tonicFrequencyHz !== undefined;

  // Always restarts from the beginning and loops until stopped — the drone
  // is never auto-triggered here, since it's played manually via the
  // keyboard grid below (see startDroneNote/stopDroneNote).
  const preview = () => {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
      setPlaying(false);
      return;
    }
    sessionRef.current = playMasterLoop(
      "master",
      master.channelData,
      master.sampleRate,
      { balance: balance / 100 },
      () => {
        sessionRef.current = null;
        setPlaying(false);
      },
    );
    setPlaying(true);
  };

  const onBalanceChange = (value: number) => {
    setBalance(value);
    sessionRef.current?.setBalance(value / 100);
  };

  // Keyboard grid pads: sound alongside the master loop (crossfaded via the
  // balance slider) when it's playing, or standalone otherwise.
  const startDroneNote = (frequency: number) => {
    if (sessionRef.current) {
      sessionRef.current.startDrone(frequency);
      return;
    }
    standaloneToneRef.current?.stop();
    standaloneToneRef.current = playTone(frequency, 0.35);
  };
  const stopDroneNote = () => {
    if (sessionRef.current) {
      sessionRef.current.stopDrone();
      return;
    }
    standaloneToneRef.current?.stop();
    standaloneToneRef.current = null;
  };

  return (
    <section className="panel">
      <div className="master-summary">
        <div className="master-summary__header">
          {state.handedness === "right" && <PlayButton playing={playing} onClick={preview} />}
          <strong>{stripExtension(master.name)}</strong>
          <button className="link-btn" onClick={() => dispatch({ type: "CLEAR_MASTER" })}>
            ✕ clear
          </button>
          {state.handedness !== "right" && <PlayButton playing={playing} onClick={preview} />}
        </div>

        <div className="master-detail">
          <label>
            Key
            <select
              value={tonic ?? ""}
              onChange={(e) =>
                dispatch({
                  type: "SET_MASTER_KEY",
                  tonicPitchClass: Number(e.target.value),
                  scale,
                  bpm,
                })
              }
            >
              <option value="" disabled>
                — choose by ear —
              </option>
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
              value={scale ?? ""}
              onChange={(e) =>
                dispatch({
                  type: "SET_MASTER_KEY",
                  tonicPitchClass: tonic,
                  scale: e.target.value as "major" | "minor",
                  bpm,
                })
              }
            >
              <option value="" disabled>
                — choose by ear —
              </option>
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
          </label>
          <label>
            BPM
            <input
              type="number"
              min={1}
              step={0.1}
              value={bpm ?? ""}
              onChange={(e) =>
                dispatch({
                  type: "SET_MASTER_KEY",
                  tonicPitchClass: tonic,
                  scale,
                  bpm: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </label>
        </div>

        {hasKey && (
          <>
            <ReferenceTone />

            <div className="tune-stack">
              <div className="tune-row tune-row--boxed tune-row--balance">
                <span className="tune-row__label">drone</span>
                <PrecisionSlider
                  min={0}
                  max={100}
                  step={1}
                  value={balance}
                  onChange={onBalanceChange}
                  onDoubleClick={() => onBalanceChange(50)}
                  title="Fades between the reference drone and the master loop — press play and use this to hear whether the chosen key actually matches. Drag down to slow the scrub. Double-tap to reset."
                />
                <span className="tune-row__label">master</span>
              </div>

              <div className="tune-row tune-row--boxed">
                <PrecisionSlider
                  min={-12}
                  max={12}
                  step={1}
                  value={semitoneVal}
                  onChange={setSemitoneVal}
                  onDoubleClick={() => setSemitoneVal(0)}
                  valueLabel={formatSignedSemitones}
                  title="Nudges the comparison drone/grid only — diagnostic, never applied to the master's own audio. Drag down to slow the scrub. Double-tap to reset."
                />
              </div>

              <div className="tune-row tune-row--boxed">
                <PrecisionSlider
                  min={-50}
                  max={50}
                  step={1}
                  value={centsVal}
                  onChange={setCentsVal}
                  onDoubleClick={() => setCentsVal(0)}
                  valueLabel={formatSignedCents}
                  title="Fine cents nudge on the comparison drone/grid. Drag down to slow the scrub. Double-tap to reset."
                />
              </div>

              <div className="tune-row tune-row--footer">
                <span
                  className="trim-value"
                  title="Diagnostic offset applied to the drone/grid tones only — if this needs to be large to match the master, the chosen key or tonic frequency is probably wrong"
                >
                  {formatTrim(trimSemitones)}
                </span>
              </div>
            </div>

            <MasterGrid
              tonicFrequencyHz={tonicFrequencyHz!}
              tonicPitchClass={tonic!}
              scale={scale!}
              trimSemitones={trimSemitones}
              onPressNote={startDroneNote}
              onReleaseNote={stopDroneNote}
            />
          </>
        )}
      </div>
    </section>
  );
}
