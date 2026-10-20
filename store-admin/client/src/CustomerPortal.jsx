import { useEffect, useState } from 'react';
import { apiFetch } from './api';

const INTEREST_OPTIONS = ['Áo thun', 'Váy', 'Quần jean'];

function CustomerPortal({ user, onUserUpdated, onLogout }) {
  const pageKeys = ['catalog', 'profile', 'feedback', 'surveys'];
  const initialPage = window.location.hash.split('/').at(-1);
  const [view, setView] = useState(pageKeys.includes(initialPage) ? initialPage : 'catalog');
  const nav = [
    ['catalog', 'Sản phẩm'],
    ['profile', 'Hồ sơ cá nhân'],
    ['feedback', 'Gửi phản hồi'],
    ['surveys', 'Khảo sát của tôi'],
  ];

  useEffect(() => {
    const syncRoute = () => {
      const next = window.location.hash.split('/').at(-1);
      if (pageKeys.includes(next)) setView(next);
    };
    window.addEventListener('hashchange', syncRoute);
    if (!window.location.hash.startsWith('#/khach-hang/')) window.location.hash = '#/khach-hang/catalog';
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar customer-sidebar">
        <div className="brand">Hung Fashion</div>
        <p className="sidebar-user">Xin chào, {user.full_name || user.username}</p>
        <nav>{nav.map(([key, label]) => (
          <button className={`nav-item${view === key ? ' active' : ''}`} key={key} onClick={() => { window.location.hash = `#/khach-hang/${key}`; setView(key); }}>{label}</button>
        ))}</nav>
        <button className="nav-item logout-link" onClick={onLogout}>Đăng xuất</button>
      </aside>
      <main className="main-panel">
        {view === 'catalog' && <CustomerCatalog />}
        {view === 'profile' && <CustomerProfile user={user} onUserUpdated={onUserUpdated} />}
        {view === 'feedback' && <CustomerFeedback />}
        {view === 'surveys' && <CustomerSurveys />}
      </main>
    </div>
  );
}

function CustomerCatalog() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 12;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit, sort, order: sort === 'price' ? 'asc' : 'desc' });
    if (search.trim()) params.set('search', search.trim());
    apiFetch(`/api/products?${params}`)
      .then(result => {
        if (!active) return;
        setProducts(result.data || []);
        setTotal(result.total || 0);
      })
      .catch(requestError => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, sort]);

  return (
    <>
      <header className="topbar"><div><p className="eyebrow">Cửa hàng</p><h1>Sản phẩm thời trang</h1></div></header>
      <div className="filter-toolbar">
        <label className="filter-field search-field">Tìm sản phẩm
          <input className="search-input" type="search" value={search} placeholder="Tên hoặc mô tả sản phẩm" onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <label className="filter-field">Sắp xếp
          <select className="filter-select" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            <option value="created_at">Mới nhất</option><option value="name">Tên A–Z</option><option value="price">Giá thấp đến cao</option>
          </select>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="panel"><p>Đang tải sản phẩm...</p></div> : (
        <>
          <section className="product-grid">
            {products.map(product => (
              <article className="panel product-card" key={product.product_id}>
                {product.image_url && <img src={product.image_url} alt={product.product_name} loading="lazy" />}
                <div><p className="eyebrow">{product.category_name}</p><h2>{product.product_name}</h2>
                  <p className="customer-price">{Number(product.selling_price).toLocaleString('vi-VN')}đ</p>
                  <small>Còn {product.total_stock} sản phẩm</small>
                </div>
              </article>
            ))}
            {!products.length && <div className="panel empty-state">Không tìm thấy sản phẩm phù hợp.</div>}
          </section>
          <Pagination page={page} total={total} limit={limit} onPage={setPage} />
        </>
      )}
    </>
  );
}

function CustomerProfile({ user, onUserUpdated }) {
  const [form, setForm] = useState({
    full_name: user.full_name || '', gender: user.gender || '', date_of_birth: user.date_of_birth?.slice(0, 10) || '',
    phone: user.phone || '', address: user.address || '', interests: user.interests || [],
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const updated = await apiFetch('/api/auth/me', { method: 'PUT', body: { ...form, gender: form.gender || null, date_of_birth: form.date_of_birth || null } });
      onUserUpdated(updated);
      setMessage('Đã cập nhật hồ sơ.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar"><div><p className="eyebrow">Tài khoản</p><h1>Hồ sơ cá nhân</h1></div></header>
      <form className="panel stack-form profile-form" onSubmit={save}>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <label>Họ và tên<input required maxLength={150} value={form.full_name} onChange={e => update('full_name', e.target.value)} /></label>
        <label>Giới tính<select value={form.gender} onChange={e => update('gender', e.target.value)}><option value="">Chưa cung cấp</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option></select></label>
        <label>Ngày sinh<input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} /></label>
        <label>Số điện thoại<input type="tel" maxLength={30} value={form.phone} onChange={e => update('phone', e.target.value)} /></label>
        <label>Địa chỉ<textarea maxLength={500} rows={3} value={form.address} onChange={e => update('address', e.target.value)} /></label>
        <fieldset className="interest-options"><legend>Sở thích</legend>
          {[...new Set([...INTEREST_OPTIONS, ...form.interests])].map(interest => <label key={interest}><input type="checkbox" checked={form.interests.includes(interest)} onChange={e => update('interests', e.target.checked ? [...form.interests, interest] : form.interests.filter(item => item !== interest))} />{interest}</label>)}
        </fieldset>
        <button className="primary-btn" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
      </form>
    </>
  );
}

function CustomerFeedback() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ product_id: '', rating: '5', content: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch('/api/products?limit=100')
      .then(result => setProducts(result.data || []))
      .catch(requestError => setError(requestError.message));
  }, []);

  const submit = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await apiFetch('/api/feedbacks', { method: 'POST', body: { product_id: Number(form.product_id), rating: Number(form.rating), content: form.content } });
      setForm({ product_id: '', rating: '5', content: '' });
      setMessage('Cảm ơn bạn đã gửi phản hồi.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar"><div><p className="eyebrow">Chăm sóc khách hàng</p><h1>Gửi phản hồi sản phẩm</h1></div></header>
      <form className="panel stack-form profile-form" onSubmit={submit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <label>Sản phẩm<select required value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}><option value="">Chọn sản phẩm</option>{products.map(item => <option key={item.product_id} value={item.product_id}>{item.product_name}</option>)}</select></label>
        <label>Đánh giá<select value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}</select></label>
        <label>Nội dung<textarea required minLength={2} maxLength={5000} rows={5} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></label>
        <button className="primary-btn" disabled={busy || !products.length}>{busy ? 'Đang gửi...' : 'Gửi phản hồi'}</button>
      </form>
    </>
  );
}

function CustomerSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch('/api/surveys/mine').then(setSurveys).catch(requestError => setError(requestError.message));
  useEffect(() => { load(); }, []);
  const openSurvey = async survey => {
    setError('');
    try {
      const details = await apiFetch(`/api/surveys/${survey.survey_id}`);
      setSelected(details);
      setAnswers({});
    } catch (requestError) { setError(requestError.message); }
  };
  const submit = async event => {
    event.preventDefault();
    const submitted = selected.questions.flatMap(question => {
      const value = answers[question.question_id];
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return [];
      if (question.question_type === 'MultiChoice') return value.map(option_id => ({ question_id: question.question_id, option_id }));
      if (['SingleChoice'].includes(question.question_type)) return [{ question_id: question.question_id, option_id: Number(value) }];
      return [{ question_id: question.question_id, answer_text: String(value) }];
    });
    setError('');
    setBusy(true);
    try {
      const result = await apiFetch(`/api/surveys/${selected.survey_id}/respond`, { method: 'POST', body: { answers: submitted } });
      setMessage(result.message);
      setSelected(null);
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar"><div><p className="eyebrow">Khảo sát</p><h1>Khảo sát của tôi</h1></div></header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {selected ? (
        <form className="panel stack-form survey-form" onSubmit={submit}>
          <div><button className="text-button" type="button" onClick={() => setSelected(null)}>← Danh sách khảo sát</button><h2>{selected.title}</h2><p>{selected.description}</p></div>
          {selected.questions.map(question => <SurveyQuestion key={question.question_id} question={question} value={answers[question.question_id]} onChange={value => setAnswers(current => ({ ...current, [question.question_id]: value }))} />)}
          <button className="primary-btn" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi câu trả lời'}</button>
        </form>
      ) : (
        <section className="survey-list">
          {surveys.map(survey => <article className="panel survey-card" key={survey.survey_id}>
            <div><p className="eyebrow">{survey.end_date ? `Hạn ${new Date(survey.end_date).toLocaleDateString('vi-VN')}` : 'Chưa đặt hạn'}</p><h2>{survey.title}</h2><p>{survey.description}</p></div>
            <button className="primary-btn" onClick={() => openSurvey(survey)}>Làm khảo sát</button>
          </article>)}
          {!surveys.length && <div className="panel empty-state">Hiện không có khảo sát nào cần hoàn thành.</div>}
        </section>
      )}
    </>
  );
}

function SurveyQuestion({ question, value, onChange }) {
  return (
    <fieldset className="survey-question">
      <legend>{question.question_text}{question.is_required && <span> *</span>}</legend>
      {['SingleChoice', 'MultiChoice'].includes(question.question_type) && question.options.map(option => (
        <label key={option.option_id}>
          <input
            type={question.question_type === 'SingleChoice' ? 'radio' : 'checkbox'}
            name={`question-${question.question_id}`}
            required={question.question_type === 'SingleChoice' && question.is_required}
            checked={question.question_type === 'SingleChoice'
              ? Number(value) === option.option_id
              : (value || []).includes(option.option_id)}
            onChange={event => {
              if (question.question_type === 'SingleChoice') onChange(String(option.option_id));
              else onChange(event.target.checked
                ? [...(value || []), option.option_id]
                : (value || []).filter(id => id !== option.option_id));
            }}
          />{option.option_text}
        </label>
      ))}
      {question.question_type === 'Text' && <textarea required={question.is_required} maxLength={2000} rows={3} value={value || ''} onChange={e => onChange(e.target.value)} />}
      {question.question_type === 'Rating' && <select required={question.is_required} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Chọn số sao</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} sao</option>)}</select>}
    </fieldset>
  );
}

function Pagination({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return pages > 1 && <div className="pagination">
    <button className="event-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Trước</button>
    <span>Trang {page} / {pages}</span>
    <button className="event-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau →</button>
  </div>;
}

export default CustomerPortal;
