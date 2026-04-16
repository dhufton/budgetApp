import { useEffect, useMemo, useState } from "react";

import { formatCurrency, formatMonthLabel } from "@/features/dashboard/utils";

type LineSeries = {
  color: string;
  id: string;
  label: string;
  legendGroup?: string;
  strokeDasharray?: string;
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
  const legendGroups = useMemo(() => {
    const groups = new Map<
      string,
      { color: string; id: string; label: string; seriesIds: string[]; valueLabel: string }
    >();

    series.forEach((item) => {
      const groupId = item.legendGroup || item.id;
      const group = groups.get(groupId);
      const latestValue = item.values[item.values.length - 1] ?? 0;

      if (group) {
        group.seriesIds.push(item.id);
        if (item.label.toLowerCase().includes("actual")) {
          group.valueLabel = formatCurrency(latestValue);
        } else if (!group.valueLabel) {
          group.valueLabel = formatCurrency(latestValue);
        }
        return;
      }

      groups.set(groupId, {
        id: groupId,
        label: item.legendGroup || item.label,
        color: item.color,
        seriesIds: [item.id],
        valueLabel: formatCurrency(latestValue),
      });
    });

    return [...groups.values()];
  }, [series]);

  const [hiddenLegendGroups, setHiddenLegendGroups] = useState<string[]>([]);

  useEffect(() => {
    setHiddenLegendGroups((currentHidden) =>
      currentHidden.filter((groupId) =>
        legendGroups.some((group) => group.id === groupId),
      ),
    );
  }, [legendGroups]);

  const visibleSeries = useMemo(
    () =>
      series.filter((item) => {
        const groupId = item.legendGroup || item.id;
        return !hiddenLegendGroups.includes(groupId);
      }),
    [hiddenLegendGroups, series],
  );

  const maxValue = Math.max(1, ...visibleSeries.flatMap((item) => item.values), 1);
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

  function toggleLegendGroup(groupId: string) {
    setHiddenLegendGroups((currentHidden) =>
      currentHidden.includes(groupId)
        ? currentHidden.filter((currentGroupId) => currentGroupId !== groupId)
        : [...currentHidden, groupId],
    );
  }

  function isolateLegendGroup(groupId: string) {
    setHiddenLegendGroups((currentHidden) => {
      const visibleGroupIds = legendGroups
        .map((group) => group.id)
        .filter((currentGroupId) => !currentHidden.includes(currentGroupId));

      if (visibleGroupIds.length === 1 && visibleGroupIds[0] === groupId) {
        return [];
      }

      return legendGroups
        .map((group) => group.id)
        .filter((currentGroupId) => currentGroupId !== groupId);
    });
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

        {visibleSeries.map((item) => (
          <g key={item.id}>
            <polyline
              className="line-chart-graphic__line"
              points={buildPoints(item.values)}
              stroke={item.color}
              strokeDasharray={item.strokeDasharray}
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
        {legendGroups.map((group) => (
          <li className="line-chart-graphic__legend-item" key={group.id}>
            <button
              className={`line-chart-graphic__legend-button${
                hiddenLegendGroups.includes(group.id)
                  ? " line-chart-graphic__legend-button--muted"
                  : ""
              }`}
              onClick={() => toggleLegendGroup(group.id)}
              onDoubleClick={() => isolateLegendGroup(group.id)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="line-chart-graphic__swatch"
                style={{ backgroundColor: group.color }}
              />
              <span>{group.label}</span>
              <strong>{group.valueLabel}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
