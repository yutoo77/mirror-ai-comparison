// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { webcrypto } from 'node:crypto';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import type { WorkspaceSnapshot } from '../domain/model';

const fixture = demoWorkspaces[0]!;
const source = fixture.sources[0]!;
const changedText = 'エンタープライズプラン向けの導入支援は、平日9時から18時まで提供します。';

function renderApp(path = `/sources?source=${source.id}`) {
  return render(<MemoryRouter initialEntries={[path]}><WorkspaceProvider><App /></WorkspaceProvider></MemoryRouter>);
}
function saved() {
  const state = JSON.parse(localStorage.getItem('mirror:v2:workspace-state')!) as { workspaces: WorkspaceSnapshot[] };
  return state.workspaces[0]!;
}
async function editSource() {
  const dialog = within(await screen.findByRole('dialog', { name: source.title }));
  fireEvent.click(dialog.getByRole('button', { name: '原文を更新' }));
  fireEvent.change(dialog.getByRole('textbox', { name: '更新後の原文' }), { target: { value: changedText } });
  fireEvent.change(dialog.getByRole('textbox', { name: '更新メモ' }), { target: { value: '支援の対象と時間帯を再確認。' } });
  return dialog;
}

describe('source revision workflow', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('crypto', webcrypto); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('updates a source, keeps old evidence and can reopen a historical capture', async () => {
    const view = renderApp();
    const dialog = await editSource();
    fireEvent.click(dialog.getByRole('button', { name: '新しい版を保存' }));
    await screen.findByText('新しい原文を保存しました。過去の版と回答はそのまま残っています。');
    await waitFor(() => expect(saved().sources[0]!.snapshot.excerpt).toBe(changedText));
    expect(saved().sources[0]!.history).toEqual([source.snapshot]);
    expect(saved().runs).toEqual(fixture.runs);
    expect(saved().findings).toEqual(fixture.findings);
    fireEvent.change(dialog.getByRole('combobox', { name: '表示する版' }), { target: { value: '0' } });
    expect(dialog.getByText('過去の保存原文')).toBeInTheDocument();
    expect(within(dialog.getByRole('region', { name: '保存した原文' })).getByText(source.snapshot.excerpt)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: '原文と照らして確認' })).not.toBeInTheDocument();
    view.unmount();
    renderApp();
    expect(within(await screen.findByRole('dialog', { name: source.title })).getByRole('combobox', { name: '表示する版' }).children).toHaveLength(2);
  });

  it('requires deliberate review and supports updating the conditional statement', async () => {
    renderApp();
    const dialog = await editSource();
    fireEvent.click(dialog.getByRole('button', { name: '新しい版を保存' }));
    await screen.findByText('新しい原文を保存しました。過去の版と回答はそのまま残っています。');
    fireEvent.click(dialog.getAllByRole('button', { name: '原文と照らして確認' })[0]!);
    const submit = dialog.getByRole('button', { name: 'この版で確認済みにする' });
    expect(submit).toBeDisabled();
    fireEvent.change(dialog.getByRole('textbox', { name: '確認項目の文章' }), { target: { value: changedText } });
    fireEvent.click(dialog.getByRole('checkbox', { name: '対象・条件・時点を含め、上の原文と照合しました' }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(saved().claims.some((claim) => claim.statement === changedText && claim.status === 'verified')).toBe(true));
    expect(saved().runs).toEqual(fixture.runs);
  });

  it('prevents no-change saves and preserves unsaved edits when closing by Escape', async () => {
    renderApp();
    const dialog = within(await screen.findByRole('dialog', { name: source.title }));
    fireEvent.click(dialog.getByRole('button', { name: '原文を更新' }));
    expect(dialog.getByRole('button', { name: '新しい版を保存' })).toBeDisabled();
    fireEvent.change(dialog.getByRole('textbox', { name: '更新後の原文' }), { target: { value: changedText } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog.getByRole('alert')).toHaveTextContent('保存していない原文とメモを破棄しますか');
    fireEvent.click(dialog.getByRole('button', { name: '編集に戻る' }));
    expect(dialog.getByRole('textbox', { name: '更新後の原文' })).toHaveValue(changedText);
    expect(dialog.getByRole('textbox', { name: '更新後の原文' })).toHaveFocus();
    expect(saved().sources[0]!.snapshot).toEqual(source.snapshot);
  });

  it('keeps the entered text and original capture on hashing failure', async () => {
    renderApp();
    const dialog = await editSource();
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('保存を準備できませんでした。'));
    fireEvent.click(dialog.getByRole('button', { name: '新しい版を保存' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('保存を準備できませんでした。');
    expect(dialog.getByRole('textbox', { name: '更新後の原文' })).toHaveValue(changedText);
    expect(dialog.getByRole('textbox', { name: '更新メモ' })).toHaveValue('支援の対象と時間帯を再確認。');
    expect(saved().sources[0]!.snapshot).toEqual(source.snapshot);
  });

  it('distinguishes a search with no matches from a workspace with no sources', async () => {
    renderApp('/sources');
    fireEvent.change(screen.getByRole('textbox', { name: '公式情報を検索' }), { target: { value: 'zzzz-not-a-source' } });
    expect(screen.getByText('一致する項目がありません')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '検索を解除' }));
    expect(screen.getAllByRole('button', { name: /原文を確認：/ }).length).toBeGreaterThan(0);
  });

  it('supports keyboard tabs and warns about an invalid source URL', async () => {
    renderApp('/sources?source=missing-source');
    expect(screen.getByRole('alert')).toHaveTextContent('指定した資料がありません');
    fireEvent.click(screen.getByRole('button', { name: '一覧へ戻る' }));
    const claims = screen.getByRole('tab', { name: /確認項目/ });
    fireEvent.keyDown(claims, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /^資料/ })).toHaveFocus();
    expect(screen.getByRole('tab', { name: /^資料/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: /^資料/ }), { key: 'Home' });
    expect(claims).toHaveFocus();
  });
});
