// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import { demoWorkspaces } from '../data/demoWorkspaces';

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('Mirror application shell', () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the overview available with explainable fictional metrics', async () => {
    renderApp('/overview');

    expect(await screen.findByRole('heading', { level: 1, name: '全体の指標' })).toBeInTheDocument();
    expect(screen.getByText('架空デモ')).toBeInTheDocument();
    const definition = screen.getByText(/質問ごとに指定した確認項目のうち、回答が言及した割合（10\/15）/);
    expect(definition).not.toBeVisible();
    fireEvent.click(screen.getByText('指標の定義と集計範囲', { selector: 'summary' }));
    expect(definition).toBeVisible();
    expect(document.querySelector('.metric-trend')).toBeNull();
    expect(screen.getByRole('heading', { name: '参考推移' })).toBeInTheDocument();
    expect(screen.getByText('条件が異なる履歴を含むため、改善効果の比較には使えません。')).toBeInTheDocument();
  });

  it('switches workspace without company-specific routing', async () => {
    renderApp();
    const picker = await screen.findByRole('combobox', { name: '調査対象' });

    fireEvent.change(picker, { target: { value: 'workspace-morrow' } });

    expect(await screen.findByRole('heading', { level: 1, name: 'AIの回答を比較' })).toBeInTheDocument();
    expect(screen.getByText('Morrow Mobility', { selector: '.topbar__context' })).toBeInTheDocument();
    expect(picker).toHaveValue('workspace-morrow');
    expect(screen.getByLabelText('比較する質問')).toHaveValue('morrow-p1');
  });

  it('keeps data management closed until requested and exposes its actions when opened', async () => {
    renderApp();
    const summary = await screen.findByText('データ管理', { selector: 'summary' });
    const tools = summary.closest('details');
    const backup = screen.getByText('バックアップと復元', { selector: 'button' });
    const verify = screen.getByText('監査パックを検証', { selector: 'button' });
    const restore = screen.getByText('デモデータを復元', { selector: 'button' });
    const overview = screen.getByText('全体の指標', { selector: '.workspace-tools a' });

    expect(tools).not.toHaveAttribute('open');
    for (const action of [backup, verify, restore, overview]) expect(action).not.toBeVisible();
    fireEvent.click(summary);
    expect(tools).toHaveAttribute('open');
    for (const action of [backup, verify, restore, overview]) expect(action).toBeVisible();
    expect(screen.getByRole('button', { name: 'バックアップと復元' })).toBe(backup);
    expect(screen.getByRole('button', { name: '監査パックを検証' })).toBe(verify);
    expect(screen.getByRole('button', { name: 'デモデータを復元' })).toBe(restore);
    expect(screen.getByRole('link', { name: '全体の指標' })).toHaveAttribute('href', '/overview');

    fireEvent.click(summary);
    expect(tools).not.toHaveAttribute('open');
    for (const action of [backup, verify, restore, overview]) expect(action).not.toBeVisible();
  });

  it('labels sample restoration separately from user data deletion', async () => {
    renderApp();
    fireEvent.click(await screen.findByText('データ管理', { selector: 'summary' }));
    expect(await screen.findByRole('button', { name: 'デモデータを復元' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /削除/ })).not.toBeInTheDocument();
  });

  it('preserves a user workspace when demo fixtures are restored', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '対象を追加' }));
    fireEvent.change(screen.getByRole('textbox', { name: '表示名' }), {
      target: { value: 'Northstar Studio' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '業種・カテゴリ' }), {
      target: { value: 'デザインSaaS' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '公式ドメイン' }), {
      target: { value: 'northstar.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('radio', { name: /ブランド/ }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Workspaceを作成' }));

    const picker = await screen.findByRole('combobox', { name: '調査対象' });
    expect(screen.getByRole('option', { name: 'Northstar Studio' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('データ管理', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'デモデータを復元' }));

    expect(picker).toHaveValue('workspace-aster');
    expect(screen.getByRole('option', { name: 'Northstar Studio' })).toBeInTheDocument();
  });

  it('separates deterministic campaigns from manually imported answers', async () => {
    renderApp('/observe');

    fireEvent.click(await screen.findByRole('button', { name: '観測を開始' }));
    expect(screen.getByRole('heading', { name: '観測方法を選ぶ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再現可能なデモCampaign/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /既存のAI回答を取り込む/ })).toBeInTheDocument();
    expect(screen.getByText(/blind observation/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /既存のAI回答を取り込む/ }));
    expect(await screen.findByRole('heading', { name: 'AI回答を証拠として取り込む' })).toBeInTheDocument();
  });

  it('validates manual citations and never infers accuracy from mention alone', async () => {
    renderApp('/observe');
    fireEvent.click(await screen.findByRole('button', { name: '観測を開始' }));
    fireEvent.click(screen.getByRole('button', { name: /既存のAI回答を取り込む/ }));

    fireEvent.change(screen.getByRole('textbox', { name: /AI回答全文/ }), {
      target: { value: 'これは手動取り込みの入力検証に十分な長さを持つAI回答です。' },
    });
    const citationInput = screen.getByRole('textbox', { name: /Citation URL/ });
    const nextButton = screen.getByRole('button', { name: '次へ' });
    fireEvent.change(citationInput, { target: { value: 'not-a-url' } });
    expect(nextButton).toBeDisabled();
    expect(screen.getByText(/解釈できない行が1件/)).toBeInTheDocument();

    fireEvent.change(citationInput, { target: { value: 'https://user:secret@aster.example/product' } });
    expect(nextButton).toBeDisabled();

    fireEvent.change(citationInput, { target: { value: 'https://aster.example/product' } });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    const mentionSelect = screen.getAllByRole('combobox', { name: '言及' })[0];
    if (!mentionSelect) throw new Error('Expected at least one target Claim assessment.');
    fireEvent.change(mentionSelect, { target: { value: 'mentioned' } });
    expect(screen.getAllByRole('combobox', { name: '事実性' })[0]).toHaveValue('');
    expect(screen.getAllByRole('combobox', { name: '帰属' })[0]).toHaveValue('');
    expect(screen.getAllByRole('combobox', { name: '証拠状態' })[0]).toHaveValue('');
  });

  it('migrates version 1 storage without deleting legacy Run evidence', async () => {
    const bundledWorkspace = demoWorkspaces[0];
    if (!bundledWorkspace) throw new Error('Expected a bundled demo workspace.');
    const legacyWorkspace = JSON.parse(JSON.stringify(bundledWorkspace)) as Record<string, unknown>;
    delete legacyWorkspace.campaigns;
    for (const run of legacyWorkspace.runs as Array<Record<string, unknown>>) delete run.provenance;
    window.localStorage.setItem('mirror:v2:workspace-state', JSON.stringify({
      version: 1,
      activeWorkspaceId: bundledWorkspace.workspace.id,
      workspaces: [legacyWorkspace],
    }));

    renderApp('/observe?tab=runs');
    const detailButtons = await screen.findAllByRole('button', { name: /の回答を開く/ });
    const firstDetail = detailButtons[0];
    if (!firstDetail) throw new Error('Expected a migrated legacy Run.');
    fireEvent.click(firstDetail);

    expect(await screen.findByText('legacy-fixture', { selector: 'code' })).toBeInTheDocument();
    await waitFor(() => {
      const persisted = window.localStorage.getItem('mirror:v2:workspace-state');
      expect(persisted).not.toBeNull();
      expect(JSON.parse(persisted ?? '{}')).toMatchObject({ version: 2 });
    });
  });
});
