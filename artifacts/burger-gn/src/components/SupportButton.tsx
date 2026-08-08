import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, MessageCircle, X, LifeBuoy } from 'lucide-react';

/**
 * Floating support bubble (bottom-right).
 * Structure prepared for future WhatsApp Business integration —
 * currently opens an in-app support screen only (no external WA).
 */
export function SupportButton() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'menu' | 'atendimento' | 'ajuda'>('menu');

  const close = () => {
    setOpen(false);
    setTimeout(() => setScreen('menu'), 200);
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Suporte"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-amber-500 text-zinc-950 shadow-[0_10px_28px_rgba(245,158,11,0.35)] flex items-center justify-center"
      >
        <LifeBuoy size={26} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div>
                  <p className="text-white font-black uppercase text-sm tracking-wide">
                    {screen === 'menu' && 'Suporte'}
                    {screen === 'atendimento' && 'Atendimento'}
                    {screen === 'ajuda' && 'Ajuda'}
                  </p>
                  <p className="text-zinc-500 text-[11px]">The Burger GN</p>
                </div>
                <button type="button" onClick={close} className="p-2 text-zinc-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {screen === 'menu' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setScreen('atendimento')}
                      className="w-full flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-left hover:border-amber-500/40 transition-colors"
                    >
                      <span className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center">
                        <MessageCircle size={20} />
                      </span>
                      <span>
                        <span className="block text-white font-bold text-sm">💬 Atendimento</span>
                        <span className="block text-zinc-500 text-xs">Fale com a equipe da loja</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScreen('ajuda')}
                      className="w-full flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-left hover:border-amber-500/40 transition-colors"
                    >
                      <span className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center">
                        <HelpCircle size={20} />
                      </span>
                      <span>
                        <span className="block text-white font-bold text-sm">❓ Ajuda</span>
                        <span className="block text-zinc-500 text-xs">Dúvidas frequentes sobre pedidos</span>
                      </span>
                    </button>
                  </>
                )}

                {screen === 'atendimento' && (
                  <div className="space-y-3">
                    <p className="text-zinc-300 text-sm leading-relaxed">
                      Nosso atendimento pelo WhatsApp estará disponível em breve.
                      Por enquanto, acompanhe seu pedido em <strong className="text-amber-500">Meu Pedido</strong>
                      ou fale com a loja no balcão.
                    </p>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-500">
                      Integração com WhatsApp preparada — ainda não abre conversas externas.
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('menu')}
                      className="w-full h-11 rounded-xl border border-zinc-700 text-zinc-300 font-bold text-sm"
                    >
                      Voltar
                    </button>
                  </div>
                )}

                {screen === 'ajuda' && (
                  <div className="space-y-3 text-sm text-zinc-300">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                      <p className="text-white font-bold text-xs uppercase mb-1">Como acompanhar?</p>
                      <p className="text-zinc-400 text-xs leading-relaxed">
                        Use o botão <strong className="text-amber-500">Meu Pedido</strong> para ver o status em tempo real.
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                      <p className="text-white font-bold text-xs uppercase mb-1">Pagamento Pix</p>
                      <p className="text-zinc-400 text-xs leading-relaxed">
                        Após pagar, envie o comprovante na tela do pedido. O preparo inicia após a confirmação.
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                      <p className="text-white font-bold text-xs uppercase mb-1">Clube Burger GN</p>
                      <p className="text-zinc-400 text-xs leading-relaxed">
                        Acumule selos e cashback nas compras. Peça para o atendente cadastrar seu telefone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('menu')}
                      className="w-full h-11 rounded-xl border border-zinc-700 text-zinc-300 font-bold text-sm"
                    >
                      Voltar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** @deprecated Use SupportButton — kept as alias for existing imports. */
export { SupportButton as WhatsAppButton };
