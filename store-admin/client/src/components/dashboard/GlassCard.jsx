export default function GlassCard({ as: Element = 'section', className = '', children, ...props }) {
  return <Element className={`dashboard-glass ${className}`.trim()} {...props}>{children}</Element>;
}
