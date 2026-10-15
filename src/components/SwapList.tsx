import { useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext } from "../audio/decode";
import { parseSoundNames } from "../audio/soundName";
import type { Pad } from "./PadPanel";
import { useSoundPreview } from "./useSoundPreview";

const PlayGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2 1v6l5-3z" />
  </svg>
);
const StopGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2 2h4v4H2z" />
  </svg>
);
const StarGlyph = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M4 .6l1 2.3 2.5.2-1.9 1.6.6 2.4L4 5.8 1.8 7.1l.6-2.4L.5 3.1 3 2.9z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" />
  </svg>
);
const SwapGlyph = () => (
  <svg viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1 3h5V1l2 2.5L6 6V4H1zM7 5H2v2L0 4.5 2 2" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
  </svg>
);

/**
 * Hot-swap list: the sounds that can take the tapped pad's place, drawn on the OLED like the other screens (no colour
 * coding), one slim row each with the sound's name, a play button and a swap button. The list scrolls on its own.
 */
/** Scroll distances (px) for the sliding bars: down this far hides them, up this far brings them back. */
const HIDE_AFTER = 32;
/** Rows added per step of the infinite scroll, and how close (px) to the end of the list the next step starts. */
const BATCH = 50;
const LOAD_AHEAD = 400;
const SHOW_AFTER = 16;

export function SwapList({
  slotLabel,
  candidates,
  audioOf,
  readAudio,
  busy = false,
  onError,
  nameOf,
  onSwap,
  onFavorite,
}: {
  /** Identifies the tapped slot; the list starts from the top again when it changes. */
  slotLabel: string;
  candidates: Pad[];
  audioOf: (pad: Pad) => Float32Array[];
  readAudio?: (pad: Pad) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
  busy?: boolean;
  onError?: (message: string) => void;
  /** How a sound is named in the list. */
  nameOf: (pad: Pad) => string;
  onSwap: (pad: Pad) => void;
  onFavorite: (pad: Pad, favorite: boolean) => void | Promise<void>;
}) {
  const preview = useSoundPreview();
  const rows = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  // The list grows as it is scrolled: BATCH rows at first, BATCH more each time the end comes within LOAD_AHEAD px (there are no pages).
  const [shown, setShown] = useState(BATCH);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  // The title bar, the search field and the count bar hide while the list is scrolled down and come back on scrolling up (the usual collapsing-header pattern).
  const [chromeHidden, setChromeHidden] = useState(false);
  const hiddenNow = useRef(false);
  const lastTop = useRef(0);
  const travel = useRef(0);
  // Bars returning because the list was scrolled up wait a moment (0.3 s, in the CSS); reaching the top or a new search shows them at once.
  const [reveal, setReveal] = useState<"instant" | "delayed">("instant");
  const setChrome = (hide: boolean, delayed = false) => {
    hiddenNow.current = hide;
    travel.current = 0;
    setReveal(delayed ? "delayed" : "instant");
    setChromeHidden(hide);
  };
  const onScroll = () => {
    const el = rows.current;
    if (!el) return;
    const top = el.scrollTop;
    if (el.scrollHeight - top - el.clientHeight < LOAD_AHEAD) setShown(n => (n < filtered.length ? n + BATCH : n));
    const delta = top - lastTop.current;
    lastTop.current = top;
    if (delta === 0) return;
    if (top <= 4) { if (hiddenNow.current) setChrome(false); return; }
    // Distance travelled in one direction; turning round starts it again. Down hides after HIDE_AFTER px, up shows after SHOW_AFTER px.
    travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
    if (!hiddenNow.current && travel.current > HIDE_AFTER) setChrome(true);
    else if (hiddenNow.current && travel.current < -SHOW_AFTER) setChrome(false, true);
  };
  // A new pad or a new search starts at the top with the bars showing.
  useEffect(() => { lastTop.current = 0; if (hiddenNow.current) setChrome(false); }, [slotLabel, query]);
  const filtered = useMemo(() => candidates.filter(pad => `${pad.name} ${pad.sourcePath ?? ""}`.toLowerCase().includes(query.toLowerCase())), [candidates, query]);
  const visible = filtered.slice(0, shown);
  // The sound's own name, with the pack abbreviation, tempo, key and type words taken out (shown dimmed after it). Sounds of one folder share prefixes.
  const first = candidates[0];
  const parts = useMemo(
    () => parseSoundNames(candidates, (pad) => pad.name, (pad) => (pad.sourcePath ? pad.sourcePath.replace(/[^/]*$/, "") : `#${pad.origIndex}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates.length, first?.libraryId, first?.origIndex, slotLabel],
  );
  const audition = async (pad: Pad) => {
    if (loading || busy) return;
    const token = ++request.current;
    if (preview.playing === pad.origIndex) return preview.stop();
    void getAudioContext().resume();
    preview.stop();
    setLoading(true);
    try {
      const audio = readAudio ? await readAudio(pad) : { channelData: audioOf(pad), sampleRate: pad.sampleRate };
      if (token === request.current) preview.toggle(pad.origIndex, audio.channelData, audio.sampleRate);
    } catch (error) { if (token === request.current) onError?.(error instanceof Error ? error.message : "Could not preview this sound."); }
    finally { if (token === request.current) setLoading(false); }
  };
  // A different pad starts its list from the top, and stops any sound still playing.
  useEffect(() => {
    if (rows.current) rows.current.scrollTop = 0;
    preview.stop();
    request.current++;
    setLoading(false);
    setQuery("");
    setShown(BATCH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotLabel]);
  useEffect(() => () => { request.current++; }, []);
  return (
    <div className="swap-list" data-chrome={chromeHidden ? "hidden" : "shown"} data-reveal={reveal}>
      <input className="swap-list__search" aria-label="Search hot-swap sounds" placeholder="Search sounds" value={query} onChange={event => { setQuery(event.target.value); setShown(BATCH); if (rows.current) rows.current.scrollTop = 0; }} />
      <div className="swap-list__rows" ref={rows} onScroll={onScroll}>
        {filtered.length === 0 && <div className="swap-list__empty">No other sounds to swap in</div>}
        {visible.map((pad) => {
          const name = nameOf(pad);
          const part = parts.get(pad);
          const shownName = part?.name || name;
          const meta = [part?.bpm ? `${part.bpm}` : "", part?.key ?? ""].filter(Boolean).join(" ");
          return (
          <div key={pad.libraryId ?? pad.origIndex} className="swap-row">
              <span className="swap-row__name" title={pad.sourcePath ?? pad.name}>
                {shownName}
              </span>
              {meta && <span className="swap-row__meta">{meta}</span>}
              <button
                className={`swap-row__btn swap-row__favorite${pad.favorite ? " is-favorite" : ""}`}
                disabled={loading || busy}
                onClick={async () => {
                  setLoading(true);
                  try { await onFavorite(pad, !pad.favorite); }
                  catch (error) { onError?.(error instanceof Error ? error.message : "Could not save this favorite."); }
                  finally { setLoading(false); }
                }}
                aria-label={`${pad.favorite ? "Remove" : "Add"} ${name} ${pad.favorite ? "from" : "to"} favorites`}
                title={pad.favorite ? "Remove favorite" : "Favorite: keeps this one sound on this device and puts it first in hot swap"}
              >
                <StarGlyph filled={!!pad.favorite} />
              </button>
              <button
                className={`swap-row__btn${preview.playing === pad.origIndex ? " swap-row__btn--on" : ""}`}
                disabled={loading || busy}
                onClick={() => void audition(pad)}
                aria-label={`${preview.playing === pad.origIndex ? "Stop" : "Play"} ${name}`}
              >
                {preview.playing === pad.origIndex ? <StopGlyph /> : <PlayGlyph />}
              </button>
              <button
                className="swap-row__btn"
                disabled={loading || busy}
                onClick={() => {
                  request.current++;
                  preview.stop();
                  onSwap(pad);
                }}
                aria-label={`Swap in ${name}`}
              >
                <SwapGlyph />
              </button>
            </div>
          );
        })}
      </div>
      <div className="swap-list__foot">
        <span>{loading || busy ? "Loading…" : `${filtered.length.toLocaleString()} sounds`}</span>
      </div>
    </div>
  );
}
