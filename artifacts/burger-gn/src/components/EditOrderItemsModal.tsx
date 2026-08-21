import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Plus, Minus, Trash2, Search, ShoppingBag, Loader2, Save,
} from 'lucide-react';
import {
  getCategories, getProducts, updateOrderItems,
  Category, Product, Addon, Order,
} from '../lib/api';
import { ProductDetailModal } from './ProductDetailModal';

type EditLine = {
  key: string;
  productId: number | null;
  productName: string;
  productPrice: number;
  quantity: number;
  addons: Addon[];
  notes: string;
  /** Minimal Product shape for ProductDetailModal when re-adding from catalog. */
  product?: Product;
};

function lineKey(productId: number | null, name: string, addons: Addon[], notes: string) {
  const add = addons.map((a) => a.name).sort().join('|');
  return `${productId ?? 'x'}::${name}::${add}::${notes.trim()}`;
}

function lineUnit(l: EditLine) {
  return l.productPrice + l.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
}

function lineTotal(l: EditLine) {
  return lineUnit(l) * l.quantity;
}

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function seedFromOrder(order: Order): EditLine[] {
  return (order.items || []).map((item) => {
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const productId = (item as { productId?: number | null }).productId ?? null;
    const productPrice = parseFloat(String(item.productPrice)) || 0;
    return {
      key: lineKey(productId, item.productName, addons, item.notes || ''),
      productId,
      productName: item.productName,
      productPrice,
      quantity: item.quantity,
      addons,
      notes: item.notes || '',
    };
  });
}

/**
 * Modal to edit items of an existing kitchen order.
 * Reuses ProductDetailModal (same as cardápio / Novo Pedido).
 */
export function EditOrderItemsModal({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: (updated: Order) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(() => seedFromOrder(order));
  const [orderNotes, setOrderNotes] = useState(order.notes || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const deliveryFee = parseFloat(String(order.deliveryFee)) || 0;
  const discountAmount = parseFloat(String(order.discountAmount)) || 0;
  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const total = Math.max(0, subtotal + deliveryFee - discountAmount);

  useEffect(() => {
    setMenuLoading(true);
    Promise.all([getCategories(), getProducts()])
      .then(([cats, prods]) => {
        setCategories(cats.filter((c) => c.active));
        setProducts(prods);
      })
      .catch(() => {
        setCategories([]);
        setProducts([]);
      })
      .finally(() => setMenuLoading(false));
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.available) return false;
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q)
        || (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [products, catFilter, productQuery]);

  const addFromModal = (product: Product, addons: Addon[], notes: string, quantity: number) => {
    const productPrice = parseFloat(String(product.price)) || 0;
    const key = lineKey(product.id, product.name, addons, notes);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + quantity } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          productPrice,
          quantity,
          addons,
          notes,
          product,
        },
      ];
    });
    setSelectedProduct(null);
  };

  const updateQty = (key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      setError('Adicione ao menos um item.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateOrderItems(order.id, {
        notes: orderNotes,
        items: lines.map((l) => ({
          productId: l.productId ?? undefined,
          productName: l.productName,
          productPrice: l.productPrice,
          quantity: l.quantity,
          addons: l.addons,
          notes: l.notes,
        })),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar edição.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-amber-500 text-[10px] font-black uppercase tracking-wider">Editar pedido</p>
            <h2 className="text-white font-black text-lg">#{order.orderNumber} · {order.customerName}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-500 hover:text-white rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCatFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase ${
                catFilter === 'all' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase ${
                  catFilter === c.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {menuLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-amber-500" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[28vh] overflow-y-auto pr-1">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProduct(p)}
                  className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 hover:border-amber-500/50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-white truncate">{p.name}</p>
                    <p className="text-zinc-500 text-xs truncate">{p.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-amber-500 font-black text-sm">{fmt(parseFloat(p.price) || 0)}</p>
                    <Plus size={14} className="ml-auto text-zinc-500" />
                  </div>
                </button>
              ))}
              {!filteredProducts.length && (
                <p className="text-zinc-500 text-sm text-center py-4">Nenhum produto encontrado.</p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1">
              <ShoppingBag size={12} /> Itens do pedido
            </p>
            {lines.length === 0 ? (
              <p className="text-zinc-500 text-sm py-2">Nenhum item — adicione produtos acima.</p>
            ) : (
              lines.map((l) => (
                <div key={l.key} className="flex items-start gap-2 border-t border-zinc-800 pt-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{l.productName}</p>
                    {l.addons.length > 0 && (
                      <p className="text-zinc-500 text-xs truncate">+ {l.addons.map((a) => a.name).join(', ')}</p>
                    )}
                    {l.notes && <p className="text-zinc-500 text-xs italic truncate">{l.notes}</p>}
                    <p className="text-amber-500 text-xs font-bold mt-0.5">{fmt(lineTotal(l))}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => updateQty(l.key, -1)} className="p-1.5 rounded-lg bg-zinc-800 text-white">
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-white">{l.quantity}</span>
                    <button type="button" onClick={() => updateQty(l.key, 1)} className="p-1.5 rounded-lg bg-zinc-800 text-white">
                      <Plus size={14} />
                    </button>
                    <button type="button" onClick={() => removeLine(l.key)} className="p-1.5 text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-zinc-800">
              <span className="text-zinc-400">Subtotal</span>
              <span className="font-black text-white">{fmt(subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Entrega</span>
                <span className="font-bold text-white">{fmt(deliveryFee)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Desconto</span>
                <span className="font-bold text-green-400">-{fmt(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base">
              <span className="font-bold text-white">Total</span>
              <span className="font-black text-amber-500">{fmt(total)}</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-zinc-500">Observações do pedido</label>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={2}
              placeholder="Ex.: sem cebola, ponto da carne…"
              className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-white text-sm outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-xl border border-zinc-700 text-zinc-300 font-bold uppercase text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || lines.length === 0}
            className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar
          </button>
        </div>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={addFromModal}
      />
    </div>
  );
}
