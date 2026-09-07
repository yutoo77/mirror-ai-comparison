// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';

function renderHelp(returnTo?: string) {
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/help', hash: '#judgments', state: { returnTo } },
      ]}
    >
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('task-oriented help', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('opens the requested explanation and focuses its section', async () => {
    renderHelp();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '使い方と判定について',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '判定の読み方' })).toHaveFocus();
    expect(
      screen.getByText(/新しい自動検証を行うわけではありません/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '使い方の目次' }),
    ).toBeInTheDocument();
  });

  it('retains an explicit comparison selection in the return link', async () => {
    const selection =
      '/?probe=probe-aster-discovery&run=answer-a&run=answer-b&selection=custom';
    renderHelp(selection);
    expect(
      await screen.findByRole('link', { name: '比較ラボへ戻る' }),
    ).toHaveAttribute('href', selection);
    expect(
      screen.getByRole('link', { name: '比較ラボを開く' }),
    ).toHaveAttribute('href', selection);
  });

  it('does not accept an external return destination', async () => {
    renderHelp('//outside.example');
    expect(
      await screen.findByRole('link', { name: '比較ラボへ戻る' }),
    ).toHaveAttribute('href', '/');
  });

  it('explains the public demo data boundary without claiming cloud privacy guarantees', async () => {
    renderHelp();
    await screen.findByRole('heading', { level: 1, name: '使い方と判定について' });
    expect(screen.getByText(/別の端末や別のURLでは保存内容を引き継ぎません/)).toBeInTheDocument();
    expect(screen.getByText(/APIキー・個人情報・機密資料は入力しないでください/)).toBeInTheDocument();
    expect(screen.getByText(/サイト配信基盤のアクセスログは別の範囲/)).toBeInTheDocument();
    expect(screen.queryByText(/非公開のローカル開発版/)).not.toBeInTheDocument();
  });

  it('offers a persistent help entry from the application shell', async () => {
    render(
      <MemoryRouter>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole('link', { name: '使い方と判定について' }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '使い方と判定について',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '比較ラボへ戻る' }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /のAI認識を比べる/,
      }),
    ).toBeInTheDocument();
  });
});
