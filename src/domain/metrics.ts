import type {
  CampaignMetrics,
  Probe,
  ProbeRun,
  RatioMetric,
  RunMetrics,
} from './model';

const ratio = (numerator: number, denominator: number): RatioMetric => ({
  numerator,
  denominator,
  ratio: denominator === 0 ? null : numerator / denominator,
});

export function calculateRunMetrics(run: ProbeRun, probe: Probe): RunMetrics {
  const targetIds = new Set(probe.targetClaimIds);
  const assessmentByClaim = new Map(
    run.assessments
      .filter((assessment) => targetIds.has(assessment.claimId))
      .map((assessment) => [assessment.claimId, assessment]),
  );

  const targetedAssessments = probe.targetClaimIds
    .map((claimId) => assessmentByClaim.get(claimId))
    .filter((assessment) => assessment !== undefined);

  const mentioned = targetedAssessments.filter(
    (assessment) => assessment.visibility === 'mentioned',
  );
  const factualityAssessed = mentioned.filter(
    (assessment) => assessment.factuality !== 'not-assessed',
  );
  const attributionAssessed = mentioned.filter(
    (assessment) => assessment.attribution !== 'not-applicable',
  );

  return {
    claimRecall: ratio(mentioned.length, probe.targetClaimIds.length),
    factualAccuracy: ratio(
      factualityAssessed.filter((assessment) => assessment.factuality === 'accurate').length,
      factualityAssessed.length,
    ),
    attributionAccuracy: ratio(
      attributionAssessed.filter((assessment) => assessment.attribution === 'correct').length,
      attributionAssessed.length,
    ),
    evidenceSupport: ratio(
      mentioned.filter((assessment) =>
        ['passage-match', 'human-verified'].includes(assessment.evidence),
      ).length,
      mentioned.length,
    ),
  };
}

const combine = (metrics: RatioMetric[]): RatioMetric =>
  ratio(
    metrics.reduce((total, metric) => total + metric.numerator, 0),
    metrics.reduce((total, metric) => total + metric.denominator, 0),
  );

export function aggregateCampaignMetrics(
  runs: ProbeRun[],
  probes: Probe[],
): CampaignMetrics {
  const probeById = new Map(probes.map((probe) => [probe.id, probe]));
  const metricsByRun = runs.flatMap((run) => {
    const probe = probeById.get(run.probeId);
    return probe ? [{ probeId: probe.id, metrics: calculateRunMetrics(run, probe) }] : [];
  });
  const runMetrics = metricsByRun.map((item) => item.metrics);

  const stabilityByProbe = probes.flatMap((probe) => {
    const recallValues = metricsByRun
      .filter((item) => item.probeId === probe.id)
      .map((item) => item.metrics.claimRecall.ratio)
      .filter((value) => value !== null);
    if (recallValues.length < 2) return [];
    const mean = recallValues.reduce((sum, value) => sum + value, 0) / recallValues.length;
    const variance =
      recallValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      recallValues.length;
    return [Math.max(0, 1 - 2 * Math.sqrt(variance))];
  });
  const stability =
    stabilityByProbe.length === 0
      ? null
      : stabilityByProbe.reduce((sum, value) => sum + value, 0) /
        stabilityByProbe.length;

  return {
    runCount: runMetrics.length,
    claimRecall: combine(runMetrics.map((metric) => metric.claimRecall)),
    factualAccuracy: combine(runMetrics.map((metric) => metric.factualAccuracy)),
    attributionAccuracy: combine(runMetrics.map((metric) => metric.attributionAccuracy)),
    evidenceSupport: combine(runMetrics.map((metric) => metric.evidenceSupport)),
    stability,
  };
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function formatDate(value: string | null): string {
  if (!value) return '未実行';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
