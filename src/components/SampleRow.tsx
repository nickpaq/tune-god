import { useEffect, useRef, useState } from "react";
import { useSamplesStore, droneFrequency, type SampleItem } from "../state/samplesStore";
import { useAppActions } from "../state/useAppActions";
import { togglePlayback, playTone, type ToneHandle } from "../audio/playback";
import { stripExtension } from "../audio/filename";
import { PlayButton } from "./PlayButton";

/** Below this measured confidence the verify result is noise (e.g. a texture with no clear pitch). */
const VERIFY_MIN_CONFIDENCE = 0.35;
/** |error| within this many cents counts as in tune (≈ the audibility threshold). */
const VERIFY_OK_CENTS = 10;

function formatShift(semitones: number): string {
  const rounded = Math.round(semitones * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}st`;
}

function formatTrim(offset: number): string {
  const st = Math.trunc(offset);
  const cents = Math.round((offset - st) * 100);
  const parts: string[] = [];
  if (st !== 0) parts.push(`${st > 0 ? "+" : ""}${st}st`);
  if (cents !== 0) parts.push(`${cents > 0 ? "+" : ""}${cents}c`);
  return parts.length ? parts.join(" ") : "0";
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

/**
 * Post-render verification result: the rendered audio's measured cents
 * error vs the target, with a one-tap fix that folds the error into the
 * manual trim and re-renders.
 */
function VerifyChip({ sample, onFix }: { sample: SampleItem; onFix: (cents: number) => void }) {
  if (sample.mode === "drum" || sample.status !== "done" || !sample.processedChannelData) return null;
  if (sample.verifiedConfidence === undefined) return null;
  if (sample.verifiedConfidence < VERIFY_MIN_CONFIDENCE || sample.verifiedOffsetCents === undefined) {
    return (
      <span className="badge badge--muted" title="Couldn't reliably re-detect a pitch in the rendered audio">
        unverified
      </span>
    );
  }
  const cents = Math.round(sample.verifiedOffsetCents);
  if (Math.abs(cents) <= VERIFY_OK_CENTS) {
    return (
      <span className="badge badge--done" title="Rendered audio re-measured within the audibility threshold of the target">
        ✓ {cents === 0 ? "on pitch" : `${cents > 0 ? "+" : ""}${cents}c`}
      </span>
    );
  }
  return (
    <>
      <span className="badge badge--error" title="Rendered audio re-measured off-target">
        ⚠ {cents > 0 ? "+" : ""}
        {cents}c off
      </span>
      <button className="link-btn" onClick={() => onFix(sample.verifiedOffsetCents!)} title="Fold the measured error into this sample's trim and re-render">
        fix
      </button>
    </>
  );
}

export function SampleRow({ sample }: { sample: SampleItem }) {
  const { state, dispatch } = useSamplesStore();
  const { trimAndProcess } = useAppActions();
  const [playing, setPlaying] = useState(false);
  const [droning, setDroning] = useState(false);
  const droneRef = useRef<ToneHandle | null>(null);
  const tuned = sample.mode !== "drum" && !!sample.processedChannelData;
  const manualOffset = sample.manualOffsetSemitones ?? 0;

  useEffect(
    () => () => {
      droneRef.current?.stop();
    },
    [],
  );

  const preview = () => {
    const data = tuned ? sample.processedChannelData! : sample.channelData;
    setPlaying(togglePlayback(sample.id, data, sample.sampleRate, () => setPlaying(false)));
  };

  const toggleDrone = () => {
    if (droning) {
      droneRef.current?.stop();
      droneRef.current = null;
      setDroning(false);
      return;
    }
    const freq = state.master ? droneFrequency(state.master, sample, state.tuningMode, state.a4Reference) : null;
    if (freq === null) return;
    droneRef.current = playTone(freq, 0.2);
    setDroning(true);
  };

  const nudge = (deltaSemitones: number) => {
    const next = Math.round((manualOffset + deltaSemitones) * 100) / 100;
    trimAndProcess(sample.id, next);
  };

  const applyFix = (cents: number) => {
    const next = Math.round((manualOffset - cents / 100) * 100) / 100;
    trimAndProcess(sample.id, next);
  };

  const trimmable = sample.mode !== "drum" && sample.pitchShiftSemitones !== undefined;

  return (
    <div className="sample-card">
      <div className="sample-card__top">
        <span className="sample-name" title={sample.name}>
          {stripExtension(sample.name)}
        </span>
        <StatusBadge sample={sample} tuned={tuned} />
        <VerifyChip sample={sample} onFix={applyFix} />
        <PlayButton playing={playing} onClick={preview} />
      </div>

      <div className="sample-card__controls">
        <button
          className={`toggle-btn${sample.mode === "loop" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "loop" })}
          title="Rubber Band: tuned and time-stretched to the master's BPM, exact duration and formants preserved"
        >
          Loop
        </button>
        <button
          className={`toggle-btn${sample.mode === "oneshot" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "oneshot" })}
          title="Windowed-sinc resample: tuned by pitch-shifting playback speed, keeps transients crisp"
        >
          One-shot
        </button>
        <button
          className={`toggle-btn${sample.mode === "drum" ? " toggle-btn--active" : ""}`}
          onClick={() => dispatch({ type: "SET_SAMPLE_MODE", id: sample.id, mode: "drum" })}
          title="Left completely untouched"
        >
          Drum
        </button>
      </div>

      {trimmable && (
        <div className="sample-card__trim">
          <button className="trim-btn" onClick={() => nudge(-1)} title="Trim down a semitone and re-render">
            −st
          </button>
          <button className="trim-btn" onClick={() => nudge(-0.05)} title="Trim down 5 cents and re-render">
            −5c
          </button>
          <span className="trim-value" title="Manual trim on top of the computed shift">
            {formatTrim(manualOffset)}
          </span>
          <button className="trim-btn" onClick={() => nudge(0.05)} title="Trim up 5 cents and re-render">
            +5c
          </button>
          <button className="trim-btn" onClick={() => nudge(1)} title="Trim up a semitone and re-render">
            +st
          </button>
          {manualOffset !== 0 && (
            <button className="link-btn" onClick={() => trimAndProcess(sample.id, 0)} title="Clear the manual trim and re-render">
              ↺
            </button>
          )}
          <button
            className={`toggle-btn trim-drone${droning ? " toggle-btn--active" : ""}`}
            onClick={toggleDrone}
            title="Sustained sine at this sample's exact target pitch — play the sample over it and trim until the beating disappears"
          >
            drone
          </button>
        </div>
      )}
    </div>
  );
}
