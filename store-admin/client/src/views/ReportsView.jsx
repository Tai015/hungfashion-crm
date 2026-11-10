import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { dashboardFetch } from '../api/client';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';
import BarChart from '../components/dashboard/BarChart';
import GlassCard from '../components/dashboard/GlassCard';
import SectionState from '../components/dashboard/SectionState';
import DatePicker from '../components/DatePicker';
import { formatCount, formatVnd } from '../utils/dashboardFormatters';
import { CUSTOMER_GENDER_LABELS, CUSTOMER_SPENDING_SEGMENT_LABELS, CUSTOMER_TIER_LABELS, EMPLOYEE_STATUS_LABELS, FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, RECEIPT_TYPE_LABELS } from '../utils/viLabels';
import '../dashboard.css';

const TAB_ROLES = {
  sales: ['ADMIN', 'QL_BAN_HANG'],
  customers: ['ADMIN', 'QL_KHACH_HANG'],
  feedback: ['ADMIN', 'QL_KHACH_HANG'],
  warehouse: ['ADMIN', 'QL_KHO'],
  hr: ['ADMIN', 'QL_NHAN_SU'],
};
const TABS = [
  ['sales', 'Doanh thu và đơn hàng'],
  ['warehouse', 'Kho'],
  ['hr', 'Nhân sự'],
  ['customers', 'Khách hàng'],
  ['feedback', 'Phản hồi và khảo sát'],
];
const PRESETS = ['7 ngày', '30 ngày', '12 tháng'];
const PRESET_DAYS = { '7 ngày': 7, '30 ngày': 30, '12 tháng': 365 };
const DATE_FMT = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' });

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function presetRange(preset) {
  const today = new Date();
  const to = localDate(today);
  if (preset === '12 tháng') return { from: localDate(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to };
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PRESET_DAYS[preset] - 1));
  return { from: localDate(from), to };
}

function daysBetween(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
}

function dateLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? '—' : DATE_FMT.format(date);
}

function useReportData(url, enabled) {
  const [state, setState] = useState({ loading: Boolean(enabled), error: '', data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    if (!enabled || !url) {
      setState({ loading: false, error: '', data: null });
      return () => { current = false; };
    }
    setState({ loading: true, error: '', data: null });
    dashboardFetch(url).then(data => {
      if (current) setState({ loading: false, error: '', data });
    }).catch(error => {
      if (current) setState({ loading: false, error: error.status === 403 ? 'Bạn không có quyền xem mục này' : (error.message || 'Không tải được dữ liệu.'), data: null });
    });
    return () => { current = false; };
  }, [attempt, enabled, url]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

function StatePanel({ state, children, empty = false, emptyText = 'Chưa có dữ liệu.' }) {
  if (!state.loading && !state.error && empty) return <p className="reports-empty">{emptyText}</p>;
  return <SectionState loading={state.loading} error={state.error} isEmpty={false} onRetry={state.retry} skeleton="rows">{children}</SectionState>;
}

function Table({ headers, rows, emptyText = 'Chưa có dữ liệu trong khoảng đã chọn.' }) {
  return rows.length ? <div className="reports-table-wrap"><table className="reports-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.key ?? index}>{row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? '—'}</td>)}</tr>)}</tbody></table></div> : <p className="reports-empty">{emptyText}</p>;
}

function SurveyOptionsChart({ options = [], answeredCount = 0 }) {
  const denominator = Math.max(0, Number(answeredCount) || 0);
  if (!options.length || !denominator) return <p className="reports-empty">Chưa có lượt trả lời cho câu hỏi này.</p>;
  return <div className="reports-survey-chart" role="list">
    {options.map((option, index) => {
      const count = Math.max(0, Number(option.vote_count) || 0);
      const percent = count / denominator * 100;
      return <div className="reports-survey-chart-row" role="listitem" key={option.option_id ?? `${option.option_text}-${index}`}>
        <div className="reports-survey-chart-label"><span>{option.option_text}</span><strong>{formatCount(count)} người <small>({percent.toFixed(1)}%)</small></strong></div>
        <div className="reports-survey-chart-track" role="img" aria-label={`${option.option_text}: ${formatCount(count)} người, ${percent.toFixed(1)} phần trăm`}>
          <i style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      </div>;
    })}
  </div>;
}

function DistributionChart({ items = [], formatValue = formatCount }) {
  const values = items.map(item => Math.max(0, Number(item.value) || 0));
  const max = Math.max(...values, 0);
  if (!items.length || !max) return <p className="reports-empty">Chưa có dữ liệu để vẽ biểu đồ.</p>;
  return <div className="reports-distribution-chart" role="list">
    {items.map((item, index) => {
      const value = values[index];
      const percent = value / max * 100;
      return <div className="reports-distribution-row" role="listitem" key={`${item.label}-${index}`}>
        <div className="reports-distribution-label"><span>{item.label}</span><strong>{formatValue(value)}</strong></div>
        <div className="reports-distribution-track" role="img" aria-label={`${item.label}: ${formatValue(value)}`}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>;
    })}
  </div>;
}

function csvValue(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(tabName, rangeName, headers, rows) {
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hung-fashion-${tabName}-${rangeName}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ReportBlock({ eyebrow, title, children, className = '' }) {
  return <GlassCard className={`reports-block ${className}`}><div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>{children}</GlassCard>;
}

function SalesTab({ from, to, preset, rangeDaysCount, groupBy, rangeValid, rangeError }) {
  const query = new URLSearchParams({ from, to, group_by: groupBy });
  const revenue = useReportData(`/api/reports/revenue?${query}`, rangeValid);
  const productQuery = new URLSearchParams({ limit: '10', from, to });
  const products = useReportData(`/api/reports/top-products?${productQuery}`, rangeValid);
  const summary = useReportData(preset ? `/api/reports/summary?days=${PRESET_DAYS[preset]}` : '', Boolean(preset));

  const revenueRows = useMemo(() => {
    if (!revenue.data) return [];
    const byPeriod = new Map(revenue.data.map(row => [String(row.period).slice(0, 10), row]));
    const points = [];
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (groupBy === 'day') {
      for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
        const key = localDate(date);
        const row = byPeriod.get(key);
        points.push({ period: key, label: DATE_FMT.format(date), orderCount: Number(row?.order_count) || 0, revenue: Number(row?.revenue) || 0 });
      }
    } else if (groupBy === 'month') {
      const date = new Date(start.getFullYear(), start.getMonth(), 1);
      for (; date <= end; date.setMonth(date.getMonth() + 1)) {
        const key = localDate(date);
        const row = byPeriod.get(key);
        points.push({ period: key, label: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', month: 'short', year: '2-digit' }).format(date), orderCount: Number(row?.order_count) || 0, revenue: Number(row?.revenue) || 0 });
      }
    } else {
      const date = new Date(start);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      for (; date <= end; date.setDate(date.getDate() + 7)) {
        const key = localDate(date);
        const row = byPeriod.get(key);
        points.push({ period: key, label: `Tuần ${DATE_FMT.format(date)}`, orderCount: Number(row?.order_count) || 0, revenue: Number(row?.revenue) || 0 });
      }
    }
    return points;
  }, [from, groupBy, revenue.data, to]);
  const reportData = useMemo(() => revenueRows.map(row => ({ label: row.label, revenue: row.revenue })), [revenueRows]);
  const productsData = Array.isArray(products.data) ? products.data : [];
  const displayedRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
  const displayedOrders = revenueRows.reduce((sum, row) => sum + row.orderCount, 0);
  const revenueHeaders = ['Kỳ', 'Số đơn hàng', 'Doanh thu (₫)'];
  const revenueCsvRows = revenueRows.map(row => [row.period, row.orderCount, row.revenue]);
  const productHeaders = ['Sản phẩm', 'Danh mục', 'Đã bán', 'Doanh thu (₫)'];
  const productCsvRows = productsData.map(row => [row.product_name, row.category_name, Number(row.total_sold) || 0, Number(row.total_revenue) || 0]);
  const exportRows = [
    ...revenueCsvRows.map(row => [...row, '', '', '', '']),
    ...productCsvRows.map(row => ['', '', '', ...row]),
  ];

  return <>
    {rangeError && <p className="reports-range-error" role="alert">{rangeError}</p>}
    <section className="reports-summary-grid" aria-label="Tổng số liệu trong kỳ">
      <ReportBlock eyebrow="TỔNG HỢP" title="Doanh thu trong kỳ">{revenue.loading ? <i className="reports-number-skeleton" /> : <strong className="reports-big-number">{revenue.error ? '—' : formatVnd(displayedRevenue)}</strong>}</ReportBlock>
      <ReportBlock eyebrow="TỔNG HỢP" title="Đơn hàng trong kỳ">{revenue.loading ? <i className="reports-number-skeleton" /> : <strong className="reports-big-number">{revenue.error ? '—' : formatCount(displayedOrders)}</strong>}</ReportBlock>
      <ReportBlock eyebrow="TỶ LỆ" title="Chuyển đổi">{preset
        ? <StatePanel state={summary} empty={!summary.data}><strong className="reports-big-number">{summary.data?.conversionPercent == null ? '—' : `${summary.data.conversionPercent}%`}</strong></StatePanel>
        : <><strong className="reports-big-number">—</strong><span className="reports-subtle">Chưa có API cho khoảng ngày tùy chọn</span></>}
        {preset && <span className="reports-subtle">{preset === '12 tháng' ? 'API hiện trả tỷ lệ trong 365 ngày gần nhất' : 'Người hoạt động có đơn hợp lệ'}</span>}
      </ReportBlock>
    </section>
    <div className="reports-grid-two">
      <div className="reports-report-chart" key={`${from}-${to}-${groupBy}`}>
        <AnalyticsChart data={reportData} range={`${dateLabel(from)} – ${dateLabel(to)}`} status={revenue} onRetry={revenue.retry} showRangeToggle={false} title="Doanh thu theo thời gian" subtitle={`Gom theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'}`} />
      </div>
      <div className="reports-report-chart" key={`products-${from}-${to}`}>
        <BarChart data={productsData} status={products} onRetry={products.retry} />
      </div>
    </div>
    <ReportBlock eyebrow="CHI TIẾT" title="Doanh thu và số đơn theo kỳ"><StatePanel state={revenue} empty={!revenueRows.length}><Table headers={revenueHeaders} rows={revenueRows.map(row => ({ key: row.period, cells: [row.label, formatCount(row.orderCount), formatVnd(row.revenue)] }))} /></StatePanel></ReportBlock>
    <ReportBlock eyebrow="SẢN PHẨM" title="10 sản phẩm bán chạy"><StatePanel state={products} empty={!productsData.length}><Table headers={productHeaders} rows={productsData.map(row => ({ key: row.product_id, cells: [row.product_name, row.category_name, formatCount(Number(row.total_sold) || 0), formatVnd(Number(row.total_revenue) || 0)] }))} /></StatePanel></ReportBlock>
    <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('doanh-thu-don-hang', `${from}-${to}`, [...revenueHeaders, ...productHeaders], exportRows)} disabled={!revenueRows.length && !productsData.length}><Download size={15} /> Xuất CSV</button></div>
    {rangeDaysCount > 366 && <span className="sr-only">Đang gom dữ liệu theo tuần.</span>}
  </>;
}

function CustomersTab({ from, to }) {
  const rangeQuery = new URLSearchParams({ from, to }).toString();
  const dashboard = useReportData(`/api/reports/dashboard?${rangeQuery}`, true);
  const segments = useReportData(`/api/reports/customer-segments?${rangeQuery}`, true);
  const interests = useReportData(`/api/reports/interests?${rangeQuery}`, true);
  const ages = useReportData(`/api/reports/customer-ages?${rangeQuery}`, true);
  const tier = dashboard.data?.customersByTier || [];
  const gender = dashboard.data?.customersByGender || [];
  const ageRows = Array.isArray(ages.data) ? ages.data : [];
  const interestRows = Array.isArray(interests.data) ? interests.data : [];
  const segmentRows = Array.isArray(segments.data) ? segments.data : [];
  const ageChart = ageRows.map(row => ({ label: row.ageBand, value: Number(row.customerCount) || 0 }));
  const tierChart = tier.map(row => ({ label: CUSTOMER_TIER_LABELS[row.customer_tier] || 'Chưa phân hạng', value: Number(row.count) || 0 }));
  const interestChart = interestRows.map(row => ({ label: row.interest, value: Number(row.count) || 0 }));
  const segmentChart = segmentRows.map(row => ({ label: CUSTOMER_SPENDING_SEGMENT_LABELS[row.segment] || row.segment, value: Number(row.lifetime_avg_spent) || 0 }));
  const genderChart = gender.map(row => ({ label: CUSTOMER_GENDER_LABELS[row.gender] || 'Chưa có thông tin', value: Number(row.count) || 0 }));
  const rows = [
    ...ageRows.map(row => ['Độ tuổi', row.ageBand, Number(row.customerCount) || 0, Number(row.percent) || 0, '', '']),
    ...tier.map(row => ['Hạng thành viên', CUSTOMER_TIER_LABELS[row.customer_tier] || 'Chưa phân hạng', Number(row.count) || 0, null, '', '']),
    ...gender.map(row => ['Giới tính', CUSTOMER_GENDER_LABELS[row.gender] || 'Chưa có thông tin', Number(row.count) || 0, null, '', '']),
    ...segmentRows.map(row => ['Phân khúc chi tiêu', CUSTOMER_SPENDING_SEGMENT_LABELS[row.segment] || row.segment, Number(row.customer_count) || 0, null, Number(row.lifetime_avg_spent) || 0, Number(row.period_avg_spent) || 0]),
    ...interestRows.map(row => ['Sở thích', row.interest, Number(row.count) || 0, Number(row.percent) || 0, '', '']),
  ];
  return <>
    <div className="reports-grid-two">
      <ReportBlock eyebrow="NHÂN KHẨU HỌC" title="Tỷ lệ độ tuổi"><StatePanel state={ages} empty={!ageRows.length}><DistributionChart items={ageChart} /><Table headers={['Nhóm tuổi', 'Số khách hàng', 'Tỷ lệ']} rows={ageRows.map(row => ({ key: row.ageBand, cells: [row.ageBand, formatCount(Number(row.customerCount) || 0), `${Number(row.percent) || 0}%`] }))} /></StatePanel></ReportBlock>
      <ReportBlock eyebrow="HẠNG THÀNH VIÊN" title="Khách hàng theo hạng"><StatePanel state={dashboard} empty={!tier.length}><DistributionChart items={tierChart} /><Table headers={['Hạng', 'Số khách hàng']} rows={tier.map(row => ({ key: row.customer_tier, cells: [CUSTOMER_TIER_LABELS[row.customer_tier] || 'Chưa phân hạng', formatCount(Number(row.count) || 0)] }))} /></StatePanel></ReportBlock>
      <ReportBlock eyebrow="SỞ THÍCH" title="Sở thích khách hàng"><StatePanel state={interests} empty={!interestRows.length}><DistributionChart items={interestChart} /><Table headers={['Sở thích', 'Số khách', 'Tỷ lệ']} rows={interestRows.map(row => ({ key: row.interest_id, cells: [row.interest, formatCount(Number(row.count) || 0), `${Number(row.percent) || 0}%`] }))} /></StatePanel></ReportBlock>
      <ReportBlock eyebrow="CHI TIÊU" title="Phân khúc khách hàng"><StatePanel state={segments} empty={!segmentRows.length}><p className="reports-subtle">Phân khúc được xác định theo tổng chi tiêu trọn đời; số khách không thay đổi theo khoảng ngày.</p><DistributionChart items={segmentChart} formatValue={formatVnd} /><Table headers={['Phân khúc', 'Số khách', 'Chi tiêu trọn đời TB', 'Chi tiêu trong kỳ TB']} rows={segmentRows.map(row => ({ key: row.segment, cells: [CUSTOMER_SPENDING_SEGMENT_LABELS[row.segment] || row.segment, formatCount(Number(row.customer_count) || 0), formatVnd(Number(row.lifetime_avg_spent) || 0), formatVnd(Number(row.period_avg_spent) || 0)] }))} /></StatePanel></ReportBlock>
      <ReportBlock eyebrow="GIỚI TÍNH" title="Khách hàng theo giới tính"><StatePanel state={dashboard} empty={!gender.length}><DistributionChart items={genderChart} /><Table headers={['Giới tính', 'Số khách hàng']} rows={gender.map(row => ({ key: row.gender || 'unknown', cells: [CUSTOMER_GENDER_LABELS[row.gender] || 'Chưa có thông tin', formatCount(Number(row.count) || 0)] }))} /></StatePanel></ReportBlock>
    </div>
    <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('khach-hang', `${from}-${to}`, ['Loại thống kê', 'Nhóm', 'Số khách hàng', 'Tỷ lệ (%)', 'Chi tiêu trọn đời TB (₫)', 'Chi tiêu trong kỳ TB (₫)'], rows)} disabled={!rows.length}><Download size={15} /> Xuất CSV</button></div>
  </>;
}

function FeedbackSurveyTab({ from, to }) {
  const rangeQuery = new URLSearchParams({ from, to }).toString();
  const dashboard = useReportData(`/api/reports/dashboard?${rangeQuery}`, true);
  const stats = useReportData(`/api/feedbacks/stats?${rangeQuery}`, true);
  const ratings = useReportData(`/api/feedbacks/stats/rating?${rangeQuery}`, true);
  const feedbackExport = useReportData(`/api/feedbacks/report?${rangeQuery}`, true);
  const surveyListQuery = new URLSearchParams({ paged: 'true', limit: '100', from, to });
  const surveyList = useReportData(`/api/surveys?${surveyListQuery}`, true);
  const surveys = surveyList.data?.data || [];
  const [surveyId, setSurveyId] = useState('');
  useEffect(() => {
    if (!surveys.length) setSurveyId('');
    else if (!surveys.some(survey => String(survey.survey_id) === surveyId)) setSurveyId(String(surveys[0].survey_id));
  }, [surveyId, surveys]);
  const results = useReportData(surveyId ? `/api/surveys/${surveyId}/results?${rangeQuery}` : '', Boolean(surveyId));
  const distribution = ratings.data?.distribution || dashboard.data?.ratingDistribution || [];
  const feedbackRows = dashboard.data?.recentFeedbacks || [];
  const allFeedbackRows = feedbackExport.data?.data || [];
  const csvRows = [
    ...distribution.map(row => ['Đánh giá', `${row.rating} sao`, Number(row.count) || 0, '', '']),
    ...allFeedbackRows.map(row => ['Phản hồi', `${row.customer_name || 'Khách hàng'} · ${row.product_name || FEEDBACK_TYPE_LABELS[row.feedback_type] || row.feedback_type}`, Number(row.rating) || '', FEEDBACK_STATUS_LABELS[row.status] || row.status, row.created_at ? new Date(row.created_at).toISOString() : '', row.content || '']),
    ...(results.data?.questions || []).flatMap(question => [
      ...(question.options || []).map(option => ['Kết quả khảo sát', `${question.question_text} · ${option.option_text}`, Number(option.vote_count) || 0, '', '']),
      ...(question.text_answers || []).map((answer, index) => ['Câu trả lời tự luận', `${question.question_text} · Câu trả lời ${index + 1}: ${answer.answer_text}`, Number(answer.count) || 0, '', '']),
    ]),
  ];
  return <>
    <div className="reports-grid-two">
      <ReportBlock eyebrow="PHẢN HỒI" title="Tình trạng tiếp nhận"><StatePanel state={stats} empty={!stats.data}><div className="reports-kpi-row"><span>Tổng phản hồi<strong>{formatCount(Number(stats.data?.total) || 0)}</strong></span><span>Chưa xử lý<strong>{formatCount(Number(stats.data?.pending) || 0)}</strong></span><span>Đã giải quyết<strong>{formatCount(Number(stats.data?.resolved) || 0)}</strong></span><span>Bị từ chối<strong>{formatCount(Number(stats.data?.rejected) || 0)}</strong></span></div></StatePanel></ReportBlock>
      <ReportBlock eyebrow="ĐÁNH GIÁ" title="Phân bố xếp hạng"><StatePanel state={ratings} empty={!distribution.length}><Table headers={['Số sao', 'Số phản hồi']} rows={distribution.map(row => ({ key: row.rating, cells: [`${row.rating} sao`, formatCount(Number(row.count) || 0)] }))} /></StatePanel><p className="reports-subtle">Điểm trung bình: {ratings.data?.average == null ? '—' : Number(ratings.data.average).toFixed(2)}</p></ReportBlock>
    </div>
    <ReportBlock eyebrow="MỚI NHẤT" title="Phản hồi gần đây"><StatePanel state={dashboard} empty={!feedbackRows.length}><Table headers={['Khách hàng', 'Sản phẩm / loại', 'Đánh giá', 'Trạng thái', 'Ngày gửi']} rows={feedbackRows.map(row => ({ key: row.feedback_id, cells: [row.customer_name, row.product_name || FEEDBACK_TYPE_LABELS[row.feedback_type] || row.feedback_type, row.rating == null ? '—' : `${row.rating}/5`, FEEDBACK_STATUS_LABELS[row.status] || row.status, row.created_at ? DATE_FMT.format(new Date(row.created_at)) : '—'] }))} /></StatePanel></ReportBlock>
    <ReportBlock eyebrow="KHẢO SÁT" title="Kết quả khảo sát">
      <StatePanel state={surveyList} empty={!surveys.length} emptyText="Không có khảo sát diễn ra trong khoảng thời gian báo cáo đã chọn.">
        <label className="reports-field">Chọn khảo sát<select value={surveyId} onChange={event => setSurveyId(event.target.value)} aria-label="Chọn khảo sát để xem kết quả">{surveys.map(survey => <option key={survey.survey_id} value={survey.survey_id}>{survey.title}</option>)}</select></label>
      </StatePanel>
      {surveyId && <StatePanel state={results} empty={!results.data?.questions?.length} emptyText="Khảo sát chưa có câu hỏi hoặc kết quả.">
        <p className="reports-subtle">{results.data?.title} · {formatCount(Number(results.data?.total_responses) || 0)} lượt trả lời</p>
        {(results.data?.questions || []).map(question => <div className="reports-survey-question" key={question.question_id}>
          <strong>{question.question_text}</strong>
          <p className="reports-subtle">Có {formatCount(Number(question.answered_count) || 0)} người đã trả lời câu hỏi này.</p>
          {question.question_type === 'Text'
            ? question.text_answers?.length
              ? <ul className="reports-survey-text-answers">{question.text_answers.map((answer, index) => <li key={index}>{answer.answer_text} <span className="reports-subtle">({formatCount(Number(answer.count) || 0)} lượt)</span></li>)}</ul>
              : <p className="reports-empty">Chưa có câu trả lời tự luận.</p>
            : <SurveyOptionsChart options={question.options || []} answeredCount={question.answered_count} />}
        </div>)}
      </StatePanel>}
    </ReportBlock>
    <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('phan-hoi-khao-sat', `${from}-${to}`, ['Nhóm dữ liệu', 'Nội dung', 'Số lượng / đánh giá', 'Trạng thái', 'Ngày', 'Nội dung phản hồi'], csvRows)} disabled={!csvRows.length || feedbackExport.loading || Boolean(feedbackExport.error)}><Download size={15} /> Xuất CSV</button></div>
    {feedbackExport.error && <p className="reports-range-error" role="alert">Không thể tải đầy đủ phản hồi để xuất CSV: {feedbackExport.error}</p>}
  </>;
}

function WarehouseTab({ from, to }) {
  const rangeQuery = new URLSearchParams({ from, to }).toString();
  const movements = useReportData(`/api/reports/warehouse/movements?${rangeQuery}`, true);
  const suppliers = useReportData(`/api/reports/warehouse/suppliers?${rangeQuery}`, true);
  const [threshold, setThreshold] = useState(10);
  const stock = useReportData(`/api/reports/warehouse/summary?threshold=${threshold}`, true);
  const movementRows = Array.isArray(movements.data) ? movements.data : [];
  const supplierRows = Array.isArray(suppliers.data) ? suppliers.data : [];
  const lowStock = stock.data?.lowStock || [];
  const movementHeaders = ['Ngày', 'Loại phiếu', 'Số lượng', 'Giá trị (₫)'];
  const supplierHeaders = ['Nhà cung cấp', 'Số phiếu nhập', 'Số lượng nhập', 'Giá trị nhập (₫)'];
  const lowHeaders = ['Sản phẩm', 'SKU', 'Biến thể', 'Tồn', 'Ngưỡng'];
  return <>
    <section className="reports-summary-grid"><ReportBlock eyebrow="TỒN KHO HIỆN TẠI" title="Tổng giá trị tồn kho">
      <StatePanel state={stock} empty={!stock.data}><strong className="reports-big-number">{formatVnd(stock.data?.inventoryValue || 0)}</strong></StatePanel>
    </ReportBlock><ReportBlock eyebrow="HÀNG CẦN THEO DÕI" title="Ngưỡng tồn tối thiểu">
      <label className="reports-field">Số lượng ngưỡng<input type="number" min="0" max="1000000" value={threshold} onChange={event => setThreshold(Math.max(0, Math.min(1000000, Number(event.target.value) || 0)))} /></label>
    </ReportBlock></section>
    <ReportBlock eyebrow="NHẬP / XUẤT" title="Biến động kho theo ngày"><StatePanel state={movements} empty={!movementRows.length}><DistributionChart items={movementRows.map(row => ({ label: `${dateLabel(String(row.period).slice(0, 10))} · ${RECEIPT_TYPE_LABELS[row.receipt_type] || row.receipt_type}`, value: Number(row.quantity) || 0 }))} /><Table headers={movementHeaders} rows={movementRows.map((row, i) => ({ key: `${row.period}-${row.receipt_type}-${i}`, cells: [dateLabel(String(row.period).slice(0, 10)), RECEIPT_TYPE_LABELS[row.receipt_type] || row.receipt_type, formatCount(row.quantity), formatVnd(row.value)] }))} /></StatePanel>
      <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('bien-dong-kho', `${from}-${to}`, movementHeaders, movementRows.map(row => [dateLabel(String(row.period).slice(0, 10)), RECEIPT_TYPE_LABELS[row.receipt_type] || row.receipt_type, row.quantity, row.value]))} disabled={!movementRows.length}><Download size={15} /> Xuất CSV</button></div>
    </ReportBlock>
    <ReportBlock eyebrow="CẢNH BÁO TỒN" title="Danh sách hàng sắp hết"><StatePanel state={stock} empty={!lowStock.length}><Table headers={lowHeaders} rows={lowStock.map(row => ({ key: row.variant_id, cells: [row.product_name, row.sku, row.variant_label || [row.size_name, row.color_name].filter(Boolean).join(' / ') || 'Mặc định', formatCount(row.quantity), formatCount(row.threshold)] }))} /></StatePanel>
      <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('hang-sap-het', `nguong-${threshold}`, lowHeaders, lowStock.map(row => [row.product_name, row.sku, row.variant_label || [row.size_name, row.color_name].filter(Boolean).join(' / ') || 'Mặc định', row.quantity, row.threshold]))} disabled={!lowStock.length}><Download size={15} /> Xuất CSV</button></div>
    </ReportBlock>
    <ReportBlock eyebrow="NHÀ CUNG CẤP" title="Thống kê nhập hàng"><StatePanel state={suppliers} empty={!supplierRows.length}><Table headers={supplierHeaders} rows={supplierRows.map((row, i) => ({ key: `${row.supplier_name}-${i}`, cells: [row.supplier_name, formatCount(row.receipt_count), formatCount(row.imported_quantity), formatVnd(row.imported_value)] }))} /></StatePanel>
      <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('nhap-theo-nha-cung-cap', `${from}-${to}`, supplierHeaders, supplierRows.map(row => [row.supplier_name, row.receipt_count, row.imported_quantity, row.imported_value]))} disabled={!supplierRows.length}><Download size={15} /> Xuất CSV</button></div>
    </ReportBlock>
  </>;
}

function HrTab({ from, to }) {
  const query = new URLSearchParams({ from, to }).toString();
  const report = useReportData(`/api/reports/hr/summary?${query}`, true);
  const statuses = report.data?.statuses || [];
  const positions = report.data?.positions || [];
  const hires = report.data?.hiresByMonth || [];
  const csvRows = [
    ...statuses.map(row => ['Trạng thái', EMPLOYEE_STATUS_LABELS[row.status] || row.status, row.count]),
    ...positions.map(row => ['Chức vụ', row.position, row.count]),
    ...hires.map(row => ['Nhân viên mới theo tháng', String(row.month).slice(0, 10), row.count]),
  ];
  return <>
    <section className="reports-summary-grid"><ReportBlock eyebrow="HỒ SƠ NHÂN VIÊN" title="Tổng số nhân viên"><StatePanel state={report} empty={!report.data}><strong className="reports-big-number">{formatCount(report.data?.total || 0)}</strong></StatePanel></ReportBlock></section>
    <div className="reports-grid-two">
      <ReportBlock eyebrow="TRẠNG THÁI" title="Nhân viên theo trạng thái"><StatePanel state={report} empty={!statuses.length}><DistributionChart items={statuses.map(row => ({ label: EMPLOYEE_STATUS_LABELS[row.status] || row.status, value: Number(row.count) || 0 }))} /><Table headers={['Trạng thái', 'Số nhân viên']} rows={statuses.map(row => ({ key: row.status, cells: [EMPLOYEE_STATUS_LABELS[row.status] || row.status, formatCount(row.count)] }))} /></StatePanel></ReportBlock>
      <ReportBlock eyebrow="CHỨC VỤ" title="Nhân viên theo chức vụ"><StatePanel state={report} empty={!positions.length}><DistributionChart items={positions.map(row => ({ label: row.position, value: Number(row.count) || 0 }))} /><Table headers={['Chức vụ', 'Số nhân viên']} rows={positions.map(row => ({ key: row.position, cells: [row.position, formatCount(row.count)] }))} /></StatePanel></ReportBlock>
    </div>
    <ReportBlock eyebrow="TUYỂN DỤNG" title="Nhân viên mới theo tháng"><StatePanel state={report} empty={!hires.length}><Table headers={['Tháng', 'Nhân viên mới']} rows={hires.map(row => ({ key: String(row.month), cells: [dateLabel(String(row.month).slice(0, 10)), formatCount(row.count)] }))} /></StatePanel></ReportBlock>
    <div className="reports-export-row"><button type="button" className="dashboard-quick-action" onClick={() => exportCsv('nhan-su', `${from}-${to}`, ['Loại thống kê', 'Nhóm', 'Số nhân viên'], csvRows)} disabled={!csvRows.length}><Download size={15} /> Xuất CSV</button></div>
  </>;
}

export default function ReportsView({ userRole }) {
  const allowedTabs = TABS.filter(([key]) => TAB_ROLES[key].includes(userRole));
  const [tab, setTab] = useState(allowedTabs[0]?.[0] || '');
  const today = localDate(new Date());
  const initialPreset = '7 ngày';
  const [preset, setPreset] = useState(initialPreset);
  const [dates, setDates] = useState(() => presetRange(initialPreset));
  const days = daysBetween(dates.from, dates.to);
  const rangeValid = isFinite(days) && days > 0 && days <= 3660;
  const rangeError = !rangeValid ? 'Chọn khoảng thời gian hợp lệ, tối đa 10 năm.' : '';
  const groupBy = preset === '12 tháng' ? 'month' : days > 366 ? 'week' : 'day';
  const effectiveTab = allowedTabs.some(([key]) => key === tab) ? tab : allowedTabs[0]?.[0] || '';

  const applyPreset = name => {
    setPreset(name);
    setDates(presetRange(name));
  };
  const changeDate = (key, value) => {
    if (!value) return;
    setPreset(null);
    setDates(current => ({ ...current, [key]: value }));
  };

  return <div className="reports-page dashboard-enter dashboard-enter-welcome">
    <div className="reports-page-heading"><div><p className="dashboard-eyebrow">PHÂN TÍCH HỆ THỐNG</p><h1>Báo cáo</h1><p>Xem số liệu thực tế theo phạm vi và quyền truy cập của bạn.</p></div></div>
    {!allowedTabs.length ? <GlassCard className="reports-no-data"><h2>Chưa có báo cáo dành cho vai trò này</h2><p>Hiện hệ thống chưa có nguồn dữ liệu báo cáo phù hợp với quyền của bạn.</p></GlassCard> : <>
      <div className="reports-date-filter">
        <label className="reports-field">Từ ngày<DatePicker value={dates.from} max={dates.to || today} onChange={value => changeDate('from', value)} placeholder="Chọn ngày bắt đầu" ariaLabel="Từ ngày" /></label>
        <label className="reports-field">Đến ngày<DatePicker value={dates.to} min={dates.from} max={today} onChange={value => changeDate('to', value)} placeholder="Chọn ngày kết thúc" ariaLabel="Đến ngày" /></label>
        <div className="reports-presets" role="group" aria-label="Chọn nhanh khoảng thời gian">{PRESETS.map(name => <button type="button" key={name} className={preset === name ? 'is-active' : ''} aria-pressed={preset === name} onClick={() => applyPreset(name)}>{name}</button>)}</div>
        <span className="reports-subtle reports-filter-hint">Khoảng ngày áp dụng cho biến động kho, nhập theo nhà cung cấp, nhân viên mới và các báo cáo có dữ liệu theo thời gian.</span>
      </div>
      <div className="reports-tabs" role="tablist" aria-label="Các nhóm báo cáo">{allowedTabs.map(([key, label], index) => <button type="button" role="tab" id={`report-tab-${key}`} aria-controls={`report-panel-${key}`} aria-selected={effectiveTab === key} tabIndex={effectiveTab === key ? 0 : -1} className={effectiveTab === key ? 'is-active' : ''} key={key} onClick={() => setTab(key)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? allowedTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + allowedTabs.length) % allowedTabs.length;
        setTab(allowedTabs[next][0]);
        document.getElementById(`report-tab-${allowedTabs[next][0]}`)?.focus();
      }}>{label}</button>)}</div>
      <section className="reports-tab-panel dashboard-enter dashboard-enter-charts" role="tabpanel" id={`report-panel-${effectiveTab}`} aria-labelledby={`report-tab-${effectiveTab}`}>
        {effectiveTab === 'sales' && <SalesTab from={dates.from} to={dates.to} preset={preset} rangeDaysCount={days} groupBy={groupBy} rangeValid={rangeValid} rangeError={rangeError} />}
        {effectiveTab === 'warehouse' && <WarehouseTab from={dates.from} to={dates.to} />}
        {effectiveTab === 'hr' && <HrTab from={dates.from} to={dates.to} />}
        {effectiveTab === 'customers' && <CustomersTab from={dates.from} to={dates.to} />}
        {effectiveTab === 'feedback' && <FeedbackSurveyTab from={dates.from} to={dates.to} />}
      </section>
    </>}
  </div>;
}
