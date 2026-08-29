import { useEffect, useRef, useState } from "react";
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
import { refreshStoreStatus, subscribeStoreStatus } from "../lib/storeStatusCache";
import { useSmartPoll } from "../lib/useSmartPoll";
import { isSystemSleeping } from "../lib/systemModeClient";

const HEARTBEAT_MS = 45_000;

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
 * Mounted inside the storefront router; no-ops on admin routes, hidden tabs,
 * and when the store is closed.
 */
export function MenuPresenceTracker() {
  const [location] = useLocation();
  const { totalItems } = useCart();
  const sessionIdRef = useRef(getOrCreatePresenceSessionId());
  const [storeOpen, setStoreOpen] = useState(true);
  const onStorefront = isStorefrontPresencePath(location);

  useEffect(() => subscribeStoreStatus((status) => {
    if (status) setStoreOpen(status.isOpen !== false);
  }), []);

  useEffect(() => {
    if (onStorefront) void refreshStoreStatus(false);
  }, [onStorefront]);

  const send = (keepalive = false) => {
    if (!onStorefront || !storeOpen || isSystemSleeping()) return;
    const sessionId = sessionIdRef.current;
    const { name, phone } = resolveIdentity();
    const status = resolvePresenceStatus(location, totalItems);
    void postPresence(
      "/presence/heartbeat",
      { sessionId, status, name, phone, cartItems: totalItems },
      keepalive,
    );
  };

  useSmartPoll(() => send(), {
    intervalMs: HEARTBEAT_MS,
    enabled: onStorefront && storeOpen,
  });

  useEffect(() => {
    if (onStorefront && storeOpen) send();
  }, [onStorefront, storeOpen, location, totalItems]);

  useEffect(() => {
    if (!onStorefront) return;
    const sessionId = sessionIdRef.current;
    const onIdentity = () => send();
    const onLeave = () => {
      void postPresence("/presence/leave", { sessionId }, true);
    };
    window.addEventListener("bgn:presence-identity", onIdentity);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("bgn:presence-identity", onIdentity);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [onStorefront, storeOpen, location, totalItems]);

  return null;
}
