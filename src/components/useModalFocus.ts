import { useEffect, useRef } from "react";

/** Keep keyboard navigation inside a modal and return focus to its opener. */
export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", key);
    return () => {
      dialog?.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
