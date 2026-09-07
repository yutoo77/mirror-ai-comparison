import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Fingerprint,
  Globe2,
  Plus,
  Search,
} from 'lucide-react';
import { useWorkspace } from '../../app/workspaceContext';
import { Badge, EmptyState, PageIntro } from '../../components/ui';
import { formatShortDate } from '../../domain/metrics';
import type { ClaimStatus, SourceStatus } from '../../domain/model';
import { SourceDialog } from './SourceDialog';
import { SourceDetailDialog } from './SourceDetailDialog';

type SourceTab = 'claims' | 'sources';

const claimStatusLabels: Record<ClaimStatus, string> = {
  verified: '人が確認済み',
  'review-due': '要再確認',
  draft: '未確認',
};

const sourceStatusLabels: Record<SourceStatus, string> = {
  current: '保存済み',
  'review-due': '要確認',
  changed: '更新後・要再確認',
};

export function SourcesPage() {
  const { active } = useWorkspace();
  return <SourcesWorkspace key={active.workspace.id} />;
}

function SourcesWorkspace() {
  const { active } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const selectedSource = active.sources.find((source) => source.id === params.get('source'));
  const inspect = (sourceId: string, claimId?: string) => setParams({ source: sourceId, ...(claimId ? { claim: claimId } : {}) });
  const [tab, setTab] = useState<SourceTab>('claims');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const claims = useMemo(
    () => active.claims.filter((claim) => `${claim.statement} ${claim.category}`.toLowerCase().includes(query.toLowerCase())),
    [active.claims, query],
  );
  const sources = useMemo(
    () => active.sources.filter((source) => `${source.title} ${source.url}`.toLowerCase().includes(query.toLowerCase())),
    [active.sources, query],
  );
  const verified = active.claims.filter((claim) => claim.status === 'verified').length;
  const attention = active.sources.filter((source) => source.status !== 'current').length;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="調査の根拠"
        title="公式資料と確認項目"
        description="原文を開き、対象・条件・時点を確かめる。更新前の版も残します。"
        actions={
          <button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden="true" size={17} />公式情報を追加
          </button>
        }
      />

      <section className="truth-summary">
        <div><CheckCircle2 aria-hidden="true" size={18} /><span>人が確認済み</span><strong>{verified}</strong></div>
        <div><Globe2 aria-hidden="true" size={18} /><span>保存資料</span><strong>{active.sources.length}</strong></div>
        <div><Clock3 aria-hidden="true" size={18} /><span>確認が必要</span><strong>{attention}</strong></div>
      </section>

      {params.has('source') && !selectedSource ? <p className="form-error" role="alert">このWorkspaceに指定した資料がありません。<button type="button" className="text-link" onClick={() => setParams({})}>一覧へ戻る</button></p> : null}
      <p className="section-note">保存済みは、公開ページの最新状態を保証しません。<Link className="text-link" to="/help#sources">資料の版について</Link></p>
      <div className="source-toolbar">
        <div className="tabs" role="tablist" aria-label="公式情報ビュー">
          <button type="button" id="source-tab-claims" role="tab" aria-controls="source-list-panel" tabIndex={tab === 'claims' ? 0 : -1} aria-selected={tab === 'claims'} className={tab === 'claims' ? 'is-active' : ''} onClick={() => setTab('claims')} onKeyDown={(event) => { if (['ArrowRight', 'ArrowLeft', 'End'].includes(event.key)) { event.preventDefault(); setTab('sources'); document.getElementById('source-tab-sources')?.focus(); } }}>
            確認項目 <span>{active.claims.length}</span>
          </button>
          <button type="button" id="source-tab-sources" role="tab" aria-controls="source-list-panel" tabIndex={tab === 'sources' ? 0 : -1} aria-selected={tab === 'sources'} className={tab === 'sources' ? 'is-active' : ''} onClick={() => setTab('sources')} onKeyDown={(event) => { if (['ArrowRight', 'ArrowLeft', 'Home'].includes(event.key)) { event.preventDefault(); setTab('claims'); document.getElementById('source-tab-claims')?.focus(); } }}>
            資料 <span>{active.sources.length}</span>
          </button>
        </div>
        <label className="search-field source-search">
          <Search aria-hidden="true" size={17} />
          <input aria-label="公式情報を検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="公式情報を検索" />
        </label>
      </div>

      <div id="source-list-panel" role="tabpanel" aria-labelledby={`source-tab-${tab}`}>
      {query.trim() && !(tab === 'claims' ? claims.length : sources.length) ? (
        <EmptyState title="一致する項目がありません" description="検索語を短くするか、検索を解除してください。" action={<button type="button" className="button button--secondary" onClick={() => setQuery('')}>検索を解除</button>} />
      ) : tab === 'claims' ? (
        claims.length > 0 ? (
          <section className="claim-list">
            {claims.map((claim) => {
              const source = active.sources.find((item) => item.id === claim.sourceId);
              return (
                <article key={claim.id} className="claim-card">
                  <div className="claim-card__index"><Check aria-hidden="true" size={16} /></div>
                  <div className="claim-card__content">
                    <header>
                      <Badge tone={claim.status === 'verified' ? 'success' : claim.status === 'draft' ? 'warning' : 'info'}>
                        {claimStatusLabels[claim.status]}
                      </Badge>
                      <span>{claim.category}</span>
                    </header>
                    <h2>{claim.statement}</h2>
                    <footer>
                      <div><FileText aria-hidden="true" size={15} /><span>{source?.title ?? 'Source unavailable'}</span></div>
                      <div><span>{claim.owner}</span><time dateTime={claim.reviewedAt}>{formatShortDate(claim.reviewedAt)}</time></div>
                    </footer>
                  </div>
                  {source ? (
                    <button className="button button--secondary button--compact" type="button" aria-label={`原文を確認：${claim.statement}`} onClick={() => inspect(source.id, claim.id)}>
                      <FileText aria-hidden="true" size={15} />原文を確認
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState icon={<FileText size={26} />} title="Claimがありません" description="公式Sourceと、その原文から確認できる事実を追加してください。" action={<button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}>最初のClaimを追加</button>} />
        )
      ) : (
        sources.length > 0 ? (
          <section className="source-grid">
            {sources.map((source) => (
              <article key={source.id} className="source-card">
                <header>
                  <span className="source-card__icon"><Globe2 aria-hidden="true" size={19} /></span>
                  <Badge tone={source.status === 'current' ? 'success' : source.status === 'changed' ? 'warning' : 'info'}>
                    {sourceStatusLabels[source.status]}
                  </Badge>
                </header>
                <h2>{source.title}</h2>
                <span className="source-url">{source.url}</span>
                <blockquote>「{source.snapshot.excerpt}」</blockquote>
                <dl>
                  <div><dt>確認項目</dt><dd>{source.claimIds.length}</dd></div>
                  <div><dt>保存</dt><dd>{formatShortDate(source.snapshot.capturedAt)}</dd></div>
                  <div><dt>保存版</dt><dd>{(source.history?.length ?? 0) + 1}版</dd></div>
                </dl>
                <footer>
                  <span><Fingerprint aria-hidden="true" size={14} />SHA-256</span>
                  <code>{source.snapshot.sha256.slice(0, 12)}…</code>
                </footer>
                <button type="button" className="button button--secondary button--compact" aria-label={`原文と版履歴：${source.title}`} onClick={() => inspect(source.id)}>原文と版履歴</button>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState icon={<Globe2 size={26} />} title="Sourceがありません" description="公式ページの原文をSnapshotとして保存します。" action={<button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}>Sourceを追加</button>} />
        )
      )}
      </div>

      <SourceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      {selectedSource ? <SourceDetailDialog key={`${selectedSource.id}-${params.get('claim') ?? ''}`} source={selectedSource} initialClaimId={params.get('claim') ?? undefined} onClose={() => setParams({})} /> : null}
    </div>
  );
}
