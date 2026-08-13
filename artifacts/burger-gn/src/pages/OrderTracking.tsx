import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  trackOrder, getPaymentSettings, submitOrderReview, uploadOrderReceipt, getPublicClubeMe, Order,
  PublicClubeMeResponse,
  ORDER_TYPE_LABELS, PAYMENT_STATUS_LABELS, WORKFLOW_LABELS,
  formatPaymentMethod,
  isAllowedReceiptFile, RECEIPT_ACCEPT, customerInAppStatusMessage,
  requestDeliveryAnalysis,
} from '../lib/api';
import {
  getMyOrder, clearMyOrder, saveMyOrder, archiveMyOrder,
  markDeliveredPromptStarted, DELIVERY_CONFIRM_TIMEOUT_MS,
} from '../lib/myOrder';
import { notifyOrderStatusChange } from '../lib/pushNotifications';
import { buildPostDeliverySurveyMessage, sendPostDeliverySurveyWhenReady } from '../lib/whatsappFuture';
import { ArrowLeft, Clock, Home, AlertCircle, Timer, Star, Loader2, Camera, ImageIcon, Upload, Copy, Check, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '../components/PageTransition';
import { BottomNav } from '../components/BottomNav';
import { ClubeCelebration } from '../components/ClubeCelebration';
import { formatCountdown, computePrepRemainingSeconds } from '../lib/prepTimer';
import {
  detectCelebrationKind,
  fmtCashback,
  hasCelebratedOrder,
  markOrderCelebrated,
  saveClubePhone,
  saveClubeSessionFromMe,
  type ClubeCelebrationKind,
} from '../lib/clubeCliente';

type TimelineKey = 'received' | 'accepted' | 'preparing' | 'ready' | 'out' | 'done';
type DeliveryPhase = 'confirm' | 'rate' | 'celebrate' | 'thanks' | null;

const TIMELINE: Array<{ key: TimelineKey; label: string; emoji: string }> = [
  { key: 'received', label: 'Pedido Recebido', emoji: '🟡' },
  { key: 'accepted', label: 'Pedido Aceito', emoji: '🟠' },
  { key: 'preparing', label: 'Em Preparo', emoji: '👨‍🍳' },
  { key: 'ready', label: 'Pedido Pronto', emoji: '🍔' },
  { key: 'out', label: 'Saiu para Entrega', emoji: '🛵' },
  { key: 'done', label: 'Pedido Entregue', emoji: '✅' },
];

function resolveTimelineIndex(order: Order): number {
  if (order.status === 'cancelled') return -1;
  const wf = order.workflow === 'accepted' ? 'preparing' : order.workflow;
  if (wf === 'done' || order.status === 'done') return 5;
  if (wf === 'out' || order.status === 'delivery') return 4;
  if (wf === 'ready') return 3;
  if (wf === 'preparing') return 2;
  // awaiting_payment / new stay on "Pedido Recebido"
  return 0;
}

function fmt(val: string) {
  return `R$ ${parseFloat(val).toFixed(2).replace('.', ',')}`;
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

function OrderTimelineView({ trackingId }: { trackingId: string }) {
  const [, setLocation] = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState(false);
  const [prepMin, setPrepMin] = useState(35);
  const [prepMax, setPrepMax] = useState(45);
  const [prepTick, setPrepTick] = useState(() => Date.now());
  const lastWorkflow = useRef<string | null>(null);

  const [deliveryPhase, setDeliveryPhase] = useState<DeliveryPhase>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const closedRef = useRef(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptOk, setReceiptOk] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [statusToast, setStatusToast] = useState<{ title: string; body: string } | null>(null);
  const [celebrationKind, setCelebrationKind] = useState<ClubeCelebrationKind>('returning');
  const [celebrationCashback, setCelebrationCashback] = useState<string | undefined>();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const lastPaymentKey = useRef<string | null>(null);
  const lastAnalysisKey = useRef<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisNote, setAnalysisNote] = useState('');
  const [analysisSending, setAnalysisSending] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    getPaymentSettings()
      .then(s => {
        if (s.prepTimeMin) setPrepMin(s.prepTimeMin);
        if (s.prepTimeMax) setPrepMax(s.prepTimeMax);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!order?.prepStartedAt || order.prepFinishedAt || resolveTimelineIndex(order) !== 2) return;
    const id = window.setInterval(() => setPrepTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [order?.prepStartedAt, order?.prepFinishedAt, order?.workflow, order?.status]);

  const closeAndArchive = (reason: 'reviewed' | 'declined' | 'timeout', dest = '/cardapio') => {
    if (closedRef.current) return;
    closedRef.current = true;
    archiveMyOrder(reason);
    setDeliveryPhase(null);
    setLocation(dest);
  };

  useEffect(() => {
    let alive = true;
    const fetchOrder = async () => {
      try {
        const data = await trackOrder(trackingId);
        if (!alive || closedRef.current) return;
        setOrder(data);
        setError(false);
        if (data.phone) saveClubePhone(data.phone);
        saveMyOrder({
          trackingId: data.trackingId,
          orderNumber: data.orderNumber,
          createdAt: data.createdAt,
        });

        const wf = data.status === 'cancelled' ? 'cancelled' : (data.workflow || data.status);
        const payKey = `${data.paymentStatus}:${data.receiptRejectReason || ''}:${data.receiptUploadedAt || ''}`;
        const statusChanged = lastWorkflow.current && lastWorkflow.current !== wf;
        const paymentChanged = lastPaymentKey.current && lastPaymentKey.current !== payKey;

        if (statusChanged || paymentChanged) {
          const msg = customerInAppStatusMessage(String(wf), {
            paymentStatus: data.paymentStatus,
            rejectReason: data.rejectReason,
            receiptRejectReason: data.receiptRejectReason,
          });
          setStatusToast(msg);
          notifyOrderStatusChange({
            trackingId: data.trackingId,
            workflow: String(wf),
            title: `Pedido #${data.orderNumber} — ${msg.title}`,
            body: msg.body,
          });
          window.setTimeout(() => setStatusToast(null), 6000);
        }
        lastWorkflow.current = String(wf);
        lastPaymentKey.current = payKey;

        const analysisKey = data.deliveryAnalysis
          ? `${data.deliveryAnalysis.id}:${data.deliveryAnalysis.status}`
          : '';
        if (lastAnalysisKey.current && lastAnalysisKey.current !== analysisKey && data.deliveryAnalysis) {
          const st = data.deliveryAnalysis.status;
          if (st === 'approved') {
            setStatusToast({ title: 'Análise aprovada', body: 'Sua solicitação de análise da entrega foi aprovada pela equipe.' });
          } else if (st === 'rejected') {
            setStatusToast({
              title: 'Análise recusada',
              body: data.deliveryAnalysis.rejectReason
                ? `Motivo: ${data.deliveryAnalysis.rejectReason}`
                : 'A equipe recusou a análise da entrega.',
            });
          }
          window.setTimeout(() => setStatusToast(null), 8000);
        }
        lastAnalysisKey.current = analysisKey;

        if (data.status === 'done') {
          // Survey copy stays in-app (avaliação). External WhatsApp queue gated off.
          void sendPostDeliverySurveyWhenReady({
            phone: data.phone,
            orderNumber: data.orderNumber,
            customerName: data.customerName,
            trackingId: data.trackingId,
            message: buildPostDeliverySurveyMessage(data.orderNumber, data.customerName),
          });

          if (data.review) {
            // Already reviewed — end Meu Pedido cycle.
            closeAndArchive('reviewed');
            return;
          }

          const promptAt = markDeliveredPromptStarted(data.trackingId)
            || data.deliveredAt
            || new Date().toISOString();
          const elapsed = Date.now() - new Date(promptAt).getTime();
          if (elapsed >= DELIVERY_CONFIRM_TIMEOUT_MS) {
            closeAndArchive('timeout');
            return;
          }

          setDeliveryPhase(prev => prev ?? 'confirm');
        }
      } catch {
        if (alive) setError(true);
      }
    };
    fetchOrder();
    const interval = setInterval(fetchOrder, 8000);
    return () => { alive = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingId]);

  // 60s auto-close while confirmation/rating is open (not during celebration)
  useEffect(() => {
    if (deliveryPhase !== 'confirm' && deliveryPhase !== 'rate') return;
    const ref = getMyOrder();
    const started = ref?.deliveredPromptAt ? new Date(ref.deliveredPromptAt).getTime() : Date.now();

    const tick = () => {
      const left = Math.max(0, DELIVERY_CONFIRM_TIMEOUT_MS - (Date.now() - started));
      setSecondsLeft(Math.ceil(left / 1000));
      if (left <= 0) closeAndArchive('timeout');
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryPhase]);

  const finishWithCelebration = async (
    orderData: Order,
    clubeSnapshot?: PublicClubeMeResponse | null,
  ) => {
    if (hasCelebratedOrder(orderData.id)) {
      setDeliveryPhase('thanks');
      setTimeout(() => closeAndArchive('reviewed'), 1800);
      return;
    }
    try {
      if (orderData.phone) saveClubePhone(orderData.phone);

      let me = clubeSnapshot ?? null;
      if (!me?.found) {
        me = await getPublicClubeMe(orderData.phone);
      }

      if (me?.found) {
        saveClubeSessionFromMe(me);
        const kind = detectCelebrationKind(me, {
          orderId: orderData.id,
          stampSkipped: !!orderData.stampSkipped,
          rewardGranted: !!orderData.fidelityRewardGranted,
        });
        setCelebrationKind(kind);
        const cashEntry = (me.ledger ?? []).find(
          (e) => e.orderId === orderData.id && e.type === 'cashback_pedido' && e.cashbackDelta,
        );
        setCelebrationCashback(
          cashEntry?.cashbackDelta != null
            ? fmtCashback(cashEntry.cashbackDelta)
            : orderData.cashbackAmountAwarded != null
              ? fmtCashback(orderData.cashbackAmountAwarded)
              : fmtCashback(me.member?.cashbackBalance ?? 0),
        );
        markOrderCelebrated(orderData.id);
        setDeliveryPhase('celebrate');
        return;
      }
    } catch { /* fall through */ }
    // Still keep WhatsApp session from the order so Home/Clube don't ask again.
    if (orderData.phone) saveClubePhone(orderData.phone);
    setDeliveryPhase('thanks');
    setTimeout(() => closeAndArchive('reviewed'), 1800);
  };

  const handleDeliveredOk = (ok: boolean) => {
    if (!ok) {
      setSubmittingReview(true);
      submitOrderReview(trackingId, { deliveredOk: false, stars: 0, comment: '' })
        .then(async (res) => {
          if (order?.phone) saveClubePhone(order.phone);
          if (res.clube?.found) saveClubeSessionFromMe(res.clube);
          else if (order?.phone) {
            try {
              const me = await getPublicClubeMe(order.phone);
              if (me.found) saveClubeSessionFromMe(me);
            } catch { /* ignore */ }
          }
        })
        .catch(() => {})
        .finally(() => {
          setSubmittingReview(false);
          closeAndArchive('declined');
        });
      return;
    }
    setDeliveryPhase('rate');
  };

  const handleSubmitReview = async () => {
    if (stars < 1) { setReviewError('Escolha de 1 a 5 estrelas.'); return; }
    setSubmittingReview(true);
    setReviewError('');
    try {
      const res = await submitOrderReview(trackingId, {
        deliveredOk: true,
        stars,
        comment,
      });
      if (order) await finishWithCelebration(order, res.clube);
      else {
        setDeliveryPhase('thanks');
        setTimeout(() => closeAndArchive('reviewed'), 1800);
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Erro ao enviar avaliação');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (error) {
    return (
      <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-zinc-400 mb-4">Pedido não encontrado.</p>
        <Button onClick={() => { clearMyOrder(); setLocation('/cardapio'); }}>Voltar ao cardápio</Button>
        <BottomNav />
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  const cancelled = order.status === 'cancelled';
  const current = resolveTimelineIndex(order);
  const acceptedOrFurther = current >= 2 && current < 5;
  const delivered = order.status === 'done';
  const inKitchen = current === 2; // Em preparo
  const displayPrepMin = order.prepTimeMin ?? prepMin;
  const displayPrepMax = order.prepTimeMax ?? prepMax;
  const customerRemaining = computePrepRemainingSeconds({
    prepStartedAt: order.prepStartedAt,
    prepFinishedAt: order.prepFinishedAt,
    prepTimeMax: displayPrepMax,
    now: prepTick,
  });
  const pixNeedsReceipt = order.paymentMethod === 'pix'
    && order.pixMode !== 'online'
    && order.paymentStatus !== 'paid'
    && order.status !== 'cancelled';
  const paymentConfirmed = order.paymentMethod === 'pix'
    && order.paymentStatus === 'paid'
    && (order.workflow === 'new' || !order.workflow);

  const pickReceipt = async (file: File | null) => {
    if (!file) return;
    if (!isAllowedReceiptFile(file)) {
      setReceiptError('Envie uma imagem PNG, JPG, JPEG ou WEBP.');
      return;
    }
    setReceiptError('');
    try {
      setReceiptPreview(await compressImage(file));
    } catch {
      setReceiptError('Não foi possível ler a imagem.');
    }
  };

  const sendReceipt = async () => {
    if (!receiptPreview) return;
    setUploadingReceipt(true);
    setReceiptError('');
    try {
      const updated = await uploadOrderReceipt(trackingId, receiptPreview);
      setOrder(updated);
      setReceiptOk(true);
      setReceiptPreview(null);
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Erro ao enviar comprovante');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const sendDeliveryAnalysis = async () => {
    setAnalysisSending(true);
    setAnalysisError('');
    try {
      const res = await requestDeliveryAnalysis(trackingId, analysisNote);
      setOrder(prev => prev ? { ...prev, deliveryAnalysis: res.deliveryAnalysis } : prev);
      lastAnalysisKey.current = `${res.deliveryAnalysis.id}:${res.deliveryAnalysis.status}`;
      setAnalysisModalOpen(false);
      setAnalysisNote('');
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setAnalysisSending(false);
    }
  };

  const statusHeadline = (() => {
    if (cancelled) return null;
    if (order.paymentMethod === 'pix' && order.paymentStatus === 'paid' && order.workflow === 'new') {
      return { emoji: '🎉', title: 'Pagamento confirmado', sub: 'Seu pedido foi enviado para análise da loja.' };
    }
    if (order.workflow === 'awaiting_payment' || (order.paymentMethod === 'pix' && order.pixMode !== 'online' && order.receiptDataUrl && order.paymentStatus !== 'paid')) {
      return {
        emoji: '🟡',
        title: order.pixMode === 'online' ? 'Aguardando pagamento Pix' : WORKFLOW_LABELS.awaiting_payment,
        sub: order.pixMode === 'online'
          ? 'Pague via PIX do Mercado Pago. A aprovação é automática.'
          : order.receiptRejectReason
            ? `Comprovante recusado: ${order.receiptRejectReason}`
            : 'Seu pagamento será analisado por nossa equipe.',
      };
    }
    return {
      emoji: TIMELINE[Math.max(0, current)]?.emoji,
      title: TIMELINE[Math.max(0, current)]?.label,
      sub: null as string | null,
    };
  })();

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button type="button" onClick={() => setLocation('/cardapio')}
            className="p-2 -ml-1 text-zinc-400 hover:text-white rounded-xl">
            <ArrowLeft size={22} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500 font-bold">Meu Pedido</p>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">#{order.orderNumber}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-28 space-y-5">
        <AnimatePresence>
          {statusToast && (
            <motion.div
              key={`${statusToast.title}-${statusToast.body}`}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-left"
            >
              <p className="text-amber-300 font-black text-sm uppercase tracking-wide">🍔 {statusToast.title}</p>
              <p className="text-zinc-200 text-sm mt-1">{statusToast.body}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Post-delivery confirmation / rating */}
        <AnimatePresence mode="wait">
          {delivered && deliveryPhase === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-zinc-950 p-6 text-center space-y-5">
              <p className="text-4xl">🎉</p>
              <div>
                <h2 className="text-white font-black text-xl uppercase tracking-tight">Seu pedido foi entregue.</h2>
                <p className="text-zinc-300 text-sm mt-2">Seu pedido chegou corretamente?</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={submittingReview} onClick={() => handleDeliveredOk(true)}
                  className="h-12 rounded-xl bg-emerald-500 text-zinc-950 font-black uppercase text-sm hover:bg-emerald-400">
                  ✅ SIM
                </button>
                <button type="button" disabled={submittingReview} onClick={() => handleDeliveredOk(false)}
                  className="h-12 rounded-xl bg-zinc-800 text-zinc-200 font-black uppercase text-sm hover:bg-zinc-700 border border-zinc-700">
                  ❌ NÃO
                </button>
              </div>
              {secondsLeft !== null && (
                <p className="text-zinc-500 text-xs">Esta tela fecha em {secondsLeft}s</p>
              )}
            </motion.div>
          )}

          {delivered && deliveryPhase === 'rate' && (
            <motion.div key="rate" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
              <div className="text-center">
                <h2 className="text-white font-black text-lg uppercase">Como foi sua experiência?</h2>
                <p className="text-zinc-500 text-xs mt-1">Pedido #{order.orderNumber}</p>
              </div>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => { setStars(n); setReviewError(''); }}
                    className="p-1 transition-transform active:scale-90" aria-label={`${n} estrelas`}>
                    <Star size={36}
                      className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
                    />
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-zinc-500 text-xs">Comentário (opcional)</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Conte como foi..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none h-24 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-zinc-500 text-[11px] leading-relaxed">
                  Seu comentário não será público. Ele será enviado apenas para os proprietários da loja.
                </p>
              </div>
              {reviewError && <p className="text-red-400 text-sm text-center">{reviewError}</p>}
              <Button type="button" disabled={submittingReview} onClick={handleSubmitReview}
                className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase">
                {submittingReview ? <Loader2 className="animate-spin" size={18} /> : 'Enviar Avaliação'}
              </Button>
              {secondsLeft !== null && (
                <p className="text-zinc-600 text-xs text-center">Fecha automaticamente em {secondsLeft}s</p>
              )}
            </motion.div>
          )}

          {delivered && deliveryPhase === 'celebrate' && (
            <motion.div key="celebrate" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <ClubeCelebration
                kind={celebrationKind}
                cashbackLabel={celebrationCashback}
                stampsRequired={10}
                continueLabel="Ver meu Clube"
                onContinue={() => {
                  closeAndArchive('reviewed', '/clube');
                }}
              />
              <button
                type="button"
                onClick={() => {
                  closeAndArchive('reviewed', '/');
                }}
                className="w-full mt-3 h-10 rounded-xl text-zinc-400 text-xs font-bold uppercase tracking-wider hover:text-white"
              >
                Voltar para o início
              </button>
            </motion.div>
          )}

          {delivered && deliveryPhase === 'thanks' && (
            <motion.div key="thanks" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-8 text-center space-y-2">
              <p className="text-4xl">⭐</p>
              <h2 className="text-emerald-400 font-black text-xl uppercase">Obrigado!</h2>
              <p className="text-zinc-400 text-sm">Sua avaliação foi registrada.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {(!delivered || !deliveryPhase) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 text-center">
            {cancelled ? (
              <>
                <p className="text-4xl mb-2">❌</p>
                <h2 className="text-red-400 font-black text-xl uppercase">Pedido Recusado</h2>
                {order.rejectReason && (
                  <div className="mt-3 flex items-start gap-2 text-left bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2.5">
                    <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-red-200 text-sm"><span className="font-bold">Motivo: </span>{order.rejectReason}</p>
                  </div>
                )}
              </>
            ) : statusHeadline && (
              <>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Status atual</p>
                <h2 className="text-amber-400 font-black text-xl uppercase">
                  {statusHeadline.emoji} {statusHeadline.title}
                </h2>
                {statusHeadline.sub && (
                  <p className="text-zinc-300 text-sm mt-2">{statusHeadline.sub}</p>
                )}
                {paymentConfirmed && (
                  <p className="text-zinc-400 text-xs mt-2">
                    Aguarde enquanto nossa equipe confirma seu pedido.
                  </p>
                )}
                <p className="text-zinc-600 text-xs mt-2 flex items-center justify-center gap-1">
                  <Clock size={12} /> Atualiza automaticamente
                </p>
              </>
            )}
          </motion.div>
        )}

        {!cancelled && order.paymentMethod === 'pix' && order.pixMode === 'online' && order.paymentStatus !== 'paid' && order.pixCopyPaste && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-amber-500/30 bg-zinc-900 p-5 space-y-3">
            <h3 className="text-white font-black uppercase text-xs tracking-wider">PIX Online — Mercado Pago</h3>
            <p className="text-zinc-400 text-xs">Pague via PIX do Mercado Pago. Aprovação automática.</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400 text-xs font-mono truncate">
                {order.pixCopyPaste}
              </div>
              <button type="button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(order.pixCopyPaste || '');
                  setCopiedPix(true);
                  setTimeout(() => setCopiedPix(false), 2500);
                } catch { /* ignore */ }
              }}
                className={`shrink-0 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 ${copiedPix ? 'bg-green-500/20 text-green-400' : 'bg-amber-500 text-zinc-950'}`}>
                {copiedPix ? <Check size={14} /> : <Copy size={14} />} {copiedPix ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </motion.div>
        )}

        {!cancelled && pixNeedsReceipt && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-amber-500/30 bg-zinc-900 p-5 space-y-3">
            <h3 className="text-white font-black uppercase text-xs tracking-wider">
              {order.receiptRejectReason || order.paymentStatus === 'failed'
                ? 'Reenviar comprovante'
                : order.receiptDataUrl
                  ? 'Comprovante enviado'
                  : 'Enviar comprovante Pix'}
            </h3>
            {order.receiptRejectReason && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                Motivo da recusa: {order.receiptRejectReason}
              </div>
            )}
            {order.receiptDataUrl && order.paymentStatus === 'pending' && !order.receiptRejectReason && (
              <p className="text-zinc-400 text-sm">
                ✅ Comprovante enviado. Aguarde a conferência do pagamento.
              </p>
            )}
            {(order.paymentStatus === 'failed' || !order.receiptDataUrl || !!order.receiptRejectReason) && (
              <>
                <input ref={galleryRef} type="file" accept={RECEIPT_ACCEPT} className="hidden"
                  onChange={e => { void pickReceipt(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                <input ref={cameraRef} type="file" accept={RECEIPT_ACCEPT} capture="environment" className="hidden"
                  onChange={e => { void pickReceipt(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => cameraRef.current?.click()}
                    className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-200 text-xs font-bold uppercase flex items-center justify-center gap-2">
                    <Camera size={15} /> Tirar foto
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-200 text-xs font-bold uppercase flex items-center justify-center gap-2">
                    <ImageIcon size={15} /> Galeria
                  </button>
                </div>
                {receiptPreview && (
                  <img src={receiptPreview} alt="Pré-visualização" className="w-full max-h-48 object-contain rounded-xl border border-zinc-800 bg-zinc-950" />
                )}
                {receiptError && <p className="text-red-400 text-xs">{receiptError}</p>}
                {receiptOk && <p className="text-emerald-400 text-xs">✅ Comprovante enviado com sucesso.</p>}
                <button type="button" disabled={!receiptPreview || uploadingReceipt} onClick={sendReceipt}
                  className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase flex items-center justify-center gap-2">
                  {uploadingReceipt ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Enviar comprovante
                </button>
              </>
            )}
          </motion.div>
        )}

        {!cancelled && acceptedOrFurther && !delivered && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
            <p className="text-amber-300 font-bold text-sm">
              {inKitchen ? '🍔 Em preparo' : 'Seu pedido foi aceito e já está sendo preparado.'}
            </p>
            <div className="flex items-center gap-2 text-white font-black text-lg">
              <Timer size={20} className="text-amber-400" />
              Tempo estimado: {displayPrepMin} a {displayPrepMax} minutos.
            </div>
            {inKitchen && order.prepStartedAt && !order.prepFinishedAt && customerRemaining != null && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                  ⏳ Tempo restante aproximado
                </p>
                <p className="text-white font-black text-2xl tabular-nums mt-1">
                  {formatCountdown(Math.max(0, customerRemaining))}
                </p>
                <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed">
                  Seu pedido poderá ficar pronto antes desse prazo.
                </p>
              </div>
            )}
            {!order.prepStartedAt && (
              <p className="text-zinc-400 text-xs leading-relaxed">
                Seu pedido poderá ficar pronto antes desse prazo. O tempo pode variar conforme o movimento da loja.
              </p>
            )}
          </motion.div>
        )}

        {!cancelled && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h3 className="text-white font-black uppercase text-xs tracking-wider mb-5">Linha do tempo</h3>
            <div className="space-y-0">
              {TIMELINE.map((step, idx) => {
                const done = idx < current || (idx === current && current === 5);
                const active = idx === current && current < 5;
                const completed = idx < current || (current >= 2 && idx === 1) || done;
                const isFuture = !completed && !active;

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                        completed ? 'bg-emerald-500 border-emerald-400 text-zinc-950 shadow-[0_0_16px_rgba(16,185,129,0.35)]' :
                        active ? 'bg-amber-500 border-amber-300 text-zinc-950 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.45)]' :
                        'bg-zinc-900 border-zinc-700 text-zinc-600'
                      }`}>
                        <span aria-hidden>{step.emoji}</span>
                      </div>
                      {idx < TIMELINE.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[28px] my-1 ${
                          idx < current ? 'bg-emerald-500' : 'bg-zinc-800'
                        }`} />
                      )}
                    </div>
                    <div className={`pt-2.5 pb-5 ${isFuture ? 'opacity-50' : ''}`}>
                      <p className={`font-black text-sm ${
                        active ? 'text-amber-400' : completed ? 'text-emerald-400' : 'text-zinc-500'
                      }`}>
                        {step.label}
                      </p>
                      {active && <p className="text-amber-500/80 text-xs mt-0.5 font-medium">Etapa atual</p>}
                      {completed && !active && <p className="text-emerald-600 text-xs mt-0.5">Concluído</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {order.orderType === 'delivery' && !cancelled && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3">
            <h3 className="text-white font-black uppercase text-xs tracking-wider">Entrega</h3>
            <p className="text-zinc-300 text-sm flex items-start gap-2">
              <MapPin size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <span>
                {order.address}{order.addressNumber ? `, ${order.addressNumber}` : ''}
                {order.neighborhood ? ` — ${order.neighborhood}` : ''}
              </span>
            </p>
            {parseFloat(order.deliveryFee) > 0 && (
              <p className="text-zinc-500 text-xs">Taxa de entrega: {fmt(order.deliveryFee)}</p>
            )}

            {order.deliveryAnalysis?.status === 'pending' && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                <p className="text-amber-300 font-black text-sm uppercase tracking-wide">Análise solicitada</p>
                <p className="text-zinc-200 text-sm mt-1">Aguardando análise da equipe.</p>
              </div>
            )}
            {order.deliveryAnalysis?.status === 'approved' && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
                <p className="text-emerald-300 font-black text-sm uppercase tracking-wide">Análise aprovada</p>
                <p className="text-zinc-200 text-sm mt-1">Sua solicitação de análise da entrega foi aprovada.</p>
              </div>
            )}
            {order.deliveryAnalysis?.status === 'rejected' && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 space-y-1">
                <p className="text-red-300 font-black text-sm uppercase tracking-wide">Análise recusada</p>
                {order.deliveryAnalysis.rejectReason && (
                  <p className="text-zinc-200 text-sm">{order.deliveryAnalysis.rejectReason}</p>
                )}
              </div>
            )}

            {(!order.deliveryAnalysis || order.deliveryAnalysis.status === 'rejected') && (
              <button
                type="button"
                onClick={() => { setAnalysisError(''); setAnalysisModalOpen(true); }}
                className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm tracking-wide"
              >
                Solicitar análise da entrega
              </button>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3">
          <h3 className="text-white font-black uppercase text-xs tracking-wider">Resumo</h3>
          <div className="space-y-1.5">
            {order.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
                <span className="text-zinc-500">{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-3 flex justify-between font-bold">
            <span className="text-white">Total</span>
            <span className="text-amber-500">{fmt(order.total)}</span>
          </div>
          <div className="text-xs text-zinc-500 space-y-1 pt-1">
            <div className="flex justify-between"><span>Tipo</span><span>{ORDER_TYPE_LABELS[order.orderType]}</span></div>
            <div className="flex justify-between items-center">
              <span>Pagamento</span>
              <span className="flex items-center gap-1.5">
                {formatPaymentMethod(order)}
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                  order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700/40 text-zinc-400'
                }`}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
              </span>
            </div>
          </div>
        </motion.div>

        <Link href="/" className="block">
          <Button variant="ghost" className="w-full text-zinc-500 hover:text-white gap-2">
            <Home size={16} /> Voltar ao início
          </Button>
        </Link>
      </main>

      <AnimatePresence>
        {analysisModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !analysisSending && setAnalysisModalOpen(false)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-white font-black uppercase text-sm">Análise da entrega</h2>
                <button type="button" disabled={analysisSending} onClick={() => setAnalysisModalOpen(false)} className="text-zinc-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                A entrega será analisada pela nossa equipe. Se quiser, informe o motivo ou uma observação para ajudar na análise.
              </p>
              <textarea
                value={analysisNote}
                onChange={e => setAnalysisNote(e.target.value)}
                placeholder="Motivo ou observação (opcional)"
                maxLength={1000}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none h-28 focus:border-amber-500 focus:outline-none"
              />
              {analysisError && <p className="text-red-400 text-sm">{analysisError}</p>}
              <button type="button" disabled={analysisSending} onClick={sendDeliveryAnalysis}
                className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm tracking-wide disabled:opacity-50">
                {analysisSending ? 'Enviando…' : 'Enviar para análise'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </PageTransition>
  );
}

export function MyOrderPage() {
  const [, setLocation] = useLocation();
  const ref = getMyOrder();

  if (!ref?.trackingId) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center pb-28">
          <p className="text-4xl mb-3">🍔</p>
          <h1 className="text-white font-black text-2xl uppercase mb-2">Meu Pedido</h1>
          <p className="text-zinc-500 text-sm max-w-xs mb-6">
            Você ainda não tem um pedido em andamento. Faça um pedido no cardápio para acompanhar aqui.
          </p>
          <Button onClick={() => setLocation('/cardapio')} className="rounded-xl font-bold bg-amber-500 text-zinc-950">
            Ver cardápio
          </Button>
        </div>
        <BottomNav />
      </PageTransition>
    );
  }

  return <OrderTimelineView trackingId={ref.trackingId} />;
}

export default function OrderTracking() {
  const { trackingId } = useParams<{ trackingId: string }>();
  if (!trackingId) return <MyOrderPage />;
  return <OrderTimelineView trackingId={trackingId} />;
}
