import type { ButtonHTMLAttributes } from "react";
import type { CategoryId } from "../audio/classify";
import { PadSymbol } from "./PadSymbol";
import { LOCK_ICON } from "./dropIcons";
/** One pad face shared by Tune, Type and SEQ; page-specific handlers never change its appearance. */
export function PadButton({
  caption,
  slot,
  symbol,
  locked,
  ...button
}: {
  caption: string;
  slot: number;
  symbol?: CategoryId;
  locked?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "slot">) {
  return (
    <button {...button}>
      <span className="pad__number">
        <span key={caption}>{caption || slot + 1}</span>
      </span>
      {symbol && <PadSymbol category={symbol} />}
      {locked && (
        <span className="pad__lock">
          <svg
            className="pixel-icon"
            viewBox={`0 0 ${LOCK_ICON[0].length} ${LOCK_ICON.length}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            {LOCK_ICON.flatMap((row, y) =>
              [...row].map((c, x) =>
                c === "#" ? (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width={1}
                    height={1}
                    fill="currentColor"
                  />
                ) : null,
              ),
            )}
          </svg>
        </span>
      )}
    </button>
  );
}
