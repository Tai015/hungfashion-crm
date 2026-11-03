import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useModalEffects } from '../hooks/useModalEffects';
import { ChevronLeft, ChevronRight, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import FilterPopover from '../components/FilterPopover';
import { confirmDestructiveAction } from '../utils/confirmAction';
import { fmtVND } from '../utils/formatters';
import { useSweetAlertMessages } from '../utils/notifications';

const LIMIT = 24;
const INPUT  = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/22 outline-none focus:border-orange-500/50 focus:bg-white/10 focus:ring-2 focus:ring-orange-500/[0.12] transition-all dark-input';
const SELECT = INPUT + ' cursor-pointer';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 h-9 px-4 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer';
const PANEL  = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const TH     = 'px-3.5 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.05em] uppercase text-white/38 border-b border-white/[0.08] whitespace-nowrap';
const TD     = 'px-3.5 py-3 border-b border-white/[0.05] text-white/78 align-middle';
const ICON_BTN = 'grid w-8 h-8 place-items-center border border-white/10 rounded-[9px] bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-white/90 hover:border-white/22';

function Field({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-white/65 text-sm font-medium">{label&&<span>{label}</span>}{children}</label>;
}

function ProductModal({ product, categories, suppliers, onClose, onSaved }) {
  useModalEffects(true, onClose);
  const isEdit = Boolean(product);
  const [form, setForm] = useState(product ? {
    product_name: product.product_name||'', category_id: product.category_id||'',
    supplier_id: product.supplier_id||'', import_price: product.import_price||'',
    selling_price: product.selling_price||'', description: product.description||'',
  } : { product_name:'', category_id:'', supplier_id:'', import_price:'', selling_price:'', description:'' });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  useSweetAlertMessages({ error });

  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = { ...form, import_price:Number(form.import_price), selling_price:Number(form.selling_price), category_id:Number(form.category_id)||null, supplier_id:Number(form.supplier_id)||null };
      if (isEdit) await apiFetch(`/api/products/${product.product_id}`, { method:'PATCH', body });
      else        await apiFetch('/api/products', { method:'POST', body });
      onSaved();
    } catch(err) { setError(err.message); } finally { setBusy(false); }
  };

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={onClose}>
      <motion.div initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.94, opacity:0 }} transition={{ duration:0.18 }}
        className="popup-surface w-full max-w-[520px] p-7 border border-white/[0.12] rounded-3xl bg-[rgba(26,20,16,0.96)] shadow-[0_32px_80px_rgba(0,0,0,0.65)] text-[#f5f0eb]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.08]">
          <h2 className="m-0 text-[1.1rem] font-bold">{isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
          <button className="grid w-[34px] h-[34px] place-items-center border border-white/12 rounded-[9px] bg-white/[0.05] text-white/50 cursor-pointer transition-all hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="col-span-2">
              <Field label="Tên sản phẩm *">
                <input required maxLength={200} placeholder="Áo thun..." className={INPUT} value={form.product_name} onChange={e => setForm({...form, product_name:e.target.value})} />
              </Field>
            </div>
            <Field label="Danh mục">
              <select className={SELECT} value={form.category_id} onChange={e => setForm({...form, category_id:e.target.value})}>
                <option value="">-- Chọn danh mục --</option>
                {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
              </select>
            </Field>
            <Field label="Nhà cung cấp">
              <select className={SELECT} value={form.supplier_id} onChange={e => setForm({...form, supplier_id:e.target.value})}>
                <option value="">-- Chọn nhà cung cấp --</option>
                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </select>
            </Field>
            <Field label="Giá nhập (đ)"><input type="number" min="0" placeholder="0" className={INPUT} value={form.import_price} onChange={e => setForm({...form, import_price:e.target.value})} /></Field>
            <Field label="Giá bán (đ)"><input type="number" min="0" placeholder="0" className={INPUT} value={form.selling_price} onChange={e => setForm({...form, selling_price:e.target.value})} /></Field>
            <div className="col-span-2">
              <Field label="Mô tả">
                <textarea rows={3} maxLength={2000} className={`${INPUT} h-auto py-2.5 resize-y min-h-[70px]`} value={form.description} onChange={e => setForm({...form, description:e.target.value})} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Hủy</button>
            <button type="submit" className={`${BTN_PRIMARY} admin-primary-action`} disabled={busy}>{busy ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  ), document.body);
}

export default function ProductsView() {
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]         = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [search, setSearch]         = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId]       = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [minPrice, setMinPrice]     = useState('');
  const [maxPrice, setMaxPrice]     = useState('');
  const [sort, setSort]             = useState('created_at');
  const [order, setOrder]           = useState('desc');
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  useSweetAlertMessages({ error });
  const [refresh, setRefresh]       = useState(0);
  const [modal, setModal]           = useState(null);

  useEffect(() => {
    Promise.all([apiFetch('/api/products/categories'), apiFetch('/api/products/brands'), apiFetch('/api/inventory/suppliers')])
      .then(([cats, brandRows, supps]) => {
        const seen = new Set();
        setCategories(cats.filter(c => { if(seen.has(c.category_name)) return false; seen.add(c.category_name); return true; }));
        setBrands(brandRows || []);
        setSuppliers(supps||[]);
      }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ page, limit:LIMIT, sort, order });
    if (search)     p.set('search', search);
    if (categoryId) p.set('category_id', categoryId);
    if (brandId)    p.set('brand_id', brandId);
    if (supplierId) p.set('supplier_id', supplierId);
    if (minPrice !== '') p.set('min_price', minPrice);
    if (maxPrice !== '') p.set('max_price', maxPrice);
    apiFetch(`/api/products?${p}`)
      .then(d => { setProducts(d.data||[]); setTotal(d.total||0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, categoryId, brandId, supplierId, minPrice, maxPrice, page, sort, order, refresh]);

  const deleteProduct = async p => {
    const confirmed = await confirmDestructiveAction({
      title: 'Xóa sản phẩm?',
      text: `Bạn có chắc muốn xóa "${p.product_name}" không?`,
      confirmText: 'Xóa sản phẩm',
    });
    if (!confirmed) return;
    try { await apiFetch(`/api/products/${p.product_id}`, { method:'DELETE' }); setRefresh(v => v+1); }
    catch(err) { setError(err.message); }
  };

  const stockColor = n => n<=5 ? '#ef4444' : n<=20 ? '#f59e0b' : '#10b981';
  const totalPages = Math.ceil(total/LIMIT)||1;

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Kho hàng</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Quản lý sản phẩm</h1>
        </div>
        <button className={`${BTN_PRIMARY} admin-primary-action`} onClick={() => setModal('add')}><Plus size={15}/> Thêm sản phẩm</button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center flex-wrap gap-2.5 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none"/>
          <input className={`${INPUT} pl-9`} placeholder="Tìm tên hoặc mô tả sản phẩm..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <FilterPopover title="Lọc sản phẩm" activeCount={[search, categoryId, brandId, supplierId, minPrice, maxPrice, sort !== 'created_at' || order !== 'desc'].filter(Boolean).length}
          onClear={() => { setSearch(''); setCategoryId(''); setBrandId(''); setSupplierId(''); setMinPrice(''); setMaxPrice(''); setSort('created_at'); setOrder('desc'); setPage(1); }}>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Danh mục<select className={SELECT} value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }}><option value="">Tất cả danh mục</option>{categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Thương hiệu<select className={SELECT} value={brandId} onChange={e => { setBrandId(e.target.value); setPage(1); }}><option value="">Tất cả thương hiệu</option>{brands.map(brand => <option key={brand.brand_id} value={brand.brand_id}>{brand.brand_name}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Nhà cung cấp<select className={SELECT} value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}><option value="">Tất cả nhà cung cấp</option>{suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><label className="flex flex-col gap-1.5 text-xs text-white/65">Giá từ<input aria-label="Giá tối thiểu" className={INPUT} type="number" min="0" step="1000" value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1); }} /></label><label className="flex flex-col gap-1.5 text-xs text-white/65">Giá đến<input aria-label="Giá tối đa" className={INPUT} type="number" min="0" step="1000" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1); }} /></label></div>
          <label className="flex flex-col gap-1.5 text-xs text-white/65">Sắp xếp<select className={SELECT} value={`${sort}-${order}`} onChange={e => { const [s,o]=e.target.value.split('-'); setSort(s); setOrder(o); setPage(1); }}><option value="created_at-desc">Mới nhất</option><option value="name-asc">Tên A–Z</option><option value="price-asc">Giá thấp → cao</option><option value="price-desc">Giá cao → thấp</option></select></label>
        </FilterPopover>
      </div>


      <div className={PANEL}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2.5 m-0 text-[1.05rem] font-semibold">
            Sản phẩm
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-xs font-semibold">{total.toLocaleString('vi-VN')}</span>
          </h2>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>{['#','Tên sản phẩm','Danh mục','Giá nhập','Giá bán','Tồn kho','Thao tác'].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {products.length ? products.map(p => (
                  <tr key={p.product_id} className="hover:bg-white/[0.04] transition-colors">
                    <td className={`${TD} text-white/28 text-xs tabular-nums w-10`}>{p.product_id}</td>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <div className="grid w-8 h-8 place-items-center rounded-[10px] bg-white/[0.07] text-white/45 shrink-0"><Package size={13}/></div>
                        <strong className="text-[#f5f0eb] font-semibold">{p.product_name}</strong>
                      </div>
                    </td>
                    <td className={TD}><span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/[0.07] text-white/55 text-xs font-medium">{p.category_name}</span></td>
                    <td className={TD}>{fmtVND(p.import_price)}</td>
                    <td className={TD}><strong className="text-[#f5f0eb]">{fmtVND(p.selling_price)}</strong></td>
                    <td className={TD}>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums" style={{ color:stockColor(p.total_stock), background:`${stockColor(p.total_stock)}18` }}>{p.total_stock}</span>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <button className={ICON_BTN} title="Chỉnh sửa" onClick={() => setModal(p)}><Pencil size={14}/></button>
                        <button className={`${ICON_BTN} border-red-500/20 text-red-500/65 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-400`} title="Xóa" onClick={() => deleteProduct(p)}><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={7} className="py-10 text-center text-white/25 text-sm">Chưa có sản phẩm</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/[0.06]">
            <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={15}/></button>
            <span className="text-white/40 text-sm tabular-nums">Trang {page} / {totalPages}</span>
            <button className="grid w-9 h-9 place-items-center border border-white/10 rounded-xl bg-white/[0.06] text-white/55 cursor-pointer transition-all hover:bg-white/[0.12] hover:text-[#f5f0eb] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={page>=totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={15}/></button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <ProductModal
            product={modal==='add'?null:modal}
            categories={categories} suppliers={suppliers}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); setRefresh(v => v+1); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
