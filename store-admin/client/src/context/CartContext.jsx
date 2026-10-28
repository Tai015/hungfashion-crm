import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ accountId, children }) {
  const cartKey = `hungfashion_cart_v1_${accountId}`;
  const [items, setItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(cartKey));
      return Array.isArray(saved) ? saved : [];
    }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(items));
  }, [cartKey, items]);

  /** Thêm sản phẩm vào giỏ (hoặc tăng số lượng nếu đã có) */
  const addItem = useCallback((variant, product, qty = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.variant_id === variant.variant_id);
      if (existing) {
        return prev.map(i =>
          i.variant_id === variant.variant_id
            ? { ...i, quantity: Math.min(i.quantity + qty, i.max_stock) }
            : i
        );
      }
      return [...prev, {
        variant_id:   variant.variant_id,
        product_id:   product.product_id,
        product_name: product.product_name,
        image_url:    product.image_url || null,
        size_name:    variant.size_name,
        color_name:   variant.color_name,
        sku:          variant.sku,
        selling_price: Number(product.selling_price),
        max_stock:    Number(variant.quantity),
        quantity:     Math.min(qty, Number(variant.quantity)),
      }];
    });
  }, []);

  const removeItem = useCallback(variant_id =>
    setItems(prev => prev.filter(i => i.variant_id !== variant_id)), []);

  const updateQuantity = useCallback((variant_id, qty) => {
    if (qty < 1) return removeItem(variant_id);
    setItems(prev => prev.map(i =>
      i.variant_id === variant_id
        ? { ...i, quantity: Math.min(qty, i.max_stock) }
        : i
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems  = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = items.reduce((s, i) => s + i.selling_price * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      totalItems, totalAmount,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart phải dùng trong CartProvider');
  return ctx;
}
