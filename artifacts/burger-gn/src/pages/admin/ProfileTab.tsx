import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Upload, User, X } from 'lucide-react';
import {
  CompanyProfile,
  getAdminCompanyProfile,
  updateAdminCompanyProfile,
} from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMPTY: CompanyProfile = {
  name: '',
  logoUrl: '',
  photoUrl: '',
  slogan: '',
  description: '',
  address: '',
  phone: '',
  profileWhatsapp: '',
  instagramUrl: '',
  facebookUrl: '',
  websiteUrl: '',
  bannerUrl: '',
  displayOpenDays: '',
  displayHoursText: '',
  menuWelcomeMessage: '',
  primaryColor: '#f59e0b',
  secondaryColor: '#0a0a0a',
};

const MAX_IMAGE_BYTES = 450_000;

async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Imagem muito grande (máx. ~450 KB). Comprima ou use uma URL.');
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function ImageField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState('');

  const onFile = async (file: File | null) => {
    if (!file) return;
    setLocalError('');
    try {
      onChange(await fileToDataUrl(file));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Erro ao carregar imagem');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-zinc-400 text-xs uppercase font-bold">{label}</Label>
      {value ? (
        <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-[16/7] max-h-36">
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}
      <Input
        value={value.startsWith('data:') ? '(imagem carregada do dispositivo)' : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('(imagem')) return;
          onChange(v);
        }}
        placeholder={placeholder || 'URL da imagem ou envie um arquivo'}
        className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500"
      />
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="h-10 rounded-xl border-zinc-700 text-zinc-300"
        >
          <Upload size={16} className="mr-2" /> Enviar arquivo
        </Button>
        {value ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange('')}
            className="h-10 rounded-xl border-zinc-700 text-zinc-400"
          >
            Remover
          </Button>
        ) : null}
      </div>
      {localError ? <p className="text-red-400 text-xs">{localError}</p> : null}
    </div>
  );
}

export function ProfileTab() {
  const [form, setForm] = useState<CompanyProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const profile = await getAdminCompanyProfile();
        setForm({ ...EMPTY, ...profile });
      } catch {
        setError('Não foi possível carregar o perfil.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (!form.name.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    try {
      const res = await updateAdminCompanyProfile(form);
      setForm({ ...EMPTY, ...res.profile });
      setSuccess(res.message || 'Perfil salvo com sucesso.');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-1">
        <h3 className="text-white font-black uppercase tracking-wide text-sm flex items-center gap-2">
          <User size={16} className="text-amber-500" /> Perfil da empresa
        </h3>
        <p className="text-zinc-500 text-xs">
          Essas informações aparecem no cardápio do cliente quando preenchidas.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <ImageField
          label="Foto da empresa"
          value={form.photoUrl}
          onChange={(v) => set('photoUrl', v)}
        />
        <ImageField label="Logo" value={form.logoUrl} onChange={(v) => set('logoUrl', v)} />
        <ImageField
          label="Banner do cardápio"
          value={form.bannerUrl}
          onChange={(v) => set('bannerUrl', v)}
        />

        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Nome da empresa</Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Frase de apresentação</Label>
          <Input
            value={form.slogan}
            onChange={(e) => set('slogan', e.target.value)}
            placeholder="Ex.: Muito mais que um hambúrguer."
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Mensagem de boas-vindas</Label>
          <Input
            value={form.menuWelcomeMessage}
            onChange={(e) => set('menuWelcomeMessage', e.target.value)}
            placeholder="Texto curto no cardápio"
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Descrição da empresa</Label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm p-3 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Endereço</Label>
          <Input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase font-bold">Telefone</Label>
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="71999998888"
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase font-bold">WhatsApp</Label>
            <Input
              value={form.profileWhatsapp}
              onChange={(e) => set('profileWhatsapp', e.target.value)}
              placeholder="5571999998888"
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Instagram</Label>
          <Input
            value={form.instagramUrl}
            onChange={(e) => set('instagramUrl', e.target.value)}
            placeholder="https://instagram.com/..."
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Facebook</Label>
          <Input
            value={form.facebookUrl}
            onChange={(e) => set('facebookUrl', e.target.value)}
            placeholder="https://facebook.com/..."
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">Site (opcional)</Label>
          <Input
            value={form.websiteUrl}
            onChange={(e) => set('websiteUrl', e.target.value)}
            placeholder="https://..."
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">
            Dias de funcionamento (informativo)
          </Label>
          <Input
            value={form.displayOpenDays}
            onChange={(e) => set('displayOpenDays', e.target.value)}
            placeholder="Seg a Dom"
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs uppercase font-bold">
            Horário exibido ao cliente
          </Label>
          <Input
            value={form.displayHoursText}
            onChange={(e) => set('displayHoursText', e.target.value)}
            placeholder="18:00 às 23:30"
            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
          />
        </div>
      </div>

      {success ? (
        <p className="text-green-400 text-sm px-1 flex items-center gap-2">
          <Check size={16} /> {success}
        </p>
      ) : null}
      {error ? (
        <p className="text-red-400 text-sm px-1 flex items-center gap-2">
          <X size={16} /> {error}
        </p>
      ) : null}

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
      >
        {saving ? <Loader2 size={18} className="animate-spin mr-2" /> : <Check size={18} className="mr-2" />}
        Salvar Perfil
      </Button>
    </div>
  );
}
