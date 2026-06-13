/**
 * useFocusTrap — prende o foco dentro de um container enquanto `active` for true.
 * Ao ativar: move o foco para o primeiro elemento focável (ou o próprio container).
 * Tab/Shift+Tab circulam só dentro. Ao desativar/desmontar: restaura o foco ao
 * elemento que estava ativo antes. Seguro para SSR. Sem dependências externas.
 */

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("tabindex") !== "-1" && !el.hasAttribute("disabled"),
  );
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);
  const previousRef = useRef<Element | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !active) return;

    previousRef.current = document.activeElement;
    const container = containerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      const items = getFocusable(container);
      (items[0] ?? container).focus();
    });

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab") return;
      const node = containerRef.current;
      if (!node) return;
      const items = getFocusable(node);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      const prev = previousRef.current;
      if (prev instanceof HTMLElement && document.body.contains(prev)) {
        prev.focus();
      }
      previousRef.current = null;
    };
  }, [active]);

  return containerRef;
}
