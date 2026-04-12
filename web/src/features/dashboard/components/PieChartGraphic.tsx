type PieChartSlice = {
  color: string;
  label: string;
  value: number;
};

type PieChartGraphicProps = {
  slices: PieChartSlice[];
};

export function PieChartGraphic({ slices }: PieChartGraphicProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (!total) {
    return null;
  }

  let start = 0;
  const gradientStops = slices.map((slice) => {
    const from = start;
    const share = (slice.value / total) * 100;
    start += share;
    return `${slice.color} ${from}% ${start}%`;
  });

  return (
    <div className="pie-chart-graphic">
      <div
        aria-hidden="true"
        className="pie-chart-graphic__disc"
        style={{
          background: `conic-gradient(${gradientStops.join(", ")})`,
        }}
      />

      <ul className="pie-chart-graphic__legend">
        {slices.map((slice) => (
          <li className="pie-chart-graphic__legend-item" key={slice.label}>
            <span
              aria-hidden="true"
              className="pie-chart-graphic__swatch"
              style={{ backgroundColor: slice.color }}
            />
            <span>{slice.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
