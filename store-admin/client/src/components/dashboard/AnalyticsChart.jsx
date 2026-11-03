import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { formatCompactVnd } from '../../utils/dashboardFormatters';
import SectionState from './SectionState';
import GlassCard from './GlassCard';

const RANGES = ['7 ngày', '30 ngày', '12 tháng'];
const WIDTH = 760;
const HEIGHT = 250;
const PAD = { left: 72, right: 12, top: 18, bottom: 28 };

function smoothPath(points) {
  if (!points.length) return '';
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middleX = (previous.x + point.x) / 2;
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

export default function AnalyticsChart({ data, range, onRangeChange, status, onRetry, showRangeToggle = true, title = 'Doanh thu', subtitle = 'Tổng tiền đơn hàng theo thời gian' }) {
  const [hovered, setHovered] = useState(null);
  const lineRef = useRef(null);
  const areaRef = useRef(null);
  const hasAnimatedRef = useRef(false);
  const previousRangeRef = useRef(range);
  const reduceMotion = useReducedMotion();
  const chart = useMemo(() => {
    const values = data || [];
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const max = Math.max(0, ...values.map(item => Number(item.revenue) || 0));
    const upper = max > 0 ? max * 1.15 : 1;
    const points = values.map((item, index) => ({
      x: PAD.left + (values.length <= 1 ? plotWidth / 2 : index * (plotWidth / (values.length - 1))),
      y: PAD.top + plotHeight - ((Number(item.revenue) || 0) / upper) * plotHeight,
      value: Number(item.revenue) || 0,
      label: item.label,
    }));
    const line = smoothPath(points);
    const area = points.length
      ? `${line} L ${points.at(-1).x} ${HEIGHT - PAD.bottom} L ${points[0].x} ${HEIGHT - PAD.bottom} Z`
      : '';
    return { points, line, area, upper };
  }, [data]);

  useLayoutEffect(() => {
    if (status.loading || status.error || !data?.length || !chart.line) return undefined;
    const line = lineRef.current;
    const area = areaRef.current;
    if (!line || !area) return undefined;

    const firstData = !hasAnimatedRef.current;
    const rangeChanged = previousRangeRef.current !== range;
    hasAnimatedRef.current = true;
    previousRangeRef.current = range;

    let frameId;
    let areaTimer;
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    line.style.transition = 'none';
    area.style.transition = 'none';
    const shouldAnimate = (firstData || rangeChanged) && !reduceMotion;
    if (!shouldAnimate) {
      line.style.strokeDashoffset = '0';
      area.style.opacity = '1';
      return undefined;
    }

    line.style.strokeDashoffset = `${length}`;
    area.style.opacity = '0';
    void line.getBoundingClientRect();
    frameId = window.requestAnimationFrame(() => {
      line.style.transition = 'stroke-dashoffset var(--dash-chart-draw-duration) var(--dash-motion-ease)';
      line.style.strokeDashoffset = '0';
      areaTimer = window.setTimeout(() => {
        area.style.transition = 'opacity var(--dash-chart-area-duration) var(--dash-motion-ease)';
        area.style.opacity = '1';
      }, 260);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(areaTimer);
    };
  }, [chart.line, data, range, reduceMotion, status.error, status.loading]);

  const selectPoint = event => {
    if (!chart.points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * WIDTH;
    const closest = chart.points.reduce((best, point, index) =>
      Math.abs(point.x - x) < Math.abs(chart.points[best].x - x) ? index : best, 0);
    setHovered(closest);
  };

  return <GlassCard className="dashboard-chart-card">
    <div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">HIỆU SUẤT</p><h2>{title}</h2><span>{subtitle}</span></div>
      {showRangeToggle && <div className="dashboard-range" role="group" aria-label="Khoảng thời gian biểu đồ">
        {RANGES.map(item => <button type="button" key={item} aria-pressed={range === item} onClick={() => { setHovered(null); onRangeChange(item); }}>{item}</button>)}
      </div>}
    </div>
    <SectionState loading={status.loading} error={status.error} isEmpty={!status.loading && !status.error && !data?.length} onRetry={onRetry} skeleton="chart">
      <div className="dashboard-chart-wrap">
        {hovered !== null && chart.points[hovered] && <div className="dashboard-chart-tooltip" style={{ left: (chart.points[hovered].x / WIDTH * 100) + '%', top: (chart.points[hovered].y / HEIGHT * 100) + '%' }}><span>{chart.points[hovered].label}</span><strong>{formatCompactVnd(chart.points[hovered].value)}</strong></div>}
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`Biểu đồ doanh thu ${range}`}>
          <defs><linearGradient id="dashboard-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--dash-purple)" stopOpacity=".42" /><stop offset="100%" stopColor="var(--dash-purple)" stopOpacity="0" /></linearGradient></defs>
          {[0, 1, 2, 3].map(level => {
            const y = PAD.top + level * ((HEIGHT - PAD.top - PAD.bottom) / 3);
            return <g key={level}><line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className="dashboard-chart-grid" /><text x={PAD.left - 8} y={y - 6} textAnchor="end" className="dashboard-chart-axis">{formatCompactVnd(chart.upper * (1 - level / 3))}</text></g>;
          })}
          <path ref={areaRef} d={chart.area} fill="url(#dashboard-area-fill)" className="dashboard-chart-area" />
          <path ref={lineRef} d={chart.line} fill="none" className="dashboard-chart-line" />
          {chart.points.map((point, index) => {
            const last = index === chart.points.length - 1;
            const showLabel = range === '7 ngày' || (range === '30 ngày' ? index % 5 === 0 || last : index % 2 === 0 || last);
            return <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r={hovered === index ? 6 : 3.5} className="dashboard-chart-point" />{showLabel && <text x={point.x} y={HEIGHT - 6} textAnchor="middle" className="dashboard-chart-axis">{point.label}</text>}</g>;
          })}
          <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.top - PAD.bottom} fill="transparent" onPointerMove={selectPoint} onPointerLeave={() => setHovered(null)} />
        </svg>
      </div>
      <div className="dashboard-chart-legend"><span><i />Doanh thu</span><small>Giá trị lấy từ báo cáo doanh thu</small></div>
    </SectionState>
  </GlassCard>;
}
