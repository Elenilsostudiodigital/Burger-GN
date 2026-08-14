import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminProducts, getAdminCategories, createProduct, updateProduct, deleteProduct,
  updateProductPromotion,
  createCategory, updateCategory, deleteCategory,
  Product, Category,
} from '../../lib/api';
import { PROMO_TEXT_SUGGESTIONS, calcDiscountPercent, calcSavedAmount, formatBrl } from '../../lib/productMarketing';
import { useAdmin } from '../../context/AdminContext';
import { Link, useLocation } from 'wouter';
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Check, X,
  ToggleLeft, ToggleRight, Loader2, LogOut, Zap, Megaphone,
} from 'lucide-react';
import type { Addon } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { AdminTab, AdminTabBar } from '../../components/AdminTabs';

type Tab = 'products' | 'categories';

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  image: string;
  videoUrl: string;
  ingredients: string;
  addons: Addon[];
  categoryId: string;
  displayOrder: string;
  isFeatured: boolean;
  isPromotion: boolean;
  isClubeExclusive: boolean;
  promoOriginalPrice: string;
  promoPrice: string;
  promoStartsAt: string;
  promoEndsAt: string;
  promoText: string;
}

const EMPTY_FORM: ProductFormData = {
  name: '', description: '', price: '', image: '', videoUrl: '', ingredients: '', addons: [], categoryId: '', displayOrder: '0',
  isFeatured: false, isPromotion: false, isClubeExclusive: false,
  promoOriginalPrice: '', promoPrice: '', promoStartsAt: '', promoEndsAt: '', promoText: '',
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function productToForm(p: Product): ProductFormData {
  return {
    name: p.name,
    description: p.description,
    price: p.price,
    image: p.image,
    videoUrl: p.videoUrl ?? '',
    ingredients: (p.ingredients ?? []).join(', '),
    addons: p.addons ?? [],
    categoryId: p.categoryId ? String(p.categoryId) : '',
    displayOrder: String(p.displayOrder),
    isFeatured: !!p.isFeatured,
    isPromotion: !!p.isPromotion,
    isClubeExclusive: !!p.isClubeExclusive,
    promoOriginalPrice: p.promoOriginalPrice || p.price || '',
    promoPrice: p.promoPrice || '',
    promoStartsAt: toLocalInput(p.promoStartsAt),
    promoEndsAt: toLocalInput(p.promoEndsAt),
    promoText: p.promoText || '',
  };
}

function CheckboxRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500"
      />
      {label}
    </label>
  );
}

function ProductForm({ categories, initial, onSave, onCancel, saving }: {
  categories: Category[];
  initial?: ProductFormData;
  onSave: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProductFormData>(initial ?? EMPTY_FORM);
  const set = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const addAddonRow = () => setForm(f => ({ ...f, addons: [...f.addons, { name: '', price: 0 }] }));
  const removeAddonRow = (idx: number) => setForm(f => ({ ...f, addons: f.addons.filter((_, i) => i !== idx) }));
  const updateAddonRow = (idx: number, field: 'name' | 'price', value: string) =>
    setForm(f => ({
      ...f,
      addons: f.addons.map((a, i) => i === idx ? { ...a, [field]: field === 'price' ? parseFloat(value) || 0 : value } : a),
    }));

  const originalNum = parseFloat(form.promoOriginalPrice || form.price) || 0;
  const promoNum = parseFloat(form.promoPrice) || 0;
  const autoPercent = form.isPromotion ? calcDiscountPercent(originalNum, promoNum) : null;
  const autoSaved = form.isPromotion ? calcSavedAmount(originalNum, promoNum) : null;

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4">
      <h3 className="text-white font-bold uppercase tracking-wider text-sm">
        {initial ? 'Editar Produto' : 'Novo Produto'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-zinc-400 text-xs">Nome *</Label>
          <Input value={form.name} onChange={set('name')} placeholder="Ex: KING BURGER"
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-zinc-400 text-xs">Descrição</Label>
          <textarea value={form.description} onChange={set('description')}
            placeholder="Ingredientes e descrição..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-16 placeholder:text-zinc-600" />
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-400 text-xs">Preço (R$) *</Label>
          <Input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="24.90"
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-400 text-xs">Categoria</Label>
          <select value={form.categoryId} onChange={set('categoryId')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-10 text-white text-sm focus:border-amber-500 focus:outline-none">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-zinc-400 text-xs">URL da Imagem</Label>
          <Input value={form.image} onChange={set('image')} placeholder="https://..."
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-zinc-400 text-xs">URL do Vídeo (opcional)</Label>
          <Input value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://..."
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-400 text-xs">Ordem</Label>
          <Input type="number" min="0" value={form.displayOrder} onChange={set('displayOrder')}
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
        </div>
      </div>
      {form.image && (
        <img src={form.image} alt="preview" className="w-full h-32 object-cover rounded-xl border border-zinc-800" onError={e => (e.currentTarget.style.display = 'none')} />
      )}

      <div className="space-y-1">
        <Label className="text-zinc-400 text-xs">Ingredientes (separados por vírgula)</Label>
        <textarea value={form.ingredients} onChange={set('ingredients')}
          placeholder="Pão brioche, hambúrguer 180g, queijo cheddar, alface, tomate"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-14 placeholder:text-zinc-600" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-400 text-xs">Adicionais</Label>
          <button type="button" onClick={addAddonRow} className="text-amber-500 text-xs font-bold flex items-center gap-1 hover:text-amber-400">
            <Plus size={14} /> Adicionar
          </button>
        </div>
        {form.addons.map((addon, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input value={addon.name} onChange={e => updateAddonRow(idx, 'name', e.target.value)} placeholder="Ex: Bacon extra"
              className="bg-zinc-950 border-zinc-800 text-white h-9 text-sm flex-1 focus:border-amber-500" />
            <Input type="number" step="0.01" min="0" value={addon.price} onChange={e => updateAddonRow(idx, 'price', e.target.value)} placeholder="0.00"
              className="bg-zinc-950 border-zinc-800 text-white h-9 text-sm w-24 focus:border-amber-500" />
            <button type="button" onClick={() => removeAddonRow(idx)} className="p-2 text-red-500 hover:bg-red-900/20 rounded-lg shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {form.addons.length === 0 && (
          <p className="text-zinc-600 text-xs">Nenhum adicional cadastrado.</p>
        )}
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-zinc-950/60 p-4 space-y-3">
        <h4 className="text-amber-500 font-black uppercase text-xs tracking-wider">📢 Promoção do Produto</h4>
        <div className="grid grid-cols-1 gap-2">
          <CheckboxRow checked={form.isPromotion} onChange={v => setForm(f => ({
            ...f,
            isPromotion: v,
            promoOriginalPrice: f.promoOriginalPrice || f.price,
          }))} label="Ativar Promoção" />
          <CheckboxRow checked={form.isFeatured} onChange={v => setForm(f => ({ ...f, isFeatured: v }))} label="Produto em Destaque" />
          <CheckboxRow checked={form.isClubeExclusive} onChange={v => setForm(f => ({ ...f, isClubeExclusive: v }))} label="Exclusivo Clube Burger" />
        </div>

        {(form.isPromotion || form.isClubeExclusive) && (
          <>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Texto da promoção</Label>
              <Input
                value={form.promoText}
                onChange={set('promoText')}
                placeholder="Ex: Oferta da Semana"
                className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {PROMO_TEXT_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, promoText: s }))}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold border border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Preço original</Label>
                <Input type="number" step="0.01" min="0" value={form.promoOriginalPrice} onChange={set('promoOriginalPrice')}
                  placeholder={form.price || '0.00'}
                  className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Preço promocional</Label>
                <Input type="number" step="0.01" min="0" value={form.promoPrice} onChange={set('promoPrice')}
                  className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Data de início</Label>
                <Input type="datetime-local" value={form.promoStartsAt} onChange={set('promoStartsAt')}
                  className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Data de término</Label>
                <Input type="datetime-local" value={form.promoEndsAt} onChange={set('promoEndsAt')}
                  className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-xs space-y-1">
              <p className="text-zinc-500 uppercase font-bold tracking-wider">Cálculo automático</p>
              <p className="text-white">
                Desconto:{' '}
                <span className="text-amber-500 font-black">
                  {autoPercent != null ? `-${autoPercent}%` : '—'}
                </span>
                {' · '}
                Economia:{' '}
                <span className="text-emerald-400 font-bold">
                  {autoSaved != null ? formatBrl(autoSaved) : '—'}
                </span>
              </p>
              <p className="text-zinc-600">A porcentagem não é editável — é calculada pelos preços.</p>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={() => onSave(form)} disabled={saving || !form.name || !form.price}
          className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl h-10 text-sm">
          {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Check size={16} className="mr-1" />}
          Salvar
        </Button>
        <Button variant="outline" onClick={onCancel}
          className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl h-10 text-sm">
          <X size={16} className="mr-1" /> Cancelar
        </Button>
      </div>
    </motion.div>
  );
}

function QuickPromoModal({
  product, onClose, onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [promoPrice, setPromoPrice] = useState(product.promoPrice || '');
  const [promoText, setPromoText] = useState(product.promoText || 'Promoção');
  const [starts, setStarts] = useState(toLocalInput(product.promoStartsAt));
  const [ends, setEnds] = useState(toLocalInput(product.promoEndsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const original = parseFloat(String(product.promoOriginalPrice || product.price)) || 0;
  const promoNum = parseFloat(promoPrice) || 0;
  const pct = calcDiscountPercent(original, promoNum);
  const saved = calcSavedAmount(original, promoNum);

  const save = async () => {
    setError('');
    if (!promoPrice.trim()) {
      setError('Informe o preço promocional.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProductPromotion(product.id, {
        promoPrice,
        promoStartsAt: starts || null,
        promoEndsAt: ends || null,
        promoText,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar promoção');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-white font-black uppercase text-sm">⚡ Promoção Rápida</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-zinc-500 text-xs">{product.name}</p>
        <div className="space-y-1">
          <Label className="text-zinc-400 text-xs">Texto da promoção</Label>
          <Input value={promoText} onChange={e => setPromoText(e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-amber-500" />
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-400 text-xs">Preço Promocional</Label>
          <Input type="number" step="0.01" min="0" value={promoPrice} onChange={e => setPromoPrice(e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-amber-500" />
        </div>
        <p className="text-xs text-zinc-400">
          Desconto automático:{' '}
          <span className="text-amber-500 font-black">{pct != null ? `-${pct}%` : '—'}</span>
          {' · '}Economia: <span className="text-emerald-400 font-bold">{saved != null ? formatBrl(saved) : '—'}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-zinc-400 text-xs">Data inicial</Label>
            <Input type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-400 text-xs">Data final</Label>
            <Input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>
        </div>
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}
        <Button onClick={save} disabled={saving}
          className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

export default function MenuAdmin() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [promoProduct, setPromoProduct] = useState<Product | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [prods, cats] = await Promise.all([getAdminProducts(), getAdminCategories()]);
    setProducts(prods);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveProduct = async (form: ProductFormData) => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: form.price,
        image: form.image,
        videoUrl: form.videoUrl,
        ingredients: form.ingredients.split(',').map(i => i.trim()).filter(Boolean),
        addons: form.addons.filter(a => a.name.trim()),
        categoryId: form.categoryId ? parseInt(form.categoryId) : null,
        displayOrder: parseInt(form.displayOrder) || 0,
        isFeatured: form.isFeatured,
        isPromotion: form.isPromotion,
        isClubeExclusive: form.isClubeExclusive,
        promoOriginalPrice: form.promoOriginalPrice || form.price,
        promoPrice: form.promoPrice || null,
        promoStartsAt: form.promoStartsAt || null,
        promoEndsAt: form.promoEndsAt || null,
        promoText: form.promoText || '',
      };
      if (editProduct) {
        const updated = await updateProduct(editProduct.id, payload);
        setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      } else {
        const created = await createProduct(payload);
        setProducts(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditProduct(null);
    } finally { setSaving(false); }
  };

  const handleToggleAvailable = async (product: Product) => {
    const updated = await updateProduct(product.id, { available: !product.available });
    setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, available: updated.available } : p));
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Excluir este produto?')) return;
    await deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleAddCategory = async () => {
    if (!newCatName || !newCatSlug) return;
    setAddingCat(true);
    try {
      const cat = await createCategory({ name: newCatName, slug: newCatSlug, displayOrder: categories.length });
      setCategories(prev => [...prev, cat]);
      setNewCatName('');
      setNewCatSlug('');
    } finally { setAddingCat(false); }
  };

  const handleToggleCategory = async (cat: Category) => {
    const updated = await updateCategory(cat.id, { active: !cat.active });
    setCategories(prev => prev.map(c => c.id === updated.id ? { ...c, active: updated.active } : c));
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Excluir esta categoria?')) return;
    await deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase text-base leading-none">Gestão do Cardápio</h1>
            <p className="text-zinc-600 text-xs">Produtos e promoções</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        <Link href="/admin/divulgacao" className="block">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3 hover:bg-amber-500/15 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <Megaphone size={18} className="text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-amber-400 font-black uppercase text-sm leading-none">Divulgação</p>
                <p className="text-zinc-400 text-xs mt-1 truncate">Link, WhatsApp e QR do cardápio</p>
              </div>
            </div>
            <span className="text-amber-500 text-xs font-bold uppercase shrink-0">Abrir</span>
          </div>
        </Link>

        <AdminTabBar variant="equal">
          {(['products', 'categories'] as const).map(t => (
            <AdminTab key={t} active={tab === t} onClick={() => setTab(t)}>
              {t === 'products' ? 'Produtos' : 'Categorias'}
            </AdminTab>
          ))}
        </AdminTabBar>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'products' ? (
          <div className="space-y-4">
            {showForm && (
              <ProductForm
                categories={categories}
                initial={editProduct ? productToForm(editProduct) : undefined}
                onSave={handleSaveProduct}
                onCancel={() => { setShowForm(false); setEditProduct(null); }}
                saving={saving}
              />
            )}

            {!showForm && (
              <Button onClick={() => { setEditProduct(null); setShowForm(true); }}
                className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
                <Plus size={18} /> Adicionar Produto
              </Button>
            )}

            <div className="admin-card-grid-2">
              <AnimatePresence>
                {products.map(product => (
                  <motion.div key={product.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex gap-0">
                    <div className="w-24 shrink-0">
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=150&fit=crop'}
                        alt={product.name}
                        className={`w-full h-full object-cover min-h-[88px] ${!product.available ? 'opacity-40 grayscale' : ''}`}
                      />
                    </div>
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className={`font-bold uppercase text-sm leading-tight ${product.available ? 'text-white' : 'text-zinc-600'}`}>
                            {product.name}
                          </h3>
                          {product.categoryName && (
                            <span className="text-zinc-600 text-[10px] uppercase tracking-wider">{product.categoryName}</span>
                          )}
                          <p className="text-amber-500 font-black text-base mt-1">
                            {product.isPromoActive && product.displayPrice ? (
                              <>
                                <span className="text-zinc-500 text-xs line-through mr-1.5 font-medium">
                                  {formatBrl(product.compareAtPrice || product.price)}
                                </span>
                                {formatBrl(product.displayPrice)}
                              </>
                            ) : (
                              formatBrl(product.price)
                            )}
                          </p>
                          {(product.promoText || product.discountLabel) ? (
                            <span className="inline-block mt-1 text-[10px] font-bold text-red-400">
                              {[product.discountLabel, product.promoText].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button onClick={() => setPromoProduct(product)}
                            className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 inline-flex items-center gap-1"
                            title="Promoção rápida">
                            <Zap size={12} /> Promoção
                          </button>
                          <button onClick={() => handleToggleAvailable(product)}
                            className={`p-1.5 rounded-lg transition-colors ${product.available ? 'text-green-400 bg-green-900/30 hover:bg-green-900/50' : 'text-zinc-600 bg-zinc-800 hover:bg-zinc-700'}`}
                            title={product.available ? 'Desativar' : 'Ativar'}>
                            {product.available ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          <button onClick={() => { setEditProduct(product); setShowForm(true); }}
                            className="p-1.5 text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors" title="Editar">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDeleteProduct(product.id)}
                            className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg transition-colors" title="Excluir">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {products.length === 0 && (
                <div className="text-center py-12">
                  <UtensilsCrossed size={40} className="text-zinc-800 mx-auto mb-3" />
                  <p className="text-zinc-600">Nenhum produto cadastrado.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-white font-bold uppercase text-sm">Nova Categoria</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Nome</Label>
                  <Input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder="Ex: Sobremesas"
                    className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Slug (sem espaços)</Label>
                  <Input value={newCatSlug} onChange={e => setNewCatSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    placeholder="Ex: sobremesas"
                    className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
                </div>
              </div>
              <Button onClick={handleAddCategory} disabled={addingCat || !newCatName || !newCatSlug}
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl h-10 text-sm flex gap-2">
                {addingCat ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar
              </Button>
            </div>

            <div className="admin-card-grid-2">
              {categories.map(cat => (
                <div key={cat.id} className="admin-card bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className={`font-bold text-sm ${cat.active ? 'text-white' : 'text-zinc-600'}`}>{cat.name}</p>
                    <p className="text-zinc-600 text-xs font-mono">{cat.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleCategory(cat)}
                      className={`p-1.5 rounded-lg ${cat.active ? 'text-green-400 bg-green-900/30' : 'text-zinc-600 bg-zinc-800'}`}>
                      {cat.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {promoProduct ? (
        <QuickPromoModal
          product={promoProduct}
          onClose={() => setPromoProduct(null)}
          onSaved={(updated) => setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))}
        />
      ) : null}

      <AdminBottomNav active="/admin/cardapio" />
    </div>
  );
}
