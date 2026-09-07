import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { RunDetailDialog } from '../../components/RunDetailDialog';
import { formatPercent } from '../../domain/metrics';
import { canonicalJson } from '../../domain/integrity';
import {
  exclusionLabels,
  evaluateWindow,
  experimentCohorts,
  tallyRate,
} from '../../domain/experiments';
import {
  findingKindLabels,
  providerLabels,
  type ActionExperiment,
  type ExperimentCohort,
  type ExperimentTally,
} from '../../domain/model';

const localInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
};
const toIso = (value: string) => new Date(value).toISOString();
const showTime = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

function CapturedConditions({ cohort }: { cohort: ExperimentCohort }) {
  return (
    <div className="experiment-conditions">
      <strong>保存された条件</strong>
      <span>質問: {cohort.observation.question}</span>
      <span>
        対象: {cohort.observation.subject.displayName} ·{' '}
        {cohort.observation.subject.canonicalDomain}
      </span>
      <span>
        別名: {cohort.observation.subject.aliases.join(' / ') || 'なし'}
      </span>
      <span>
        {providerLabels[cohort.provider]} · {cohort.model} · {cohort.locale} ·
        検索 {cohort.searchEnabled ? 'ON' : 'OFF'}
      </span>
      <span>
        取得方法:{' '}
        {
          { demo: 'デモ', manual: '手動取り込み', provider: 'API' }[
            cohort.origin
          ]
        }{' '}
        · 評価方法: {cohort.assessorId}
      </span>
      <span>
        評価対象: {cohort.targets.map((target) => target.statement).join(' / ')}
      </span>
    </div>
  );
}

function TallyCard({
  title,
  tally,
}: {
  title: string;
  tally: ExperimentTally;
}) {
  return (
    <div className="experiment-tally">
      <span>{title}</span>
      <strong>{formatPercent(tallyRate(tally))}</strong>
      <p>
        非検出 {tally.notDetected} / 判定可能{' '}
        {tally.affected + tally.notDetected}
      </p>
      <small>
        影響あり {tally.affected} · 判定不能 {tally.unassessed} · 条件外{' '}
        {tally.excluded.length}
      </small>
    </div>
  );
}

function RunRows({
  tally,
  onOpen,
}: {
  tally: ExperimentTally;
  onOpen: (id: string) => void;
}) {
  const { active } = useWorkspace();
  const rows = [
    ...tally.runIds.map((runId) => ({ runId, reason: '集計対象' })),
    ...tally.excluded.map((row) => ({
      runId: row.runId,
      reason: exclusionLabels[row.reason],
    })),
  ];
  if (!rows.length)
    return <p className="section-note">この期間に候補の回答はありません。</p>;
  return (
    <details className="experiment-runs">
      <summary>根拠の回答と除外理由を見る（{rows.length}件）</summary>
      {rows.map((row) => {
        const run = active.runs.find((item) => item.id === row.runId);
        return (
          <div className="experiment-run-row" key={row.runId}>
            <span>
              <strong>{run ? providerLabels[run.provider] : row.runId}</strong>
              <small>
                {run
                  ? `${showTime(run.executedAt)} · ${row.reason}`
                  : '参照先なし'}
              </small>
            </span>
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => onOpen(row.runId)}
              disabled={!run}
            >
              回答を見る
            </button>
          </div>
        );
      })}
    </details>
  );
}

export function ExperimentRoom({ action }: { action: ActionExperiment }) {
  const { active, editAction, lockExperimentPlan, recordExperimentEvaluation } =
    useWorkspace();
  const finding = active.findings.find((item) => item.id === action.findingId);
  const groups = useMemo(
    () => (finding ? experimentCohorts(active, finding) : []),
    [active, finding],
  );
  const [brief, setBrief] = useState({
    title: action.title,
    hypothesis: action.hypothesis,
    owner: action.owner,
    channel: action.channel,
    dueDate: localInput(action.dueDate).slice(0, 10),
  });
  const [seedRunId, setSeedRunId] = useState(groups[0]?.seedRunId ?? '');
  const seed = active.runs.find((item) => item.id === seedRunId);
  const now = new Date();
  const [period, setPeriod] = useState({
    baselineStart: localInput(seed?.executedAt ?? now.toISOString()),
    baselineEnd: localInput(now.toISOString()),
    changedAt: localInput(new Date(now.getTime() + 1000).toISOString()),
    followupStart: localInput(new Date(now.getTime() + 1000).toISOString()),
    followupEnd: localInput(
      new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    ),
  });
  const [changeSummary, setChangeSummary] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const plan = action.measurementPlan;
  const [clock, setClock] = useState(() => Date.now());
  const endAt = plan ? Date.parse(plan.followupWindow.endAt) : null;
  useEffect(() => {
    if (endAt === null || clock >= endAt) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(endAt - Date.now(), 60_000)),
    );
    return () => window.clearTimeout(timer);
  }, [clock, endAt]);
  const windowEnded = endAt !== null && clock >= endAt;
  const briefDirty =
    brief.title.trim() !== action.title ||
    brief.hypothesis.trim() !== action.hypothesis ||
    brief.owner.trim() !== action.owner ||
    brief.channel.trim() !== action.channel ||
    brief.dueDate !== localInput(action.dueDate).slice(0, 10);
  const selectedCohort = groups.find(
    (item) => item.seedRunId === seedRunId,
  )?.cohort;
  const baselinePreview = useMemo(() => {
    if (
      !selectedCohort ||
      !finding ||
      !Number.isFinite(Date.parse(period.baselineStart)) ||
      !Number.isFinite(Date.parse(period.baselineEnd))
    )
      return null;
    return evaluateWindow(
      active,
      { cohort: selectedCohort, claimId: finding.claimId, kind: finding.kind },
      {
        startAt: toIso(period.baselineStart),
        endAt: toIso(period.baselineEnd),
      },
    );
  }, [
    active,
    finding,
    period.baselineStart,
    period.baselineEnd,
    selectedCohort,
  ]);
  const liveWindow = plan
    ? {
        ...plan.followupWindow,
        endAt: new Date(
          Math.min(clock, Date.parse(plan.followupWindow.endAt)),
        ).toISOString(),
      }
    : null;
  const live =
    plan && liveWindow ? evaluateWindow(active, plan, liveWindow) : null;
  const latest = action.evaluations?.at(-1);
  const changedSinceRecord =
    latest && live && canonicalJson(latest.followup) !== canonicalJson(live);
  const saveBrief = (event: FormEvent) => {
    event.preventDefault();
    try {
      editAction(action.id, {
        ...brief,
        dueDate: toIso(`${brief.dueDate}T12:00`),
      });
      setMessage('改善仮説を保存しました。');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '保存できませんでした。',
      );
    }
  };
  const lock = (event: FormEvent) => {
    event.preventDefault();
    if (briefDirty || !acknowledged) {
      setMessage(
        '編集した仮説を保存し、条件と期間を確認してから固定してください。',
      );
      return;
    }
    try {
      lockExperimentPlan(action.id, {
        seedRunId,
        baselineWindow: {
          startAt: toIso(period.baselineStart),
          endAt: toIso(period.baselineEnd),
        },
        changedAt: toIso(period.changedAt),
        changeSummary,
        followupWindow: {
          startAt: toIso(period.followupStart),
          endAt: toIso(period.followupEnd),
        },
      });
      setMessage('比較条件と変更前の集計を固定しました。');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '固定できませんでした。',
      );
    }
  };
  const evaluate = (event: FormEvent) => {
    event.preventDefault();
    try {
      recordExperimentEvaluation(action.id, note);
      setNote('');
      setMessage(
        '回答の参照と検証メモを保存しました。Findingは自動で解決しません。',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '記録できませんでした。',
      );
    }
  };
  if (!finding)
    return (
      <div className="page-stack">
        <Link className="text-link" to="/actions">
          <ArrowLeft size={15} />
          改善一覧へ
        </Link>
        <p>関連Findingが見つかりません。</p>
      </div>
    );
  return (
    <div className="experiment-room page-stack">
      <Link className="text-link" to="/actions">
        <ArrowLeft size={15} />
        改善一覧へ
      </Link>
      <header className="experiment-room__heading">
        <span className="eyebrow">EXPERIMENT WORKSPACE</span>
        <h1>{action.title}</h1>
        <p>{action.hypothesis}</p>
        <Link className="text-link" to={`/findings/${finding.id}`}>
          関連Findingを確認 <ArrowRight size={15} />
        </Link>
      </header>
      <ol className="experiment-steps">
        <li className="done">1 仮説を整える</li>
        <li className={plan ? 'done' : ''}>2 条件を固定する</li>
        <li className={latest ? 'done' : ''}>3 結果を記録する</li>
      </ol>
      {message ? (
        <div className="notice notice--info" role="status">
          <p>{message}</p>
        </div>
      ) : null}
      {!plan ? (
        <>
          <section className="experiment-section">
            <span className="eyebrow">HYPOTHESIS</span>
            <h2>改善案を整える</h2>
            <p className="form-lead">
              比較条件を固定するまでは編集できます。先に保存してください。
            </p>
            <form
              className="form-stack"
              onSubmit={saveBrief}
              onChange={() => setAcknowledged(false)}
            >
              <label className="field">
                改善案のタイトル
                <input
                  required
                  minLength={4}
                  maxLength={200}
                  value={brief.title}
                  onChange={(e) =>
                    setBrief({ ...brief, title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                改善仮説
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  value={brief.hypothesis}
                  onChange={(e) =>
                    setBrief({ ...brief, hypothesis: e.target.value })
                  }
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  担当
                  <input
                    maxLength={100}
                    value={brief.owner}
                    onChange={(e) =>
                      setBrief({ ...brief, owner: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  変更する掲載先
                  <input
                    maxLength={100}
                    value={brief.channel}
                    onChange={(e) =>
                      setBrief({ ...brief, channel: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  改善案の期限
                  <input
                    type="date"
                    required
                    value={brief.dueDate}
                    onChange={(e) =>
                      setBrief({ ...brief, dueDate: e.target.value })
                    }
                  />
                </label>
              </div>
              <button className="button button--secondary" type="submit">
                仮説を保存
              </button>
            </form>
          </section>
          <section className="experiment-section">
            <span className="eyebrow">MEASUREMENT PLAN</span>
            <h2>比較条件を固定する</h2>
            {finding.reviewStatus !== 'confirmed' ? (
              <div className="notice notice--neutral">
                <p>先に関連Findingを「改善対象」で確認してください。</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="notice notice--neutral">
                <p>
                  比較に使える入力Snapshotがありません。新しいCampaignを実行するか、回答を手動で取り込んでください。古い回答を現在の質問文で補完はしません。
                </p>
                <Link className="text-link" to="/observe">
                  観測へ
                </Link>
              </div>
            ) : (
              <form className="form-stack" onSubmit={lock}>
                <label className="field">
                  比較する保存条件
                  <select
                    value={seedRunId}
                    onChange={(e) => {
                      setSeedRunId(e.target.value);
                      setAcknowledged(false);
                    }}
                  >
                    {groups.map((group) => (
                      <option key={group.key} value={group.seedRunId}>
                        {providerLabels[group.cohort.provider]} ·{' '}
                        {group.cohort.model} ·{' '}
                        {group.cohort.observation.question.slice(0, 34)} ·{' '}
                        {group.runCount}件
                      </option>
                    ))}
                  </select>
                </label>
                {selectedCohort ? (
                  <CapturedConditions cohort={selectedCohort} />
                ) : null}
                <div className="experiment-periods">
                  {(
                    [
                      ['baselineStart', '変更前の開始'],
                      ['baselineEnd', '変更前の終了'],
                      ['changedAt', '変更日時'],
                      ['followupStart', '変更後の開始'],
                      ['followupEnd', '変更後の終了'],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="field" key={key}>
                      {label}
                      <input
                        type="datetime-local"
                        step="1"
                        required
                        value={period[key]}
                        onChange={(e) => {
                          setPeriod({ ...period, [key]: e.target.value });
                          setAcknowledged(false);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="section-note">
                  日時は端末のタイムゾーンで表示します。変更前の終了 &lt;
                  変更日時 ≤ 変更後の開始の順に設定してください。
                </p>
                {baselinePreview ? (
                  <>
                    <TallyCard
                      title="変更前の集計プレビュー"
                      tally={baselinePreview}
                    />
                    <RunRows tally={baselinePreview} onOpen={setRunId} />
                    {tallyRate(baselinePreview) === null ? (
                      <p className="section-note">
                        変更前に判定可能な回答が1件以上必要です。「古い情報」の自動比較は未対応です。
                      </p>
                    ) : null}
                  </>
                ) : null}
                <label className="field">
                  変更する内容
                  <textarea
                    required
                    minLength={4}
                    maxLength={2000}
                    rows={4}
                    value={changeSummary}
                    onChange={(e) => {
                      setChangeSummary(e.target.value);
                      setAcknowledged(false);
                    }}
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>
                    <strong>仮説・条件・期間を確認しました</strong>
                    <small>
                      変更前の回答と集計は固定され、後から自動で混ぜません。
                    </small>
                  </span>
                </label>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={
                    briefDirty ||
                    !acknowledged ||
                    changeSummary.trim().length < 4 ||
                    !baselinePreview ||
                    tallyRate(baselinePreview) === null
                  }
                >
                  <LockKeyhole size={16} />
                  比較条件を固定
                </button>
                {briefDirty ? (
                  <p className="form-error">
                    仮説に未保存の変更があります。先に「仮説を保存」を押してください。
                  </p>
                ) : null}
                <p className="section-note">
                  これは事前登録を証明する機能ではありません。回答取得設定のうち保存していないパラメータは比較できません。
                </p>
              </form>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="experiment-section">
            <span className="eyebrow">LOCKED CONDITIONS</span>
            <h2>固定した比較条件</h2>
            <CapturedConditions cohort={plan.cohort} />
            <div className="experiment-conditions">
              <span>問題: {findingKindLabels[plan.kind]}</span>
              <strong>変更内容: {plan.changeSummary}</strong>
              <span>
                変更前 {showTime(plan.baselineWindow.startAt)}〜
                {showTime(plan.baselineWindow.endAt)}
              </span>
              <span>条件を固定した日時: {showTime(plan.createdAt)}</span>
              <span>
                変更 {showTime(plan.changedAt)} / 変更後{' '}
                {showTime(plan.followupWindow.startAt)}〜
                {showTime(plan.followupWindow.endAt)}
              </span>
            </div>
            <p className="section-note">
              同条件の前後差として記録します。因果関係や統計的有意性を示すものではありません。
            </p>
          </section>
          <section className="experiment-section">
            <span className="eyebrow">COMPARISON</span>
            <h2>回答に基づく比較</h2>
            <div className="experiment-comparison">
              <div>
                <TallyCard title="固定した変更前" tally={plan.baseline} />
                <RunRows tally={plan.baseline} onOpen={setRunId} />
              </div>
              {live ? (
                <div>
                  <TallyCard
                    title={windowEnded ? '変更後' : '変更後（観測中）'}
                    tally={live}
                  />
                  <RunRows tally={live} onOpen={setRunId} />
                </div>
              ) : null}
            </div>
            {changedSinceRecord ? (
              <p className="section-note">
                前回の記録後に対象の回答が増えています。保存済みの記録は維持し、必要に応じて新しい集計を追記できます。
              </p>
            ) : null}
            <Link className="button button--secondary" to="/observe">
              同じ条件の回答を観測・取り込む
            </Link>
          </section>
          <section className="experiment-section">
            <span className="eyebrow">DECISION LOG</span>
            <h2>検証メモを残す</h2>
            <form className="form-stack" onSubmit={evaluate}>
              <label className="field">
                検証メモ
                <textarea
                  rows={4}
                  required
                  minLength={4}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                className="button button--primary"
                type="submit"
                disabled={
                  !windowEnded ||
                  !live ||
                  tallyRate(live) === null ||
                  note.trim().length < 4
                }
              >
                {latest ? '検証記録を追記' : '検証結果を記録'}
              </button>
            </form>
            {!windowEnded ? (
              <p className="section-note">観測期間の終了後に記録できます。</p>
            ) : live && tallyRate(live) === null ? (
              <p className="section-note">
                変更後に同じ保存条件で判定可能な回答が必要です。回答を追加してください。
              </p>
            ) : null}
            <div className="experiment-history">
              {[...(action.evaluations ?? [])].reverse().map((item) => (
                <article key={item.id}>
                  <span>
                    <CheckCircle2 size={16} />
                    {showTime(item.recordedAt)}
                  </span>
                  <strong>
                    非検出率 {formatPercent(tallyRate(item.followup))}
                  </strong>
                  <p>{item.note}</p>
                  <RunRows tally={item.followup} onOpen={setRunId} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <RunDetailDialog
        run={active.runs.find((item) => item.id === runId) ?? null}
        probe={active.probes.find(
          (item) =>
            item.id === active.runs.find((run) => run.id === runId)?.probeId,
        )}
        claims={active.claims}
        onClose={() => setRunId(null)}
      />
    </div>
  );
}
