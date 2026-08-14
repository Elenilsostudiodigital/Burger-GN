import { useEffect, useRef, useState } from "react";
import { Eye, ShoppingCart, CreditCard } from "lucide-react";
import { getAdminPresence, type PresenceSession } from "../lib/api";
import {
  loadNotificationSettings,
  playEventSound,
  resolveSoundGate,
  type NotifEventKey,
} from "../lib/adminNotifications";

const POLL_MS = 5_000;

type SessionSnap = { status: string; cartItems: number };

interface PedidosPresenceBarProps {
  onAlert: (message: string) => void;
}

function firePresenceAlert(
  eventKey: NotifEventKey,
  message: string,
  onAlert: (message: string) => void,
) {
  onAlert(message);
  const settings = loadNotificationSettings();
  if (!settings.masterEnabled) return;
  const cfg = settings.events[eventKey];
  if (!cfg?.enabled) return;
  const gate = resolveSoundGate(settings);
  if (gate === "play") {
    playEventSound(cfg, settings, eventKey);
  }
}

/**
 * Live presence strip for Pedidos board — counters + discreet alerts with optional sound.
 */
export function PedidosPresenceBar({ onAlert }: PedidosPresenceBarProps) {
  const [summary, setSummary] = useState({ online: 0, cart: 0, checkout: 0 });
  const primedRef = useRef(false);
  const prevRef = useRef<Map<string, SessionSnap>>(new Map());
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await getAdminPresence();
        if (cancelled) return;
        setSummary({
          online: data.summary.online,
          cart: data.summary.cart,
          checkout: data.summary.checkout,
        });

        const sessions: PresenceSession[] = data.sessions || [];
        const next = new Map<string, SessionSnap>();
        for (const s of sessions) {
          next.set(s.sessionId, { status: s.status, cartItems: s.cartItems });
        }

        if (!primedRef.current) {
          prevRef.current = next;
          primedRef.current = true;
          return;
        }

        const prev = prevRef.current;
        for (const [id, snap] of next) {
          const was = prev.get(id);
          if (!was) {
            firePresenceAlert(
              "presenceOnline",
              "👀 Novo cliente entrou no cardápio.",
              onAlertRef.current,
            );
          } else {
            const enteredCart =
              (was.status !== "cart" && was.status !== "checkout" && snap.status === "cart")
              || (was.cartItems === 0 && snap.cartItems > 0 && snap.status !== "checkout");
            if (enteredCart) {
              firePresenceAlert(
                "presenceCart",
                "🛒 Um cliente iniciou um pedido.",
                onAlertRef.current,
              );
            }
            if (was.status !== "checkout" && snap.status === "checkout") {
              firePresenceAlert(
                "presenceCheckout",
                "💳 Um cliente está finalizando um pedido.",
                onAlertRef.current,
              );
            }
          }
        }
        prevRef.current = next;
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="admin-shell-wide mt-3">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-2">
        <div className="text-center min-w-0 px-1">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-center gap-1 truncate">
            <Eye size={11} className="text-amber-400 shrink-0" />
            <span className="truncate">Online</span>
          </p>
          <p className="text-lg font-black text-amber-400 leading-none mt-1">{summary.online}</p>
        </div>
        <div className="text-center min-w-0 px-1 border-x border-zinc-800">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-center gap-1 truncate">
            <ShoppingCart size={11} className="text-sky-400 shrink-0" />
            <span className="truncate">Carrinhos</span>
          </p>
          <p className="text-lg font-black text-sky-400 leading-none mt-1">{summary.cart}</p>
        </div>
        <div className="text-center min-w-0 px-1">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-center gap-1 truncate">
            <CreditCard size={11} className="text-emerald-400 shrink-0" />
            <span className="truncate">Checkout</span>
          </p>
          <p className="text-lg font-black text-emerald-400 leading-none mt-1">{summary.checkout}</p>
        </div>
      </div>
      <p className="sr-only">
        Clientes Online: {summary.online}. Carrinhos Ativos: {summary.cart}. Clientes Finalizando Pedido: {summary.checkout}.
      </p>
    </div>
  );
}
