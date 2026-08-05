/**
 * Future WhatsApp Business API integration surface.
 * Do NOT call any WhatsApp API from here yet.
 *
 * TEMP: external WhatsApp is fully disabled in the UI via WHATSAPP_EXTERNAL_ENABLED.
 * This queue remains so reactivation only needs the official API + the flag.
 */

import { WHATSAPP_EXTERNAL_ENABLED } from './api';

export interface FutureWhatsappSurveyPayload {
  phone: string;
  orderNumber: number;
  customerName: string;
  message: string;
  trackingId: string;
}

const QUEUE_KEY = 'bgn_wa_future_queue';

/** Build post-delivery experience survey message (same copy server will use later). */
export function buildPostDeliverySurveyMessage(orderNumber: number, customerName: string): string {
  const name = (customerName || 'cliente').trim().split(/\s+/)[0] || 'cliente';
  return (
    `Olá ${name}! Seu pedido #${orderNumber} foi entregue. 🎉\n\n` +
    `Como foi sua experiência com a The Burger GN?\n` +
    `Responda com uma nota de 1 a 5 estrelas e, se quiser, um comentário.`
  );
}

/**
 * Queue a survey for when WhatsApp API is connected.
 * Currently only persists locally — never sends.
 */
export function queueFutureWhatsappSurvey(payload: FutureWhatsappSurveyPayload) {
  try {
    const prev = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as Array<
      FutureWhatsappSurveyPayload & { queuedAt: string; sent: boolean }
    >;
    const next = [
      { ...payload, queuedAt: new Date().toISOString(), sent: false },
      ...prev.filter(p => p.trackingId !== payload.trackingId),
    ].slice(0, 40);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function isWhatsappApiIntegrated(): boolean {
  return false;
}

/** Placeholder for future automatic send after delivery. */
export async function sendPostDeliverySurveyWhenReady(payload: FutureWhatsappSurveyPayload) {
  // TEMP: do not even enqueue while external WhatsApp is disabled for testing.
  if (!WHATSAPP_EXTERNAL_ENABLED) return { queued: false, sent: false };
  queueFutureWhatsappSurvey(payload);
  if (!isWhatsappApiIntegrated()) return { queued: true, sent: false };
  // Future: await whatsappApi.sendText(payload.phone, payload.message);
  return { queued: true, sent: false };
}
