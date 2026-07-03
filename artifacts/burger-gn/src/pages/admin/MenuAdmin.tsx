import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminProducts, getAdminCategories, createProduct, updateProduct, deleteProduct,
  createCategory, updateCategory, deleteCategory,
  Product, Category,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import { useLocation } from 'wouter';
import {
  LayoutDashboard, UtensilsCrossed, Plus, Pencil, Trash2, Check, X,
  ToggleLeft, ToggleRight, Loader2, Tag, MapPin, LogOut, Navigation, Settings, Upload,
  TrendingUp,
} from 'lucide-react';
import type { Addon } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
}

const EMPTY_FORM: ProductFormData = {
  name: '', description: '', price: '', image: '', videoUrl: '', ingredients: '', addons: [], categoryId: '', displayOrder: '0',
};

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
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase text-base leading-none">Gestão do Cardápio</h1>
            <p className="text-zinc-600 text-xs">The Burger GN</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Tabs */}
        <div className="flex gap-2">
          {(['products', 'categories'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${
                tab === t ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:bg-zinc-800'
              }`}>
              {t === 'products' ? 'Produtos' : 'Categorias'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'products' ? (
          <div className="space-y-4">
            {/* Add / Edit form */}
            {showForm && (
              <ProductForm
                categories={categories}
                initial={editProduct ? {
                  name: editProduct.name,
                  description: editProduct.description,
                  price: editProduct.price,
                  image: editProduct.image,
                  videoUrl: editProduct.videoUrl ?? '',
                  ingredients: (editProduct.ingredients ?? []).join(', '),
                  addons: editProduct.addons ?? [],
                  categoryId: editProduct.categoryId ? String(editProduct.categoryId) : '',
                  displayOrder: String(editProduct.displayOrder),
                } : undefined}
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

            {/* Product list */}
            <div className="space-y-3">
              <AnimatePresence>
                {products.map(product => (
                  <motion.div key={product.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex gap-0">
                    {/* Image */}
                    <div className="w-24 shrink-0">
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=150&fit=crop'}
                        alt={product.name}
                        className={`w-full h-full object-cover min-h-[88px] ${!product.available ? 'opacity-40 grayscale' : ''}`}
                      />
                    </div>
                    {/* Info */}
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
                            R$ {parseFloat(product.price).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 shrink-0">
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
          /* Categories tab */
          <div className="space-y-4">
            {/* Add category */}
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

            {/* Category list */}
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
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

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="max-w-2xl mx-auto flex">
          <Link href="/admin" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <LayoutDashboard size={18} />
              <span className="text-[9px] font-bold uppercase">Pedidos</span>
            </div>
          </Link>
          <Link href="/admin/cardapio" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-amber-500">
              <UtensilsCrossed size={18} />
              <span className="text-[9px] font-bold uppercase">Cardápio</span>
            </div>
          </Link>
          <Link href="/admin/financeiro" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <TrendingUp size={18} />
              <span className="text-[9px] font-bold uppercase">Financeiro</span>
            </div>
          </Link>

          <Link href="/admin/cupons" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Tag size={18} />
              <span className="text-[9px] font-bold uppercase">Cupons</span>
            </div>
          </Link>
          <Link href="/admin/taxas" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <MapPin size={18} />
              <span className="text-[9px] font-bold uppercase">Bairros</span>
            </div>
          </Link>
          <Link href="/admin/entrega-km" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Navigation size={18} />
              <span className="text-[9px] font-bold uppercase">Por KM</span>
            </div>
          </Link>
          <Link href="/admin/config" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Settings size={18} />
              <span className="text-[9px] font-bold uppercase">Config</span>
            </div>
          </Link>
          <Link href="/admin/importar" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Upload size={18} />
              <span className="text-[9px] font-bold uppercase">Importar</span>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}
