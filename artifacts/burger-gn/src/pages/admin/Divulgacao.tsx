import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import QRCode from 'qrcode';
import {
  Share2, Copy, Check, LogOut, Megaphone, MessageCircle, Download, QrCode, Link as LinkIcon,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { Button } from '@/components/ui/button';

function buildMenuUrl(): string {
  if (typeof window === 'undefined') return 'https://burger-gn.vercel.app/cardapio';
  return `${window.location.origin}/cardapio`;
}

function whatsappShareUrl(menuUrl: string): string {
  const text =
    `🍔 Confira nosso cardápio digital!\n` +
    `Faça seu pedido online:\n` +
    menuUrl;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export default function Divulgacao() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [menuUrl, setMenuUrl] = useState(buildMenuUrl);
  const [copied, setCopied] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState('');
  const [shareHint, setShareHint] = useState('');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const waUrl = useMemo(() => whatsappShareUrl(menuUrl), [menuUrl]);

  useEffect(() => {
    setMenuUrl(buildMenuUrl());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setQrReady(false);
      setQrError('');
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        await QRCode.toCanvas(canvas, menuUrl, {
          width: 280,
          margin: 2,
          color: { dark: '#0a0a0a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setQrReady(true);
      } catch (err) {
        if (!cancelled) setQrError(err instanceof Error ? err.message : 'Falha ao gerar QR Code');
      }
    })();
    return () => { cancelled = true; };
  }, [menuUrl]);

  const handleLogout = async () => {
    await logout();
    setLocation('/');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = menuUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const shareNative = async () => {
    setShareHint('');
    if (!canNativeShare) {
      setShareHint('Compartilhamento nativo indisponível neste navegador. Use WhatsApp ou Copiar Link.');
      return;
    }
    try {
      await navigator.share({
        title: 'Cardápio Burger GN',
        text: '🍔 Confira nosso cardápio digital! Faça seu pedido online:',
        url: menuUrl,
      });
    } catch (err) {
      // User cancelled share — not an error
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareHint('Não foi possível abrir o compartilhamento nativo.');
    }
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !qrReady) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'burger-gn-cardapio-qrcode.png';
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Megaphone size={20} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none">Divulgação</h1>
              <p className="text-zinc-600 text-xs truncate">Compartilhe o cardápio digital</p>
            </div>
          </div>
          <button type="button" onClick={() => void handleLogout()} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        {/* Link */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
            <LinkIcon size={16} className="text-amber-500" /> Link do Cardápio
          </h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
            <p className="text-amber-400 text-sm font-mono break-all leading-relaxed">{menuUrl}</p>
          </div>
          <Button
            type="button"
            onClick={() => void copyLink()}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
          >
            {copied ? <Check size={18} className="mr-2" /> : <Copy size={18} className="mr-2" />}
            {copied ? 'Link copiado!' : 'Copiar Link'}
          </Button>
        </section>

        {/* Share */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
          <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
            <Share2 size={16} className="text-amber-500" /> Compartilhar
          </h2>
          <p className="text-zinc-500 text-xs leading-relaxed">
            Mensagem padrão com o link do cardápio para enviar aos clientes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
            >
              <MessageCircle size={18} /> WhatsApp
            </a>
            <Button
              type="button"
              variant="outline"
              onClick={() => void shareNative()}
              className="w-full h-12 border-zinc-700 text-zinc-200 hover:bg-zinc-800 font-bold rounded-xl"
            >
              <Share2 size={18} className="mr-2" />
              {canNativeShare ? 'Compartilhar' : 'Compartilhar (nativo)'}
            </Button>
          </div>
          {shareHint ? <p className="text-zinc-500 text-xs">{shareHint}</p> : null}
        </section>

        {/* QR */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
            <QrCode size={16} className="text-amber-500" /> QR Code
          </h2>
          <p className="text-zinc-500 text-xs leading-relaxed">
            Escaneie para abrir o cardápio digital. Ideal para impressão, balcão e redes sociais.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="rounded-2xl bg-white p-4 shadow-lg shadow-black/30">
              <canvas ref={canvasRef} className="block w-[280px] h-[280px] max-w-full" />
            </div>
            <div className="flex-1 w-full space-y-3">
              {qrError ? <p className="text-red-400 text-sm">{qrError}</p> : null}
              {!qrError && !qrReady ? (
                <p className="text-zinc-500 text-sm">Gerando QR Code…</p>
              ) : null}
              <Button
                type="button"
                disabled={!qrReady}
                onClick={downloadPng}
                className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl disabled:opacity-40"
              >
                <Download size={18} className="mr-2" /> Baixar PNG
              </Button>
              <p className="text-zinc-600 text-[11px] leading-relaxed">
                Arquivo: <span className="font-mono text-zinc-400">burger-gn-cardapio-qrcode.png</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <AdminBottomNav active="/admin/divulgacao" />
    </div>
  );
}
