import { useRef } from "react";
export interface ChopTile { id: number; label: string; color: string; }
export function ChopGrid({ chops, onTrigger }: { chops: readonly ChopTile[]; onTrigger: (chop: number) => void }) {
  const gesture = useRef<{ pointer: number; x: number; y: number; chop: number; moved: boolean } | null>(null);
  const pages = Array.from({ length: Math.ceil(chops.length / 16) }, (_, page) => chops.slice(page * 16, (page + 1) * 16));
  return <div className="s-chop-pages" aria-label="Chop pads">
    {pages.map((tiles, page) => <section className="s-chop-page" key={page} aria-label={`Chops page ${page + 1}`}>
      {tiles.map(chop => <button type="button" className="s-pad s-pad--loaded" key={chop.id} style={{ ["--c" as string]: chop.color }} aria-label={chop.label}
        onPointerDown={event => { gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, chop: chop.id, moved: false }; }}
        onPointerMove={event => { const g = gesture.current; if (g?.pointer === event.pointerId && Math.hypot(event.clientX - g.x, event.clientY - g.y) > 10) g.moved = true; }}
        onPointerUp={event => { const g = gesture.current; gesture.current = null; if (g?.pointer === event.pointerId && !g.moved) onTrigger(g.chop); }}
        onPointerCancel={() => { gesture.current = null; }}
        onClick={event => { if (event.detail === 0) onTrigger(chop.id); }}><b>{chop.label}</b></button>)}
    </section>)}
  </div>;
}
