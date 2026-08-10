import { Link } from 'wouter';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Settings, Crown,
  TrendingUp, Star, Upload, Navigation, Users, BarChart3,
} from 'lucide-react';

const ITEMS = [
  { href: '/admin', icon: BarChart3, label: 'Início' },
  { href: '/admin/pedidos', icon: LayoutDashboard, label: 'Pedidos' },
  { href: '/admin/clientes', icon: Users, label: 'Clientes' },
  { href: '/admin/avaliacoes', icon: Star, label: 'Avaliações' },
  { href: '/admin/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
  { href: '/admin/financeiro', icon: TrendingUp, label: 'Financeiro' },
  { href: '/admin/cupons', icon: Tag, label: 'Cupons' },
  { href: '/admin/clube', icon: Crown, label: 'Clube' },
  { href: '/admin/taxas', icon: MapPin, label: 'Bairros' },
  { href: '/admin/entrega-km', icon: Navigation, label: 'Por KM' },
  { href: '/admin/config', icon: Settings, label: 'Config' },
  { href: '/admin/importar', icon: Upload, label: 'Importar' },
] as const;

export function AdminBottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex overflow-x-auto no-scrollbar">
        {ITEMS.map((item) => {
          const isActive = active === item.href
            || (item.href !== '/admin' && active.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
              <div className={`flex flex-col items-center gap-0.5 py-2.5 ${
                isActive ? 'text-amber-500' : 'text-zinc-500 hover:text-white'
              }`}>
                <item.icon size={18} />
                <span className="text-[9px] font-bold uppercase">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
