import { Link } from 'wouter';
import { List, UserPlus, Flame } from 'lucide-react';
import { AdminTabBar, AdminTabLink } from './AdminTabs';

type Tab = 'lista' | 'importar' | 'recuperacao';

const TABS: { id: Tab; href: string; label: string; icon: typeof List }[] = [
  { id: 'lista', href: '/admin/clientes', label: 'Lista', icon: List },
  { id: 'importar', href: '/admin/clientes/importar', label: 'Importação', icon: UserPlus },
  { id: 'recuperacao', href: '/admin/clientes/recuperacao', label: 'Recuperação', icon: Flame },
];

export function ClientsSubnav({ active }: { active: Tab }) {
  return (
    <AdminTabBar variant="equal">
      {TABS.map((tab) => (
        <AdminTabLink key={tab.id} href={tab.href} active={active === tab.id} icon={<tab.icon size={15} />}>
          {tab.label}
        </AdminTabLink>
      ))}
    </AdminTabBar>
  );
}
