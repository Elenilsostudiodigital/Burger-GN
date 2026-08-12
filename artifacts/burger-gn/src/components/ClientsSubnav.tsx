import { Link } from 'wouter';
import { List, UserPlus, Flame, FileSpreadsheet } from 'lucide-react';

type Tab = 'lista' | 'importar' | 'importar-clientes' | 'recuperacao';

const TABS: { id: Tab; href: string; label: string; icon: typeof List }[] = [
  { id: 'lista', href: '/admin/clientes', label: 'Lista', icon: List },
  { id: 'importar', href: '/admin/clientes/importar', label: 'Manual', icon: UserPlus },
  {
    id: 'importar-clientes',
    href: '/admin/config/clientes/importar',
    label: 'Importar',
    icon: FileSpreadsheet,
  },
  { id: 'recuperacao', href: '/admin/clientes/recuperacao', label: 'Recuperação', icon: Flame },
];

export function ClientsSubnav({ active }: { active: Tab }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <Link key={tab.id} href={tab.href} className="flex-1 min-w-[4.5rem]">
            <div
              className={`h-11 rounded-xl font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 px-1 ${
                on
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-amber-500/40'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
