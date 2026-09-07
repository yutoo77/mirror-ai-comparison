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
import { webcrypto } from 'node:crypto';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { createEvidencePack } from '../domain/evidencePack';
import { buildIncident } from '../domain/incident';
import type { WorkspaceSnapshot } from '../domain/model';

const snapshot = demoWorkspaces[0]!;
const finding = snapshot.findings[0]!;
const key = 'mirror:v2:workspace-state';
const renderIncident = (path = `/findings/${finding.id}`) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
const stored = () =>
  (
    JSON.parse(localStorage.getItem(key)!) as {
      workspaces: WorkspaceSnapshot[];
    }
  ).workspaces[0]!;

describe('Incident Room interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires a reason, persists review history, and reopens a dismissed finding', async () => {
    const view = renderIncident();
    const save = await screen.findByRole('button', { name: '判断を保存' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '今回の判断' }), {
      target: { value: 'dismissed' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '判断の理由' }), {
      target: { value: '質問の前提が対象外だった。' },
    });
    fireEvent.click(save);
    await waitFor(() => expect(stored().findings[0]!.status).toBe('resolved'));
    expect(stored().findings[0]!.reviewHistory?.[0]?.note).toBe(
      '質問の前提が対象外だった。',
    );
    expect(stored().findings[0]!.reviewHistory?.[0]?.runIds).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox', { name: '今回の判断' }), {
      target: { value: 'needs-evidence' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '判断の理由' }), {
      target: { value: '新しい証拠があるため再調査。' },
    });
    fireEvent.click(save);
    await waitFor(() => expect(stored().findings[0]!.status).toBe('open'));
    expect(stored().findings[0]!.reviewHistory).toHaveLength(2);
    view.unmount();
    renderIncident();
    expect(
      await screen.findByText('新しい証拠があるため再調査。'),
    ).toBeInTheDocument();
  });

  it('changes the inspected original answer when another observation is selected', async () => {
    renderIncident();
    const rows = await screen.findAllByRole('button', { pressed: false });
    fireEvent.click(rows[0]!);
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '回答全文' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/回答全文/)).toBeInTheDocument();
    expect(within(dialog).getByText(/fixture-v1/)).toBeInTheDocument();
  });

  it('never silently substitutes another incident for a stale route', async () => {
    renderIncident('/findings/no-such-finding');
    expect(
      await screen.findByText(
        'このWorkspaceには、指定されたFindingがありません。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '判断を保存' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '一覧へ戻る' }));
    expect(
      await screen.findByRole('button', { name: '判断を保存' }),
    ).toBeInTheDocument();
  });

  it('makes empty filters recoverable and labels an out-of-filter selection', async () => {
    renderIncident();
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Findingを検索' }),
      { target: { value: 'no-match-query' } },
    );
    expect(
      screen.getByText('条件に一致するFindingはありません。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/選択中のFindingは絞り込み条件の対象外です/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: '絞り込みを解除' })[0]!,
    );
    expect(screen.getByRole('textbox', { name: 'Findingを検索' })).toHaveValue(
      '',
    );
  });

  it('creates a draft only after review and uses the kind-specific denominator', async () => {
    const fixture = structuredClone(snapshot);
    fixture.actions = [];
    fixture.findings[0]!.reviewStatus = 'unreviewed';
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        activeWorkspaceId: fixture.workspace.id,
        workspaces: [fixture],
      }),
    );
    renderIncident();
    expect(
      await screen.findByRole('button', { name: '改善案を下書き' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '判断の理由' }), {
      target: { value: '公式原文と保存回答の差を確認した。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '判断を保存' }));
    fireEvent.click(screen.getByRole('button', { name: '改善案を下書き' }));
    await waitFor(() => expect(stored().actions).toHaveLength(1));
    const incident = buildIncident(fixture, fixture.findings[0]!);
    expect(stored().actions[0]!.before.value).toBe(1 - incident.rate!);
    expect(stored().actions[0]!.before.runCount).toBe(incident.evaluable);
    expect(stored().actions[0]!.targetMetric).toContain('非検出率');
  });

  it('verifies imported packs without modifying workspace or executing markup', async () => {
    renderIncident();
    fireEvent.click(
      await screen.findByRole('button', { name: '監査パックを検証' }),
    );
    const before = localStorage.getItem(key);
    const fixture = structuredClone(snapshot);
    fixture.findings[0]!.title = '<img src=x onerror=alert(1)>';
    const pack = await createEvidencePack(fixture, fixture.findings[0]!);
    const file = new File([JSON.stringify(pack)], 'evidence.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify(pack),
    });
    fireEvent.change(screen.getByLabelText('監査パックのJSONファイル'), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText(
        '構造・参照・Fingerprintの整合性を確認しました。',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { level: 3 })
        .textContent,
    ).toContain('<img src=x onerror=alert(1)>');
    expect(screen.getByRole('dialog').querySelector('img')).toBeNull();
    expect(localStorage.getItem(key)).toBe(before);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects an oversized file without reading its contents', async () => {
    renderIncident();
    fireEvent.click(
      await screen.findByRole('button', { name: '監査パックを検証' }),
    );
    const read = vi.fn();
    fireEvent.change(screen.getByLabelText('監査パックのJSONファイル'), {
      target: { files: [{ size: 6_000_000, text: read }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('5 MB');
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the live workspace usable when browser persistence fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    renderIncident();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このブラウザに保存できていません',
    );
    expect(screen.getByRole('button', { name: '監査パック' })).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: '判断の理由' }), {
      target: { value: '保存失敗時もメモリ内の証拠は残す。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '判断を保存' }));
    expect(
      await screen.findByText('保存失敗時もメモリ内の証拠は残す。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ignores a slow older file after a newer file has been verified', async () => {
    renderIncident();
    fireEvent.click(
      await screen.findByRole('button', { name: '監査パックを検証' }),
    );
    const pack = await createEvidencePack(snapshot, finding);
    let resolveOld!: (value: string) => void;
    const oldText = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    const input = screen.getByLabelText('監査パックのJSONファイル');
    fireEvent.change(input, {
      target: { files: [{ size: 10, text: () => oldText }] },
    });
    fireEvent.change(input, {
      target: {
        files: [{ size: 2000, text: async () => JSON.stringify(pack) }],
      },
    });
    expect(
      await screen.findByText(
        '構造・参照・Fingerprintの整合性を確認しました。',
      ),
    ).toBeInTheDocument();
    resolveOld('{broken older file');
    await oldText;
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'JSONを保存' }),
    ).toBeInTheDocument();
  });
});
