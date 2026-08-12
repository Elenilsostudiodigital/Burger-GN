import React, { useEffect, useRef, useState } from "react";
import {
  DayHours,
  StoreSettingsAdmin,
  getAdminStoreSettings,
  setAdminStoreOpenStatus,
  updateAdminStoreSettings,
} from "../../lib/api";
import {
  Check, X, Loader2, Store, ToggleLeft, ToggleRight, Upload, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  0: "Domingo",
};

function compressImage(file: File, maxWidth: number, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const mime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
        resolve(canvas.toDataURL(mime, quality));
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function defaultHours(): DayHours[] {
  return WEEKDAY_ORDER.map((day) => ({
    day,
    enabled: day !== 0,
    open: "08:00",
    close: "22:30",
  }));
}

export function EstablishmentTab({ onSaved }: { onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<StoreSettingsAdmin | null>(null);

  const [hours, setHours] = useState<DayHours[]>(defaultHours());
  const [useAuto, setUseAuto] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [storeName, setStoreName] = useState("The Burger GN");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [zipCode, setZipCode] = useState("");

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const applySettings = (s: StoreSettingsAdmin) => {
    setSettings(s);
    setHours(s.openingHours?.length ? s.openingHours : defaultHours());
    setUseAuto(s.useAutomaticSchedule);
    setLogoUrl(s.logoUrl || "");
    setBannerUrl(s.bannerUrl || "");
    setStoreName(s.storeName || "The Burger GN");
    setDescription(s.description || "");
    setPhone(s.phone || "");
    setWhatsapp(s.whatsapp || "");
    setInstagram(s.instagram || "");
    setEmail(s.email || "");
    setAddress(s.address || "");
    setCity(s.city || "");
    setStateUf(s.state || "");
    setZipCode(s.zipCode || "");
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        applySettings(await getAdminStoreSettings());
      } catch {
        setError("Não foi possível carregar o estabelecimento");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateDay = (day: number, patch: Partial<DayHours>) => {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  };

  const handleImage = async (file: File | undefined, kind: "logo" | "banner") => {
    if (!file) return;
    const ok = /image\/(png|jpeg|jpg|webp)/i.test(file.type);
    if (!ok) {
      setError("Use PNG, JPG ou WEBP");
      return;
    }
    setError("");
    try {
      const dataUrl = await compressImage(file, kind === "logo" ? 512 : 1400, kind === "logo" ? 0.85 : 0.78);
      if (kind === "logo") setLogoUrl(dataUrl);
      else setBannerUrl(dataUrl);
    } catch {
      setError("Falha ao processar imagem");
    }
  };

  const handleStatus = async (open: boolean) => {
    setStatusBusy(true);
    setError("");
    try {
      const updated = await setAdminStoreOpenStatus(open);
      applySettings(updated);
      setSuccess(open ? "Estabelecimento aberto" : "Estabelecimento fechado");
      setTimeout(() => setSuccess(""), 2500);
      onSaved?.();
    } catch {
      setError("Erro ao atualizar status");
    } finally {
      setStatusBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const updated = await updateAdminStoreSettings({
        openingHours: hours,
        useAutomaticSchedule: useAuto,
        logoUrl,
        bannerUrl,
        storeName,
        description,
        phone,
        whatsapp,
        instagram,
        email,
        address,
        city,
        state: stateUf,
        zipCode,
      });
      applySettings(updated);
      setSuccess("Configurações do estabelecimento salvas!");
      setTimeout(() => setSuccess(""), 3000);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
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

  const effectiveOpen = settings?.isOpen ?? false;

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className={`rounded-2xl border p-5 space-y-4 ${
        effectiveOpen ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide">Status do estabelecimento</p>
            <p className={`text-lg font-black uppercase mt-1 ${effectiveOpen ? "text-emerald-400" : "text-red-400"}`}>
              {effectiveOpen ? "● Aberto" : "● Fechado"}
            </p>
            <p className="text-zinc-500 text-xs mt-1">{settings?.statusMessage}</p>
          </div>
          <Store size={22} className={effectiveOpen ? "text-emerald-400" : "text-red-400"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            disabled={statusBusy}
            onClick={() => handleStatus(true)}
            className="h-11 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            🟢 Abrir estabelecimento
          </Button>
          <Button
            type="button"
            disabled={statusBusy}
            onClick={() => handleStatus(false)}
            className="h-11 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white"
          >
            🔴 Fechar estabelecimento
          </Button>
        </div>
        <p className="text-zinc-600 text-[11px] leading-relaxed">
          O fechamento manual tem prioridade sobre o horário automático e bloqueia novos pedidos imediatamente.
        </p>
      </div>

      {/* Auto schedule switch */}
      <div className={`rounded-2xl p-5 border transition-all ${
        useAuto ? "bg-amber-500/10 border-amber-500/30" : "bg-zinc-900 border-zinc-800"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Funcionamento automático</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              {useAuto
                ? "Abre/fecha conforme a tabela de horários (com prioridade do controle manual)."
                : "Usa apenas o controle manual Abrir/Fechar."}
            </p>
          </div>
          <button type="button" onClick={() => setUseAuto(!useAuto)}
            className={`transition-colors ${useAuto ? "text-amber-500" : "text-zinc-600"}`}>
            {useAuto ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
          </button>
        </div>
      </div>

      {/* Hours table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <div>
          <h3 className="text-white font-black uppercase tracking-wide text-sm">Funcionamento da loja</h3>
          <p className="text-zinc-500 text-xs mt-1">Defina os dias e horários de expediente.</p>
        </div>
        <div className="space-y-2">
          {WEEKDAY_ORDER.map((day) => {
            const row = hours.find((h) => h.day === day) ?? { day, enabled: false, open: "08:00", close: "22:30" };
            return (
              <div key={day} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-sm font-bold">{WEEKDAY_LABELS[day]}</p>
                  <button
                    type="button"
                    onClick={() => updateDay(day, { enabled: !row.enabled })}
                    className={`text-xs font-bold uppercase px-2.5 py-1 rounded-lg border ${
                      row.enabled
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-zinc-900 text-zinc-500 border-zinc-700"
                    }`}
                  >
                    {row.enabled ? "☑ Funciona" : "☐ Fechado"}
                  </button>
                </div>
                {row.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={row.open}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                      className="bg-zinc-900 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
                    />
                    <span className="text-zinc-500 text-xs shrink-0">→</span>
                    <Input
                      type="time"
                      value={row.close}
                      onChange={(e) => updateDay(day, { close: e.target.value })}
                      className="bg-zinc-900 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Logo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-black uppercase tracking-wide text-sm">Logo da loja</h3>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-full object-cover border-2 border-amber-500" />
          ) : (
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600">
              <ImageIcon size={22} />
            </div>
          )}
          <div className="space-y-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void handleImage(e.target.files?.[0], "logo")}
            />
            <Button type="button" variant="outline"
              onClick={() => logoInputRef.current?.click()}
              className="h-10 rounded-xl border-zinc-700 font-bold gap-2">
              <Upload size={15} /> Alterar Logo
            </Button>
            <p className="text-zinc-600 text-[11px]">PNG, JPG ou WEBP</p>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-black uppercase tracking-wide text-sm">Banner da loja</h3>
        <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-[16/7]">
          {bannerUrl ? (
            <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
              Sem banner — pré-visualização
            </div>
          )}
        </div>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => void handleImage(e.target.files?.[0], "banner")}
        />
        <Button type="button" variant="outline"
          onClick={() => bannerInputRef.current?.click()}
          className="w-full h-11 rounded-xl border-zinc-700 font-bold gap-2">
          <Upload size={15} /> Enviar banner principal
        </Button>
      </div>

      {/* Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-black uppercase tracking-wide text-sm">Informações da loja</h3>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Nome da Loja</Label>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Descrição</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-zinc-950 border border-zinc-800 text-white text-sm p-3 focus:border-amber-500 focus:outline-none resize-y"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5571999998888"
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500 font-mono" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Instagram</Label>
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)}
              placeholder="@theburgergn"
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Endereço</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5 col-span-1">
            <Label className="text-zinc-500 text-xs">Cidade</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Estado</Label>
            <Input value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="BA"
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">CEP</Label>
            <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
        </div>
      </div>

      {success && <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> {success}</p>}
      {error && <p className="text-red-400 text-sm px-1 flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar Estabelecimento
      </Button>
    </div>
  );
}
