import React from 'react';
import { Bell } from 'lucide-react';

/** Placeholder for future notification preferences. */
export function NotificationsTab() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
        <Bell size={16} className="text-amber-500" /> Notificações
      </h3>
      <p className="text-zinc-400 text-sm leading-relaxed">
        Estrutura reservada para futuras funções: alerta de novos pedidos, som do painel,
        resumo diário e avisos por WhatsApp/e-mail.
      </p>
      <ul className="text-zinc-500 text-xs space-y-1.5 list-disc pl-4">
        <li>Notificar novo pedido (em breve)</li>
        <li>Som ao receber pedido (em breve)</li>
        <li>Resumo diário de vendas (em breve)</li>
      </ul>
      <p className="text-zinc-600 text-xs pt-2">Nenhuma configuração ativa nesta versão.</p>
    </div>
  );
}
