import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import SectionState from './SectionState';
import { formatCount, formatVnd } from '../../utils/dashboardFormatters';
import { dashboardMotionMs } from '../../utils/dashboardMotion';
import GlassCard from './GlassCard';

export default function BarChart({ data = [], status, onRetry }) {
  const max = Math.max(0, ...data.map(item => Number(item.total_sold) || 0));
  const [animateBars, setAnimateBars] = useState(false);
  const hasAnimatedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const staggerMs = dashboardMotionMs('--dash-motion-stagger');
  useLayoutEffect(() => {
    if (status.loading) {
      setAnimateBars(false);
      return;
    }
    if (status.error || !data.length || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    setAnimateBars(!reduceMotion);
  }, [data, reduceMotion, status.error, status.loading]);

  return <GlassCard className="dashboard-category-card">
    <div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">SẢN PHẨM</p><h2>Sản phẩm bán chạy</h2><span>Số lượng đã bán</span></div>
      <span className="dashboard-total-pill">{formatCount(data.reduce((sum, item) => sum + (Number(item.total_sold) || 0), 0))} sản phẩm</span>
    </div>
    <SectionState loading={status.loading} error={status.error} isEmpty={!status.loading && !status.error && !data.length} onRetry={onRetry} skeleton="rows">
      <div className="dashboard-bars">{data.map((item, index) => {
        const sold = Number(item.total_sold) || 0;
        const revenue = item.total_revenue == null ? null : Number(item.total_revenue);
        return <div className="dashboard-bar-row" key={item.product_id}>
          <div className="dashboard-bar-label"><span title={item.product_name}>{item.product_name}</span><strong>{formatCount(sold)}</strong></div>
          <div className="dashboard-bar-track"><i className={animateBars ? 'dashboard-bar-grow' : ''}
            style={{ '--bar-height': (max ? sold / max * 100 : 0) + '%', '--bar-delay': `${index * staggerMs}ms` }} /></div>
          <small>{item.category_name}{revenue == null ? '' : ` · ${formatVnd(revenue)}`}</small>
        </div>;
      })}</div>
    </SectionState>
  </GlassCard>;
}
