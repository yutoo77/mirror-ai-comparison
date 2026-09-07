import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Minus,
} from 'lucide-react';
import {
  providerLabels,
  severityLabels,
  type ProviderId,
  type RiskLevel,
} from '../domain/model';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function SeverityBadge({ severity }: { severity: RiskLevel }) {
  const tone: BadgeTone =
    severity === 'critical'
      ? 'danger'
      : severity === 'high'
        ? 'warning'
        : severity === 'medium'
          ? 'info'
          : 'neutral';
  return <Badge tone={tone}>{severityLabels[severity]}</Badge>;
}

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  return <span className={`provider provider--${provider}`}>{providerLabels[provider]}</span>;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-intro__actions">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  trend?: number;
  tone?: 'default' | 'accent';
}) {
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__row">
        <strong>{value}</strong>
        {trend !== undefined ? (
          <span className={`metric-trend ${trend >= 0 ? 'metric-trend--up' : 'metric-trend--down'}`}>
            <TrendIcon aria-hidden="true" size={14} />
            {Math.abs(trend)}pt
          </span>
        ) : null}
      </div>
      <p>{detail}</p>
    </article>
  );
}

export function ProgressBar({
  value,
  tone = 'accent',
  label,
}: {
  value: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  label: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className={`progress__bar progress__bar--${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function ReviewStatusIcon({ status }: { status: 'pass' | 'warning' | 'danger' }) {
  if (status === 'pass') return <Check aria-hidden="true" size={16} />;
  return <AlertTriangle aria-hidden="true" size={16} />;
}
