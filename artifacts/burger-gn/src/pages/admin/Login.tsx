import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAdmin } from '../../context/AdminContext';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { login } = useAdmin();
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      setLocation('/admin');
    } catch {
      setError('Senha incorreta. Tente novamente.');
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
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-amber-500 font-black text-2xl">GN</span>
          </div>
          <h1 className="text-white font-black text-3xl uppercase tracking-tighter">The Burger GN</h1>
          <p className="text-zinc-500 text-sm mt-1">Painel Administrativo</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium">Senha de acesso</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Digite a senha"
                className="bg-zinc-900 border-zinc-800 h-14 pl-10 pr-12 text-white text-base focus:border-amber-500"
                autoComplete="current-password"
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

          <Button type="submit" disabled={loading || !password}
            className="w-full h-14 font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-base">
            {loading ? <><Loader2 size={20} className="animate-spin mr-2" /> Entrando...</> : 'ENTRAR'}
          </Button>
        </form>

        <p className="text-zinc-700 text-xs text-center mt-8">
          Senha padrão: <span className="text-zinc-500">burger123</span> — altere em ADMIN_PASSWORD
        </p>
      </motion.div>
    </div>
  );
}
