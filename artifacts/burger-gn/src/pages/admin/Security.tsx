import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Shield, Lock, Eye, EyeOff, Loader2, LogOut, CheckCircle2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { adminChangePassword } from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function validateClient(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!currentPassword) return 'Informe a senha atual.';
  if (!newPassword) return 'Informe a nova senha.';
  if (newPassword.length < 8) return 'A nova senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return 'A nova senha deve conter letras e números.';
  }
  if (!confirmPassword) return 'Confirme a nova senha.';
  if (newPassword !== confirmPassword) {
    return 'A nova senha e a confirmação não coincidem.';
  }
  if (newPassword === currentPassword) {
    return 'A nova senha deve ser diferente da senha atual.';
  }
  return null;
}

export default function AdminSecurity() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogout = async () => {
    await logout();
    setLocation('/admin/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const clientError = validateClient(currentPassword, newPassword, confirmPassword);
    if (clientError) {
      setError(clientError);
      return;
    }
    setLoading(true);
    try {
      const res = await adminChangePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setSuccess(res.message || 'Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message.trim() : '';
      setError(message || 'Não foi possível alterar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Shield size={18} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black text-lg tracking-tight uppercase truncate">Segurança</h1>
              <p className="text-zinc-500 text-xs">Gerenciamento de senha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-zinc-500 hover:text-white p-2"
            aria-label="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        <section className="space-y-1">
          <h2 className="text-amber-500 font-bold text-sm uppercase tracking-wide flex items-center gap-2">
            <Lock size={16} />
            Alterar Senha
          </h2>
          <p className="text-zinc-500 text-sm">
            Use sua senha atual para definir uma nova. O login continua o mesmo fluxo de sempre.
          </p>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium" htmlFor="current-password">
              Senha Atual
            </label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-zinc-900 border-zinc-800 h-12 pr-12 text-white focus:border-amber-500"
                placeholder="Digite a senha atual"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium" htmlFor="new-password">
              Nova Senha
            </label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-zinc-900 border-zinc-800 h-12 pr-12 text-white focus:border-amber-500"
                placeholder="Mínimo 8 caracteres, letras e números"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-zinc-400 text-sm font-medium" htmlFor="confirm-password">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="bg-zinc-900 border-zinc-800 h-12 pr-12 text-white focus:border-amber-500"
                placeholder="Repita a nova senha"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
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
            className="w-full h-12 font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              'Salvar Nova Senha'
            )}
          </Button>
        </form>
      </main>

      <AdminBottomNav active="/admin/seguranca" />
    </div>
  );
}
