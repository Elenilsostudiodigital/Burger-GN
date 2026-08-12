import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAdmin } from '../../context/AdminContext';
import { Lock, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEFAULT_EMAIL = 'admin@burgergn.com.br';

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { login } = useAdmin();
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      setLocation('/admin');
    } catch (err) {
      const message = err instanceof Error ? err.message.trim() : '';
      // Never mask server/DB failures as "wrong password".
      if (
        !message ||
        /e-mail ou senha incorretos/i.test(message) ||
        /informe e-mail e senha/i.test(message)
      ) {
        setError(message || 'E-mail ou senha incorretos. Tente novamente.');
      } else if (/<!DOCTYPE|<html/i.test(message)) {
        setError('Falha interna no servidor ao autenticar. Tente novamente em instantes.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-amber-500 font-black text-2xl">GN</span>
          </div>
          <h1 className="text-white font-black text-3xl uppercase tracking-tighter">The Burger GN</h1>
          <p className="text-zinc-500 text-sm mt-1">Painel Administrativo</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium">E-mail</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-zinc-900 border-zinc-800 h-14 pl-10 text-white text-base focus:border-amber-500"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium">Senha</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Digite a senha"
                className="bg-zinc-900 border-zinc-800 h-14 pl-10 pr-12 text-white text-base focus:border-amber-500"
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || !password || !email}
            className="w-full h-14 font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-base">
            {loading ? <><Loader2 size={20} className="animate-spin mr-2" /> Entrando...</> : 'ENTRAR'}
          </Button>
        </form>

        <p className="text-zinc-700 text-xs text-center mt-8">
          Padrão: <span className="text-zinc-500">{DEFAULT_EMAIL}</span> / <span className="text-zinc-500">burger123</span>
        </p>
      </motion.div>
    </div>
  );
}
