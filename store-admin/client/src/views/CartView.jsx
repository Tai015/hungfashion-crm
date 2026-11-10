import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';

const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ';

const PANEL = 'flex flex-col gap-5 p-6 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)] text-[#f5f0eb]';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 h-11 px-6 bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-500/50 text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_26px_rgba(249,115,22,0.45)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const BTN_GHOST   = 'inline-flex items-center gap-1.5 h-9 px-4 bg-white/[0.07] border border-white/15 text-white/65 text-sm font-medium rounded-xl transition-all hover:bg-white/[0.12] hover:text-white/90 cursor-pointer';

export default function CartView({ onCheckout }) {
  const { items, removeItem, updateQuantity, totalAmount } = useCart();

  if (!items.length) {
    return (
      <div className="flex flex-col gap-5 text-[#f5f0eb]">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Mua sắm</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Giỏ hàng</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/30">
          <ShoppingCart size={56} className="opacity-30"/>
          <p className="text-base font-medium">Giỏ hàng đang trống</p>
          <p className="text-sm text-white/22">Thêm sản phẩm từ trang Sản phẩm để bắt đầu mua sắm.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-[#f5f0eb]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-white/40 text-xs font-semibold tracking-[0.08em] uppercase">Mua sắm</p>
          <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.5vw,2rem)] font-bold tracking-tight">Giỏ hàng</h1>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-500 text-sm font-semibold">
          {items.length} sản phẩm
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Danh sách sản phẩm */}
        <div className={`${PANEL} gap-0`}>
          {items.map((item, idx) => (
            <div key={item.variant_id}
              className={`flex items-start gap-4 py-4 ${idx < items.length-1 ? 'border-b border-white/[0.06]' : ''}`}>
              {/* Hình ảnh */}
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/[0.07] shrink-0">
                {item.image_url
                  ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover"/>
                  : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">Ảnh</div>}
              </div>

              {/* Thông tin */}
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <strong className="text-[0.95rem] font-semibold text-[#f5f0eb] truncate">{item.product_name}</strong>
                <p className="m-0 text-white/40 text-xs">{item.variant_label || [item.size_name, item.color_name].filter(Boolean).join(' · ') || 'Mặc định'} · SKU: {item.sku || '—'}</p>
                <p className="m-0 text-orange-400 text-sm font-bold">{fmtVND(item.selling_price)} / sản phẩm</p>
              </div>

              {/* Số lượng + xóa */}
              <div className="flex flex-col items-end gap-2.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button className="grid w-8 h-8 place-items-center border border-white/12 rounded-lg bg-white/[0.07] text-white/60 cursor-pointer hover:bg-white/[0.15] hover:text-[#f5f0eb] transition-all disabled:opacity-30"
                    disabled={item.quantity <= 1}
                    onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}>
                    <Minus size={13}/>
                  </button>
                  <span className="w-9 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                  <button className="grid w-8 h-8 place-items-center border border-white/12 rounded-lg bg-white/[0.07] text-white/60 cursor-pointer hover:bg-white/[0.15] hover:text-[#f5f0eb] transition-all disabled:opacity-30"
                    disabled={item.quantity >= item.max_stock}
                    onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}>
                    <Plus size={13}/>
                  </button>
                </div>
                <strong className="text-[0.95rem] font-bold text-[#f5f0eb] tabular-nums">
                  {fmtVND(item.selling_price * item.quantity)}
                </strong>
                <button className="text-red-400/60 hover:text-red-400 cursor-pointer transition-colors"
                  onClick={() => removeItem(item.variant_id)} title="Xóa">
                  <Trash2 size={15}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Tóm tắt đơn */}
        <div className={`${PANEL} sticky top-4`}>
          <h2 className="m-0 text-[1.05rem] font-semibold">Tóm tắt đơn hàng</h2>
          <dl className="flex flex-col gap-2.5">
            {items.map(item => (
              <div key={item.variant_id} className="flex justify-between gap-3 text-sm">
                <dt className="text-white/50 truncate">{item.product_name} × {item.quantity}</dt>
                <dd className="m-0 text-[#f5f0eb] tabular-nums shrink-0">{fmtVND(item.selling_price * item.quantity)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-between items-center pt-3 border-t border-white/[0.08]">
            <span className="font-semibold">Tổng cộng</span>
            <strong className="text-xl font-bold text-orange-400 tabular-nums">{fmtVND(totalAmount)}</strong>
          </div>
          <p className="m-0 text-white/30 text-xs">Phí vận chuyển tính khi thanh toán.</p>
          <button className={BTN_PRIMARY} onClick={onCheckout}>
            <ShoppingCart size={16}/> Tiến hành đặt hàng
          </button>
        </div>
      </div>
    </div>
  );
}
