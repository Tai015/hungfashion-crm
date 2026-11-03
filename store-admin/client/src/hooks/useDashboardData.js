import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardFetch } from '../api/client';

const EMPTY_SECTION = { loading: true, data: null, error: '' };
function dateParam(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRange(range) {
  const today = new Date();
  const to = dateParam(today);
  if (range === '7 ngày') {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    return { from: dateParam(fromDate), to, groupBy: 'day' };
  }
  if (range === '30 ngày') {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    return { from: dateParam(fromDate), to, groupBy: 'day' };
  }
  const fromDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  return { from: dateParam(fromDate), to, groupBy: 'month' };
}

function dateKey(value) {
  return String(value).slice(0, 10);
}

function createRevenueSeries(rows, range) {
  const { from, to } = getRange(range);
  const valuesByPeriod = new Map(rows.map(row => [dateKey(row.period), Number(row.revenue) || 0]));
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const buckets = [];

  if (range === '12 tháng') {
    for (let index = 0; index < 12; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      const key = dateParam(date).slice(0, 7);
      buckets.push({
        label: `T${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`,
        revenue: valuesByPeriod.get(`${key}-01`) || 0,
      });
    }
    return buckets;
  }

  for (let date = start; date <= end; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)) {
    const key = dateParam(date);
    const label = range === '7 ngày'
      ? new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date)
      : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
    buckets.push({ label, revenue: valuesByPeriod.get(key) || 0 });
  }
  return buckets;
}

function initialSections() {
  return {
    metrics: { ...EMPTY_SECTION },
    revenue: { ...EMPTY_SECTION },
    products: { ...EMPTY_SECTION },
  };
}

const SUMMARY_DAYS = { '7 ngày': 7, '30 ngày': 30, '12 tháng': 365 };

export function useDashboardData({ enabled = true } = {}) {
  const [sections, setSections] = useState(initialSections);
  const [range, setRange] = useState('12 tháng');
  const requestVersions = useRef({});

  const updateSection = useCallback((key, changes) => {
    setSections(current => ({ ...current, [key]: { ...current[key], ...changes } }));
  }, []);

  const loadSection = useCallback(async (key, request, transform = value => value) => {
    const version = (requestVersions.current[key] || 0) + 1;
    requestVersions.current[key] = version;
    updateSection(key, { loading: true, error: '' });
    try {
      const result = await request();
      if (requestVersions.current[key] !== version) return;
      updateSection(key, { loading: false, data: transform(result), error: '' });
    } catch (error) {
      if (requestVersions.current[key] !== version) return;
      updateSection(key, {
        loading: false,
        error: error.status === 403 ? 'Bạn không có quyền xem mục này' : 'Không tải được dữ liệu. Vui lòng thử lại.',
      });
    }
  }, [updateSection]);

  const loadMetrics = useCallback(() => {
    const days = SUMMARY_DAYS[range] || 30;
    return loadSection('metrics', () => dashboardFetch(`/api/reports/summary?days=${days}`));
  }, [loadSection, range]);
  const loadProducts = useCallback(() => loadSection('products', () => dashboardFetch('/api/reports/top-products?limit=5')), [loadSection]);
  const loadRevenue = useCallback(() => {
    const { from, to, groupBy } = getRange(range);
    const query = new URLSearchParams({ from, to, group_by: groupBy });
    return loadSection('revenue', () => dashboardFetch(`/api/reports/revenue?${query}`), rows => rows?.length ? createRevenueSeries(rows, range) : []);
  }, [loadSection, range]);

  useEffect(() => { if (enabled) loadMetrics(); }, [enabled, loadMetrics]);
  useEffect(() => { if (enabled) loadProducts(); }, [enabled, loadProducts]);
  useEffect(() => { if (enabled) loadRevenue(); }, [enabled, loadRevenue]);

  return {
    sections,
    range,
    setRange,
    retry: { metrics: loadMetrics, revenue: loadRevenue, products: loadProducts },
  };
}
