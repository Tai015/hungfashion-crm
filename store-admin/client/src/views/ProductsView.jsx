import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import Spinner from '../components/Spinner';
import { fmtVND } from '../utils/formatters';

export default function ProductsView() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [suppliers, setSuppliers] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const LIMIT = 15;

  useEffect(() => {
    Promise.all([apiFetch('/api/products/categories'), apiFetch('/api/inventory/suppliers')])
      .then(([rows, supplierRows]) => {
        const seen = new Set();
        setCategories(rows.filter(category => {
          if (seen.has(category.category_name)) return false;
          seen.add(category.category_name);
          return true;
        }));
        setSuppliers(supplierRows || []);
      })
      .catch(requestError => setError(requestError.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (categoryId) params.set('category_id', categoryId);
    if (supplierId) params.set('supplier_id', supplierId);
    params.set('sort', sort);
    params.set('order', order);
    apiFetch(`/api/products?${params}`)
      .then(d => { setProducts(d.data || []); setTotal(d.total || 0); })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [search, categoryId, supplierId, page, sort, order]);

  return (
    <>
      <header className="topbar">
        <div><p className="eyebrow">Kho hàng</p><h1>Quản lý sản phẩm</h1></div>
      </header>
      <div className="filter-toolbar">
        <label className="filter-field search-field">
          <span>Tìm sản phẩm</span>
          <input className="search-input" type="search" placeholder="Tên sản phẩm"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <label className="filter-field">
          <span>Danh mục</span>
          <select className="filter-select" value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">Tất cả danh mục</option>
            {categories.map(category => (
              <option key={category.category_id} value={category.category_id}>{category.category_name}</option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Nhà cung cấp</span>
          <select className="filter-select" value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}>
            <option value="">Tất cả nhà cung cấp</option>
            {suppliers.map(supplier => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Sắp xếp</span>
          <select className="filter-select" value={`${sort}-${order}`} onChange={e => { const [nextSort, nextOrder] = e.target.value.split('-'); setSort(nextSort); setOrder(nextOrder); }}>
            <option value="created_at-desc">Mới nhất</option><option value="name-asc">Tên A–Z</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option>
          </select>
        </label>
        {(search || categoryId || supplierId) && (
          <button className="filter-clear" type="button" onClick={() => { setSearch(''); setCategoryId(''); setSupplierId(''); setPage(1); }}>
            Xóa lọc
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-header"><h3>Sản phẩm ({total.toLocaleString('vi-VN')})</h3></div>
        {loading ? <Spinner /> : (
          <table>
            <thead>
              <tr><th>#</th><th>Tên sản phẩm</th><th>Danh mục</th><th>Giá nhập</th><th>Giá bán</th><th>Tồn kho</th></tr>
            </thead>
            <tbody>
              {products.length ? products.map(p => (
                <tr key={p.product_id}>
                  <td>{p.product_id}</td>
                  <td><strong>{p.product_name}</strong></td>
                  <td>{p.category_name}</td>
                  <td>{fmtVND(p.import_price)}</td>
                  <td>{fmtVND(p.selling_price)}</td>
                  <td>
                    <span style={{ color: p.total_stock <= 5 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                      {p.total_stock}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>Chưa có sản phẩm</td></tr>
              )}
            </tbody>
          </table>
        )}
        {total > LIMIT && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 0' }}>
            <button className="event-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
            <span style={{ lineHeight: '32px', fontSize: 13, color: '#94a3b8' }}>Trang {page} / {Math.ceil(total / LIMIT)}</span>
            <button className="event-btn" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Sau →</button>
          </div>
        )}
      </div>
    </>
  );
}
