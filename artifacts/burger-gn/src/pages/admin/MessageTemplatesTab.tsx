import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, RotateCcw, Save, Check, MessageSquareText } from 'lucide-react';
import {
  getAdminMessageTemplates,
  updateAdminMessageTemplate,
  restoreAdminMessageTemplate,
  previewAdminMessageTemplate,
  MessageTemplateItem,
  getOrders,
  buildOrderTemplateVars,
  interpolateMessageTemplate,
  Order,
} from '../../lib/api';

export function MessageTemplatesTab() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [sampleOrder, setSampleOrder] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, orders] = await Promise.all([
        getAdminMessageTemplates(),
        getOrders("all").catch(() => [] as Order[]),
      ]);
      setTemplates(res.templates);
      setVariables(res.variables || []);
      const next: Record<string, string> = {};
      for (const t of res.templates) next[t.key] = t.body;
      setDrafts(next);
      const preparing = orders.find((o) => o.workflow === 'preparing' || o.status === 'preparing');
      setSampleOrder(preparing || orders[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setFlashFor = (key: string, msg: string) => {
    setFlash((prev) => ({ ...prev, [key]: msg }));
    setTimeout(() => {
      setFlash((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }, 2500);
  };

  const handleSave = async (key: string) => {
    setBusyKey(key);
    setError('');
    try {
      const updated = await updateAdminMessageTemplate(key, drafts[key] || '');
      setTemplates((prev) => prev.map((t) => (t.key === key ? updated : t)));
      setDrafts((prev) => ({ ...prev, [key]: updated.body }));
      setFlashFor(key, 'Salvo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (key: string) => {
    if (!window.confirm('Restaurar a mensagem padrão desta opção?')) return;
    setBusyKey(key);
    setError('');
    try {
      const updated = await restoreAdminMessageTemplate(key);
      setTemplates((prev) => prev.map((t) => (t.key === key ? updated : t)));
      setDrafts((prev) => ({ ...prev, [key]: updated.body }));
      setFlashFor(key, 'Padrão restaurado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar');
    } finally {
      setBusyKey(null);
    }
  };

  const handlePreview = async (key: string, name: string) => {
    setBusyKey(key);
    setError('');
    try {
      const body = drafts[key] || '';
      if (sampleOrder) {
        const vars = buildOrderTemplateVars(sampleOrder);
        setPreview({
          name,
          text: interpolateMessageTemplate(body, vars),
        });
      } else {
        const res = await previewAdminMessageTemplate(key, { body });
        setPreview({ name, text: res.preview });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao visualizar');
    } finally {
      setBusyKey(null);
    }
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
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
        <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
          <MessageSquareText size={16} className="text-amber-500" />
          Mensagens Automáticas
        </h3>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Textos usados nas atualizações do pedido (WhatsApp e painel). Variáveis disponíveis:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <code
              key={v}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-amber-400"
            >
              {`{{${v}}}`}
            </code>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {templates.map((t) => {
        const busy = busyKey === t.key;
        const dirty = (drafts[t.key] || '') !== t.body;
        return (
          <div
            key={t.key}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-white font-black text-sm">{t.name}</p>
                <p className="text-zinc-600 text-[10px] uppercase font-bold tracking-wider">{t.key}</p>
              </div>
              {flash[t.key] && (
                <span className="text-green-400 text-xs font-bold flex items-center gap-1">
                  <Check size={12} /> {flash[t.key]}
                </span>
              )}
            </div>

            <textarea
              value={drafts[t.key] || ''}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [t.key]: e.target.value }))}
              rows={6}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 resize-y min-h-[120px] font-mono leading-relaxed"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePreview(t.key, t.name)}
                className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-200 text-xs font-black uppercase flex items-center gap-1.5 hover:border-amber-500/50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Visualizar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRestore(t.key)}
                className="h-10 px-3 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-black uppercase flex items-center gap-1.5 hover:border-amber-500/50"
              >
                <RotateCcw size={14} /> Restaurar padrão
              </button>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => void handleSave(t.key)}
                className="h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-40 ml-auto"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        );
      })}

      {preview && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-white font-black text-sm">Preview · {preview.name}</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-zinc-500 hover:text-white text-xs font-bold uppercase"
              >
                Fechar
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-xl p-3 font-sans leading-relaxed">
              {preview.text}
            </pre>
            <p className="text-zinc-600 text-[10px]">
              {sampleOrder
                ? `Variáveis do pedido #${sampleOrder.orderNumber}`
                : 'Variáveis de exemplo (nenhum pedido no painel)'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
