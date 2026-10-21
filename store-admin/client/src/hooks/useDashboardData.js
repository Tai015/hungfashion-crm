import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export function useDashboardData(userRole) {
  const [kpi, setKpi] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [byTier, setByTier] = useState([]);
  const [byGender, setByGender] = useState([]);
  const [byAge, setByAge] = useState([]);
  const [byInterest, setByInterest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const canViewCustomerReports = ['ADMIN', 'QL_KHACH_HANG'].includes(userRole);
    const requests = [
      apiFetch('/api/reports/dashboard'),
      apiFetch('/api/reports/revenue?group_by=day'),
      apiFetch('/api/reports/top-products?limit=5'),
      ['ADMIN', 'QL_BAN_HANG'].includes(userRole) ? apiFetch('/api/orders?limit=8') : Promise.resolve(null),
      canViewCustomerReports ? apiFetch('/api/customers?limit=100') : Promise.resolve(null),
      canViewCustomerReports ? apiFetch('/api/reports/interests') : Promise.resolve(null),
    ];
    setError('');
    Promise.all(requests).then(([dash, revenue, products, orderResult, customerResult, interestResult]) => {
      setKpi(dash.kpi);
      setByTier(dash.customersByTier || []);
      setByGender(dash.customersByGender || []);
      if (customerResult) {
        const ageGroups = { 'Dưới 18': 0, '18–24': 0, '25–34': 0, '35–44': 0, 'Từ 45': 0, 'Chưa rõ': 0 };
        for (const customer of customerResult.data || []) {
          const age = customer.age == null ? NaN : Number(customer.age);
          const group = !Number.isFinite(age) ? 'Chưa rõ'
            : age < 18 ? 'Dưới 18' : age <= 24 ? '18–24' : age <= 34 ? '25–34' : age <= 44 ? '35–44' : 'Từ 45';
          ageGroups[group] += 1;
        }
        const ageCounts = Object.entries(ageGroups).map(([age, count]) => ({ age, count })).filter(item => item.count);
        const totalAge = ageCounts.reduce((sum, item) => sum + item.count, 0);
        setByAge(ageCounts.map(item => ({ ...item, percent: Math.round((item.count / totalAge) * 1000) / 10 })));
      }
      setByInterest(interestResult || []);
      setRevenueData(revenue.map(r => ({
        day: new Date(r.period).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: Number(r.revenue),
      })));
      setTopProducts(products.map(p => ({ name: p.product_name, value: p.total_sold })));
      setRecentOrders(orderResult?.data || []);
      setLastUpdated(new Date());
    }).catch(requestError => setError(requestError.message)).finally(() => setLoading(false));
  }, [userRole]);

  return {
    kpi,
    revenueData,
    topProducts,
    recentOrders,
    byTier,
    byGender,
    byAge,
    byInterest,
    loading,
    lastUpdated,
    error,
  };
}
