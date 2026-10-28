import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import { apiFetch } from './api';
import AppShell from './components/AppShell';
import Spinner from './components/Spinner';
import { CartProvider, useCart } from './context/CartContext';
const CartView = lazy(() => import('./views/CartView'));
const CheckoutView = lazy(() => import('./views/CheckoutView'));
const CustomerOrdersView = lazy(() => import('./views/CustomerOrdersView'));
const CskhChatView = lazy(() => import('./views/CskhChatView'));

const INTEREST_OPTIONS = ['Áo thun', 'Váy', 'Quần jean'];

const INPUT    = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT   = INPUT + ' cursor-pointer';
const TEXTAREA = 'w-full px-3 py-2.5 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all resize-y dark-input';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-10 px-5 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer disabled:opacity-50';
const PANEL    = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const FIELD    = 'flex flex-col gap-1.5 text-white/65 text-sm font-medium';

const PAGE_KEYS = ['catalog','cart','checkout','orders','profile','feedback','surveys','chat'];

/* ── Modal chọn biến thể khi thêm vào giỏ ── */
function VariantModal({ product, onAdd, onClose }) {
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty]           = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const { addItem }             = useCart();

  useEffect(() => {
    apiFetch(`/api/products/${product.product_id}`)
      .then(p => { setVariants(p.variants||[]); setLoading(false); })
      .catch(requestError => { setError(requestError.message); setLoading(false); });
  }, [product.product_id]);

  const handleAdd = () => {
    if (!selected) return;
    addItem(selected, product, qty);
    onAdd?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-5">
      <div className="w-full max-w-sm flex flex-col gap-4 p-6 border border-white/[0.12] rounded-3xl bg-[rgba(26,20,16,0.97)] shadow-[0_32px_80px_rgba(0,0,0,0.7)] text-[#f5f0eb]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="m-0 text-base font-bold">{product.product_name}</h3>
            <p className="m-0 mt-1 text-orange-400 font-bold">{Number(product.selling_price).toLocaleString('vi-VN')}đ</p>
          </div>
          <button className="text-white/35 hover:text-white/80 cursor-pointer transition-colors mt-1" onClick={onClose}><X size={18}/></button>
        </div>
        {loading ? <Spinner /> : error ? (
          <p className="text-red-300 text-sm" role="alert">{error}</p>
        ) : (
          <>
            {!variants.length ? (
              <p className="text-white/40 text-sm text-center py-4">Sản phẩm này hiện không có sẵn.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-white/55 text-sm font-medium">Chọn phiên bản</span>
                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                    {variants.map(v => (
                      <label key={v.variant_id}
                        className={`flex items-center justify-between gap-3 p-3 border rounded-xl cursor-pointer transition-all ${selected?.variant_id===v.variant_id ? 'border-orange-500/50 bg-orange-500/[0.09]' : 'border-white/10 bg-white/[0.04] hover:border-white/20'} ${v.quantity<=0?'opacity-40 cursor-not-allowed':''}`}>
                        <input type="radio" name="variant" className="accent-orange-500"
                          disabled={v.quantity<=0}
                          checked={selected?.variant_id===v.variant_id}
                          onChange={() => { setSelected(v); setQty(1); }} />
                        <span className="flex-1 text-sm">{v.size_name} — {v.color_name}</span>
                        <span className={`text-xs ${v.quantity<=5?'text-amber-400':'text-white/40'}`}>Còn {v.quantity}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {selected && (
                  <div className="flex items-center gap-3">
                    <span className="text-white/55 text-sm font-medium">Số lượng</span>
                    <div className="flex items-center gap-2">
                      <button type="button" className="grid w-8 h-8 place-items-center border border-white/12 rounded-lg bg-white/[0.07] text-white/60 cursor-pointer hover:bg-white/[0.15] transition-all disabled:opacity-30"
                        disabled={qty<=1} onClick={() => setQty(q => q-1)}>−</button>
                      <span className="w-8 text-center font-bold tabular-nums">{qty}</span>
                      <button type="button" className="grid w-8 h-8 place-items-center border border-white/12 rounded-lg bg-white/[0.07] text-white/60 cursor-pointer hover:bg-white/[0.15] transition-all disabled:opacity-30"
                        disabled={qty>=selected.quantity} onClick={() => setQty(q => q+1)}>+</button>
                    </div>
                  </div>
                )}
                <button className={BTN_PRIMARY} style={{ width:'100%', justifyContent:'center' }}
                  disabled={!selected} onClick={handleAdd}>
                  <ShoppingCart size={15}/> Thêm vào giỏ hàng
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Catalog sản phẩm ── */
function CustomerCatalog({ onGoCart }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState('created_at');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [modalProduct, setModalProduct] = useState(null);
  const [addedMsg, setAddedMsg] = useState('');
  const limit = 12;

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const p = new URLSearchParams({ page, limit, sort, order: sort==='price'?'asc':'desc' });
    if (search.trim()) p.set('search', search.trim());
    apiFetch(`/api/products?${p}`)
      .then(r => { if(!active) return; setProducts(r.data||[]); setTotal(r.total||0); })
      .catch(e => { if(active) setError(e.message); })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, sort]);

  const handleAdded = () => {
    setAddedMsg('Đã thêm vào giỏ hàng!');
    setTimeout(() => setAddedMsg(''), 2500);
  };

  const pages = Math.max(1, Math.ceil(total/limit));

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Cửa hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Sản phẩm thời trang</h1>
        </div>
        {addedMsg && (
          <span className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-medium rounded-xl animate-pulse">
            ✓ {addedMsg}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <input type="search" className={`${INPUT} flex-1`} value={search} placeholder="Tìm sản phẩm..."
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select className={`${SELECT} w-auto`} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="created_at">Mới nhất</option>
          <option value="name">Tên A–Z</option>
          <option value="price">Giá thấp đến cao</option>
        </select>
      </div>

      {error && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}

      {loading ? <Spinner /> : (
        <>
          <section className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {products.map(p => (
              <article key={p.product_id} className="flex flex-col overflow-hidden bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] hover:bg-white/[0.09] hover:-translate-y-1 transition-all">
                {p.image_url && <img src={p.image_url} alt={p.product_name} loading="lazy" className="w-full h-44 object-cover" />}
                <div className="flex flex-col gap-1.5 p-4">
                  <p className="m-0 text-white/40 text-[0.7rem] font-semibold tracking-widest uppercase">{p.category_name}</p>
                  <h2 className="m-0 text-[0.95rem] font-bold text-[#f5f0eb] leading-tight">{p.product_name}</h2>
                  <strong className="text-orange-400 text-base font-bold">{Number(p.selling_price).toLocaleString('vi-VN')}đ</strong>
                  <small className="text-white/35 text-xs">Còn {p.total_stock} sản phẩm</small>
                  <button className={`${BTN_PRIMARY} mt-1 w-full justify-center text-xs h-9 px-3`}
                    disabled={p.total_stock <= 0}
                    onClick={() => setModalProduct(p)}>
                    <ShoppingCart size={13}/> {p.total_stock>0?'Thêm vào giỏ':'Hết hàng'}
                  </button>
                </div>
              </article>
            ))}
            {!products.length && <div className="col-span-full py-16 text-center text-white/25 text-sm">Không tìm thấy sản phẩm phù hợp.</div>}
          </section>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/[0.06]">
              <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
              <span className="text-white/40 text-sm tabular-nums">Trang {page} / {pages}</span>
              <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page>=pages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
            </div>
          )}
        </>
      )}
      {modalProduct && (
        <VariantModal product={modalProduct} onAdd={handleAdded} onClose={() => setModalProduct(null)} />
      )}
    </div>
  );
}

/* ── Hồ sơ cá nhân ── */
function CustomerProfile({ user, onUserUpdated }) {
  const [form, setForm] = useState({ full_name:user.full_name||'', gender:user.gender||'', date_of_birth:user.date_of_birth?.slice(0,10)||'', phone:user.phone||'', address:user.address||'', interests:user.interests||[] });
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy]       = useState(false);
  const upd = (k,v) => setForm(f => ({...f, [k]:v}));
  const save = async e => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const updated = await apiFetch('/api/auth/me', { method:'PUT', body:{ ...form, gender:form.gender||null, date_of_birth:form.date_of_birth||null } });
      onUserUpdated(updated); setMessage('Đã cập nhật hồ sơ.');
    } catch(err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Tài khoản</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Hồ sơ cá nhân</h1>
      </div>
      <form className={`${PANEL} max-w-xl`} onSubmit={save}>
        {error   && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm" role="alert">{error}</p>}
        {message && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm" role="status">{message}</p>}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="col-span-2">
            <label className={FIELD}><span>Họ và tên</span><input required maxLength={150} className={INPUT} value={form.full_name} onChange={e => upd('full_name',e.target.value)} /></label>
          </div>
          <label className={FIELD}><span>Giới tính</span>
            <select className={SELECT} value={form.gender} onChange={e => upd('gender',e.target.value)}>
              <option value="">Chưa cung cấp</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
            </select>
          </label>
          <label className={FIELD}><span>Ngày sinh</span><input type="date" className={INPUT} value={form.date_of_birth} onChange={e => upd('date_of_birth',e.target.value)} /></label>
          <label className={FIELD}><span>Số điện thoại</span><input type="tel" maxLength={30} className={INPUT} value={form.phone} onChange={e => upd('phone',e.target.value)} /></label>
          <div className="col-span-2">
            <label className={FIELD}><span>Địa chỉ</span><textarea maxLength={500} rows={3} className={TEXTAREA} value={form.address} onChange={e => upd('address',e.target.value)} /></label>
          </div>
          <div className="col-span-2 flex flex-col gap-2.5">
            <span className="text-white/60 text-sm font-medium">Sở thích</span>
            <div className="flex flex-wrap gap-2.5">
              {[...new Set([...INTEREST_OPTIONS, ...form.interests])].map(interest => (
                <label key={interest} className="flex items-center gap-2 text-sm text-white/55 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-orange-500"
                    checked={form.interests.includes(interest)}
                    onChange={e => upd('interests', e.target.checked ? [...form.interests,interest] : form.interests.filter(x => x!==interest))} />
                  {interest}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div><button className={BTN_PRIMARY} type="submit" disabled={busy}>{busy?'Đang lưu...':'Lưu hồ sơ'}</button></div>
      </form>
    </div>
  );
}

/* ── Gửi phản hồi ── */
function CustomerFeedback() {
  const [products, setProducts] = useState([]);
  const [form, setForm]         = useState({ product_id:'', rating:'5', content:'' });
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [busy, setBusy]         = useState(false);

  useEffect(() => { apiFetch('/api/products?limit=100').then(r => setProducts(r.data||[])).catch(e => setError(e.message)); }, []);

  const submit = async e => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await apiFetch('/api/feedbacks', { method:'POST', body:{ product_id:Number(form.product_id), rating:Number(form.rating), content:form.content } });
      setForm({ product_id:'', rating:'5', content:'' });
      setMessage('Cảm ơn bạn đã gửi phản hồi.');
    } catch(err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Chăm sóc khách hàng</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Gửi phản hồi sản phẩm</h1>
      </div>
      <form className={`${PANEL} max-w-xl`} onSubmit={submit}>
        {error   && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm" role="alert">{error}</p>}
        {message && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm" role="status">{message}</p>}
        <div className="flex flex-col gap-3.5">
          <label className={FIELD}><span>Sản phẩm</span>
            <select required className={SELECT} value={form.product_id} onChange={e => setForm({...form, product_id:e.target.value})}>
              <option value="">Chọn sản phẩm</option>
              {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
            </select>
          </label>
          <label className={FIELD}><span>Đánh giá</span>
            <select className={SELECT} value={form.rating} onChange={e => setForm({...form, rating:e.target.value})}>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}
            </select>
          </label>
          <label className={FIELD}><span>Nội dung</span>
            <textarea required minLength={2} maxLength={5000} rows={5} className={TEXTAREA} value={form.content} onChange={e => setForm({...form, content:e.target.value})} />
          </label>
        </div>
        <div><button className={BTN_PRIMARY} type="submit" disabled={busy||!products.length}>{busy?'Đang gửi...':'Gửi phản hồi'}</button></div>
      </form>
    </div>
  );
}

/* ── Khảo sát ── */
function CustomerSurveys() {
  const [surveys, setSurveys]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers]   = useState({});
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [busy, setBusy]         = useState(false);

  const load = () => apiFetch('/api/surveys/mine').then(setSurveys).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const openSurvey = async survey => {
    setError('');
    try { const d = await apiFetch(`/api/surveys/${survey.survey_id}`); setSelected(d); setAnswers({}); }
    catch(e) { setError(e.message); }
  };
  const submit = async e => {
    e.preventDefault();
    const submitted = selected.questions.flatMap(q => {
      const v = answers[q.question_id];
      if (v==null||v===''||(Array.isArray(v)&&!v.length)) return [];
      if (q.question_type==='MultiChoice') return v.map(option_id => ({ question_id:q.question_id, option_id }));
      if (q.question_type==='SingleChoice') return [{ question_id:q.question_id, option_id:Number(v) }];
      return [{ question_id:q.question_id, answer_text:String(v) }];
    });
    setError(''); setBusy(true);
    try { const r = await apiFetch(`/api/surveys/${selected.survey_id}/respond`, { method:'POST', body:{ answers:submitted } }); setMessage(r.message); setSelected(null); await load(); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Khảo sát</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Khảo sát của tôi</h1>
      </div>
      {error   && <p className="p-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</p>}
      {message && <p className="p-3 px-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{message}</p>}
      {selected ? (
        <form className={`${PANEL} max-w-2xl`} onSubmit={submit}>
          <div>
            <button type="button" className={BTN_GHOST} onClick={() => setSelected(null)}>← Danh sách khảo sát</button>
            <h2 className="m-0 mt-3 text-xl font-bold">{selected.title}</h2>
            {selected.description && <p className="m-0 mt-1.5 text-white/45 text-sm">{selected.description}</p>}
          </div>
          <div className="flex flex-col gap-4">
            {selected.questions.map(q => (
              <fieldset key={q.question_id} className="flex flex-col gap-2.5 p-4 border border-white/[0.07] rounded-xl bg-white/[0.03]">
                <legend className="text-[#f5f0eb] text-sm font-semibold mb-1">
                  {q.question_text}{q.is_required && <span className="text-orange-500 ml-1">*</span>}
                </legend>
                {['SingleChoice','MultiChoice'].includes(q.question_type) && q.options.map(opt => (
                  <label key={opt.option_id} className="flex items-center gap-2.5 text-sm text-white/60 cursor-pointer hover:text-white/90 transition-colors">
                    <input type={q.question_type==='SingleChoice'?'radio':'checkbox'} className="w-4 h-4 accent-orange-500"
                      name={`question-${q.question_id}`}
                      required={q.question_type==='SingleChoice'&&q.is_required}
                      checked={q.question_type==='SingleChoice'?Number(answers[q.question_id])===opt.option_id:(answers[q.question_id]||[]).includes(opt.option_id)}
                      onChange={e => {
                        if (q.question_type==='SingleChoice') setAnswers(a=>({...a,[q.question_id]:String(opt.option_id)}));
                        else setAnswers(a=>({...a,[q.question_id]:e.target.checked?[...(a[q.question_id]||[]),opt.option_id]:(a[q.question_id]||[]).filter(id=>id!==opt.option_id)}));
                      }} />
                    {opt.option_text}
                  </label>
                ))}
                {q.question_type==='Text' && <textarea required={q.is_required} maxLength={2000} rows={3} className={TEXTAREA} value={answers[q.question_id]||''} onChange={e=>setAnswers(a=>({...a,[q.question_id]:e.target.value}))} />}
                {q.question_type==='Rating' && (
                  <select required={q.is_required} className={`${SELECT} w-auto`} value={answers[q.question_id]||''} onChange={e=>setAnswers(a=>({...a,[q.question_id]:e.target.value}))}>
                    <option value="">Chọn số sao</option>
                    {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} sao</option>)}
                  </select>
                )}
              </fieldset>
            ))}
          </div>
          <div><button className={BTN_PRIMARY} type="submit" disabled={busy}>{busy?'Đang gửi...':'Gửi câu trả lời'}</button></div>
        </form>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {surveys.map(s => (
            <article key={s.survey_id} className="flex flex-col justify-between gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] hover:bg-white/[0.09] transition-all">
              <div>
                <p className="m-0 text-white/35 text-xs font-semibold">{s.end_date ? `Hạn ${new Date(s.end_date).toLocaleDateString('vi-VN')}` : 'Chưa đặt hạn'}</p>
                <h2 className="m-0 mt-1.5 text-[1rem] font-bold text-[#f5f0eb]">{s.title}</h2>
                {s.description && <p className="m-0 mt-1 text-white/40 text-sm leading-relaxed line-clamp-2">{s.description}</p>}
              </div>
              <button className={BTN_PRIMARY} style={{ alignSelf:'flex-start' }} onClick={() => openSurvey(s)}>Làm khảo sát</button>
            </article>
          ))}
          {!surveys.length && <div className="col-span-full py-16 text-center text-white/25 text-sm">Hiện không có khảo sát nào cần hoàn thành.</div>}
        </div>
      )}
    </div>
  );
}

/* ── Cart badge wrapper ── */
function CartBadge({ onClick }) {
  const { totalItems } = useCart();
  return (
    <button className="relative grid w-9 h-9 place-items-center rounded-xl bg-white/[0.07] border border-white/12 text-white/60 hover:text-[#f5f0eb] hover:bg-white/[0.12] cursor-pointer transition-all"
      onClick={onClick} title="Giỏ hàng">
      <ShoppingCart size={16}/>
      {totalItems > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-orange-500 text-white text-[0.6rem] font-bold rounded-full">
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </button>
  );
}

/* ── Portal nội bộ (dùng CartProvider) ── */
function PortalInner({ user, onUserUpdated, onLogout }) {
  const pageKeys = ['catalog','cart','orders','profile','feedback','surveys','chat'];
  const initial  = window.location.hash.split('/').at(-1);
  const [view, setView]        = useState(pageKeys.includes(initial) ? initial : 'catalog');
  const [checkout, setCheckout] = useState(false);

  const nav = [
    ['catalog','Sản phẩm'],
    ['orders','Đơn hàng của tôi'],
    ['profile','Hồ sơ cá nhân'],
    ['feedback','Gửi phản hồi'],
    ['surveys','Khảo sát'],
    ['chat','Chat hỗ trợ'],
  ];

  useEffect(() => {
    const sync = () => { const next = window.location.hash.split('/').at(-1); if (pageKeys.includes(next)) { setView(next); setCheckout(false); } };
    window.addEventListener('hashchange', sync);
    if (!window.location.hash.startsWith('#/khach-hang/')) window.location.hash = '#/khach-hang/catalog';
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const goView = key => { window.location.hash = `#/khach-hang/${key}`; setView(key); setCheckout(false); };

  return (
    <AppShell brand="Hung Fashion" userName={user.full_name||user.username} roleLabel="Khách hàng"
      navItems={nav} active={view}
      onNav={goView} onLogout={onLogout}
      extraHeaderContent={
        <CartBadge onClick={() => { setCheckout(false); goView('cart'); }} />
      }>
      <Suspense fallback={<div className="grid min-h-64 place-items-center"><Spinner /></div>}>
        {view==='catalog' && !checkout && <CustomerCatalog onGoCart={() => goView('cart')} />}
        {view==='cart'    && !checkout && <CartView onCheckout={() => setCheckout(true)} />}
        {view==='cart'    && checkout  && (
          <CheckoutView
            onBack={() => setCheckout(false)}
            onOrderSuccess={() => goView('orders')}
          />
        )}
        {view==='orders'  && <CustomerOrdersView />}
        {view==='profile' && <CustomerProfile user={user} onUserUpdated={onUserUpdated} />}
        {view==='feedback'&& <CustomerFeedback />}
        {view==='surveys' && <CustomerSurveys />}
        {view==='chat'    && <CskhChatView user={user} />}
      </Suspense>
    </AppShell>
  );
}

/* ── Export chính ── */
export default function CustomerPortal({ user, onUserUpdated, onLogout }) {
  return (
    <CartProvider key={user.account_id} accountId={user.account_id}>
      <PortalInner user={user} onUserUpdated={onUserUpdated} onLogout={onLogout} />
    </CartProvider>
  );
}
