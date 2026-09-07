import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Finding } from '../../domain/model';
import { findingKindLabels } from '../../domain/model';
import { ProviderBadge, SeverityBadge } from '../../components/ui';

export function FindingCard({ finding, compact = false, selected = false }: { finding: Finding; compact?: boolean; selected?: boolean }) {
  const delta = Math.round((finding.occurrenceRate - finding.previousOccurrenceRate) * 100);
  return (
    <Link className={`finding-card ${compact ? 'finding-card--compact' : ''} ${selected ? 'is-selected' : ''}`} aria-current={selected ? 'page' : undefined} to={`/findings/${finding.id}`}>
      <span className={`finding-card__risk finding-card__risk--${finding.severity}`} aria-hidden="true" />
      <div className="finding-card__body">
        <div className="finding-card__meta">
          <SeverityBadge severity={finding.severity} />
          <span>{findingKindLabels[finding.kind]}</span>
          {finding.reviewStatus === 'confirmed' ? <span className="reviewed-label">確認済み</span> : null}
        </div>
        <h3>{finding.title}</h3>
        {!compact ? <p>{finding.summary}</p> : null}
        <div className="finding-card__footer">
          <div className="provider-row">
            {finding.providers.map((provider) => <ProviderBadge key={provider} provider={provider} />)}
          </div>
          {!compact ? <span className={`delta ${delta > 0 ? 'delta--worse' : 'delta--better'}`}>
            {delta > 0 ? <TrendingUp aria-hidden="true" size={14} /> : <TrendingDown aria-hidden="true" size={14} />}
            発生率 {Math.round(finding.occurrenceRate * 100)}% ({delta > 0 ? '+' : ''}{delta}pt)
          </span> : <span className="finding-card__review-state">{finding.reviewStatus === 'unreviewed' ? '未確認 · 証拠を確認する' : finding.reviewStatus === 'needs-evidence' ? '根拠待ち' : finding.reviewStatus === 'dismissed' ? '対象外' : '改善対象'}</span>}
        </div>
      </div>
      <ArrowRight className="finding-card__arrow" aria-hidden="true" size={18} />
    </Link>
  );
}
