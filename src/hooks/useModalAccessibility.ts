import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]',
].join(',');

function firstSummary(details: Element): Element | undefined {
  return Array.from(details.children).find(
    (child) => child.tagName === 'SUMMARY',
  );
}

function isTabbable(element: HTMLElement): boolean {
  if (
    element.tabIndex < 0 ||
    element.matches(':disabled, input[type="hidden"]')
  ) {
    return false;
  }

  // Only the first direct summary gets a native tab stop. An explicit tabindex
  // can still make another summary focusable, like any other element.
  if (
    element.tagName === 'SUMMARY' &&
    !element.hasAttribute('tabindex') &&
    (element.parentElement?.tagName !== 'DETAILS' ||
      firstSummary(element.parentElement) !== element)
  ) {
    return false;
  }

  const visibility = window.getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;

  for (
    let ancestor: HTMLElement | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (ancestor.hasAttribute('hidden') || ancestor.hasAttribute('inert'))
      return false;
    const style = window.getComputedStyle(ancestor);
    if (style.display === 'none' || style.contentVisibility === 'hidden')
      return false;

    if (ancestor.tagName === 'DETAILS' && !ancestor.hasAttribute('open')) {
      const summary = firstSummary(ancestor);
      if (!summary?.contains(element)) return false;
    }
  }
  return true;
}

function tabStops(dialog: HTMLElement | null): HTMLElement[] {
  return Array.from(
    dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
  )
    .filter(isTabbable)
    .sort((left, right) => {
      // Positive tabindex values precede the natural (zero) tab order.
      const leftOrder = left.tabIndex > 0 ? left.tabIndex : Infinity;
      const rightOrder = right.tabIndex > 0 ? right.tabIndex : Infinity;
      return leftOrder === rightOrder ? 0 : leftOrder - rightOrder;
    });
}

export function useModalAccessibility<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  canClose = true,
): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
  }, [canClose, onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const addedTabIndex = dialog !== null && !dialog.hasAttribute('tabindex');
    if (addedTabIndex) dialog.setAttribute('tabindex', '-1');

    const frame = window.requestAnimationFrame(() => {
      const focusables = tabStops(dialogRef.current);
      const preferred = focusables.find((element) =>
        element.hasAttribute('autofocus'),
      );
      (preferred ?? focusables[0] ?? dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      // Recalculate after disclosure, disabling, or visibility changes.
      const focusables = tabStops(dialogRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!first || !last) return;

      const active = document.activeElement;
      if (!focusables.some((element) => element === active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (addedTabIndex) dialog.removeAttribute('tabindex');
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  return dialogRef;
}
