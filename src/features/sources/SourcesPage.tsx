import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  FileText,
  Globe2,
  Plus,
  Search,
} from 'lucide-react';
import { useWorkspace } from '../../app/workspaceContext';
import { EmptyState, PageIntro } from '../../components/ui';
import type { ClaimStatus, SourceStatus } from '../../domain/model';
import { SourceDialog } from './SourceDialog';
import { SourceDetailDialog } from './SourceDetailDialog';

type SourceTab = 'claims' | 'sources';

const claimStatusLabels: Record<ClaimStatus, string> = {
  verified: '確認済み',
  'review-due': '要再確認',
  draft: '未確認',
};

const sourceStatusLabels: Record<SourceStatus, string> = {
  current: '保存済み',
  'review-due': '要確認',
  changed: '要再確認',
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
  const [tab, setTab] = useState<SourceTab>('sources');
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
  return (
    <div className="page-stack sources-page">
      <PageIntro
        title="公式情報"
        actions={
          <>
            <Link className="text-link sources-help" to="/help#sources">使い方</Link>
            <button className="button button--primary" type="button" aria-label="公式情報を追加" onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden="true" size={17} />追加
            </button>
          </>
        }
      />

      {params.has('source') && !selectedSource ? <p className="form-error" role="alert">このWorkspaceに指定した資料がありません。<button type="button" className="text-link" onClick={() => setParams({})}>一覧へ戻る</button></p> : null}
      <div className="source-toolbar">
        <div className="tabs" role="tablist" aria-label="公式情報ビュー">
          <button type="button" id="source-tab-sources" role="tab" aria-controls="source-list-panel" tabIndex={tab === 'sources' ? 0 : -1} aria-selected={tab === 'sources'} className={tab === 'sources' ? 'is-active' : ''} onClick={() => setTab('sources')} onKeyDown={(event) => { if (['ArrowRight', 'ArrowLeft', 'End'].includes(event.key)) { event.preventDefault(); setTab('claims'); document.getElementById('source-tab-claims')?.focus(); } }}>
            資料 <span>{active.sources.length}</span>
          </button>
          <button type="button" id="source-tab-claims" role="tab" aria-controls="source-list-panel" tabIndex={tab === 'claims' ? 0 : -1} aria-selected={tab === 'claims'} className={tab === 'claims' ? 'is-active' : ''} onClick={() => setTab('claims')} onKeyDown={(event) => { if (['ArrowRight', 'ArrowLeft', 'Home'].includes(event.key)) { event.preventDefault(); setTab('sources'); document.getElementById('source-tab-sources')?.focus(); } }}>
            確認項目 <span>{active.claims.length}</span>
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
          <section className="sources-list">
            {claims.map((claim) => {
              const source = active.sources.find((item) => item.id === claim.sourceId);
              return (
                <article key={claim.id} className="sources-row">
                  <div className="sources-row__content">
                    <h2>{claim.statement}</h2>
                    <p>{source?.title ?? '資料が見つかりません'}</p>
                  </div>
                  <span className={`sources-row__status${claim.status === 'verified' ? '' : ' sources-row__status--attention'}`}>{claimStatusLabels[claim.status]}</span>
                  {source ? (
                    <button className="sources-row__open" type="button" aria-label={`原文を確認：${claim.statement}`} onClick={() => inspect(source.id, claim.id)}>
                      開く<ChevronRight aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState icon={<FileText size={26} />} title="確認項目がありません" description="公式資料と確認したい内容を追加してください。" action={<button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}>公式情報を追加</button>} />
        )
      ) : (
        sources.length > 0 ? (
          <section className="sources-list">
            {sources.map((source) => (
              <article key={source.id} className="sources-row">
                <div className="sources-row__content">
                  <h2>{source.title}</h2>
                  <p className="sources-row__url" title={source.url}>{source.url}</p>
                </div>
                <span className={`sources-row__status${source.status === 'current' ? '' : ' sources-row__status--attention'}`}>{sourceStatusLabels[source.status]}</span>
                <button type="button" className="sources-row__open" aria-label={`原文と版履歴：${source.title}`} onClick={() => inspect(source.id)}>開く<ChevronRight aria-hidden="true" size={16} /></button>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState icon={<Globe2 size={26} />} title="資料がありません" description="公式ページの原文を保存してください。" action={<button className="button button--primary" type="button" onClick={() => setDialogOpen(true)}>資料を追加</button>} />
        )
      )}
      </div>

      <SourceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      {selectedSource ? <SourceDetailDialog key={`${selectedSource.id}-${params.get('claim') ?? ''}`} source={selectedSource} initialClaimId={params.get('claim') ?? undefined} onClose={() => setParams({})} /> : null}
    </div>
  );
}
