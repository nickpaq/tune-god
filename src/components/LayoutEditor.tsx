import { useModalFocus } from "./useModalFocus";
import { useRef, useState } from "react";
import { CATEGORIES, categoryLabel, type CategoryId } from "../audio/classify";
import { layoutById, type FingerLayout } from "../audio/fingerLayouts";
import { SUBTYPES } from "../audio/sampleClassification";

export function LayoutEditor({
  layout,
  templates,
  onApply,
  onSave,
  onSelect,
  onClose,
}: {
  layout: FingerLayout;
  templates: FingerLayout[];
  onApply: (layout: FingerLayout) => void;
  onSave: (layout: FingerLayout) => void;
  onSelect: (layout: FingerLayout) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FingerLayout>(() =>
    structuredClone(layout),
  );
  const dialog = useModalFocus(onClose);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(layout.name);
  const touchDrag = useRef<{
    index: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const swap = (a: number, b: number) => {
    const slots = [...draft.slots];
    [slots[a], slots[b]] = [slots[b], slots[a]];
    setDraft({ ...draft, slots });
    setSelected(null);
  };
  const replace = (category: CategoryId, subtype?: string) => {
    if (selected === null) return;
    setDraft({
      ...draft,
      slots: draft.slots.map((slot, i) =>
        i === selected
          ? { category, subtype, label: subtype ?? categoryLabel(category) }
          : slot,
      ),
    });
  };
  const active = selected === null ? null : draft.slots[selected];
  return (
    <div className="sample-library-backdrop">
      <section
        ref={dialog}
        className="sample-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-title"
      >
        <header className="sample-library__header">
          <h2 id="layout-title">Bank A layout</h2>
          <button onClick={onClose} aria-label="Close layout editor">
            ×
          </button>
        </header>
        <p>
          Tap two pads to swap, or drag one onto another. Select a pad to
          replace its Type. Locked samples stay in place when generating.
        </p>
        <div className="layout-grid">
          {draft.slots.map((slot, i) => (
            <button
              key={i}
              data-layout-pad={i}
              draggable
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") {
                  touchDrag.current = {
                    index: i,
                    x: event.clientX,
                    y: event.clientY,
                    moved: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onPointerMove={(event) => {
                const start = touchDrag.current;
                if (
                  start &&
                  Math.hypot(event.clientX - start.x, event.clientY - start.y) >
                    8
                )
                  start.moved = true;
              }}
              onPointerUp={(event) => {
                const start = touchDrag.current;
                touchDrag.current = null;
                if (!start?.moved) return;
                suppressClick.current = true;
                requestAnimationFrame(() => { suppressClick.current = false; });
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-layout-pad]");
                if (target) swap(start.index, Number(target.dataset.layoutPad));
              }}
              onPointerCancel={() => {
                touchDrag.current = null;
              }}
              onDragStart={() => setDrag(i)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (drag !== null) swap(drag, i);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
              aria-pressed={selected === i}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (selected === null || selected === i)
                  setSelected(selected === i ? null : i);
                else swap(selected, i);
              }}
            >
              {String(i + 1).padStart(2, "0")}
              <br />
              {slot.label}
            </button>
          ))}
        </div>
        {active && (
          <div className="library-actions">
            <select
              aria-label="Pad Type"
              value={active.category}
              onChange={(event) => replace(event.target.value as CategoryId)}
            >
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Pad subtype"
              value={active.subtype ?? ""}
              onChange={(event) =>
                replace(active.category, event.target.value || undefined)
              }
            >
              <option value="">Any subtype</option>
              {SUBTYPES[active.category]?.map((subtype) => (
                <option key={subtype}>{subtype}</option>
              ))}
            </select>
          </div>
        )}
        <input
          aria-label="Template name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="library-actions">
          <button
            onClick={() => {
              const defaultLayout = structuredClone(layoutById(null));
              setDraft(defaultLayout);
              setName(defaultLayout.name);
              setSelected(null);
            }}
          >
            Reset default
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => {
              const saved = {
                ...draft,
                id: draft.id.startsWith("custom:")
                  ? draft.id
                  : `custom:${Date.now()}`,
                name: name.trim(),
              };
              onSave(saved);
              setDraft(saved);
            }}
          >
            Save template
          </button>
          <button
            onClick={() =>
              onApply({ ...draft, name: name.trim() || draft.name })
            }
          >
            Use layout
          </button>
        </div>
        {templates.map((template) => (
          <button
            className="menu__button"
            key={template.id}
            onClick={() => {
              setDraft(structuredClone(template));
              setName(template.name);
              setSelected(null);
              onSelect(template);
            }}
          >
            {template.name}
          </button>
        ))}
      </section>
    </div>
  );
}
