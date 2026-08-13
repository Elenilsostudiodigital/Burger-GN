import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, Lock, Mail, Phone, Shield, X } from 'lucide-react';
import {
  adminChangePassword,
  getRecoveryContacts,
  updateRecoveryEmail,
  updateRecoveryPhone,
} from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function validatePasswordChange(
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

export function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [contactsLoading, setContactsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setContactsLoading(true);
      try {
        const c = await getRecoveryContacts();
        setLoginEmail(c.loginEmail || '');
        setRecoveryEmail(c.recoveryEmail || '');
        setRecoveryPhone(c.recoveryPhone || '');
      } catch {
        /* ignore — form still usable */
      } finally {
        setContactsLoading(false);
      }
    })();
  }, []);

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    const clientError = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (clientError) {
      setPwdError(clientError);
      return;
    }
    setPwdLoading(true);
    try {
      const res = await adminChangePassword({ currentPassword, newPassword, confirmPassword });
      setPwdSuccess(res.message || 'Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!recoveryEmail.trim()) {
      setEmailError('Informe o e-mail de recuperação.');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await updateRecoveryEmail(recoveryEmail.trim());
      setRecoveryEmail(res.recoveryEmail);
      setEmailSuccess(res.message || 'E-mail de recuperação salvo com sucesso.');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao salvar e-mail.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    setPhoneSuccess('');
    if (!recoveryPhone.trim()) {
      setPhoneError('Informe o telefone de recuperação.');
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await updateRecoveryPhone(recoveryPhone.trim());
      setRecoveryPhone(res.recoveryPhone);
      setPhoneSuccess(res.message || 'Telefone de recuperação salvo com sucesso.');
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Erro ao salvar telefone.');
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-1">
        <h3 className="text-white font-black uppercase tracking-wide text-sm flex items-center gap-2">
          <Shield size={16} className="text-amber-500" /> Segurança
        </h3>
        <p className="text-zinc-500 text-xs">
          Alterar senha e contatos de recuperação. O login atual continua o mesmo.
          {loginEmail ? ` Conta: ${loginEmail}` : ''}
        </p>
      </div>

      <form onSubmit={handlePassword} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4" noValidate>
        <h4 className="text-amber-500 font-bold text-sm uppercase tracking-wide flex items-center gap-2">
          <Lock size={16} /> Alterar Senha
        </h4>
        {[
          {
            id: 'sec-current',
            label: 'Senha Atual',
            value: currentPassword,
            set: setCurrentPassword,
            show: showCurrent,
            setShow: setShowCurrent,
            auto: 'current-password',
          },
          {
            id: 'sec-new',
            label: 'Nova Senha',
            value: newPassword,
            set: setNewPassword,
            show: showNew,
            setShow: setShowNew,
            auto: 'new-password',
          },
          {
            id: 'sec-confirm',
            label: 'Confirmar Senha',
            value: confirmPassword,
            set: setConfirmPassword,
            show: showConfirm,
            setShow: setShowConfirm,
            auto: 'new-password',
          },
        ].map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase font-bold" htmlFor={f.id}>
              {f.label}
            </Label>
            <div className="relative">
              <Input
                id={f.id}
                type={f.show ? 'text' : 'password'}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                autoComplete={f.auto}
                className="bg-zinc-950 border-zinc-800 text-white h-11 pr-12 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => f.setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {f.show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        ))}
        {pwdError ? (
          <p className="text-red-400 text-sm flex items-center gap-2">
            <X size={16} /> {pwdError}
          </p>
        ) : null}
        {pwdSuccess ? (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <Check size={16} /> {pwdSuccess}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={pwdLoading}
          className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
        >
          {pwdLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
          Salvar Nova Senha
        </Button>
      </form>

      <form onSubmit={handleEmail} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4" noValidate>
        <h4 className="text-amber-500 font-bold text-sm uppercase tracking-wide flex items-center gap-2">
          <Mail size={16} /> E-mail de Recuperação
        </h4>
        <p className="text-zinc-500 text-xs">
          No futuro, o link de recuperação será enviado para este e-mail.
        </p>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Novo e-mail</Label>
          <Input
            type="email"
            value={recoveryEmail}
            onChange={(e) => setRecoveryEmail(e.target.value)}
            disabled={contactsLoading}
            placeholder="recuperacao@email.com"
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        {emailError ? (
          <p className="text-red-400 text-sm flex items-center gap-2">
            <X size={16} /> {emailError}
          </p>
        ) : null}
        {emailSuccess ? (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <Check size={16} /> {emailSuccess}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={emailLoading}
          className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
        >
          {emailLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
          Salvar
        </Button>
      </form>

      <form onSubmit={handlePhone} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4" noValidate>
        <h4 className="text-amber-500 font-bold text-sm uppercase tracking-wide flex items-center gap-2">
          <Phone size={16} /> Telefone de Recuperação
        </h4>
        <p className="text-zinc-500 text-xs">
          No futuro, um código de recuperação poderá ser enviado para este número.
        </p>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Número do telefone</Label>
          <Input
            value={recoveryPhone}
            onChange={(e) => setRecoveryPhone(e.target.value)}
            disabled={contactsLoading}
            placeholder="71999998888"
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        {phoneError ? (
          <p className="text-red-400 text-sm flex items-center gap-2">
            <X size={16} /> {phoneError}
          </p>
        ) : null}
        {phoneSuccess ? (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <Check size={16} /> {phoneSuccess}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={phoneLoading}
          className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
        >
          {phoneLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
          Salvar
        </Button>
      </form>

      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5 space-y-2">
        <h4 className="text-white font-bold text-sm uppercase">Esqueci minha senha</h4>
        <p className="text-zinc-500 text-xs leading-relaxed">
          Estrutura preparada para envio futuro de link por e-mail ou código por telefone.
          A tela pública já existe em <span className="text-zinc-400">/admin/esqueci-senha</span>.
          O envio ainda não está ativo.
        </p>
      </div>
    </div>
  );
}
