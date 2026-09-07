// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalAccessibility } from './useModalAccessibility';

function Dialog({
  children,
  canClose = true,
  onClose,
}: {
  children: ReactNode;
  canClose?: boolean;
  onClose: () => void;
}) {
  const ref = useModalAccessibility<HTMLDivElement>(true, onClose, canClose);
  return (
    <div ref={ref} role="dialog" aria-label="確認">
      {children}
    </div>
  );
}

function tab(shiftKey = false) {
  return fireEvent.keyDown(document.activeElement ?? document, {
    key: 'Tab',
    shiftKey,
  });
}

function nextFrame() {
  act(() => vi.advanceTimersToNextFrame());
}

describe('useModalAccessibility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('focuses inside, wraps both directions, closes with Escape, and restores focus and scroll', () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>開く</button>
          {open && (
            <Dialog onClose={() => setOpen(false)}>
              <button>最初</button>
              <button>最後</button>
            </Dialog>
          )}
        </>
      );
    }
    document.body.style.overflow = 'auto';
    render(<Example />);
    const opener = screen.getByRole('button', { name: '開く' });
    opener.focus();
    fireEvent.click(opener);
    nextFrame();
    expect(screen.getByRole('button', { name: '最初' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(tab(true)).toBe(false);
    expect(screen.getByRole('button', { name: '最後' })).toHaveFocus();
    expect(tab()).toBe(false);
    expect(screen.getByRole('button', { name: '最初' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('includes the first summary while excluding closed details contents and other summaries', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button>最初</button>
        <details>
          <summary>根拠の詳細</summary>
          <button>根拠を開く</button>
          <summary>追加の見出し</summary>
        </details>
      </Dialog>,
    );
    nextFrame();
    tab(true);
    expect(screen.getByText('根拠の詳細')).toHaveFocus();
    tab();
    expect(screen.getByRole('button', { name: '最初' })).toHaveFocus();
    const details = screen.getByText('根拠の詳細').closest('details')!;
    details.open = true;
    tab(true);
    expect(screen.getByRole('button', { name: '根拠を開く' })).toHaveFocus();
    tab();
    expect(screen.getByRole('button', { name: '最初' })).toHaveFocus();
    details.open = false;
    tab(true);
    expect(screen.getByText('根拠の詳細')).toHaveFocus();
  });

  it('does not let nested open details escape a closed ancestor', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <details>
          <summary>外側の詳細</summary>
          <details open>
            <summary>内側の詳細</summary>
            <button>内部の操作</button>
          </details>
        </details>
      </Dialog>,
    );
    nextFrame();
    expect(screen.getByText('外側の詳細')).toHaveFocus();
    tab(true);
    expect(screen.getByText('外側の詳細')).toHaveFocus();
    tab();
    expect(screen.getByText('外側の詳細')).toHaveFocus();
  });

  it('excludes hidden, inert, display-none, visibility-hidden, disabled, and negative-tabindex controls', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <div hidden>
          <button>hidden</button>
        </div>
        <div inert>
          <button>inert</button>
        </div>
        <div style={{ display: 'none' }}>
          <button>display</button>
        </div>
        <div style={{ visibility: 'hidden' }}>
          <button>visibility</button>
        </div>
        <fieldset disabled>
          <button>fieldset</button>
        </fieldset>
        <button disabled>disabled</button>
        <button tabIndex={-2}>negative</button>
        <input type="hidden" />
        <button>有効</button>
        <div hidden>
          <button>hidden last</button>
        </div>
      </Dialog>,
    );
    nextFrame();
    const valid = screen.getByRole('button', { name: '有効' });
    expect(valid).toHaveFocus();
    expect(tab()).toBe(false);
    expect(valid).toHaveFocus();
    expect(tab(true)).toBe(false);
    expect(valid).toHaveFocus();
  });

  it('preserves the enabled first legend of a disabled fieldset and an explicit visible child', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <fieldset disabled>
          <legend>
            <button>凡例の操作</button>
          </legend>
          <button>無効な操作</button>
        </fieldset>
        <div style={{ visibility: 'hidden' }}>
          <button style={{ visibility: 'visible' }}>表示する操作</button>
        </div>
      </Dialog>,
    );
    nextFrame();
    expect(screen.getByRole('button', { name: '凡例の操作' })).toHaveFocus();
    tab(true);
    expect(screen.getByRole('button', { name: '表示する操作' })).toHaveFocus();
    tab();
    expect(screen.getByRole('button', { name: '凡例の操作' })).toHaveFocus();
  });

  it('recomputes tab stops after controls become hidden or disabled and recovers outside focus', () => {
    render(
      <>
        <button>外側</button>
        <Dialog onClose={vi.fn()}>
          <button>最初</button>
          <button>最後</button>
        </Dialog>
      </>,
    );
    nextFrame();
    const first = screen.getByRole('button', { name: '最初' });
    const last = screen.getByRole('button', { name: '最後' });
    last.setAttribute('disabled', '');
    expect(tab()).toBe(false);
    expect(first).toHaveFocus();
    last.removeAttribute('disabled');
    first.hidden = true;
    tab(true);
    expect(last).toHaveFocus();
    screen.getByRole('button', { name: '外側' }).focus();
    tab();
    expect(last).toHaveFocus();
  });

  it('keeps focus on the dialog when no tab stops are available', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button disabled>処理中</button>
      </Dialog>,
    );
    nextFrame();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    expect(tab()).toBe(false);
    expect(tab(true)).toBe(false);
    expect(dialog).toHaveFocus();
  });

  it('honors an available autofocus target but never focuses a hidden preferred target', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button>最初</button>
        <button
          hidden
          ref={(element) => {
            element?.setAttribute('autofocus', '');
          }}
        >
          非表示
        </button>
        <button
          ref={(element) => {
            element?.setAttribute('autofocus', '');
          }}
        >
          入力を開始
        </button>
      </Dialog>,
    );
    nextFrame();
    expect(screen.getByRole('button', { name: '入力を開始' })).toHaveFocus();
  });

  it('respects positive tabindex ordering at the trap boundaries', () => {
    render(
      <Dialog onClose={vi.fn()}>
        <button>通常順</button>
        <button tabIndex={5}>優先5</button>
        <button tabIndex={2}>優先2</button>
      </Dialog>,
    );
    nextFrame();
    expect(screen.getByRole('button', { name: '優先2' })).toHaveFocus();
    tab(true);
    expect(screen.getByRole('button', { name: '通常順' })).toHaveFocus();
    tab();
    expect(screen.getByRole('button', { name: '優先2' })).toHaveFocus();
    // Native tabbing between internal controls is left to the browser.
    expect(tab()).toBe(true);
  });

  it('updates Escape permission and callback without resetting the active control', () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(
      <Dialog onClose={firstClose} canClose={false}>
        <button>最初</button>
        <button>作業中</button>
      </Dialog>,
    );
    nextFrame();
    const working = screen.getByRole('button', { name: '作業中' });
    working.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    rerender(
      <Dialog onClose={latestClose} canClose>
        <button>最初</button>
        <button>作業中</button>
      </Dialog>,
    );
    nextFrame();
    expect(working).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(latestClose).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
  });
});
