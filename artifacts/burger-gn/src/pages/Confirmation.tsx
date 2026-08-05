import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, Home, ExternalLink, Copy, Check, QrCode, Upload, Loader2, ImageIcon, AlertCircle } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import {
  ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, CARD_TYPE_LABELS,
  PaymentStatus, PixPaymentResult, uploadOrderReceipt, CardType, WorkflowStage,
} from '../lib/api';
import { Button } from '@/components/ui/button';

interface StoredOrder {
  trackingId: string; orderNumber: number;
  customerName: string; phone: string;
  orderType: 'delivery' | 'pickup' | 'local';
  paymentMethod: 'pix' | 'cash' | 'card';
  paymentStatus: PaymentStatus;
  workflow?: WorkflowStage;
  cardType: CardType | null;
  needsChange: boolean;
  changeFor: string | null;
  address: string; numero: string; complemento: string;
  neighborhood: string; reference: string; notes: string;
  distanceKm: number | null;
  customerLat: number | null; customerLng: number | null;
  couponCode: string | null; discountAmount: number;
  items: Array<{ name: string; quantity: number; price: number; addons?: Array<{ name: string; price: number }>; notes?: string; subtotal: number }>;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  pixPayment: PixPaymentResult | null;
  pixConfigured?: boolean;
  pixUnavailableReason?: string | null;
  createdAt: string;
}

function compressImage(file: File, maxWidth = 1200, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas indisponível')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function hasValidPixQr(pix: PixPaymentResult | null | undefined): pix is PixPaymentResult {
  return !!pix?.qrCode && pix.qrCode.trim().length > 20;
}

export default function Confirmation() {
  const { clearCart } = useCart();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOk, setUploadOk] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const didInit = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    try {
      const raw = sessionStorage.getItem('lastOrder');
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredOrder;
      setOrder(stored);
      sessionStorage.removeItem('lastOrder');
    } catch (err) {
      console.error('[BurgerGN] Failed to restore last order:', err);
      try { sessionStorage.removeItem('lastOrder'); } catch { /* ignore */ }
    } finally {
      clearCart();
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyPix = async () => {
    if (!hasValidPixQr(order?.pixPayment)) return;
    try {
      await navigator.clipboard.writeText(order.pixPayment.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const handleCopyKey = async () => {
    const key = order?.pixPayment?.pixKey;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch { /* ignore */ }
  };

  const handleReceipt = async (file: File | null) => {
    if (!file || !order) return;
    setUploadError('');
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      setReceiptPreview(dataUrl);
      await uploadOrderReceipt(order.trackingId, dataUrl);
      setUploadOk(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao enviar comprovante');
    } finally {
      setUploading(false);
    }
  };

  const paymentLabel = order
    ? order.paymentMethod === 'card' && order.cardType
      ? `Cartão (${CARD_TYPE_LABELS[order.cardType]})`
      : PAYMENT_METHOD_LABELS[order.paymentMethod]
    : '';

  const showPixQr = hasValidPixQr(order?.pixPayment);
  const showPixMissing = order?.paymentMethod === 'pix' && !showPixQr;

  return (
    <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center p-6 text-center pb-16">
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative w-28 h-28 flex items-center justify-center mb-6 mt-4">
        <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="w-28 h-28 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
          <CheckCircle2 size={56} className="text-amber-500" />
        </div>
      </motion.div>

      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
        Pedido Enviado!
      </motion.h1>

      {order && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-4 space-y-2">
          <p className="text-amber-500 font-black text-2xl">#{order.orderNumber}</p>
          <span className="inline-block bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider">
            🟡 Pendente de confirmação
          </span>
          <p className="text-zinc-400 text-sm">
            {ORDER_TYPE_LABELS[order.orderType]} · {paymentLabel}
            {order.paymentMethod === 'cash' && order.needsChange && order.changeFor
              ? ` · Troco p/ R$ ${parseFloat(order.changeFor).toFixed(2).replace('.', ',')}`
              : ''}
          </p>
          <p className="text-zinc-500 text-sm">Total: <span className="text-white font-bold">R$ {order.total.toFixed(2).replace('.', ',')}</span></p>
          <p className="text-zinc-600 text-xs max-w-sm mx-auto">
            Seu pedido aguarda a loja aceitar. Mesmo com Pix ou comprovante, ele só avança após confirmação do atendente.
          </p>
        </motion.div>
      )}

      {showPixMissing && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="w-full max-w-sm bg-orange-950/30 border border-orange-800/50 rounded-2xl p-5 mb-4 text-left space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="text-orange-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-orange-300 font-black uppercase tracking-wide text-sm">Pix indisponível</h3>
              <p className="text-orange-200/90 text-sm mt-1">
                {order?.pixUnavailableReason
                  || 'A chave Pix da loja precisa ser cadastrada. Não foi gerado QR Code para evitar pagamento inválido.'}
              </p>
              <p className="text-zinc-500 text-xs mt-2">
                Seu pedido continua pendente. A loja será avisada e poderá orientar outra forma de pagamento.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {showPixQr && order?.pixPayment && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 text-left space-y-4">
          <div className="flex items-center gap-2 justify-center">
            <QrCode size={18} className="text-amber-500" />
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Pague com Pix</h3>
          </div>

          <div className="flex justify-center">
            {order.pixPayment.qrCodeBase64 ? (
              <img
                src={`data:image/png;base64,${order.pixPayment.qrCodeBase64}`}
                alt="QR Code Pix"
                className="w-52 h-52 rounded-xl bg-white p-2"
              />
            ) : (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(order.pixPayment.qrCode)}`}
                alt="QR Code Pix"
                className="w-52 h-52 rounded-xl bg-white p-2"
              />
            )}
          </div>

          {order.pixPayment.pixKey && (
            <div className="space-y-1.5">
              <p className="text-zinc-500 text-xs">Chave Pix</p>
              <div className="flex gap-2">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono truncate">
                  {order.pixPayment.pixKey}
                </div>
                <button type="button" onClick={handleCopyKey}
                  className={`shrink-0 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${copiedKey ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-zinc-500 text-xs">Pix Copia e Cola</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400 text-xs font-mono truncate">
                {order.pixPayment.qrCode}
              </div>
              <button type="button" onClick={handleCopyPix}
                className={`shrink-0 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${copied ? 'bg-green-500/20 text-green-400' : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'}`}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <p className="text-zinc-300 text-sm font-bold flex items-center gap-2">
              <Upload size={16} className="text-amber-500" /> Enviar comprovante
            </p>
            <p className="text-zinc-600 text-xs">
              Enviar o comprovante não aprova o pedido. Ele permanece pendente até a loja confirmar.
            </p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleReceipt(e.target.files?.[0] ?? null)} />
            <button type="button" disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full h-12 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 text-zinc-300 text-sm font-bold hover:border-amber-500/50 hover:text-amber-500 transition-colors flex items-center justify-center gap-2">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              {uploadOk ? 'Trocar comprovante' : 'Selecionar imagem'}
            </button>
            {(receiptPreview || uploadOk) && (
              <div className="rounded-xl overflow-hidden border border-zinc-800">
                <img src={receiptPreview || undefined} alt="Comprovante" className="w-full max-h-48 object-contain bg-zinc-950" />
              </div>
            )}
            {uploadOk && (
              <p className="text-green-400 text-xs flex items-center gap-1.5 justify-center">
                <CheckCircle2 size={14} /> Comprovante enviado — aguardando confirmação da loja
              </p>
            )}
            {uploadError && <p className="text-red-400 text-xs text-center">{uploadError}</p>}
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="w-full max-w-sm space-y-3 mt-2">
        {order && (
          <Link href={`/pedido/${order.trackingId}`} className="block w-full">
            <Button size="lg"
              className="w-full min-h-[56px] font-bold tracking-wider rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 flex items-center justify-center gap-2">
              <ExternalLink size={18} /> ACOMPANHAR PEDIDO
            </Button>
          </Link>
        )}
        <Link href="/" className="block w-full">
          <Button variant="ghost" size="lg"
            className="w-full min-h-[52px] font-bold tracking-wider rounded-2xl text-zinc-500 hover:text-white flex items-center justify-center gap-2">
            <Home size={18} /> Voltar ao início
          </Button>
        </Link>
      </motion.div>
    </PageTransition>
  );
}
