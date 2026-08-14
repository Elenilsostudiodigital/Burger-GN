import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useCart } from "../context/CartContext";
import { getSavedClubePhone, getClubeSessionProfile } from "../lib/clubeCliente";
import {
  getOrCreatePresenceSessionId,
  getPresenceIdentity,
  isStorefrontPresencePath,
  resolvePresenceStatus,
  setPresenceIdentity,
} from "../lib/menuPresence";

const HEARTBEAT_MS = 20_000;

async function postPresence(path: string, body: Record<string, unknown>, keepalive = false) {
  try {
    await fetch(`/api${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
  } catch { /* ignore — presence must never break storefront */ }
}

function resolveIdentity(): { name: string; phone: string } {
  const fromCheckout = getPresenceIdentity();
  let name = fromCheckout.name;
  let phone = fromCheckout.phone;
  if (!phone) {
    const saved = getSavedClubePhone().replace(/\D/g, "");
    if (saved) phone = saved;
  }
  if (!name) {
    const profile = getClubeSessionProfile();
    if (profile?.name?.trim()) name = profile.name.trim();
  }
  if (name || phone) setPresenceIdentity(name, phone);
  return { name, phone };
}

/**
 * Sends lightweight heartbeats while the customer browses the digital menu.
 * Mounted inside the storefront router; no-ops on admin routes.
 */
export function MenuPresenceTracker() {
  const [location] = useLocation();
  const { totalItems } = useCart();
  const sessionIdRef = useRef(getOrCreatePresenceSessionId());

  useEffect(() => {
    if (!isStorefrontPresencePath(location)) return;

    const sessionId = sessionIdRef.current;
    let cancelled = false;

    const send = (keepalive = false) => {
      if (cancelled) return;
      const { name, phone } = resolveIdentity();
      const status = resolvePresenceStatus(location, totalItems);
      void postPresence(
        "/presence/heartbeat",
        { sessionId, status, name, phone, cartItems: totalItems },
        keepalive,
      );
    };

    send();
    const interval = setInterval(() => send(), HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") send();
    };
    const onIdentity = () => send();
    const onLeave = () => {
      void postPresence("/presence/leave", { sessionId }, true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("bgn:presence-identity", onIdentity);
    window.addEventListener("pagehide", onLeave);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("bgn:presence-identity", onIdentity);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [location, totalItems]);

  return null;
}
