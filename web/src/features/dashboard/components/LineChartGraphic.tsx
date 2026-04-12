import { formatCurrency, formatMonthLabel } from "@/features/dashboard/utils";

type LineSeries = {
  color: string;
  id: string;
  label: string;
  values: number[];
};

type LineChartGraphicProps = {
  ariaLabel: string;
  labels: string[];
  series: LineSeries[];
};

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 56;
const PADDING = {
  top: 6,
  right: 4,
  bottom: 12,
  left: 6,
};

export function LineChartGraphic({
  ariaLabel,
  labels,
  series,
}: LineChartGraphicProps) {
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values), 1);
  const graphWidth = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
  const graphHeight = VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom;

  function getX(index: number) {
    if (labels.length <= 1) {
      return PADDING.left + graphWidth / 2;
    }

    return PADDING.left + (graphWidth / (labels.length - 1)) * index;
  }

  function getY(value: number) {
    return PADDING.top + graphHeight - (value / maxValue) * graphHeight;
  }

  function buildPoints(values: number[]) {
    return values.map((value, index) => `${getX(index)},${getY(value)}`).join(" ");
  }

  return (
    <div aria-label={ariaLabel} className="line-chart-graphic" role="img">
      <svg
        className="line-chart-graphic__svg"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PADDING.top + graphHeight - graphHeight * fraction;

          return (
            <line
              className="line-chart-graphic__grid-line"
              key={fraction}
              x1={PADDING.left}
              x2={VIEWBOX_WIDTH - PADDING.right}
              y1={y}
              y2={y}
            />
          );
        })}

        {series.map((item) => (
          <g key={item.id}>
            <polyline
              className="line-chart-graphic__line"
              points={buildPoints(item.values)}
              stroke={item.color}
            />
            {item.values.map((value, index) => (
              <circle
                className="line-chart-graphic__point"
                cx={getX(index)}
                cy={getY(value)}
                fill={item.color}
                key={`${item.id}-${labels[index]}`}
                r="1.2"
              />
            ))}
          </g>
        ))}
      </svg>

      <div className="line-chart-graphic__axis-labels">
        {labels.map((label) => (
          <span key={label}>{formatMonthLabel(label)}</span>
        ))}
      </div>

      <ul className="line-chart-graphic__legend">
        {series.map((item) => (
          <li className="line-chart-graphic__legend-item" key={item.id}>
            <span
              aria-hidden="true"
              className="line-chart-graphic__swatch"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
            <strong>{formatCurrency(item.values[item.values.length - 1] ?? 0)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
