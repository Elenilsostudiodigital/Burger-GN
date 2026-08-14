import React, { useState } from 'react';
import { Link } from 'wouter';
import { useLocation } from 'wouter';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings, LogOut,
  Upload, Link as LinkIcon, FileText, Loader2, Check, X, AlertTriangle, Download, TrendingUp, Crown,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { Button } from '@/components/ui/button';
import {
  parseImportText, fetchImportLink, commitImport,
  ImportDraft, ImportDraftProduct, ImportCommitResult,
} from '../../lib/api';

type Mode = 'text' | 'link' | 'file';

export default function ImportMenu() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const runParse = async (fn: () => Promise<ImportDraft>) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const parsed = await fn();
      if (parsed.products.length === 0) {
        setError('Nenhum produto foi identificado. Verifique o conteúdo e tente novamente.');
        setDraft(null);
        return;
      }
      setDraft({
        categories: parsed.categories,
        products: parsed.products.map(p => ({ ...p, include: true })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar importação.');
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  const handleParseText = () => runParse(() => parseImportText(text));
  const handleParseLink = () => runParse(() => fetchImportLink(link));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
      const categories = new Map<string, { name: string; slug: string }>();
      const products: ImportDraftProduct[] = [];
      for (const row of rows) {
        const name = String(row['nome'] ?? row['Nome'] ?? row['name'] ?? '').trim();
        if (!name) continue;
        const categoryName = String(row['categoria'] ?? row['Categoria'] ?? row['category'] ?? 'Sem categoria').trim() || 'Sem categoria';
        const slug = categoryName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!categories.has(slug)) categories.set(slug, { name: categoryName, slug });
        const priceRaw = row['preco'] ?? row['preço'] ?? row['Preço'] ?? row['price'] ?? 0;
        const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw).replace(',', '.')) || 0;
        products.push({
          name,
          description: String(row['descricao'] ?? row['descrição'] ?? row['Descrição'] ?? row['description'] ?? '').trim(),
          price,
          image: String(row['imagem'] ?? row['Imagem'] ?? row['image'] ?? '').trim(),
          available: true,
          categorySlug: slug,
          categoryName,
          include: true,
        });
      }
      if (products.length === 0) {
        setError('Nenhum produto encontrado no arquivo. Use colunas: nome, descricao, preco, categoria, imagem.');
        setDraft(null);
      } else {
        setDraft({ categories: Array.from(categories.values()), products });
      }
    } catch {
      setError('Não foi possível ler o arquivo. Verifique se é um CSV ou Excel válido.');
      setDraft(null);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const toggleInclude = (idx: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      products: draft.products.map((p, i) => i === idx ? { ...p, include: !p.include } : p),
    });
  };

  const updateProductField = (idx: number, field: 'name' | 'price', value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      products: draft.products.map((p, i) => {
        if (i !== idx) return p;
        return field === 'price' ? { ...p, price: parseFloat(value) || 0 } : { ...p, name: value };
      }),
    });
  };

  const handleCommit = async () => {
    if (!draft) return;
    setCommitting(true);
    try {
      const res = await commitImport(draft);
      setResult(res);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar importação.');
    } finally {
      setCommitting(false);
    }
  };

  const includedCount = draft?.products.filter(p => p.include !== false).length ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase text-base leading-none">Importar Cardápio</h1>
            <p className="text-zinc-600 text-xs">The Burger GN</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        {result && (
          <div className="bg-green-900/20 border border-green-700 rounded-2xl p-4 space-y-1">
            <p className="text-green-400 font-bold text-sm flex items-center gap-2"><Check size={16} /> Importação concluída!</p>
            <p className="text-zinc-300 text-sm">{result.categoriesCreated} categoria(s) criada(s), {result.productsCreated} produto(s) adicionado(s), {result.productsSkipped} ignorado(s) (já existiam).</p>
            <Link href="/admin/cardapio">
              <span className="inline-block mt-2 text-amber-500 text-sm font-bold underline cursor-pointer">Ver cardápio atualizado →</span>
            </Link>
          </div>
        )}

        {!draft && (
          <>
            <div className="flex gap-2">
              {([
                { key: 'text', label: 'Colar Texto', icon: FileText },
                { key: 'link', label: 'Link', icon: LinkIcon },
                { key: 'file', label: 'CSV/Excel', icon: Upload },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setMode(key); setError(''); }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mode === key ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:bg-zinc-800'
                  }`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {mode === 'text' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Cole o conteúdo do cardápio (texto copiado de outro sistema, ou uma lista simples com nome, descrição e preço de cada produto).
                </p>
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder={"## Categoria\n### Nome do Produto\nDescrição do produto\nR$ 24,90"}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-56 font-mono placeholder:text-zinc-700" />
                <Button onClick={handleParseText} disabled={loading || !text.trim()}
                  className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                  {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null} Processar
                </Button>
              </div>
            )}

            {mode === 'link' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Cole o link do cardápio online (ex: Anota Aí, iFood, etc). Funciona melhor com páginas simples — sites que carregam o cardápio via JavaScript podem não ser lidos automaticamente; nesse caso, use a opção "Colar Texto".
                </p>
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-10 text-white text-sm focus:border-amber-500 focus:outline-none" />
                <Button onClick={handleParseLink} disabled={loading || !link.trim()}
                  className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                  {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null} Buscar cardápio
                </Button>
              </div>
            )}

            {mode === 'file' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Envie um arquivo CSV ou Excel com as colunas: <span className="text-zinc-300 font-mono">nome, descricao, preco, categoria, imagem</span>.
                </p>
                <label className="w-full h-24 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-amber-500 transition-colors">
                  <Download size={20} className="text-zinc-500" />
                  <span className="text-zinc-500 text-xs">{loading ? 'Processando...' : 'Clique para selecionar o arquivo'}</span>
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
                </label>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}
          </>
        )}

        {draft && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold uppercase text-sm">Prévia da importação</h3>
              <span className="text-zinc-500 text-xs">{includedCount} de {draft.products.length} selecionados</span>
            </div>
            <p className="text-zinc-500 text-xs">
              {draft.categories.length} categoria(s) identificada(s): {draft.categories.map(c => c.name).join(', ')}.
              Desmarque itens que não deseja importar, ajuste nome/preço se necessário, e confirme.
            </p>

            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {draft.products.map((p, idx) => (
                <div key={idx}
                  className={`bg-zinc-900 border rounded-xl p-3 flex gap-3 items-center transition-opacity ${p.include === false ? 'border-zinc-800 opacity-40' : 'border-zinc-700'}`}>
                  <input type="checkbox" checked={p.include !== false} onChange={() => toggleInclude(idx)}
                    className="w-4 h-4 accent-amber-500 shrink-0" />
                  {p.image ? (
                    <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 shrink-0 flex items-center justify-center">
                      <UtensilsCrossed size={16} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <input value={p.name} onChange={e => updateProductField(idx, 'name', e.target.value)}
                      className="w-full bg-transparent text-white text-sm font-bold focus:outline-none border-b border-transparent focus:border-amber-500" />
                    <p className="text-zinc-600 text-[10px] uppercase tracking-wider truncate">{p.categoryName}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="text-amber-500 text-xs">R$</span>
                    <input type="number" step="0.01" value={p.price} onChange={e => updateProductField(idx, 'price', e.target.value)}
                      className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 h-8 text-white text-xs focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <Button onClick={handleCommit} disabled={committing || includedCount === 0}
                className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                {committing ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
                Confirmar Importação ({includedCount})
              </Button>
              <Button variant="outline" onClick={() => { setDraft(null); setError(''); }}
                className="flex-1 h-11 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl">
                <X size={16} className="mr-2" /> Cancelar
              </Button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="admin-shell flex overflow-x-auto no-scrollbar">
          <Link href="/admin/pedidos" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <LayoutDashboard size={18} />
              <span className="text-[9px] font-bold uppercase">Pedidos</span>
            </div>
          </Link>
          <Link href="/admin/cardapio" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <UtensilsCrossed size={18} />
              <span className="text-[9px] font-bold uppercase">Cardápio</span>
            </div>
          </Link>
          <Link href="/admin/financeiro" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <TrendingUp size={18} />
              <span className="text-[9px] font-bold uppercase">Financeiro</span>
            </div>
          </Link>

          <Link href="/admin/cupons" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Tag size={18} />
              <span className="text-[9px] font-bold uppercase">Cupons</span>
            </div>
          </Link>
          <Link href="/admin/clube" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Crown size={18} />
              <span className="text-[9px] font-bold uppercase">Clube Burger</span>
            </div>
          </Link>
          <Link href="/admin/taxas" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <MapPin size={18} />
              <span className="text-[9px] font-bold uppercase">Bairros</span>
            </div>
          </Link>
          <Link href="/admin/entrega-km" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Navigation size={18} />
              <span className="text-[9px] font-bold uppercase">Por KM</span>
            </div>
          </Link>
          <Link href="/admin/config" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Settings size={18} />
              <span className="text-[9px] font-bold uppercase">Config</span>
            </div>
          </Link>
          <Link href="/admin/importar" className="flex-1 min-w-[14%]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-amber-500">
              <Upload size={18} />
              <span className="text-[9px] font-bold uppercase">Importar</span>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}
