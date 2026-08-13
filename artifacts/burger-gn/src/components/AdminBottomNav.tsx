import { Link } from 'wouter';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Settings, Crown,
  TrendingUp, Star, Upload, Navigation, Users, BarChart3, PackageCheck, Shield,
} from 'lucide-react';
import { getAdminStreetRequests } from '../lib/api';

const ITEMS = [
  { href: '/admin', icon: BarChart3, label: 'Início' },
  { href: '/admin/pedidos', icon: LayoutDashboard, label: 'Pedidos' },
  { href: '/admin/pedidos-finalizados', icon: PackageCheck, label: 'Finalizados' },
  { href: '/admin/clientes', icon: Users, label: 'Clientes' },
  { href: '/admin/avaliacoes', icon: Star, label: 'Avaliações' },
  { href: '/admin/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
  { href: '/admin/financeiro', icon: TrendingUp, label: 'Financeiro' },
  { href: '/admin/cupons', icon: Tag, label: 'Cupons' },
  { href: '/admin/clube', icon: Crown, label: 'Clube' },
  { href: '/admin/taxas', icon: MapPin, label: 'Bairros' },
  { href: '/admin/novas-ruas', icon: MapPin, label: 'Novas Ruas' },
  { href: '/admin/entrega-km', icon: Navigation, label: 'Por KM' },
  { href: '/admin/config', icon: Settings, label: 'Config' },
  { href: '/admin/seguranca', icon: Shield, label: 'Segurança' },
  { href: '/admin/importar', icon: Upload, label: 'Importar' },
] as const;

export function AdminBottomNav({ active }: { active: string }) {
  const [pedidosBadge, setPedidosBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAdminStreetRequests('pending')
        .then((list) => {
          if (!cancelled) setPedidosBadge(Array.isArray(list) ? list.length : 0);
        })
        .catch(() => { /* ignore */ });
    };
    load();
    const interval = setInterval(load, 15000);
    const es = new EventSource('/api/orders/stream', { withCredentials: true });
    es.addEventListener('street_request', load);
    es.addEventListener('street_request_resolved', load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      es.close();
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex overflow-x-auto no-scrollbar">
        {ITEMS.map((item) => {
          const isActive = active === item.href
            || (item.href !== '/admin'
              && item.href !== '/admin/pedidos'
              && active.startsWith(item.href))
            || (item.href === '/admin/pedidos' && active === '/admin/pedidos');
          return (
            <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
              <div className={`relative flex flex-col items-center gap-0.5 py-2.5 ${
                isActive ? 'text-amber-500' : 'text-zinc-500 hover:text-white'
              }`}>
                <item.icon size={18} />
                <span className="text-[9px] font-bold uppercase">{item.label}</span>
                <span
                  className={`absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center ${
                    item.href === '/admin/pedidos' && pedidosBadge > 0 ? '' : 'invisible'
                  }`}
                >
                  {pedidosBadge > 9 ? '9+' : pedidosBadge || 0}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
