import type { CategoryId } from "../audio/classify";

const LOOP = '<path d="M20.5 12a8.5 8.5 0 0 1-14.6 6M3.5 12a8.5 8.5 0 0 1 14.6-6"/><path d="M18.4 2.5V6.4h-3.9M5.6 21.5v-3.9h3.9"/>';
const SHAKER = '<ellipse cx="12" cy="7.5" rx="4.8" ry="6"/><path d="M8.4 9.2c2.4 1.2 4.8 1.2 7.2 0"/><path d="M12 13.5v8"/><path d="M10.6 21.5h2.8"/>';

/** One 24-unit line drawing per sound type, in the same order as the sound type list. Static markup, drawn with currentColor. */
const SYMBOLS: Record<CategoryId, string> = {
  kick: '<circle cx="12" cy="11" r="8.5"/><circle cx="12" cy="11" r="5"/><circle cx="12" cy="11" r="1.3"/><path d="M6.5 18.2L4.8 22M17.5 18.2L19.2 22"/>',
  snare: '<ellipse cx="12" cy="7" rx="8.5" ry="3"/><path d="M3.5 7v9.5c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V7"/><path d="M7 10.4v8.4M12 10.6v8.9M17 10.4v8.4"/>',
  clap: '<path d="M7.5 14V7.5a1.3 1.3 0 0 1 2.6 0V4.8a1.3 1.3 0 0 1 2.6 0V5.2a1.3 1.3 0 0 1 2.6 0V7.5a1.3 1.3 0 0 1 2.6 0V15c0 3.9-2.4 6.5-5.9 6.5-2.5 0-4-1.2-5.4-3.3l-2.8-4a1.3 1.3 0 0 1 2.2-1.4l1.5 1.9z"/><path d="M10.1 7.5V12M12.7 5.2V12M15.3 7.5V12"/>',
  closedHat: '<path d="M12 2.5v19"/><path d="M2.5 9.8c3.2-3.4 15.8-3.4 19 0-3.2 3.4-15.8 3.4-19 0z"/>',
  openHat: '<path d="M12 2v20"/><path d="M3 7c3-3 15-3 18 0-3 3-15 3-18 0z"/><path d="M3 15c3-3 15-3 18 0-3 3-15 3-18 0z"/>',
  cymbal: '<g transform="rotate(-12 12 8.5)"><path d="M1.5 8.5c4-4.2 17-4.2 21 0-4 4.2-17 4.2-21 0z"/><ellipse cx="12" cy="8.5" rx="2.2" ry="1"/></g><path d="M12 13.4V21M7.5 21.5h9"/>',
  vox: '<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M8.5 7.5h7M8.5 10.5h7M5 11.5a7 7 0 0 0 14 0M12 18.5v3M8.5 21.5h7"/>',
  perc: `<g transform="rotate(-30 12 12)">${SHAKER}</g>`,
  fx: '<path d="M11 3c.7 5.4 2.6 7.3 8 8-5.4.7-7.3 2.6-8 8-.7-5.4-2.6-7.3-8-8 5.4-.7 7.3-2.6 8-8z"/><path d="M19 2.5c.2 1.8.8 2.4 2.5 2.5-1.7.2-2.3.8-2.5 2.5-.2-1.7-.8-2.3-2.5-2.5 1.7-.1 2.3-.7 2.5-2.5z"/>',
  bass: '<path d="M2 12c1.7-8.5 4-8.5 5.7 0s4 8.5 5.7 0 4-8.5 5.7 0c.5 2.5 1.2 4 3 4.5"/><path d="M2 20.5h20" opacity=".5"/>',
  melodic: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7.2 12.5V19M12 12.5V19M16.8 12.5V19"/><path d="M5.2 5h3.8v8H5.2zM10.1 5h3.8v8h-3.8zM15 5h3.8v8H15z"/>',
  drumLoop: `${LOOP}<ellipse cx="12" cy="10.6" rx="3.8" ry="1.5"/><path d="M8.2 10.6v3.8c0 1 1.7 1.6 3.8 1.6s3.8-.6 3.8-1.6v-3.8"/>`,
  percLoop: `${LOOP}<g transform="translate(12 12) scale(.5) rotate(-30) translate(-12 -12)">${SHAKER}</g>`,
  melodicLoop: `${LOOP}<rect x="7.2" y="9" width="9.6" height="6.4" rx="1.2"/><path d="M10.4 12v3.4M13.6 12v3.4"/>`,
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="3"/>',
};

/** The grey symbol for a sound type, pressed into the pad. Sized and coloured by CSS (.pad__symbol). */
export function PadSymbol({ category }: { category: CategoryId }) {
  return <svg className="pad__symbol" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SYMBOLS[category] }} />;
}
