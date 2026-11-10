import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useModalEffects } from './hooks/useModalEffects';
import Pagination from './components/Pagination';
import FeedbackMedia from './components/FeedbackMedia';
import FilterPopover from './components/FilterPopover';
import { apiFetch, subscribeToChatEvents } from './api';
import AppShell from './components/AppShell';
import Spinner from './components/Spinner';
import { CardGridSkeleton, SkeletonBlock } from './components/Skeleton';
import { CartProvider, useCart } from './context/CartContext';
import { useSweetAlertMessages } from './utils/notifications';
import { runPageTransition } from './utils/pageTransition';
import PaymentSuccessModal from './components/PaymentSuccessModal';
import DatePicker from './components/DatePicker';
const CartView = lazy(() => import('./views/CartView'));
const CheckoutView = lazy(() => import('./views/CheckoutView'));
const CustomerOrdersView = lazy(() => import('./views/CustomerOrdersView'));
const CskhChatView = lazy(() => import('./views/CskhChatView'));
const CustomerVouchersView = lazy(() => import('./views/CustomerVouchersView'));
const CustomerLoyaltyView = lazy(() => import('./views/CustomerLoyaltyView'));

const INPUT    = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT   = INPUT + ' cursor-pointer';
const TEXTAREA = 'w-full px-3 py-2.5 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all resize-y dark-input';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-10 px-5 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer disabled:opacity-50';
const PANEL    = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const FIELD    = 'flex flex-col gap-1.5 text-white/65 text-sm font-medium';
const CATALOG_INPUT = 'portal-input w-full h-10 px-3 rounded-xl text-sm outline-none transition-all';
const CATALOG_PRIMARY = 'portal-button-primary inline-flex items-center gap-1.5 h-10 px-5 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 cursor-pointer';

const PAGE_KEYS = ['catalog','cart','checkout','orders','profile','feedback','surveys','chat'];

/* ── Modal chọn biến thể khi thêm vào giỏ ── */
function VariantModal({ product, onAdd, onClose }) {
  useModalEffects(true, onClose);
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty]           = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const { addItem }             = useCart();
  useSweetAlertMessages({ error });

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

  return createPortal((
    <div className="customer-product-variant-modal fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="customer-product-variant-surface w-full max-w-sm flex flex-col gap-4 p-6 rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="m-0 text-base font-bold">{product.product_name}</h3>
            <p className="portal-price m-0 mt-1 font-bold">{Number(product.selling_price).toLocaleString('vi-VN')}đ</p>
          </div>
          <button className="portal-icon-button mt-1" aria-label="Đóng" onClick={onClose}><X size={18}/></button>
        </div>
        {loading ? <Spinner portalTheme /> : error ? null : (
          <>
            {!variants.length ? (
              <p className="portal-text-muted text-sm text-center py-4">Sản phẩm này hiện không có sẵn.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <span className="portal-text-secondary text-sm font-medium">Chọn phiên bản</span>
                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                    {variants.map(v => (
                      <label key={v.variant_id}
                        className={`portal-variant-option flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all ${selected?.variant_id===v.variant_id ? 'is-selected' : ''} ${v.quantity<=0?'opacity-40 cursor-not-allowed':''}`}>
                        <input type="radio" name="variant" className="portal-radio"
                          disabled={v.quantity<=0}
                          checked={selected?.variant_id===v.variant_id}
                          onChange={() => { setSelected(v); setQty(1); }} />
                        <span className="flex-1 text-sm">{v.size_name} — {v.color_name}</span>
                        <span className={`portal-stock text-xs ${v.quantity<=5?'is-low':''}`}>Còn {v.quantity}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {selected && (
                  <div className="flex items-center gap-3">
                    <span className="portal-text-secondary text-sm font-medium">Số lượng</span>
                    <div className="flex items-center gap-2">
                      <button type="button" className="portal-quantity-button grid w-8 h-8 place-items-center rounded-lg cursor-pointer transition-all disabled:opacity-30"
                        disabled={qty<=1} onClick={() => setQty(q => q-1)}>−</button>
                      <span className="w-8 text-center font-bold tabular-nums">{qty}</span>
                      <button type="button" className="portal-quantity-button grid w-8 h-8 place-items-center rounded-lg cursor-pointer transition-all disabled:opacity-30"
                        disabled={qty>=selected.quantity} onClick={() => setQty(q => q+1)}>+</button>
                    </div>
                  </div>
                )}
                <button className={CATALOG_PRIMARY} style={{ width:'100%', justifyContent:'center' }}
                  disabled={!selected} onClick={handleAdd}>
                  <ShoppingCart size={15}/> Thêm vào giỏ hàng
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  ), document.body);
}

/* ── Catalog sản phẩm ── */
function CustomerCatalog({ onGoCart, guest = false, onLogin }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState('created_at');
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]       = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [modalProduct, setModalProduct] = useState(null);
  const [addedMsg, setAddedMsg] = useState('');
  useSweetAlertMessages({ error, success: addedMsg });
  const limit = 24;

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    apiFetch('/api/products/categories')
      .then(rows => { if (active) setCategories(Array.isArray(rows) ? rows : []); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, [retryCount]);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const p = new URLSearchParams({ page, limit, sort, order: ['price', 'category'].includes(sort) ? 'asc' : 'desc' });
    if (search.trim()) p.set('search', search.trim());
    apiFetch(`/api/products?${p}`)
      .then(r => { if(!active) return; setProducts(r.data||[]); setTotal(r.total||0); })
      .catch(e => { if(active) setError(e.message); })
      .finally(() => { if(active) { setLoading(false); setHasLoadedOnce(true); } });
    return () => { active = false; };
  }, [page, search, sort, retryCount]);

  const handleAdded = () => {
    setAddedMsg('Đã thêm vào giỏ hàng!');
    setTimeout(() => setAddedMsg(''), 2500);
  };

  const pages = Math.max(1, Math.ceil(total/limit));

  return (
    <div className={`customer-catalog flex flex-col gap-5${hasLoadedOnce ? ' app-page-enter' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="portal-category m-0 text-xs font-semibold tracking-[0.08em] uppercase">Cửa hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Sản phẩm thời trang</h1>
        </div>
      </div>

      <div className="portal-filter-bar flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl">
        <input type="search" className={`${CATALOG_INPUT} flex-1`} value={search} placeholder="Tìm sản phẩm..."
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <FilterPopover portalTheme title="Sắp xếp sản phẩm" activeCount={sort !== 'created_at' ? 1 : 0} onClear={() => { setSort('created_at'); setPage(1); }}>
          <label className="portal-field flex flex-col gap-1.5 text-xs">Sắp xếp theo<select className={`${CATALOG_INPUT} w-full`} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            <option value="created_at">Mới nhất</option><option value="name">Tên A–Z</option><option value="price">Giá thấp đến cao</option><option value="category">Loại sản phẩm A–Z</option>
          </select></label>
        </FilterPopover>
      </div>


      {loading || (guest && categoriesLoading) ? <div className="customer-catalog-loading" role="status" aria-live="polite"><Spinner portalTheme label={guest ? 'Đang lấy dữ liệu, vui lòng chờ…' : 'Đang tải...'} /></div> : guest && error ? (
        <div className="portal-empty col-span-full flex flex-col items-center gap-3 py-16 text-center" role="alert">
          <ShoppingBag size={30} aria-hidden="true" />
          <p className="m-0 text-sm">Không thể tải dữ liệu cửa hàng. Vui lòng kiểm tra kết nối và thử lại.</p>
          <button type="button" className={CATALOG_PRIMARY} onClick={() => { setError(''); setLoading(true); setRetryCount(value => value + 1); }}>
            Thử tải lại
          </button>
        </div>
      ) : (
        <>
          <section key={page} className="app-page-enter grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {products.map(p => (
              <article key={p.product_id} className="portal-product-card flex flex-col overflow-hidden rounded-2xl transition-all">
                <div className="portal-product-image">
                  {p.image_url ? <img src={p.image_url} alt={p.product_name} loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} /> : null}
                  <div className="portal-product-image-placeholder" role="img" hidden={Boolean(p.image_url)} aria-label={`Không có ảnh cho ${p.product_name}`}><ShoppingBag size={34} aria-hidden="true" /></div>
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <p className="portal-category m-0 text-[0.7rem] font-semibold tracking-widest uppercase">{p.category_name}</p>
                  <h2 className="portal-text-primary m-0 text-[0.95rem] font-bold leading-tight">{p.product_name}</h2>
                  <strong className="portal-price text-base font-bold">{Number(p.selling_price).toLocaleString('vi-VN')}đ</strong>
                  <small className="portal-stock text-xs">Còn {p.total_stock} sản phẩm</small>
                  <button className={`${CATALOG_PRIMARY} mt-1 w-full justify-center text-xs h-9 px-3`}
                    disabled={!guest && p.total_stock <= 0}
                    onClick={() => guest ? onLogin?.() : setModalProduct(p)}>
                    <ShoppingCart size={13}/> {guest ? 'Đăng nhập để mua' : p.total_stock>0?'Thêm vào giỏ':'Hết hàng'}
                  </button>
                </div>
              </article>
            ))}
            {!products.length && <div className="portal-empty col-span-full py-16 text-center text-sm"><ShoppingBag size={28} aria-hidden="true"/><span>Không tìm thấy sản phẩm phù hợp.</span></div>}
          </section>
          {pages > 1 && (
            <div className="portal-pagination flex items-center justify-center gap-3 pt-4">
              <button className="portal-pagination-button grid w-9 h-9 place-items-center rounded-xl cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
              <span className="portal-text-secondary text-sm tabular-nums">Trang {page} / {pages}</span>
              <button className="portal-pagination-button grid w-9 h-9 place-items-center rounded-xl cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={page>=pages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
            </div>
          )}
        </>
      )}
      {!guest && modalProduct && (
        <VariantModal product={modalProduct} onAdd={handleAdded} onClose={() => setModalProduct(null)} />
      )}
    </div>
  );
}

/* ── Hồ sơ cá nhân ── */
function CustomerProfile({ user, onUserUpdated }) {
  const [form, setForm] = useState({ full_name:user.full_name||'', gender:user.gender||'', date_of_birth:user.date_of_birth?.slice(0,10)||'', phone:user.phone||'', address:user.address||'', interests:user.interests||[] });
  const [categories, setCategories] = useState([]);
  const [interestToAdd, setInterestToAdd] = useState('');
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  useSweetAlertMessages({ error, success: message });
  const [busy, setBusy]       = useState(false);
  useEffect(() => {
    apiFetch('/api/products/categories')
      .then(rows => setCategories(Array.isArray(rows) ? rows : []))
      .catch(err => setError(err.message));
  }, []);
  const upd = (k,v) => setForm(f => ({...f, [k]:v}));
  const save = async e => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const updated = await apiFetch('/api/auth/me', { method:'PUT', body:{ ...form, gender:form.gender||null, date_of_birth:form.date_of_birth||null } });
      onUserUpdated(updated); setMessage('Đã cập nhật hồ sơ.');
    } catch(err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="customer-profile-view flex min-h-[calc(100vh-3.5rem)] flex-col justify-center gap-5 text-[#f5f0eb]">
      <div className="mx-auto w-full max-w-3xl text-center">
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Tài khoản</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Hồ sơ cá nhân</h1>
      </div>
      <form className={`customer-profile-panel ${PANEL} mx-auto w-full max-w-3xl`} onSubmit={save}>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="col-span-2">
            <label className={FIELD}><span>Họ và tên</span><input required maxLength={150} className={INPUT} value={form.full_name} onChange={e => upd('full_name',e.target.value)} /></label>
          </div>
          <label className={FIELD}><span>Giới tính</span>
            <select className={SELECT} value={form.gender} onChange={e => upd('gender',e.target.value)}>
              <option value="">Chưa cung cấp</option><option value="Female">Nữ</option><option value="Male">Nam</option><option value="Other">Khác</option>
            </select>
          </label>
          <label className={FIELD}><span>Ngày sinh</span><DatePicker className={INPUT} value={form.date_of_birth} onChange={value => upd('date_of_birth', value)} placeholder="Chọn ngày sinh" ariaLabel="Ngày sinh" max={new Date().toLocaleDateString('en-CA')} /></label>
          <label className={FIELD}><span>Số điện thoại</span><input type="tel" maxLength={30} className={INPUT} value={form.phone} onChange={e => upd('phone',e.target.value)} /></label>
          <div className="col-span-2">
            <label className={FIELD}><span>Địa chỉ</span><textarea maxLength={500} rows={3} className={TEXTAREA} value={form.address} onChange={e => upd('address',e.target.value)} /></label>
          </div>
          <div className="col-span-2 flex flex-col gap-2.5">
            <span className="text-white/60 text-sm font-medium">Sở thích</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <select aria-label="Chọn sở thích" className={`${SELECT} min-w-52 flex-1`} value={interestToAdd} onChange={e => setInterestToAdd(e.target.value)}>
                <option value="">Chọn loại sản phẩm</option>
                {categories.filter(category => !form.interests.includes(category.category_name)).map(category => (
                  <option key={category.category_id} value={category.category_name}>{category.category_name}</option>
                ))}
              </select>
              <button type="button" className={BTN_GHOST} disabled={!interestToAdd} onClick={() => {
                if (!interestToAdd) return;
                upd('interests', [...form.interests, interestToAdd]);
                setInterestToAdd('');
              }}>Thêm sở thích</button>
              <div className="flex w-full flex-wrap gap-2">
                {form.interests.map(interest => (
                  <button key={interest} type="button" onClick={() => upd('interests', form.interests.filter(item => item !== interest))}
                    className="customer-interest-chip inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-200 hover:bg-red-500/15 hover:text-red-200">
                    {interest}<X size={13} aria-hidden="true" /><span className="sr-only">Xóa sở thích {interest}</span>
                  </button>
                ))}
                {!categories.length && <span className="text-xs text-white/40">Chưa tải được danh mục sản phẩm.</span>}
              </div>
            </div>
          </div>
        </div>
        <div><button className={BTN_PRIMARY} type="submit" disabled={busy}>{busy?'Đang lưu...':'Lưu hồ sơ'}</button></div>
      </form>
    </div>
  );
}

/* ── Gửi phản hồi ── */
function CustomerFeedback({ initialDraft, onDraftConsumed, onViewOrders }) {
  const [products, setProducts] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(true);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [form, setForm]         = useState({ product_id:'', order_id:'', product_name:'', rating:'5', content:'' });
  const [mediaFiles, setMediaFiles] = useState([]);
  const mediaFilesRef = useRef(mediaFiles);
  mediaFilesRef.current = mediaFiles;
  const [previewImageError, setPreviewImageError] = useState(false);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  useSweetAlertMessages({ error, success: message });
  const [busy, setBusy]         = useState(false);

  useEffect(() => () => mediaFilesRef.current.forEach(file => URL.revokeObjectURL(file.previewUrl)), []);

  const loadFeedbacks = async (page = feedbackPage) => {
    setFeedbacksLoading(true);
    try {
      const result = await apiFetch(`/api/feedbacks/mine?page=${page}&limit=20`);
      setFeedbacks(result.data || []); setFeedbackTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setFeedbacksLoading(false);
    }
  };

  useEffect(() => {
    apiFetch('/api/products?limit=100').then(r => setProducts(r.data||[])).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!initialDraft) return;
    setForm(current => ({
      ...current,
      product_id: String(initialDraft.product_id),
      order_id: String(initialDraft.order_id),
      product_name: initialDraft.product_name || '',
      image_url: initialDraft.image_url || '',
      content: '',
    }));
    onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);
  useEffect(() => { loadFeedbacks(feedbackPage); }, [feedbackPage]);

  const selectedProduct = products.find(product => Number(product.product_id) === Number(form.product_id));
  const selectedImage = selectedProduct?.image_url || form.image_url || '';
  useEffect(() => { setPreviewImageError(false); }, [selectedImage]);

  const addMediaFiles = incomingFiles => {
    const accepted = incomingFiles.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (accepted.length !== incomingFiles.length) setError('Chỉ có thể đính kèm ảnh hoặc video.');
    const withinSize = accepted.filter(file => file.size <= 25 * 1024 * 1024);
    if (withinSize.length !== accepted.length) setError('Mỗi ảnh/video không được vượt quá 25 MB.');
    const current = mediaFilesRef.current;
    const additions = withinSize.slice(0, Math.max(0, 4 - current.length)).map((file, index) => {
      const namedFile = file.name ? file : new File([file], `clipboard-${Date.now()}-${index}`, { type: file.type });
      return Object.assign(namedFile, { previewUrl: URL.createObjectURL(namedFile) });
    });
    if (additions.length < withinSize.length) setError('Mỗi đánh giá đính kèm tối đa 4 tệp.');
    const nextFiles = [...current, ...additions];
    mediaFilesRef.current = nextFiles;
    setMediaFiles(nextFiles);
  };

  const handleMediaPaste = event => {
    const clipboard = event.clipboardData;
    const pastedFiles = Array.from(clipboard?.files || []);
    const itemFiles = Array.from(clipboard?.items || [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter(Boolean);
    const files = pastedFiles.length ? pastedFiles : itemFiles;
    if (!files.length) return;
    event.preventDefault();
    addMediaFiles(files);
  };

  const submit = async e => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const body = new FormData();
      body.append('product_id', String(Number(form.product_id)));
      if (form.order_id) body.append('order_id', String(Number(form.order_id)));
      body.append('rating', String(Number(form.rating)));
      body.append('content', form.content);
      mediaFiles.forEach(file => body.append('media', file));
      await apiFetch('/api/feedbacks', { method:'POST', body });
      mediaFiles.forEach(file => URL.revokeObjectURL(file.previewUrl));
      mediaFilesRef.current = [];
      setMediaFiles([]);
      setForm({ product_id:'', order_id:'', product_name:'', image_url:'', rating:'5', content:'' });
      setMessage('Cảm ơn bạn đã gửi phản hồi.');
      if (feedbackPage !== 1) setFeedbackPage(1);
      else await loadFeedbacks(1);
    } catch(err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Chăm sóc khách hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Gửi phản hồi sản phẩm</h1>
          <p className="m-0 mt-1 text-white/45 text-sm">Đánh giá sản phẩm trong mục Đơn hàng của tôi sau khi đơn được giao.</p>
        </div>
        <button type="button" className={BTN_GHOST} onClick={onViewOrders}>
          <ShoppingBag size={15}/> Xem đơn đã giao
        </button>
      </div>
      <form className={`${PANEL} max-w-xl`} onSubmit={submit} onPaste={handleMediaPaste}>
        <div className="flex flex-col gap-3.5">
          <div className={FIELD}><span>Sản phẩm</span>
            <div className="flex items-center gap-3">
              <div className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] text-white/25">
                {selectedImage && !previewImageError
                  ? <img key={selectedImage} src={selectedImage} alt={selectedProduct?.product_name || form.product_name || 'Sản phẩm đang chọn'}
                      className="h-full w-full object-cover" onError={() => setPreviewImageError(true)} />
                  : <ShoppingBag size={20} aria-hidden="true" />}
              </div>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Chọn sản phẩm</span>
                <select required disabled={Boolean(form.order_id)} className={SELECT} value={form.product_id} onChange={e => {
                  const product = products.find(item => String(item.product_id) === e.target.value);
                  setForm({ ...form, product_id:e.target.value, product_name:product?.product_name || '', image_url:product?.image_url || '' });
                }}>
                  <option value="">Chọn sản phẩm</option>
                  {form.product_id && !products.some(p => Number(p.product_id) === Number(form.product_id)) && <option value={form.product_id}>{form.product_name || `Sản phẩm #${form.product_id}`}</option>}
                  {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                </select>
              </label>
            </div>
            {form.order_id && <small className="text-white/40 text-xs">Đã chọn từ đơn hàng #{form.order_id} đã giao.</small>}
          </div>
          <label className={FIELD}><span>Đánh giá</span>
            <select className={SELECT} value={form.rating} onChange={e => setForm({...form, rating:e.target.value})}>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}
            </select>
          </label>
          <label className={FIELD}><span>Nội dung</span>
            <textarea required minLength={2} maxLength={5000} rows={5} className={TEXTAREA} value={form.content} onChange={e => setForm({...form, content:e.target.value})} />
          </label>
          <div className={FIELD} role="group" aria-label="Ảnh và video đánh giá">
            <span>Ảnh và video đính kèm <span className="text-white/35 font-normal">(tối đa 4 mục, 25 MB/mục)</span></span>
            <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white/80 hover:bg-white/[0.12]">
              Chọn ảnh/video
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="sr-only"
                onChange={event => {
                  const selectedFiles = Array.from(event.target.files || []);
                  addMediaFiles(selectedFiles);
                  event.target.value = '';
                }} />
            </label>
            {!!mediaFiles.length && <div className="flex flex-wrap gap-3">
              {mediaFiles.map((file, index) => <div key={`${file.name}-${index}`} className="relative h-24 w-24 overflow-hidden rounded-lg border border-white/10 bg-black/20">
                {file.type.startsWith('video/') ? <video src={file.previewUrl} className="h-full w-full object-cover" muted /> : <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" />}
                <button type="button" aria-label={`Xóa ${file.name}`} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white" onClick={() => {
                  URL.revokeObjectURL(file.previewUrl);
                  const nextFiles = mediaFilesRef.current.filter((_, i) => i !== index);
                  mediaFilesRef.current = nextFiles;
                  setMediaFiles(nextFiles);
                }}><X size={13}/></button>
              </div>)}
            </div>}
          </div>
        </div>
        <div><button className={BTN_PRIMARY} type="submit" disabled={busy||!products.length}>{busy?'Đang gửi...':'Gửi phản hồi'}</button></div>
      </form>
      <section className={PANEL}>
        <div>
          <h2 className="m-0 text-lg font-semibold">Phản hồi đã gửi</h2>
          <p className="m-0 mt-1 text-white/45 text-sm">Xem trạng thái xử lý và câu trả lời từ cửa hàng.</p>
        </div>
        {feedbacksLoading ? (
          <div aria-label="Đang tải lịch sử phản hồi" className="flex flex-col gap-3 py-2">
            {[0, 1].map(item => <div key={item} className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-4"><SkeletonBlock className="h-4 w-1/3" /><SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-16 w-full" /></div>)}
          </div>
        ) : feedbacks.length ? (
          <div key={feedbackPage} className="app-page-enter flex flex-col gap-3">
            {feedbacks.map(feedback => (
              <article key={feedback.feedback_id} className="flex flex-col gap-3 p-4 bg-white/[0.035] border border-white/[0.08] rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                    <span>{new Date(feedback.created_at).toLocaleString('vi-VN')}</span>
                    {feedback.product_name && <span>· {feedback.product_name}</span>}
                    {feedback.order_id && <span>· Đơn #{feedback.order_id}</span>}
                    {feedback.rating && <span className="text-amber-300">· {'★'.repeat(feedback.rating)}</span>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    feedback.status === 'Resolved' ? 'bg-emerald-500/15 text-emerald-300'
                      : feedback.status === 'Rejected' ? 'bg-red-500/15 text-red-300'
                        : 'bg-amber-500/15 text-amber-200'
                  }`}>
                    {feedback.status === 'Resolved' ? 'Đã phản hồi'
                      : feedback.status === 'Rejected' ? 'Đã từ chối'
                        : feedback.status === 'Processing' ? 'Đang xử lý' : 'Mới tiếp nhận'}
                  </span>
                </div>
                <p className="m-0 text-sm text-white/80 whitespace-pre-wrap">{feedback.content}</p>
                {!!feedback.attachments?.length && <div className="flex flex-wrap gap-3">
                  {feedback.attachments.map(media => <FeedbackMedia key={media.attachment_id} media={media} />)}
                </div>}
                <div className="p-3 bg-orange-500/[0.06] border border-orange-500/15 rounded-lg">
                  <p className="m-0 text-xs font-semibold text-orange-300">Cửa hàng trả lời</p>
                  <p className="m-0 mt-1 text-sm text-white/70 whitespace-pre-wrap">
                    {feedback.reply || 'Cửa hàng chưa phản hồi. Chúng tôi sẽ cập nhật tại đây khi xử lý xong.'}
                  </p>
                  {feedback.replied_at && <small className="block mt-2 text-white/40">{new Date(feedback.replied_at).toLocaleString('vi-VN')}</small>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="m-0 py-8 text-center text-white/50 text-sm">Bạn chưa gửi phản hồi nào.</p>
        )}
        <Pagination page={feedbackPage} total={feedbackTotal} limit={20} loading={feedbacksLoading} onChange={setFeedbackPage} />
      </section>
    </div>
  );
}

/* ── Khảo sát ── */
function CustomerSurveys({ user, onGoProfile }) {
  const [surveys, setSurveys]   = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers]   = useState({});
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  useSweetAlertMessages({ error, success: message });
  const [busy, setBusy]         = useState(false);
  const [loading, setLoading]   = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const load = (requestedPage = page) => {
    setLoading(true);
    return apiFetch(`/api/surveys/mine?page=${requestedPage}&limit=20&paged=true`)
      .then(result => { setSurveys(result.data || []); setTotal(result.total || 0); })
      .catch(e => setError(e.message)).finally(() => { setLoading(false); setHasLoadedOnce(true); });
  };
  useEffect(() => { load(page); }, [page]);

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
    try { const r = await apiFetch(`/api/surveys/${selected.survey_id}/respond`, { method:'POST', body:{ answers:submitted } }); setMessage(r.message); setSelected(null); if (page !== 1) setPage(1); else await load(1); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`flex flex-col gap-5 text-[#f5f0eb]${hasLoadedOnce ? ' app-page-enter' : ''}`}>
      <div>
        <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Khảo sát</p>
        <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Khảo sát của tôi</h1>
      </div>
      {(!user?.date_of_birth || !Array.isArray(user?.interests) || user.interests.length === 0) ? (
        <section className={`${PANEL} mx-auto w-full max-w-2xl`} role="alert">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-300">
              <UserRound size={20} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="m-0 text-base font-semibold text-[#f5f0eb]">Bạn cần hoàn thiện hồ sơ</h2>
              <p className="mt-1 mb-0 text-sm leading-relaxed text-white/55">
                Để tham gia khảo sát, vui lòng bổ sung
                {!user?.date_of_birth && ' ngày sinh'}
                {!user?.date_of_birth && (!Array.isArray(user?.interests) || user.interests.length === 0) && ' và'}
                {(!Array.isArray(user?.interests) || user.interests.length === 0) && ' ít nhất một sở thích'}.
              </p>
              <button type="button" className={`${BTN_PRIMARY} mt-4`} onClick={onGoProfile}>
                Cập nhật hồ sơ
              </button>
            </div>
          </div>
        </section>
      ) : selected ? (
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
        loading ? <CardGridSkeleton count={3} /> :
        <div key={page} className="app-page-enter grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
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
      {!selected && <Pagination page={page} total={total} limit={20} loading={loading} onChange={setPage} />}
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
  const pageKeys = ['catalog','cart','orders','vouchers','loyalty','profile','feedback','surveys','chat'];
  const initial  = window.location.hash.split('/').at(-1);
  const [view, setView]        = useState(pageKeys.includes(initial) ? initial : 'catalog');
  const [checkout, setCheckout] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [feedbackDraft, setFeedbackDraft] = useState(null);
  const [paymentSuccessOrder, setPaymentSuccessOrder] = useState(null);
  const pendingTransferIdsRef = useRef(new Set());

  useEffect(() => {
    const refreshUnread = async () => {
      try {
        const result = await apiFetch('/api/chat/my-conversation/unread-count');
        setUnreadChatCount(Number(result.unread_count) || 0);
      } catch { /* keep the last known unread count while offline */ }
    };
    refreshUnread();
    return subscribeToChatEvents(refreshUnread);
  }, [user.account_id]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const checkPayments = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const result = await apiFetch('/api/orders/mine?page=1&limit=100');
        if (!active) return;
        const previousPending = pendingTransferIdsRef.current;
        const nextPending = new Set();
        let newlyPaid = null;

        for (const order of result.data || []) {
          if (order.payment_method !== 'BankTransfer') continue;
          const orderId = String(order.order_id);
          const pendingKey = `pending-transfer-order:${orderId}`;
          const seenKey = `payment-success:${orderId}`;
          if (order.payment_status === 'Pending') {
            nextPending.add(orderId);
          } else if (order.payment_status === 'Paid' && !newlyPaid
            && !localStorage.getItem(seenKey)
            && (previousPending.has(orderId) || localStorage.getItem(pendingKey))) {
            newlyPaid = {
              order_id: order.order_id,
              total_amount: order.total_amount,
              payment: { amount: order.payment_amount, status: 'Paid', method: 'BankTransfer' },
            };
            localStorage.setItem(seenKey, '1');
            localStorage.removeItem(pendingKey);
          } else if (['Failed', 'Refunded'].includes(order.payment_status)) {
            localStorage.removeItem(pendingKey);
          }
        }
        pendingTransferIdsRef.current = nextPending;
        if (newlyPaid) setPaymentSuccessOrder(current => current || newlyPaid);
      } catch { /* Retry on the next visible interval. */ }
      finally { inFlight = false; }
    };

    checkPayments();
    const timer = setInterval(checkPayments, 4000);
    const onVisibilityChange = () => { if (!document.hidden) checkPayments(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user.account_id]);

  useEffect(() => {
    if (view === 'chat') setUnreadChatCount(0);
  }, [view]);

  const nav = [
    ['catalog','Sản phẩm'],
    ['orders','Đơn hàng của tôi'],
    ['vouchers','Ví ưu đãi'],
    ['loyalty','Điểm thưởng'],
    ['feedback','Gửi phản hồi'],
    ['surveys','Khảo sát'],
    ['chat','Trò chuyện hỗ trợ', unreadChatCount],
  ];

  useEffect(() => {
    const sync = () => { const next = window.location.hash.split('/').at(-1); if (pageKeys.includes(next)) { setView(next); setCheckout(false); } };
    window.addEventListener('hashchange', sync);
    if (!window.location.hash.startsWith('#/khach-hang/')) window.location.hash = '#/khach-hang/catalog';
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const goView = key => runPageTransition(() => {
    window.location.hash = `#/khach-hang/${key}`;
    setView(key);
    setCheckout(false);
  });

  return (
    <AppShell brand="Hung Fashion" userName={user.full_name||user.username} roleLabel="Khách hàng"
      navItems={nav} active={view}
      onNav={goView} onLogout={onLogout}
      extraHeaderContent={
        <CartBadge onClick={() => { setCheckout(false); goView('cart'); }} />
      }>
      <div key={`${view}:${checkout ? 'checkout' : 'page'}`} className="app-page-enter">
        <Suspense fallback={<div className="grid min-h-64 place-items-center"><Spinner /></div>}>
          {view==='catalog' && !checkout && <CustomerCatalog onGoCart={() => goView('cart')} />}
          {view==='cart'    && !checkout && <CartView onCheckout={() => setCheckout(true)} />}
          {view==='cart'    && checkout  && (
            <CheckoutView
              onBack={() => setCheckout(false)}
              onOrderSuccess={() => goView('orders')}
            />
          )}
          {view==='orders'  && <CustomerOrdersView onReviewProduct={draft => { setFeedbackDraft(draft); goView('feedback'); }} />}
          {view==='vouchers' && <CustomerVouchersView />}
          {view==='loyalty' && <CustomerLoyaltyView />}
          {view==='profile' && <CustomerProfile user={user} onUserUpdated={onUserUpdated} />}
          {view==='feedback'&& <CustomerFeedback initialDraft={feedbackDraft} onDraftConsumed={() => setFeedbackDraft(null)} onViewOrders={() => goView('orders')} />}
          {view==='surveys' && <CustomerSurveys user={user} onGoProfile={() => goView('profile')} />}
          {view==='chat'    && <CskhChatView user={user} />}
        </Suspense>
      </div>
      {paymentSuccessOrder && <PaymentSuccessModal
        order={paymentSuccessOrder}
        onClose={() => { setPaymentSuccessOrder(null); goView('orders'); }}
        onViewOrders={() => { setPaymentSuccessOrder(null); goView('orders'); }}
      />}
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

export function GuestStorefront({ onLogin, onRegister }) {
  return (
    <div className="customer-portal-shell" data-theme="light">
      <main className="customer-portal-main">
        <header className="customer-portal-header">
          <div className="customer-portal-header-left">
            <span className="customer-portal-brand-mark" aria-hidden="true">H</span>
            <div className="customer-portal-page-title"><span>Hung Fashion <i>/</i></span><strong>Cửa hàng</strong></div>
          </div>
          <div className="customer-portal-header-actions">
            <button type="button" className="guest-auth-button" onClick={onLogin}>Đăng nhập</button>
            <button type="button" className="guest-auth-button guest-auth-button-primary" onClick={onRegister}>Đăng ký</button>
          </div>
          <span className="customer-portal-header-glow" aria-hidden="true" />
        </header>
        <div className="customer-portal-content"><CustomerCatalog guest onLogin={onLogin} /></div>
      </main>
    </div>
  );
}
