export function dashboardMotionMs(tokenName) {
  if (typeof window === 'undefined') return 0;
  const token = window.getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  const value = Number.parseFloat(token);
  if (!Number.isFinite(value)) return 0;
  return token.endsWith('s') && !token.endsWith('ms') ? value * 1000 : value;
}
