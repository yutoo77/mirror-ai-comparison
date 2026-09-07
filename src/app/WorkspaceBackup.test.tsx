// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { createWorkspaceBackup } from '../domain/workspaceBackup';
import type { WorkspaceSnapshot } from '../domain/model';

const key = 'mirror:v2:workspace-state';
function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}
function stored() {
  return JSON.parse(localStorage.getItem(key)!) as {
    workspaces: WorkspaceSnapshot[];
    activeWorkspaceId: string;
  };
}
async function chooseBackup(json: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: 'バックアップと復元' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '復元する' }));
  fireEvent.change(screen.getByLabelText('WorkspaceバックアップのJSON'), {
    target: { files: [{ size: json.length * 3, text: async () => json }] },
  });
}

describe('workspace backup and storage protection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prepares a complete backup for explicit download', async () => {
    renderApp();
    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップと復元' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'バックアップを作成' }));
    expect(
      await screen.findByRole('button', { name: 'バックアップJSONを保存' }),
    ).toBeEnabled();
    expect(stored().workspaces).toHaveLength(2);
  });

  it('requires explicit confirmation and adds a durable copy without replacing anything', async () => {
    const view = renderApp();
    const backup = await createWorkspaceBackup(demoWorkspaces[0]!);
    const before = structuredClone(demoWorkspaces);
    await chooseBackup(JSON.stringify(backup));
    const restore = await screen.findByRole('button', {
      name: '復元コピーを追加',
    });
    expect(restore).toBeDisabled();
    expect(stored().workspaces).toEqual(before);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '内容を確認し、別の復元コピーとして追加します',
      }),
    );
    fireEvent.click(restore);
    expect(
      await screen.findByText('別のWorkspaceとして復元コピーを追加しました。'),
    ).toBeInTheDocument();
    const state = stored();
    expect(state.workspaces).toHaveLength(3);
    expect(state.workspaces.slice(0, 2)).toEqual(before);
    expect(state.activeWorkspaceId).not.toBe(backup.snapshot.workspace.id);
    fireEvent.click(
      screen.getByRole('button', { name: '復元したWorkspaceを開く' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'デモデータを復元' }));
    expect(stored().workspaces).toHaveLength(3);
    expect(
      stored().workspaces.some(
        (item) => item.workspace.id === state.activeWorkspaceId,
      ),
    ).toBe(true);
    view.unmount();
    renderApp();
    expect(stored().workspaces).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), {
      target: { value: state.activeWorkspaceId },
    });
    expect(stored().activeWorkspaceId).toBe(state.activeWorkspaceId);
  });

  it('checks file size before reading and ignores a superseded file', async () => {
    renderApp();
    await chooseBackup('{bad');
    await screen.findByRole('alert');
    const fileInput = screen.getByLabelText('WorkspaceバックアップのJSON');
    const read = vi.fn();
    fireEvent.change(fileInput, {
      target: { files: [{ size: 21 * 1024 * 1024, text: read }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('20 MB');
    expect(read).not.toHaveBeenCalled();

    let resolveOld!: (value: string) => void;
    const old = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    fireEvent.change(fileInput, {
      target: { files: [{ size: 10, text: () => old }] },
    });
    const backup = await createWorkspaceBackup(demoWorkspaces[1]!);
    fireEvent.change(fileInput, {
      target: {
        files: [{ size: 1000, text: async () => JSON.stringify(backup) }],
      },
    });
    await screen.findByRole('button', { name: '復元コピーを追加' });
    await act(async () => {
      resolveOld('{broken-old');
      await old;
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent(backup.snapshot.workspace.name);
    expect(stored().workspaces).toHaveLength(2);
  });

  it('retains the live restored copy and an export path when saving hits quota', async () => {
    renderApp();
    const backup = await createWorkspaceBackup(demoWorkspaces[0]!);
    await chooseBackup(JSON.stringify(backup));
    const restore = await screen.findByRole('button', {
      name: '復元コピーを追加',
    });
    const before = localStorage.getItem(key);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '内容を確認し、別の復元コピーとして追加します',
      }),
    );
    fireEvent.click(restore);
    await screen.findByText('別のWorkspaceとして復元コピーを追加しました。');
    // Persistence runs in an effect after the restored copy is rendered.
    expect(await screen.findByRole('alert')).toHaveTextContent('保存できていません');
    expect(localStorage.getItem(key)).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    fireEvent.click(screen.getByRole('button', { name: 'バックアップを作成' }));
    expect(
      await screen.findByRole('button', { name: 'バックアップJSONを保存' }),
    ).toBeEnabled();
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent('復元');
  });

  it('keeps a restored copy temporary when the original storage is unreadable', async () => {
    const raw = '{protected original';
    localStorage.setItem(key, raw);
    renderApp();
    await chooseBackup(
      JSON.stringify(await createWorkspaceBackup(demoWorkspaces[0]!)),
    );
    const restore = await screen.findByRole('button', {
      name: '復元コピーを追加',
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '内容を確認し、別の復元コピーとして追加します',
      }),
    );
    fireEvent.click(restore);
    await screen.findByText('別のWorkspaceとして復元コピーを追加しました。');
    expect(localStorage.getItem(key)).toBe(raw);
    expect(screen.getByRole('alert')).toHaveTextContent('自動保存されません');
    fireEvent.click(
      screen.getByRole('button', { name: '復元したWorkspaceを開く' }),
    );
    expect(
      screen
        .getAllByRole('option')
        .some((option) => option.textContent?.includes('復元')),
    ).toBe(true);
  });

  it.each([
    '{broken data',
    JSON.stringify({ version: 999, workspaces: [] }),
    JSON.stringify({ version: 2, activeWorkspaceId: 'x', workspaces: [] }),
  ])('preserves unreadable original storage verbatim: %s', async (raw) => {
    localStorage.setItem(key, raw);
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '元のデータを上書きせず',
    );
    expect(localStorage.getItem(key)).toBe(raw);
    fireEvent.click(screen.getByRole('button', { name: 'データを退避する' }));
    expect(
      await screen.findByRole('button', { name: '元の保存データを退避' }),
    ).toBeEnabled();
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('rejects malformed nested records without letting rendering destroy storage', async () => {
    const data = structuredClone(demoWorkspaces);
    Object.assign(data[0]!.runs[0]!, { assessments: null });
    const raw = JSON.stringify({
      version: 2,
      activeWorkspaceId: data[0]!.workspace.id,
      workspaces: data,
    });
    localStorage.setItem(key, raw);
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('一時モード');
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('does not write when browser storage access is denied', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '元データは取得できていません',
    );
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'データを退避する' }));
    expect(
      screen.queryByRole('button', { name: '元の保存データを退避' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'バックアップを作成' }));
    expect(
      await screen.findByRole('button', { name: 'バックアップJSONを保存' }),
    ).toBeEnabled();
  });

  it('leaves all state untouched after a rejected file', async () => {
    renderApp();
    await screen.findByRole('button', { name: 'バックアップと復元' });
    const before = localStorage.getItem(key);
    await chooseBackup('{bad');
    expect(
      await within(screen.getByRole('dialog')).findByRole('alert'),
    ).toHaveTextContent('JSONを読み取れません');
    expect(
      screen.queryByRole('button', { name: '復元コピーを追加' }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe(before);
  });

  it('rejects unsafe source URLs on entry and retains the form for correction', async () => {
    renderApp('/sources');
    fireEvent.click(
      await screen.findByRole('button', { name: '公式情報を追加' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: '資料名' }), {
      target: { value: '保存対象の公式情報' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '公式URL' }), {
      target: { value: 'https://user:secret@aster.example/product' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '根拠となる原文' }), {
      target: {
        value: 'これは公式情報として手動入力する十分な長さの原文です。',
      },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '確認可能な事実' }), {
      target: {
        value: '保存前に根拠と対照できる十分な長さの事実を確認します。',
      },
    });
    const before = stored();
    fireEvent.click(screen.getByRole('button', { name: '資料を保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証情報を含まない',
    );
    expect(stored()).toEqual(before);
    fireEvent.change(screen.getByRole('textbox', { name: '公式URL' }), {
      target: { value: 'https://aster.example/product' },
    });
    fireEvent.click(screen.getByRole('button', { name: '資料を保存' }));
    await screen.findByText(
      '保存前に根拠と対照できる十分な長さの事実を確認します。',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(stored().workspaces[0]!.sources).toHaveLength(
        before.workspaces[0]!.sources.length + 1,
      ),
    );
    expect(await createWorkspaceBackup(stored().workspaces[0]!)).toBeDefined();
  });
});
