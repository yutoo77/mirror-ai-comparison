// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspaceProvider } from './WorkspaceProvider';
import { useWorkspace } from './workspaceContext';
import { ActionsPage } from '../features/actions/ActionsPage';
import { experimentFixture, experimentInput } from '../test/experimentFixture';
import { createExperimentPlan } from '../domain/experiments';
import type { WorkspaceSnapshot } from '../domain/model';

const key = 'mirror:v2:workspace-state';
const stored = () =>
  (
    JSON.parse(localStorage.getItem(key)!) as {
      workspaces: WorkspaceSnapshot[];
    }
  ).workspaces[0]!;
const local = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
};
function renderRoom(snapshot: WorkspaceSnapshot, id: string) {
  localStorage.setItem(
    key,
    JSON.stringify({
      version: 2,
      activeWorkspaceId: snapshot.workspace.id,
      workspaces: [snapshot],
    }),
  );
  return render(
    <MemoryRouter initialEntries={[`/actions/${id}`]}>
      <WorkspaceProvider>
        <Routes>
          <Route path="/actions/:actionId" element={<ActionsPage />} />
        </Routes>
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}
function fillPlan() {
  for (const [label, value] of [
    ['変更前の開始', experimentInput.baselineWindow.startAt],
    ['変更前の終了', experimentInput.baselineWindow.endAt],
    ['変更日時', experimentInput.changedAt],
    ['変更後の開始', experimentInput.followupWindow.startAt],
    ['変更後の終了', experimentInput.followupWindow.endAt],
  ])
    fireEvent.change(screen.getByLabelText(label!), {
      target: { value: local(value!) },
    });
  fireEvent.change(screen.getByLabelText('変更する内容'), {
    target: { value: experimentInput.changeSummary },
  });
  fireEvent.click(
    screen.getByRole('checkbox', { name: /仮説・条件・期間を確認/ }),
  );
}

describe('experiment workspace', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires saving an edited hypothesis before locking, then persists evaluation without resolving the finding', () => {
    const { snapshot, action, finding } = experimentFixture();
    const previousBefore = structuredClone(action.before);
    const previousAfter = structuredClone(action.after);
    const view = renderRoom(snapshot, action.id);
    fireEvent.change(screen.getByRole('textbox', { name: '改善仮説' }), {
      target: { value: '利用条件を冒頭に明記すれば誤った説明が減ると考える。' },
    });
    fillPlan();
    expect(
      screen.getByRole('button', { name: '比較条件を固定' }),
    ).toBeDisabled();
    expect(screen.getByText(/仮説に未保存の変更/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '仮説を保存' }));
    expect(
      screen.getByRole('button', { name: '比較条件を固定' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '比較条件を固定' }));
    expect(
      screen.getByRole('heading', { name: '固定した比較条件' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/評価方法: fixture-v1/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '検証メモ' }), {
      target: { value: '対象の回答と条件の一致を確認した。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '検証結果を記録' }));
    const saved = stored().actions.find((item) => item.id === action.id)!;
    expect(saved.status).toBe('completed');
    expect(saved.evaluations).toHaveLength(1);
    expect(saved.before).toEqual(previousBefore);
    expect(saved.after).toEqual(previousAfter);
    expect(
      stored().findings.find((item) => item.id === finding.id)!.status,
    ).toBe(finding.status);
    view.unmount();
    renderRoom(stored(), action.id);
    expect(
      screen.getByText('対象の回答と条件の一致を確認した。'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '仮説を保存' }),
    ).not.toBeInTheDocument();
  });

  it('enables evaluation when its observation period ends without any user interaction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T22:59:59.000Z'));
    const { snapshot, action, finding } = experimentFixture();
    action.measurementPlan = createExperimentPlan(
      snapshot,
      action,
      finding,
      experimentInput,
      '2026-09-02T00:00:00.000Z',
    );
    renderRoom(snapshot, action.id);
    fireEvent.change(screen.getByLabelText('検証メモ'), {
      target: { value: '対象の回答を確認した。' },
    });
    const button = screen.getByRole('button', { name: '検証結果を記録' });
    expect(button).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(button).toBeEnabled();
    expect(
      screen.queryByText('観測期間の終了後に記録できます。'),
    ).not.toBeInTheDocument();
  });

  it('does not add duplicate activity for two competing lock requests', () => {
    const { snapshot, action } = experimentFixture();
    function DoubleLock() {
      const { lockExperimentPlan } = useWorkspace();
      return (
        <button
          onClick={() => {
            lockExperimentPlan(action.id, experimentInput);
            lockExperimentPlan(action.id, experimentInput);
          }}
        >
          固定を続けて要求
        </button>
      );
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        activeWorkspaceId: snapshot.workspace.id,
        workspaces: [snapshot],
      }),
    );
    render(
      <WorkspaceProvider>
        <DoubleLock />
      </WorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '固定を続けて要求' }));
    expect(stored().activity).toHaveLength(snapshot.activity.length + 1);
    expect(
      stored().actions.find((item) => item.id === action.id)!.measurementPlan,
    ).toBeDefined();
  });
});
