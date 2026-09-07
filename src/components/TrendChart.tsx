import type { TrendPoint } from '../domain/model';

interface TrendChartProps {
  data: TrendPoint[];
}

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 34;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 34;

function pointsFor(data: TrendPoint[], key: keyof Omit<TrendPoint, 'label'>): string {
  const usableWidth = WIDTH - LEFT - RIGHT;
  const usableHeight = HEIGHT - TOP - BOTTOM;
  return data
    .map((point, index) => {
      const x = LEFT + (data.length === 1 ? usableWidth / 2 : (index / (data.length - 1)) * usableWidth);
      const y = TOP + (1 - point[key]) * usableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

export function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) return null;

  const chartDescription = data
    .map(
      (point) =>
        `${point.label}: 言及率${Math.round(point.visibility * 100)}%、正確性${Math.round(point.accuracy * 100)}%、文章裏付け${Math.round(point.evidence * 100)}%`,
    )
    .join('。');

  return (
    <div className="trend-chart">
      <div className="trend-chart__legend" aria-hidden="true">
        <span><i className="legend-dot legend-dot--visibility" />言及率</span>
        <span><i className="legend-dot legend-dot--accuracy" />正確性</span>
        <span><i className="legend-dot legend-dot--evidence" />文章裏付け</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="trend-title trend-desc">
        <title id="trend-title">認識指標の推移</title>
        <desc id="trend-desc">{chartDescription}</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((value) => {
          const y = TOP + (1 - value) * (HEIGHT - TOP - BOTTOM);
          return (
            <g key={value}>
              <line className="chart-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />
              <text className="chart-y-label" x={LEFT - 8} y={y + 4} textAnchor="end">
                {Math.round(value * 100)}
              </text>
            </g>
          );
        })}
        <polyline className="chart-line chart-line--visibility" points={pointsFor(data, 'visibility')} />
        <polyline className="chart-line chart-line--accuracy" points={pointsFor(data, 'accuracy')} />
        <polyline className="chart-line chart-line--evidence" points={pointsFor(data, 'evidence')} />
        {data.map((point, index) => {
          const x = LEFT + (data.length === 1 ? (WIDTH - LEFT - RIGHT) / 2 : (index / (data.length - 1)) * (WIDTH - LEFT - RIGHT));
          return (
            <text key={`${point.label}:${index}`} className="chart-x-label" x={x} y={HEIGHT - 10} textAnchor="middle">
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
