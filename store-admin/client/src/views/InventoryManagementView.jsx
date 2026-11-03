import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import FilterPopover from '../components/FilterPopover';
import { showErrorAlert, showSuccessAlert } from '../utils/notifications';
import { useModalEffects } from '../hooks/useModalEffects';

const FIELD = 'w-full h-10 px-3 bg-white/[0.07] border border-white/[0.12] rounded-xl text-[#f5f0eb] text-sm placeholder-white/30 outline-none focus:border-orange-500/50 dark-input';
const BTN = 'inline-flex items-center justify-center gap-2 h-9 px-4 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50';
const PANEL = 'flex flex-col gap-4 p-5 bg-white/[0.06] border border-white/10 rounded-2xl text-[#f5f0eb]';
const fmt = value => Number(value || 0).toLocaleString('vi-VN') + ' ₫';
const emptyLine = () => ({ product_id: '', variant_id: '', quantity: 1, unit_price: 0, variants: [] });

function SupplierForm({ supplier, onDone, onCancel }) {
  const [form, setForm] = useState({ supplier_name: supplier?.supplier_name || '', contact_name: supplier?.contact_name || '', phone: supplier?.phone || '', email: supplier?.email || '', address: supplier?.address || '' });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      await apiFetch(supplier ? `/api/inventory/suppliers/${supplier.supplier_id}` : '/api/inventory/suppliers', { method: supplier ? 'PATCH' : 'POST', body: form });
      showSuccessAlert(supplier ? 'Đã cập nhật nhà cung cấp.' : 'Đã thêm nhà cung cấp.'); onDone();
    } catch (error) { showErrorAlert(error.message); } finally { setBusy(false); }
  };
  return <form className={`${PANEL} popup-surface`} onSubmit={submit}>
    <h2 className="m-0 text-lg font-semibold">{supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <input className={FIELD} required maxLength={200} placeholder="Tên nhà cung cấp *" value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} />
      <input className={FIELD} maxLength={150} placeholder="Người liên hệ" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
      <input className={FIELD} maxLength={20} placeholder="Điện thoại" value={form.phone} onChange={e => set('phone', e.target.value)} />
      <input className={FIELD} type="email" maxLength={150} placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} />
      <input className={`${FIELD} md:col-span-2`} maxLength={500} placeholder="Địa chỉ" value={form.address} onChange={e => set('address', e.target.value)} />
    </div>
    <div className="flex gap-2"><button className={`${BTN} admin-primary-action`} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu nhà cung cấp'}</button><button type="button" className={`${BTN} admin-secondary-action`} onClick={onCancel}>Đóng</button></div>
  </form>;
}

function ReceiptForm({ onCancel, onDone }) {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [type, setType] = useState('Import');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/api/products?limit=100'), apiFetch('/api/inventory/suppliers')])
      .then(([productResult, supplierResult]) => { setProducts(productResult.data || []); setSuppliers(supplierResult); })
      .catch(error => showErrorAlert(error.message));
  }, []);

  const updateLine = async (index, key, value) => {
    const updated = lines.map((line, i) => i === index ? { ...line, [key]: value } : line);
    if (key === 'product_id') {
      updated[index] = { ...updated[index], variant_id: '', variants: [] };
      setLines(updated);
      if (value) {
        try {
          const product = await apiFetch(`/api/products/${value}`);
          setLines(current => current.map((line, i) => i === index ? { ...line, variants: product.variants || [] } : line));
        } catch (error) { showErrorAlert(error.message); }
      }
      return;
    }
    if (key === 'variant_id') {
      const variant = updated[index].variants.find(item => String(item.variant_id) === String(value));
      const product = products.find(item => String(item.product_id) === String(updated[index].product_id));
      updated[index].unit_price = type === 'Import' ? Number(product?.import_price || 0) : Number(product?.selling_price || 0);
      updated[index].variant = variant;
    }
    setLines(updated);
  };

  const submit = async event => {
    event.preventDefault();
    if (type === 'Import' && !supplierId) return showErrorAlert('Phiếu nhập cần chọn nhà cung cấp.');
    if (lines.some(line => !line.variant_id || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 || !Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0)) return showErrorAlert('Chọn biến thể và nhập số lượng, đơn giá hợp lệ cho từng dòng.');
    setBusy(true);
    try {
      await apiFetch('/api/inventory/receipts', { method: 'POST', body: {
        receipt_type: type, supplier_id: supplierId || null, note: note.trim() || null,
        details: lines.map(line => ({ variant_id: Number(line.variant_id), quantity: Number(line.quantity), unit_price: Number(line.unit_price) })),
      } });
      showSuccessAlert('Đã xác nhận phiếu kho và cập nhật tồn kho.'); onDone();
    } catch (error) { showErrorAlert(error.message); } finally { setBusy(false); }
  };

  return <form className={`${PANEL} popup-surface w-full max-w-5xl max-h-[90vh] overflow-y-auto`} onClick={event => event.stopPropagation()} onSubmit={submit}>
    <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-lg font-semibold">Tạo phiếu kho</h2><select className={FIELD} value={type} onChange={e => setType(e.target.value)}><option value="Import">Nhập kho</option><option value="Export">Xuất kho</option></select></div>
    {type === 'Import' && <select className={FIELD} required value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Chọn nhà cung cấp *</option>{suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}</select>}
    {lines.map((line, index) => <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_140px_auto] gap-2 items-center">
      <select className={FIELD} value={line.product_id} onChange={e => updateLine(index, 'product_id', e.target.value)}><option value="">Chọn sản phẩm</option>{products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}</select>
      <select className={FIELD} value={line.variant_id} disabled={!line.variants.length} onChange={e => updateLine(index, 'variant_id', e.target.value)}><option value="">Chọn biến thể</option>{line.variants.map(v => <option key={v.variant_id} value={v.variant_id}>{v.size_name} / {v.color_name} · tồn {v.quantity}</option>)}</select>
      <input className={FIELD} type="number" min="1" step="1" value={line.quantity} aria-label="Số lượng" onChange={e => updateLine(index, 'quantity', e.target.value)} />
      <input className={FIELD} type="number" min="0" step="1000" value={line.unit_price} aria-label="Đơn giá" onChange={e => updateLine(index, 'unit_price', e.target.value)} />
      <button type="button" className={`${BTN} admin-secondary-action`} disabled={lines.length < 2} onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Xóa</button>
    </div>)}
    <button type="button" className={`${BTN} admin-secondary-action`} onClick={() => setLines(current => [...current, emptyLine()])}>+ Thêm dòng</button>
    <textarea className={FIELD} rows={2} maxLength={500} placeholder="Ghi chú phiếu" value={note} onChange={e => setNote(e.target.value)} />
    <p className="m-0 text-white/50 text-sm">Tổng giá trị: {fmt(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0))}. Xác nhận sẽ ghi phiếu và cập nhật tồn kho trong cùng giao dịch.</p>
    <div className="flex gap-2"><button className="admin-primary-action inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50" disabled={busy}>{busy ? 'Đang xác nhận...' : 'Xác nhận phiếu'}</button><button type="button" className={`${BTN} admin-secondary-action`} onClick={onCancel}>Đóng</button></div>
  </form>;
}

export default function InventoryManagementView({ initialTab = 'stock' }) {
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [supplierSort, setSupplierSort] = useState('name');
  const [supplierOrder, setSupplierOrder] = useState('asc');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(true);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState(undefined);
  useModalEffects(showReceiptForm || supplierForm !== undefined, () => {
    setShowReceiptForm(false);
    setSupplierForm(undefined);
  });

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit), paged: 'true' });
    if (tab === 'stock') params.set('search', search);
    if (tab === 'suppliers') {
      params.set('search', search); params.set('contact_filter', supplierFilter);
      params.set('sort', supplierSort); params.set('order', supplierOrder);
    }
    const endpoint = tab === 'stock' ? `/api/inventory?${params}`
      : tab === 'suppliers' ? `/api/inventory/suppliers?${params}`
        : `/api/inventory/receipts?${params}`;
    apiFetch(endpoint).then(result => { setRows(result.data || []); setTotal(result.total || 0); }).catch(error => showErrorAlert(error.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tab, search, supplierFilter, supplierSort, supplierOrder, page]);

  const tabs = [['stock', 'Tồn kho'], ['receipts', 'Phiếu kho'], ['suppliers', 'Nhà cung cấp']];
  return <div className="flex flex-col gap-5 text-[#f5f0eb]">
    <header><p className="m-0 text-white/40 text-xs uppercase tracking-widest">Quản lý kho</p><h1 className="m-0 mt-1 text-2xl font-bold">Kho và nhà cung cấp</h1></header>
    <div className="flex flex-wrap gap-2">{tabs.map(([key, label]) => <button key={key} className={`${BTN} admin-secondary-action${tab === key ? ' is-active' : ''}`} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); setShowReceiptForm(false); setSupplierForm(undefined); }}>{label}</button>)}</div>
    {tab === 'receipts' && <button className={`${BTN} admin-primary-action`} onClick={() => setShowReceiptForm(true)}>+ Tạo phiếu nhập / xuất</button>}
    {tab === 'suppliers' && <button className={`${BTN} admin-primary-action`} onClick={() => setSupplierForm(null)}>+ Thêm nhà cung cấp</button>}
    {showReceiptForm && createPortal((<motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="inventory-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-4" onClick={() => setShowReceiptForm(false)}>
      <ReceiptForm onCancel={() => setShowReceiptForm(false)} onDone={() => { setShowReceiptForm(false); load(); }} />
    </motion.div>), document.body)}
    {supplierForm !== undefined && createPortal((<motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="inventory-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-md p-5" onClick={() => setSupplierForm(undefined)}>
      <motion.div initial={{ scale:0.94, opacity:0 }} animate={{ scale:1, opacity:1 }} className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <SupplierForm supplier={supplierForm} onCancel={() => setSupplierForm(undefined)} onDone={() => { setSupplierForm(undefined); load(); }} />
      </motion.div>
    </motion.div>), document.body)}
    {(tab === 'stock' || tab === 'suppliers') && <div className="flex items-center gap-2">
      <input className={FIELD} type="search" placeholder={tab === 'stock' ? 'Tìm sản phẩm...' : 'Tìm nhà cung cấp...'} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      {tab === 'suppliers' && <FilterPopover title="Lọc nhà cung cấp" activeCount={[search, supplierFilter !== 'all', supplierSort !== 'name' || supplierOrder !== 'asc'].filter(Boolean).length}
        onClear={() => { setSearch(''); setSupplierFilter('all'); setSupplierSort('name'); setSupplierOrder('asc'); setPage(1); }}>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Thông tin liên hệ<select className={FIELD} value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setPage(1); }}><option value="all">Tất cả</option><option value="has_email">Có email</option><option value="no_email">Chưa có email</option><option value="has_phone">Có số điện thoại</option><option value="no_phone">Chưa có số điện thoại</option></select></label>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">Sắp xếp<select className={FIELD} value={`${supplierSort}-${supplierOrder}`} onChange={e => { const [sort, order] = e.target.value.split('-'); setSupplierSort(sort); setSupplierOrder(order); setPage(1); }}><option value="name-asc">Tên A–Z</option><option value="name-desc">Tên Z–A</option><option value="contact-asc">Người liên hệ A–Z</option><option value="created-desc">Mới thêm trước</option></select></label>
      </FilterPopover>}
    </div>}
    <section className={PANEL}>
      {loading ? <Spinner /> : !rows.length ? <p className="m-0 text-center text-white/40">Chưa có dữ liệu.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{(tab === 'stock' ? ['Sản phẩm', 'SKU', 'Size / màu', 'Tồn'] : tab === 'suppliers' ? ['Nhà cung cấp', 'Người liên hệ', 'Điện thoại', 'Email', 'Địa chỉ', ''] : ['Mã phiếu', 'Loại', 'Nhà cung cấp', 'Nhân viên', 'Tổng tiền', 'Ngày tạo']).map(h => <th key={h} className="p-3 text-left text-white/45">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t border-white/10" key={row.variant_id || row.supplier_id || row.receipt_id}>
        {tab === 'stock' && <><td className="p-3">{row.product_name}</td><td className="p-3">{row.sku}</td><td className="p-3">{row.size_name} / {row.color_name}</td><td className="p-3">{row.quantity}</td></>}
        {tab === 'suppliers' && <><td className="p-3">{row.supplier_name}</td><td className="p-3">{row.contact_name || '—'}</td><td className="p-3">{row.phone || '—'}</td><td className="p-3">{row.email || '—'}</td><td className="p-3">{row.address || '—'}</td><td className="p-3"><button className={`${BTN} admin-secondary-action`} onClick={() => setSupplierForm(row)}>Sửa</button></td></>}
        {tab === 'receipts' && <><td className="p-3">#{row.receipt_id}</td><td className="p-3">{{ Import: 'Nhập', Export: 'Xuất', Adjustment: 'Điều chỉnh' }[row.receipt_type]}</td><td className="p-3">{row.supplier_name || '—'}</td><td className="p-3">{row.employee_name || '—'}</td><td className="p-3">{fmt(row.total_amount)}</td><td className="p-3">{new Date(row.receipt_date).toLocaleString('vi-VN')}</td></>}
      </tr>)}</tbody></table></div>}
      <Pagination page={page} total={total} limit={limit} loading={loading} onChange={setPage} />
    </section>
  </div>;
}
