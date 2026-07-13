import { useEffect, useRef, useState } from "react";
import { useSamplesStore, droneFrequency, type SampleItem } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { pressSample, pressSampleWithDrone, type PressHandle, type PressDualHandle } from "../audio/playback";
import { formatSignedSemitones, formatSignedCents } from "../audio/theory";
import { PlayButton } from "./PlayButton";
import { PrecisionSlider } from "./PrecisionSlider";

/** "bass" mode transposes the preview drone+sample up this many octaves, to make a low fundamental easier to hear/tune. */
const BASS_PREVIEW_OCTAVE_SHIFT = 3;

/**
 * How long after the last slider/nudge change before the real (DSP-quality)
 * render fires in the background. What you actually hear while dragging
 * updates instantly via the native `detune` AudioParam (see playback.ts),
 * so this only paces how often the expensive resample/Rubber Band worker
 * call runs — it doesn't gate audible feedback.
 */
const COMMIT_DEBOUNCE_MS = 300;

function formatShift(semitones: number): string {
  const rounded = Math.round(semitones * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}st`;
}

/** Trim shown as signed semitones.cents, e.g. "+1.07" = up 1 semitone 7 cents. */
function formatTrim(offset: number): string {
  return `${offset > 0 ? "+" : ""}${offset.toFixed(2)}`;
}

/** One badge summarizing where this sample is in the pipeline, and what the play button will play. */
function StatusBadge({ sample, tuned }: { sample: SampleItem; tuned: boolean }) {
  if (sample.mode === "drum") return <span className="badge badge--muted">untouched</span>;
  switch (sample.status) {
    case "pending":
    case "analyzing":
      return <span className="badge badge--muted">analyzing…</span>;
    case "processing":
      return <span className="badge badge--busy">tuning…</span>;
    case "error":
      return (
        <span className="badge badge--error" title={sample.error}>
          ⚠ failed
        </span>
      );
    default:
      if (tuned && sample.pitchShiftSemitones !== undefined) {
        return (
          <span className="badge badge--done" title="Preview plays the tuned audio">
            ✓ tuned {formatShift(sample.pitchShiftSemitones)}
          </span>
        );
      }
      if (sample.pitchShiftSemitones !== undefined) {
        return (
          <span className="badge badge--pending" title="Not processed yet — preview plays the original audio">
            will shift {formatShift(sample.pitchShiftSemitones)}
          </span>
        );
      }
      return <span className="badge badge--muted">waiting for master</span>;
  }
}

/** Splits a semitone-fraction trim into whole semitones + cents, both rounded to the nearest cent. */
function splitTrim(offset: number): { semitones: number; cents: number } {
  const totalCents = Math.round(offset * 100);
  const semitones = Math.trunc(totalCents / 100);
  return { semitones, cents: totalCents - semitones * 100 };
}

export function SampleRow({ sample, number }: { sample: SampleItem; number: number }) {
  const { state, dispatch } = useSamplesStore();
  const { trimAndProcess } = useAppActions();
  const [playing, setPlaying] = useState(false);
  const [balance, setBalanceState] = useState(50); // 0 = drone only, 100 = sample only
  const activeRef = useRef<PressHandle | PressDualHandle | null>(null);
  const tuned = sample.mode !== "drum" && !!sample.processedChannelData;
  const manualOffset = sample.manualOffsetSemitones ?? 0;

  const initialSplit = splitTrim(manualOffset);
  const [semitoneVal, setSemitoneVal] = useState(initialSplit.semitones);
  const [centsVal, setCentsVal] = useState(initialSplit.cents);
  const pendingRef = useRef(false);
  const commitTimerRef = useRef<number | null>(null);

  // Reflects external changes (e.g. the silent post-render auto-correction
  // in renderSample, or the trim being reset elsewhere) into the sliders —
  // but not while the user is actively dragging/debouncing a change of
  // their own, which would fight it.
  useEffect(() => {
    if (pendingRef.current) return;
    const split = splitTrim(manualOffset);
    setSemitoneVal(split.semitones);
    setCentsVal(split.cents);
  }, [manualOffset]);

  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);
      activeRef.current?.release();
    },
    [],
  );

  // Keeps whatever's currently sounding (i.e. the button is still held) in
  // sync with the store, so the expensive render pipeline never has to be on
  // the hot path for what you hear. Two distinct cases:
  //  - A background render just landed (processedChannelData appeared) —
  //    swap to the exact final audio, detune reset to 0. Only affects the
  //    *next* press — see `setBuffer` in playback.ts.
  //  - No processed render yet (still dragging, or freshly invalidated by
  //    another trim change) — content is unchanged raw audio, so the shift
  //    is applied purely via the live `detune` AudioParam. Instant, no
  //    worker round-trip.
  useEffect(() => {
    if (sample.processedChannelData) {
      activeRef.current?.setBuffer?.(sample.processedChannelData, 0);
    } else {
      activeRef.current?.setBuffer?.(sample.channelData, (sample.pitchShiftSemitones ?? 0) * 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample.processedChannelData]);

  useEffect(() => {
    if (sample.processedChannelData) return;
    activeRef.current?.setDetuneCents?.((sample.pitchShiftSemitones ?? 0) * 100);
  }, [sample.pitchShiftSemitones, sample.processedChannelData]);

  const startPreview = () => {
    activeRef.current?.release();
    if (state.master) {
      const freq = droneFrequency(state.master, sample);
      if (freq !== null) {
        const usesProcessed = !!sample.processedChannelData;
        const data = usesProcessed ? sample.processedChannelData! : sample.channelData;
        const detuneCents = usesProcessed ? 0 : (sample.pitchShiftSemitones ?? 0) * 100;
        const isBass = sample.mode === "bass";
        activeRef.current = pressSampleWithDrone(
          sample.id,
          data,
          sample.sampleRate,
          {
            droneFrequency: freq,
            balance: balance / 100,
            detuneCents,
            previewOctaveShift: isBass ? BASS_PREVIEW_OCTAVE_SHIFT : 0,
          },
          () => {
            activeRef.current = null;
            setPlaying(false);
          },
        );
        setPlaying(true);
        return;
      }
    }
    const data = sample.processedChannelData ?? sample.channelData;
    activeRef.current = pressSample(sample.id, data, sample.sampleRate, () => {
      activeRef.current = null;
      setPlaying(false);
    });
    setPlaying(true);
  };

  const stopPreview = () => {
    activeRef.current?.release();
    activeRef.current = null;
    setPlaying(false);
  };

  const onBalanceChange = (value: number) => {
    setBalanceState(value);
    activeRef.current?.setBalance?.(value / 100);
  };

  const scheduleCommit = (semitones: number, cents: number) => {
    pendingRef.current = true;
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      trimAndProcess(sample.id, Math.round((semitones + cents / 100) * 100) / 100).finally(() => {
        pendingRef.current = false;
      });
    }, COMMIT_DEBOUNCE_MS);
  };

  const commitNow = (semitones: number, cents: number) => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    pendingRef.current = true;
    trimAndProcess(sample.id, Math.round((semitones + cents / 100) * 100) / 100).finally(() => {
      pendingRef.current = false;
    });
  };

  const onSemitoneSlider = (v: number) => {
    setSemitoneVal(v);
    scheduleCommit(v, centsVal);
  };
  const onCentsSlider = (v: number) => {
    setCentsVal(v);
    scheduleCommit(semitoneVal, v);
  };

  const trimmable = sample.mode !== "drum" && sample.pitchShiftSemitones !== undefined;

  const playButton = <PlayButton playing={playing} onPress={startPreview} onRelease={stopPreview} />;

  return (
    <div className="sample-card">
      <div className="sample-card__top">
        {state.handedness === "right" && playButton}
        <span className="sample-index">{number}</span>
        <StatusBadge sample={sample} tuned={tuned} />
        {state.handedness !== "right" && playButton}
      </div>

      <div className="sample-card__controls">
        <button
          className={`toggle-btn${sample.mode === "loop" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "loop" })}
          aria-label="Loop"
          title="Loop: Rubber Band, tuned and time-stretched to the master's BPM, exact duration and formants preserved"
        >
          🔁
        </button>
        <button
          className={`toggle-btn${sample.mode === "oneshot" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "oneshot" })}
          aria-label="One-shot"
          title="One-shot: windowed-sinc resample, tuned by pitch-shifting playback speed, keeps transients crisp"
        >
          🎹
        </button>
        <button
          className={`toggle-btn${sample.mode === "bass" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "bass" })}
          aria-label="Bass"
          title="Bass: same as one-shot, but previews 3 octaves up (sample and drone together) — easier to hear the pitch of a low-fundamental, sliding 808-style tail"
        >
          ⬆️
        </button>
        <button
          className={`toggle-btn${sample.mode === "drum" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "drum" })}
          aria-label="Drum"
          title="Drum: left completely untouched"
        >
          🥁
        </button>
      </div>

      {trimmable && (
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
              title="Fades between the reference drone and the sample — press play and use this to hear beating against the drone. Drag down to slow the scrub. Double-tap to reset."
            />
            <span className="tune-row__label">sample</span>
          </div>

          <div className="tune-row tune-row--boxed">
            <PrecisionSlider
              min={-12}
              max={12}
              step={1}
              value={semitoneVal}
              onChange={onSemitoneSlider}
              onDoubleClick={() => {
                setSemitoneVal(0);
                commitNow(0, centsVal);
              }}
              valueLabel={formatSignedSemitones}
              title="Semitone trim, ±1 octave. Drag down to slow the scrub. Double-tap to reset."
            />
          </div>

          <div className="tune-row tune-row--boxed">
            <PrecisionSlider
              min={-50}
              max={50}
              step={1}
              value={centsVal}
              onChange={onCentsSlider}
              onDoubleClick={() => {
                setCentsVal(0);
                commitNow(semitoneVal, 0);
              }}
              valueLabel={formatSignedCents}
              title="Fine cents trim. Drag down to slow the scrub. Double-tap to reset."
            />
          </div>

          <div className="tune-row tune-row--footer">
            <span className="trim-value" title="Manual trim in semitones on top of the computed shift">
              {formatTrim(semitoneVal + centsVal / 100)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
