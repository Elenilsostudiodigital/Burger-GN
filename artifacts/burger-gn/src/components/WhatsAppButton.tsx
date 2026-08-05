import React from 'react';
import { MessageCircle } from 'lucide-react';
import { WHATSAPP_NUMBER } from '../data/menu';
import { WHATSAPP_EXTERNAL_ENABLED } from '../lib/api';

/**
 * Floating WhatsApp CTA.
 * TEMP: hidden while WHATSAPP_EXTERNAL_ENABLED is false (dev/test — in-app only).
 * Structure kept for future official WhatsApp Business API.
 */
export function WhatsAppButton() {
  if (!WHATSAPP_EXTERNAL_ENABLED) return null;

  const handleClick = () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Olá! Gostaria de tirar uma dúvida sobre o cardápio.")}`;
    window.open(url, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-24 right-4 z-40 bg-[#25D366] text-white p-4 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle size={28} />
    </button>
  );
}
