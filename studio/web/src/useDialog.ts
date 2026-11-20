import {useEffect, useRef, type RefObject} from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
function isFocusable(item: HTMLElement) {
  if (item === document.activeElement) return true;
  if (item.tagName !== 'SUMMARY' && item.closest('details:not([open])')) return false;
  const style = getComputedStyle(item);
  return style.display !== 'none' && style.visibility !== 'hidden' && item.getClientRects().length > 0;
}

/** Atrapa el foco dentro del diálogo, bloquea el scroll de fondo y cierra con Escape. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = node.querySelector<HTMLElement>('[data-autofocus]') || node.querySelector<HTMLElement>(FOCUSABLE) || node;
    first.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isFocusable);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index === -1) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      } else if (event.shiftKey && index === 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && index === items.length - 1) {
        event.preventDefault();
        items[0].focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [ref]);
}
