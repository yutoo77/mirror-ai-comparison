// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';

describe('mobile navigation control', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderApp() {
    render(
      <MemoryRouter>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </MemoryRouter>,
    );
  }

  it('keeps the hidden sidebar inert and restores focus after Escape', async () => {
    renderApp();
    const open = await screen.findByRole('button', { name: 'メニューを開く' });
    expect(document.getElementById('workspace-navigation')).toHaveAttribute(
      'inert',
    );
    open.focus();
    fireEvent.click(open);
    const menu = screen.getByRole('dialog', { name: 'メニュー' });
    expect(menu).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.app-main')).toHaveAttribute('inert');
    const close = within(menu).getByRole('button', {
      name: 'メニューを閉じる',
    });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(open).toHaveFocus());
    expect(
      screen.queryByRole('dialog', { name: 'メニュー' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.app-main')).not.toHaveAttribute('inert');
  });

  it('closes the menu before opening the add-target dialog', async () => {
    renderApp();
    fireEvent.click(
      await screen.findByRole('button', { name: 'メニューを開く' }),
    );
    const menu = screen.getByRole('dialog', { name: 'メニュー' });
    fireEvent.click(within(menu).getByRole('button', { name: '対象を追加' }));
    expect(
      screen.queryByRole('dialog', { name: 'メニュー' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('textbox', { name: '表示名' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
