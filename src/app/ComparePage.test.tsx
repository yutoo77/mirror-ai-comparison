// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { WorkspaceProvider } from './WorkspaceProvider';
import { demoWorkspaces } from '../data/demoWorkspaces';
import type {
  Probe,
  ProbeRun,
  ProviderId,
  WorkspaceSnapshot,
} from '../domain/model';
import {
  validateWorkspaceReferences,
  workspaceSnapshotSchema,
} from '../domain/workspaceBackup';

function fixture() {
  const snapshot = structuredClone(demoWorkspaces[0]!);
  const probe = snapshot.probes[0]!;
  const nextProbe = snapshot.probes[1]!;
  const claim = snapshot.claims.find(
    (item) => item.id === probe.targetClaimIds[0],
  )!;
  const source = snapshot.sources.find((item) => item.id === claim.sourceId)!;
  const base = snapshot.runs.find((item) => item.probeId === probe.id)!;
  const makeRun = (
    provider: ProviderId,
    targetProbe: Probe,
    index: number,
  ): ProbeRun => {
    const answer = `${provider}が保存した回答です。条件の確認には元資料を参照してください。`;
    return {
      ...structuredClone(base),
      id: `compare-${targetProbe.id}-${provider}`,
      probeId: targetProbe.id,
      provider,
      model: `${provider}-test-model`,
      executedAt: `2026-09-0${4 - index}T01:00:00.000Z`,
      answer,
      assessments: targetProbe.targetClaimIds.map((claimId) => ({
        ...base.assessments[0]!,
        claimId,
        visibility: 'mentioned',
        factuality: provider === 'chatgpt' ? 'partial' : 'accurate',
        attribution: 'correct',
        evidence: 'reported-url',
        rationale: `${provider}の保存済みの判断理由。`,
        observedExcerpt: answer,
      })),
      inputSnapshot: {
        observation: {
          subject: {
            displayName: snapshot.workspace.subject.displayName,
            canonicalDomain: snapshot.workspace.subject.canonicalDomain,
            aliases: [...snapshot.workspace.subject.aliases],
          },
          question: targetProbe.question,
          locale: base.locale,
          searchEnabled: base.searchEnabled,
        },
        evaluationTargets: targetProbe.targetClaimIds.map((claimId) => {
          const targetClaim = snapshot.claims.find(
            (item) => item.id === claimId,
          )!;
          const targetSource = snapshot.sources.find(
            (item) => item.id === targetClaim.sourceId,
          )!;
          return {
            claimId,
            statement: targetClaim.statement,
            sourceId: targetSource.id,
            sourceSnapshotHash: targetSource.snapshot.sha256,
          };
        }),
      },
    };
  };
  snapshot.runs = (['chatgpt', 'gemini', 'perplexity', 'claude'] as const).map(
    (provider, index) => makeRun(provider, probe, index),
  );
  snapshot.runs.push(makeRun('claude', nextProbe, 0));
  return { snapshot, probe, nextProbe, claim, source, run: snapshot.runs[0]! };
}

function seed(snapshot: WorkspaceSnapshot) {
  workspaceSnapshotSchema.parse(snapshot);
  validateWorkspaceReferences(snapshot);
  localStorage.setItem(
    'mirror:v2:workspace-state',
    JSON.stringify({
      version: 2,
      activeWorkspaceId: snapshot.workspace.id,
      workspaces: [snapshot],
    }),
  );
}

function renderComparison(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

async function answerRegion() {
  return screen.findByRole('region', { name: '選択した回答' });
}

function openPicker() {
  fireEvent.click(screen.getByText('比較する回答を選ぶ'));
  return screen.getByRole('group', { name: '比較する回答（最大3件）' });
}

describe('Compare Lab interactions', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('starts with three distinct AI answers and clearly identifies stored judgments', async () => {
    const { snapshot } = fixture();
    seed(snapshot);
    renderComparison();
    const answers = await answerRegion();
    expect(within(answers).getAllByRole('article')).toHaveLength(3);
    for (const provider of ['ChatGPT', 'Gemini', 'Perplexity']) {
      expect(
        within(answers).getByRole('heading', { name: provider }),
      ).toBeInTheDocument();
    }
    expect(
      within(answers).queryByRole('heading', { name: 'Claude' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('保存判定：一部正確').length).toBeGreaterThan(0);
    expect(screen.getAllByText('保存判定：正確').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/新しい自動検証は行っていません/),
    ).toBeInTheDocument();
    expect(
      within(answers).queryByText(snapshot.runs[0]!.answer),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '比較の使い方' })).toHaveAttribute(
      'href',
      '/help#comparison',
    );
    expect(screen.getByRole('link', { name: '判定について' })).toHaveAttribute(
      'href',
      '/help#judgments',
    );
  });

  it('keeps differences and evidence visible while revealing detailed rationale on request', async () => {
    const { snapshot, claim, run } = fixture();
    seed(snapshot);
    renderComparison();
    const answers = await answerRegion();
    expect(within(answers).getAllByText('架空デモ')).toHaveLength(3);
    expect(
      screen.queryByText(run.assessments[0]!.rationale),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('根拠：URLのみ').length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', {
        name: `ChatGPTの根拠を確認：${claim.statement}`,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: '説明と根拠を確かめる' });
    expect(
      within(dialog).getByText(run.assessments[0]!.rationale),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('正しい帰属')).toBeInTheDocument();
    expect(within(dialog).getByText('URLのみ')).toBeInTheDocument();
  });

  it('keeps comparison condition differences visible without opening detail controls', async () => {
    const { snapshot, run } = fixture();
    run.inputSnapshot!.observation.question =
      '回答当時の別の質問で取得しました。';
    seed(snapshot);
    renderComparison();
    await answerRegion();
    expect(
      screen.getByText(/質問・言語・検索条件に違いがあります/),
    ).toBeVisible();
    expect(screen.getByText('この回答の記録に確認事項あり')).toBeVisible();
  });

  it('opens the complete answer from its compact column header and returns focus on close', async () => {
    const { snapshot, run } = fixture();
    seed(snapshot);
    renderComparison();
    const answers = await answerRegion();
    const trigger = within(answers).getByRole('button', {
      name: 'ChatGPTの回答全文・実行条件',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '観測結果の証拠' });
    expect(within(dialog).getAllByText(run.answer).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(run.model)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows the filter result count and restores all items without changing the selected answers', async () => {
    const { snapshot, probe } = fixture();
    for (const run of snapshot.runs) {
      for (const assessment of run.assessments) {
        assessment.factuality = 'accurate';
        assessment.evidence = 'human-verified';
      }
    }
    snapshot.runs[0]!.assessments[0]!.factuality = 'partial';
    seed(snapshot);
    renderComparison();
    await answerRegion();
    const comparisons = screen.getByRole('region', {
      name: '確認項目ごとの比較',
    });
    const filter = within(comparisons).getByRole('button', {
      name: '要確認の項目だけ',
    });
    fireEvent.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    expect(within(comparisons).getAllByRole('article')).toHaveLength(1);
    expect(within(comparisons).getByRole('status')).toHaveTextContent(
      `1 / ${probe.targetClaimIds.length}項目`,
    );
    expect(within(await answerRegion()).getAllByRole('article')).toHaveLength(
      3,
    );
    fireEvent.click(filter);
    expect(within(comparisons).getAllByRole('article')).toHaveLength(
      probe.targetClaimIds.length,
    );
    expect(filter).toHaveAttribute('aria-pressed', 'false');
  });

  it('provides a query-preserving item anchor only while there are comparison rows', async () => {
    const { snapshot, probe, run } = fixture();
    for (const assessment of run.assessments) {
      assessment.factuality = 'accurate';
      assessment.evidence = 'human-verified';
    }
    seed(snapshot);
    renderComparison(`/?probe=${probe.id}&selection=custom&run=${run.id}`);
    await answerRegion();
    const jump = screen.getByRole('link', { name: '項目の比較へ' });
    expect(jump).toHaveAttribute('href', '#comparison-items');
    const target = screen.getByRole('region', { name: '確認項目ごとの比較' });
    expect(target).toHaveAttribute('id', 'comparison-items');
    expect(target).toHaveAttribute('tabindex', '-1');
    fireEvent.click(
      within(target).getByRole('button', { name: '要確認の項目だけ' }),
    );
    expect(
      screen.queryByRole('link', { name: '項目の比較へ' }),
    ).not.toBeInTheDocument();
    expect(within(await answerRegion()).getAllByRole('article')).toHaveLength(
      1,
    );
  });

  it('limits selection to three, permits replacement, and resets it when the question changes', async () => {
    const { snapshot, nextProbe } = fixture();
    seed(snapshot);
    renderComparison();
    await answerRegion();
    const picker = openPicker();
    const chatgpt = within(picker).getByRole('checkbox', { name: /ChatGPT/ });
    const claude = within(picker).getByRole('checkbox', { name: /Claude/ });
    expect(claude).toBeDisabled();
    fireEvent.click(chatgpt);
    expect(claude).toBeEnabled();
    fireEvent.click(claude);
    expect(within(await answerRegion()).getAllByRole('article')).toHaveLength(
      3,
    );
    expect(
      within(await answerRegion()).queryByRole('heading', { name: 'ChatGPT' }),
    ).not.toBeInTheDocument();
    expect(chatgpt).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: '比較する質問' }), {
      target: { value: nextProbe.id },
    });
    const nextAnswers = await answerRegion();
    expect(within(nextAnswers).getAllByRole('article')).toHaveLength(1);
    expect(
      within(nextAnswers).getByRole('heading', { name: 'Claude' }),
    ).toBeInTheDocument();
  });

  it.each(['比較の使い方', '判定について'])(
    'preserves the current question and explicit answer selection when returning from %s',
    async (helpLabel) => {
      const { snapshot, probe } = fixture();
      const first = snapshot.runs[3]!;
      const second = snapshot.runs[0]!;
      const selection = `/?probe=${probe.id}&selection=custom&run=${first.id}&run=${second.id}`;
      seed(snapshot);
      renderComparison(selection);
      await answerRegion();
      fireEvent.click(screen.getByRole('link', { name: helpLabel }));
      const back = await screen.findByRole('link', { name: '比較ラボへ戻る' });
      expect(back).toHaveAttribute('href', selection);
      fireEvent.click(back);
      const answers = await answerRegion();
      expect(within(answers).getAllByRole('article')).toHaveLength(2);
      expect(
        within(answers)
          .getAllByRole('heading')
          .map((item) => item.textContent),
      ).toEqual(['Claude', 'ChatGPT']);
      expect(
        screen.getByRole('combobox', { name: '比較する質問' }),
      ).toHaveValue(probe.id);
    },
  );

  it('opens evidence with its source, restores focus after Escape, and links to the corresponding finding', async () => {
    const { snapshot, claim, source } = fixture();
    seed(snapshot);
    renderComparison();
    await answerRegion();
    const trigger = screen.getByRole('button', {
      name: `ChatGPTの根拠を確認：${claim.statement}`,
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '説明と根拠を確かめる' });
    expect(
      within(dialog).getByText(source.snapshot.excerpt),
    ).toBeInTheDocument();
    const finding = snapshot.findings.find(
      (item) => item.claimId === claim.id,
    )!;
    expect(
      within(dialog).getByRole('link', { name: 'この項目の調査・判断へ' }),
    ).toHaveAttribute('href', `/findings/${finding.id}`);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('link', { name: 'この項目の調査・判断へ' }),
    );
    expect(
      await screen.findByRole('button', { name: '判断を保存' }),
    ).toBeInTheDocument();
  });

  it('shows captured definitions and withholds the current source body after a source version change', async () => {
    const { snapshot, probe, claim, source, run } = fixture();
    const oldQuestion = probe.question;
    const oldStatement = claim.statement;
    const capturedHash = source.snapshot.sha256;
    probe.question =
      '更新された質問として最新のサービス条件を確認してください。';
    claim.statement = '現在の確認項目では別の条件が記載されています。';
    source.snapshot.sha256 = 'updated-source-hash';
    source.snapshot.excerpt =
      'この新しい本文を過去の回答の根拠として表示してはいけません。';
    seed(snapshot);
    renderComparison(`/?probe=${probe.id}&run=${run.id}`);
    const answers = await answerRegion();
    fireEvent.click(within(answers).getByText('質問・取得条件'));
    expect(within(answers).getByText(oldQuestion)).toBeInTheDocument();
    expect(
      within(answers).getByText('回答と一緒に保存した質問'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: `ChatGPTの根拠を確認：${claim.statement}`,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: '説明と根拠を確かめる' });
    expect(
      within(dialog).getByRole('heading', { name: oldStatement }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('更新あり・旧本文未収録'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(source.snapshot.excerpt),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(capturedHash)).toBeInTheDocument();
  });

  it('labels legacy source text as a current reference rather than a captured historical source', async () => {
    const { snapshot, probe, claim, source, run } = fixture();
    run.inputSnapshot = undefined;
    seed(snapshot);
    renderComparison(`/?probe=${probe.id}&run=${run.id}`);
    const answers = await answerRegion();
    fireEvent.click(within(answers).getByText('質問・取得条件'));
    expect(
      within(answers).getByText(
        '当時の質問は未保存。現在の質問を参照しています。',
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: `ChatGPTの根拠を確認：${claim.statement}`,
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('現行資料を参考表示・観測時の版は未保存'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(source.snapshot.excerpt),
    ).toBeInTheDocument();
  });

  it('distinguishes captured and current-only target definitions in the same comparison', async () => {
    const { snapshot, probe, claim, run } = fixture();
    const capturedStatement = claim.statement;
    claim.statement =
      '現在の確認項目は変更され、旧形式の回答では当時の文章を確認できません。';
    const legacy = snapshot.runs[1]!;
    legacy.inputSnapshot = undefined;
    seed(snapshot);
    renderComparison(`/?probe=${probe.id}&run=${run.id}&run=${legacy.id}`);
    await answerRegion();
    expect(
      screen.getByText(`当時の確認項目：${capturedStatement}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `現在の確認項目（当時の定義は未保存）：${claim.statement}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`当時の確認項目：${claim.statement}`),
    ).not.toBeInTheDocument();
  });

  it('does not fill an unrecorded target with the current claim in the evidence inspector', async () => {
    const { snapshot, probe, claim, run } = fixture();
    run.inputSnapshot!.evaluationTargets = [];
    seed(snapshot);
    renderComparison(`/?probe=${probe.id}&run=${run.id}`);
    await answerRegion();
    fireEvent.click(
      screen.getByRole('button', {
        name: `ChatGPTの根拠を確認：${claim.statement}`,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: '説明と根拠を確かめる' });
    expect(
      within(dialog).getByRole('heading', {
        name: 'この回答の対象文は未収録です。',
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        '現在の確認項目を当時の対象文として補完していません。',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(claim.statement)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText('当時の保存内容'),
    ).not.toBeInTheDocument();
  });

  it('recovers an invalid selection without locking every selection control', async () => {
    const { snapshot, probe } = fixture();
    seed(snapshot);
    renderComparison(
      `/?probe=${probe.id}&selection=custom&run=missing-a&run=missing-b&run=missing-c`,
    );
    expect(
      await screen.findByText('比較する回答を選んでください'),
    ).toBeInTheDocument();
    const picker = openPicker();
    for (const checkbox of within(picker).getAllByRole('checkbox'))
      expect(checkbox).toBeEnabled();
    fireEvent.click(within(picker).getByRole('checkbox', { name: /ChatGPT/ }));
    expect(
      within(await answerRegion()).getByRole('heading', { name: 'ChatGPT' }),
    ).toBeInTheDocument();
  });

  it('does not substitute a different question for an invalid question URL', async () => {
    const { snapshot, nextProbe } = fixture();
    seed(snapshot);
    renderComparison('/?probe=no-such-probe');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このWorkspaceに対応する質問がありません。',
    );
    expect(
      screen.queryByRole('region', { name: '選択した回答' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '比較する質問' }), {
      target: { value: nextProbe.id },
    });
    expect(
      within(await answerRegion()).getByRole('heading', { name: 'Claude' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('provides a preparation path when a workspace has no questions or observations', async () => {
    const { snapshot } = fixture();
    snapshot.probes = [];
    snapshot.runs = [];
    snapshot.campaigns = [];
    snapshot.findings = [];
    snapshot.actions = [];
    seed(snapshot);
    renderComparison();
    expect(
      await screen.findByText('最初の比較を始めましょう'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /調査の準備へ/ })).toHaveAttribute(
      'href',
      '/observe',
    );
    expect(
      screen.queryByRole('region', { name: '選択した回答' }),
    ).not.toBeInTheDocument();
  });
});
