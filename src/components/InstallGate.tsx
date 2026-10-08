import { ACAPELLA_ICON, DRUM_ICON, KEYS_ICON } from "./dropIcons";
import "./InstallGate.css";

/** The Chopper: a waveform cut by slice lines, 20 x 20 like the other start-screen icons. */
const CHOPPER_ICON = [
  "....#.....#.....#...",
  "....#.....#.....#...",
  "....#.....#.#...#...",
  "....#..#..#.#...#.#.",
  "..#.#..#..#.#.#.#.#.",
  "..#.#.##..#.#.#.#.#.",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "#.#.#.##.##.#.#.#.##",
  "..#.#.##..#.#.#.#.#.",
  "..#.#..#..#.#.#.#.#.",
  "....#..#..#.#...#.#.",
  "....#.....#.#...#...",
  "....#.....#.....#...",
  "....#.....#.....#...",
];

function Icon({ rows }: { rows: string[] }) {
  return (
    <svg className="gate__icon" viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

const FEATURES = [
  { icon: DRUM_ICON, name: "Four banks", note: "Drums, loops and one-shots from your folders" },
  { icon: KEYS_ICON, name: "In key", note: "Every melodic pad tuned to your song" },
  { icon: CHOPPER_ICON, name: "Chopper", note: "Up to 127 slices on one Koala pad" },
  { icon: ACAPELLA_ICON, name: "Acapella", note: "A vocal stem cut into 16 section pads" },
];

/** Shown instead of the app when it is opened in a browser tab rather than from the Home Screen. */
export function InstallGate() {
  return (
    <main className="gate">
      <section className="gate__card" aria-label="tunegod">
        <div className="gate__kick">
          <span className="gate__led" />
          Koala Sampler companion
        </div>
        <h1 className="gate__title">
          Drop a folder.
          <br />
          Get a kit, in key.
        </h1>
        <ul className="gate__grid">
          {FEATURES.map((f) => (
            <li key={f.name} className="gate__tile">
              <Icon rows={f.icon} />
              <span className="gate__name">{f.name}</span>
              <span className="gate__note">{f.note}</span>
            </li>
          ))}
        </ul>
        <div className="gate__chips">
          <span>Offline</span>
          <span>Nothing uploaded</span>
          <span>Exports .koala</span>
        </div>
      </section>
      <ol className="gate__steps">
        <li>
          <span>
            Tap <b>Share</b> in Safari
          </span>
        </li>
        <li>
          <span>
            Choose <b>Add to Home Screen</b>
          </span>
        </li>
        <li>
          <span>
            Open it from your <b>Home Screen</b>
          </span>
        </li>
      </ol>
    </main>
  );
}
