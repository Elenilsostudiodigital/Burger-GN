import React, { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { adminForgotPassword } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await adminForgotPassword(trimmed);
      setSuccess(
        res.message ||
          'Se o e-mail estiver cadastrado, registramos o pedido de recuperação. O envio de e-mail será ativado em breve.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message.trim() : '';
      setError(message || 'Não foi possível registrar a recuperação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="text-amber-500" size={28} />
          </div>
          <h1 className="text-white font-black text-2xl uppercase tracking-tight">
            Esqueci minha senha
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            Informe o e-mail da conta. Por enquanto apenas registramos o pedido — o envio de e-mail
            será implementado depois.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium" htmlFor="recovery-email">
              E-mail
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-zinc-900 border-zinc-800 h-14 pl-10 text-white text-base focus:border-amber-500"
                autoComplete="email"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-900/30 border border-emerald-800 rounded-xl p-3 text-emerald-400 text-sm flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-14 font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-base"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin mr-2" />
                Registrando...
              </>
            ) : (
              'Solicitar recuperação'
            )}
          </Button>
        </form>

        <Link
          href="/admin/login"
          className="mt-8 flex items-center justify-center gap-2 text-zinc-500 hover:text-amber-500 text-sm"
        >
          <ArrowLeft size={16} />
          Voltar ao login
        </Link>
      </motion.div>
    </div>
  );
}
