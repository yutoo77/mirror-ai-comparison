// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import { demoWorkspaces } from '../data/demoWorkspaces';

function CurrentRoute() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}{location.search}</output>;
}

function renderObservation(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider><App /><CurrentRoute /></WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('Observation answer previews', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('previews the latest answer without leaving questions and restores focus after Escape', async () => {
    renderObservation('/observe');
    const trigger = (await screen.findAllByRole('button', { name: '最新の回答' }))[0]!;
    const questionTab = screen.getByRole('tab', { name: /^質問 / });
    const latestAnswer = demoWorkspaces[0]!.runs.find((run) => run.id === 'aster-r3')!;

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: '観測結果の証拠' });
    expect(within(dialog).getAllByText(latestAnswer.answer).length).toBeGreaterThan(0);
    expect(questionTab).toHaveAttribute('aria-selected', 'true');
    expect(trigger).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/observe?run=aster-r3');
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: '閉じる' })[0]).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(questionTab).toHaveAttribute('aria-selected', 'true');
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/observe$/);
  });

  it('keeps the answer-history route and return focus when closing an answer from the history', async () => {
    renderObservation('/observe?tab=runs');
    const trigger = (await screen.findAllByRole('button', { name: /の回答を開く/ }))[0]!;
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '観測結果の証拠' });
    expect(screen.getByRole('tab', { name: /^回答 / })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('current-route')).toHaveTextContent('/observe?tab=runs&run=');
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: '閉じる' })[0]).toHaveFocus());

    fireEvent.click(within(dialog).getAllByRole('button', { name: '閉じる' })[0]!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^回答 / })).toHaveAttribute('aria-selected', 'true');
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/observe\?tab=runs$/);
  });
});
