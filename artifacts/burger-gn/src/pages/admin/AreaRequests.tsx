import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { getAdminAreaRequests, DeliveryAreaRequest } from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { AreaRequestAdminCard } from '../../components/AreaRequestAdminCard';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function AdminAreaRequests() {
  const [, setLocation] = useLocation();
  const [list, setList] = useState<DeliveryAreaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setList(await getAdminAreaRequests('pending'));
      setError('');
    } catch {
      setError('Não foi possível carregar as solicitações.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/orders/stream', { withCredentials: true });
    es.addEventListener('area_request', () => {
      void refresh(true);
    });
    return () => es.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button type="button" onClick={() => setLocation('/admin/pedidos')} className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Pedidos</p>
            <h1 className="font-black text-sm uppercase tracking-tight">Solicitações de Área</h1>
          </div>
          <Link href="/admin/entrega-km" className="ml-auto text-amber-500 text-[10px] font-bold uppercase">
            Áreas de entrega
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" /></div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-500 text-sm">
            Nenhuma solicitação de área aguardando análise.
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((r) => (
              <AreaRequestAdminCard key={r.id} request={r} onChanged={() => void refresh(true)} />
            ))}
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/solicitacoes-areas" />
    </div>
  );
}
