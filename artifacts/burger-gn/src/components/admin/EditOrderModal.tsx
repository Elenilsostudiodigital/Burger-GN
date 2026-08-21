import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { ProductDetailModal } from '../ProductDetailModal';
import {
  Addon, Category, Order, Product,
  getCategories, getProducts, updateOrderItems,
} from '../../lib/api';
import { lineSubtotal, PIX_PAID_EDIT_MESSAGE } from '../../lib/counterOrderEdit';

type CartLine = {
  key: string;
  productId?: number;
  productName: string;
  productPrice: number;
  quantity: number;
  addons: Addon[];
  notes: string;
};

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function makeKey(line: Omit<CartLine, 'key' | 'quantity'>) {
  return `${line.productId ?? line.productName}:${line.addons.map((a) => a.name).sort().join(',')}:${line.notes}`;
}

function orderToLines(order: Order): CartLine[] {
  return (order.items || []).map((item) => {
    const base: Omit<CartLine, 'key'> = {
      productId: item.productId ?? undefined,
      productName: item.productName,
      productPrice: parseFloat(String(item.productPrice)) || 0,
      quantity: item.quantity,
      addons: (item.addons || []) as Addon[],
      notes: item.notes || '',
    };
    return { ...base, key: makeKey(base) };
  });
}

export function EditOrderModal({
  order,
  pixPaidBlocked,
  onClose,
  onSaved,
}: {
  order: Order;
  pixPaidBlocked?: boolean;
  onClose: () => void;
  onSaved: (updated: Order) => void;
}) {
  const [lines, setLines] = useState<CartLine[]>(() => orderToLines(order));
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMenuLoading(true);
    Promise.all([getCategories(), getProducts()])
      .then(([cats, prods]) => {
        setCategories(cats.filter((c) => c.active));
        setProducts(prods.filter((p) => p.available));
      })
      .catch(() => {
        setCategories([]);
        setProducts([]);
      })
      .finally(() => setMenuLoading(false));
  }, []);

  const deliveryFee = parseFloat(String(order.deliveryFee)) || 0;
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + lineSubtotal({
      productPrice: l.productPrice,
      addons: l.addons,
      quantity: l.quantity,
    }), 0),
    [lines],
  );
  const previewTotal = Math.max(0, subtotal + deliveryFee);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });
  }, [products, catFilter, query]);

  const addProduct = (product: Product, addons: Addon[], notes: string, quantity: number) => {
    const price = parseFloat(product.price) || 0;
    const base = {
      productId: product.id,
      productName: product.name,
      productPrice: price,
      addons,
      notes,
    };
    const key = makeKey(base);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { ...base, key, quantity }];
    });
    setSelectedProduct(null);
  };

  const updateQty = (key: string, delta: number) => {
    setLines((prev) => prev
      .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
  };

  const onSave = async () => {
    if (!lines.length) {
      setError('Adicione ao menos um produto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateOrderItems(order.id, lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        productPrice: l.productPrice,
        quantity: l.quantity,
        addons: l.addons,
        notes: l.notes,
      })));
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar o pedido.');
    } finally {
      setSaving(false);
    }
  };

  if (pixPaidBlocked) {
    return (
      <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
        <div
          className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-white font-black uppercase text-sm">Editar Pedido #{order.orderNumber}</h2>
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{PIX_PAID_EDIT_MESSAGE}</p>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm tracking-wide"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
            <Pencil size={16} className="text-amber-500" /> Editar Pedido #{order.orderNumber}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 h-10 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setCatFilter('all')}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${catFilter === 'all' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(c.id)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${catFilter === c.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {menuLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-amber-500" /></div>
        ) : (
          <div className="space-y-1.5 max-h-[22vh] overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProduct(p)}
                className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 hover:border-amber-500/50 flex items-center justify-between gap-3"
              >
                <p className="font-bold text-sm truncate">{p.name}</p>
                <p className="text-amber-500 font-black text-xs shrink-0">{fmt(parseFloat(p.price) || 0)}</p>
              </button>
            ))}
            {!filtered.length && (
              <p className="text-zinc-500 text-sm text-center py-4">Nenhum produto encontrado.</p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase text-zinc-500">Itens do pedido</p>
          {lines.map((l) => (
            <div key={l.key} className="flex items-start gap-2 border-t border-zinc-800 pt-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{l.productName}</p>
                {l.addons.length > 0 && (
                  <p className="text-zinc-500 text-xs truncate">+ {l.addons.map((a) => a.name).join(', ')}</p>
                )}
                <p className="text-amber-500 text-xs font-bold mt-0.5">
                  {fmt(lineSubtotal({ productPrice: l.productPrice, addons: l.addons, quantity: l.quantity }))}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => updateQty(l.key, -1)} className="p-1.5 rounded-lg bg-zinc-800"><Minus size={14} /></button>
                <span className="w-6 text-center text-sm font-bold">{l.quantity}</span>
                <button type="button" onClick={() => updateQty(l.key, 1)} className="p-1.5 rounded-lg bg-zinc-800"><Plus size={14} /></button>
                <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="p-1.5 text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!lines.length && <p className="text-zinc-500 text-xs">Nenhum item. Adicione produtos acima.</p>}
          <div className="flex justify-between text-xs pt-2 border-t border-zinc-800">
            <span className="text-zinc-500">Subtotal</span>
            <span className="text-white font-bold">{fmt(subtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Entrega</span>
              <span className="text-white font-bold">{fmt(deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400 font-bold">Total estimado</span>
            <span className="text-amber-500 font-black">{fmt(previewTotal)}</span>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="button"
          disabled={saving || lines.length === 0}
          onClick={() => { void onSave(); }}
          className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm tracking-wide disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar pedido'}
        </button>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={addProduct}
        overlayClassName="!z-[100]"
      />
    </div>
  );
}
