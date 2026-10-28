import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export default function StatCard({ label, value, sub, change, icon: Icon, tone = 'glass' }) {
  const changeNumber = Number(change);
  const hasChange = Number.isFinite(changeNumber);
  const up = hasChange && changeNumber >= 0;

  return (
    <motion.article
      whileHover={{ y: -5 }}
      className={`stat-card glass-card tone-${tone}`}
    >
      <div className="stat-card-row">
        <div>
          <p className="stat-card-label">{label}</p>
          <h2 className="stat-card-value">{value}</h2>
          {(hasChange || sub) && (
            <p className={`stat-card-change${hasChange ? (up ? ' up' : ' down') : ''}`}>
              {hasChange && (up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />)}
              {hasChange ? `${up ? '+' : ''}${changeNumber}%` : sub}
            </p>
          )}
        </div>
        {Icon && (
          <span className="stat-card-icon" aria-hidden="true">
            <Icon size={22} />
          </span>
        )}
      </div>
    </motion.article>
  );
}
