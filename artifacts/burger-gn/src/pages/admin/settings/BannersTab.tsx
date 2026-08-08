import React, { useEffect, useState } from 'react';
import { Check, Loader2, X, Plus, Trash2, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BannerItem, BannerType, getAdminBanners, updateBanners } from '../../../lib/api';

const TYPES: { id: BannerType; label: string }[] = [
  { id: 'mais_vendidos', label: 'Mais vendidos' },
  { id: 'combos', label: 'Combos' },
  { id: 'promocoes', label: 'Promoções' },
  { id: 'novidades', label: 'Novidades' },
];

export function BannersTab() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminBanners()
      .then(setBanners)
      .catch(() => setError('Erro ao carregar banners'))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (next: BannerItem[]) => {
    setSaving(true); setSuccess(false); setError('');
    try {
      const ordered = next.map((b, i) => ({ ...b, order: i }));
      const saved = await updateBanners(ordered);
      setBanners(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError('Erro ao salvar banners');
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...banners];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void persist(next);
  };

  const addBanner = () => {
    const item: BannerItem = {
      id: `banner-${Date.now()}`,
      title: 'Novo banner',
      subtitle: '',
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&h=600&fit=crop',
      type: 'novidades',
      active: true,
      order: banners.length,
      link: '/cardapio',
    };
    void persist([...banners, item]);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Carrossel automático da tela inicial. Altere imagens, ordem e ative/desative cada banner.
        </p>
      </div>

      {banners.map((b, index) => (
        <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
              <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{b.title}</p>
              <p className="text-zinc-500 text-[11px] uppercase">{TYPES.find((t) => t.id === b.type)?.label}</p>
            </div>
            <button type="button" onClick={() => {
              const next = banners.map((x) => x.id === b.id ? { ...x, active: !x.active } : x);
              void persist(next);
            }} className={b.active ? 'text-green-400' : 'text-zinc-600'}>
              {b.active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[10px]">Título</Label>
              <Input value={b.title}
                onChange={(e) => setBanners((prev) => prev.map((x) => x.id === b.id ? { ...x, title: e.target.value } : x))}
                onBlur={() => void persist(banners)}
                className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[10px]">Tipo</Label>
              <select
                value={b.type}
                onChange={(e) => {
                  const next = banners.map((x) => x.id === b.id ? { ...x, type: e.target.value as BannerType } : x);
                  setBanners(next);
                  void persist(next);
                }}
                className="w-full h-10 rounded-md bg-zinc-950 border border-zinc-800 text-white text-sm px-2 focus:border-amber-500"
              >
                {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-500 text-[10px] flex items-center gap-1"><ImageIcon size={12} /> URL da imagem</Label>
            <Input value={b.imageUrl}
              onChange={(e) => setBanners((prev) => prev.map((x) => x.id === b.id ? { ...x, imageUrl: e.target.value } : x))}
              onBlur={() => void persist(banners)}
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500 font-mono" />
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-500 text-[10px]">Subtítulo</Label>
            <Input value={b.subtitle}
              onChange={(e) => setBanners((prev) => prev.map((x) => x.id === b.id ? { ...x, subtitle: e.target.value } : x))}
              onBlur={() => void persist(banners)}
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => move(index, -1)} className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white">
              <ChevronUp size={16} />
            </button>
            <button type="button" onClick={() => move(index, 1)} className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white">
              <ChevronDown size={16} />
            </button>
            <div className="flex-1" />
            <button type="button" onClick={() => {
              if (!confirm('Excluir este banner?')) return;
              void persist(banners.filter((x) => x.id !== b.id));
            }} className="p-2 rounded-lg text-red-500 hover:bg-red-950/40">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}

      {success && <p className="text-green-400 text-sm flex items-center gap-2"><Check size={16} /> Banners salvos!</p>}
      {error && <p className="text-red-400 text-sm flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={addBanner} disabled={saving}
        className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar banner
      </Button>
    </div>
  );
}
