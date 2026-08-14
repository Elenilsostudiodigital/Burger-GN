/**
 * Automatic fidelity (stamps) + cashback when an order reaches "done".
 * Idempotent per order via order meta flags AND client ledger.
 *
 * Fidelity rule: at most 1 stamp per America/Sao_Paulo calendar day (selo_pedido only).
 * Cashback: every eligible completed order (no daily limit); each order at most once.
 * Admin edits of points/cashback become the new base; future awards add on top.
 */
import { db, clubeMembersTable, clubeSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  STAMP_SKIPPED_MESSAGE,
  appendClientLedger,
  canAwardFidelityStamp,
  grantAvailableReward,
  hasLedgerForOrder,
  parseClientNotes,
  serializeClientNotes,
} from "./clientMeta";
import {
  parseExpiryMode,
  resolveBenefitExpiresAt,
  roundMoney,
} from "./clubBenefits";
import { syncClubeMemberOnOrder } from "./clubeClientSync";
import type { OrderMeta } from "./orderMeta";

export type OrderForRewards = {
  id: number;
  orderNumber: number;
  companyId: number;
  customerName: string;
  phone: string;
  total: string | number;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
};

export type ApplyRewardsResult = {
  meta: OrderMeta;
  stampsAwarded: boolean;
  stampSkipped: boolean;
  cashbackAwarded: boolean;
  cashbackAmount: number;
  rewardGranted: boolean;
  memberId: number | null;
};

/** Cashback/stamps only after a completed sale — never for unpaid PIX, cancelled, or refused. */
export function isEligibleForOrderRewards(order: {
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
}): boolean {
  if (order.status !== "done") return false;
  if (order.paymentMethod === "pix" && order.paymentStatus !== "paid") return false;
  return true;
}

async function ensureClubeSettings(companyId: number) {
  const [existing] = await db
    .select()
    .from(clubeSettingsTable)
    .where(eq(clubeSettingsTable.companyId, companyId));
  if (existing) return existing;
  const [created] = await db
    .insert(clubeSettingsTable)
    .values({ companyId })
    .returning();
  return created;
}

/**
 * Apply stamp + cashback for a completed order.
 * Safe to call multiple times — never double-awards the same order.
 */
export async function applyOrderCompletionRewards(
  order: OrderForRewards,
  meta: OrderMeta,
): Promise<ApplyRewardsResult> {
  const nextMeta: OrderMeta = { ...meta };
  const result: ApplyRewardsResult = {
    meta: nextMeta,
    stampsAwarded: false,
    stampSkipped: false,
    cashbackAwarded: false,
    cashbackAmount: 0,
    rewardGranted: false,
    memberId: typeof meta.clientMemberId === "number" ? meta.clientMemberId : null,
  };

  if (!isEligibleForOrderRewards(order)) {
    return result;
  }

  // Always locate/create the CRM member by the order WhatsApp — even when
  // rewards were already applied — so the public Clube area never shows
  // "não participa" after a valid completed order.
  const member = await syncClubeMemberOnOrder({
    companyId: order.companyId,
    customerName: order.customerName,
    phone: order.phone,
    origin: "pedido",
  });
  if (!member) {
    result.meta = nextMeta;
    return result;
  }

  result.memberId = member.id;
  nextMeta.clientMemberId = member.id;

  const settings = await ensureClubeSettings(order.companyId);
  const fidelityOn = settings.fidelityEnabled !== false;
  const cashbackOn = settings.cashbackEnabled !== false;
  const needStamps = fidelityOn && !nextMeta.stampsAwarded;
  const needCashback = cashbackOn && !nextMeta.cashbackAwarded;

  if (!needStamps && !needCashback) {
    if (!nextMeta.rewardsProcessedAt && (nextMeta.stampsAwarded || nextMeta.cashbackAwarded)) {
      nextMeta.rewardsProcessedAt = new Date().toISOString();
    }
    result.stampSkipped = !!nextMeta.stampSkipped;
    result.rewardGranted = !!nextMeta.fidelityRewardGranted;
    result.meta = nextMeta;
    return result;
  }

  const { publicNotes, meta: clientMeta } = parseClientNotes(member.notes);
  let workingMeta = { ...clientMeta };
  let points = member.points ?? 0;
  let cashbackBalance = parseFloat(String(member.cashbackBalance)) || 0;
  let changed = false;
  const now = new Date().toISOString();
  const nowMs = Date.now();

  // ── Stamps (+1, max 1 per SP calendar day) ─────────────────────────────────
  if (needStamps) {
    const alreadyInLedger = hasLedgerForOrder(workingMeta, order.id, "selo_pedido");
    const alreadyBlocked = hasLedgerForOrder(workingMeta, order.id, "selo_bloqueado");
    if (alreadyInLedger) {
      nextMeta.stampsAwarded = true;
      result.stampsAwarded = false;
    } else if (alreadyBlocked || nextMeta.stampSkipped) {
      nextMeta.stampsAwarded = true;
      nextMeta.stampSkipped = true;
      nextMeta.stampSkipMessage = nextMeta.stampSkipMessage || STAMP_SKIPPED_MESSAGE;
      result.stampSkipped = true;
    } else if (!canAwardFidelityStamp(workingMeta, nowMs)) {
      // Already earned a purchase stamp today — cashback still applies below.
      workingMeta = appendClientLedger(workingMeta, {
        at: now,
        type: "selo_bloqueado",
        orderId: order.id,
        orderNumber: order.orderNumber,
        stampsDelta: 0,
        description: `Selo bloqueado (já ganhou neste dia) — pedido #${order.orderNumber}`,
      });
      nextMeta.stampsAwarded = true;
      nextMeta.stampSkipped = true;
      nextMeta.stampSkipMessage = STAMP_SKIPPED_MESSAGE;
      result.stampSkipped = true;
      changed = true;
    } else {
      points = Math.min(500, points + 1);
      workingMeta = appendClientLedger(workingMeta, {
        at: now,
        type: "selo_pedido",
        orderId: order.id,
        orderNumber: order.orderNumber,
        stampsDelta: 1,
        description: `Selo do pedido #${order.orderNumber}`,
      });
      nextMeta.stampsAwarded = true;
      result.stampsAwarded = true;
      changed = true;

      const fidelityExpiry = resolveBenefitExpiresAt({
        mode: parseExpiryMode((settings as { fidelityExpiryMode?: string }).fidelityExpiryMode),
        days: (settings as { fidelityExpiryDays?: number | null }).fidelityExpiryDays,
        date: (settings as { fidelityExpiryDate?: string | null }).fidelityExpiryDate
          ? String((settings as { fidelityExpiryDate?: string | null }).fidelityExpiryDate)
          : null,
        fromMs: nowMs,
      });
      workingMeta = { ...workingMeta, fidelityExpiresAt: fidelityExpiry };

      // Punch card: each full set of stampsRequired → available reward
      const required = Math.max(1, Math.min(100, Number(settings.stampsRequired) || 10));
      const rewardTitle =
        (settings.stampRewardTitle || "").trim() || "1 hambúrguer grátis";
      while (points >= required) {
        points -= required;
        const granted = grantAvailableReward(workingMeta, {
          title: rewardTitle,
          earnedAt: now,
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
        workingMeta = granted.meta;
        workingMeta = appendClientLedger(workingMeta, {
          at: now,
          type: "recompensa_disponivel",
          orderId: order.id,
          orderNumber: order.orderNumber,
          rewardId: granted.reward.id,
          rewardTitle: granted.reward.title,
          description: `Recompensa disponível: ${granted.reward.title}`,
        });
        nextMeta.fidelityRewardGranted = true;
        nextMeta.fidelityRewardTitle = granted.reward.title;
        result.rewardGranted = true;
      }
    }
  }

  // ── Cashback (every order — no daily limit) ────────────────────────────────
  if (needCashback) {
    const alreadyInLedger = hasLedgerForOrder(workingMeta, order.id, "cashback_pedido");
    if (alreadyInLedger) {
      nextMeta.cashbackAwarded = true;
      if (typeof nextMeta.cashbackAmountAwarded === "number") {
        result.cashbackAmount = nextMeta.cashbackAmountAwarded;
      }
    } else {
      const orderTotal = parseFloat(String(order.total)) || 0;
      const minOrder = parseFloat(String(settings.cashbackMinOrder)) || 0;
      const percent = parseFloat(String(settings.cashbackPercent)) || 0;
      let amount = 0;
      if (orderTotal >= minOrder && percent > 0) {
        amount = roundMoney(orderTotal * (percent / 100));
        const maxRaw = settings.cashbackMaxPerOrder;
        if (maxRaw != null && String(maxRaw).trim() !== "") {
          const max = parseFloat(String(maxRaw));
          if (Number.isFinite(max) && max >= 0) {
            amount = Math.min(amount, roundMoney(max));
          }
        }
      }

      if (amount > 0) {
        const before = cashbackBalance;
        cashbackBalance = roundMoney(cashbackBalance + amount);
        const cashbackExpiry = resolveBenefitExpiresAt({
          mode: parseExpiryMode((settings as { cashbackExpiryMode?: string }).cashbackExpiryMode),
          days: (settings as { cashbackExpiryDays?: number | null }).cashbackExpiryDays,
          date: (settings as { cashbackExpiryDate?: string | null }).cashbackExpiryDate
            ? String((settings as { cashbackExpiryDate?: string | null }).cashbackExpiryDate)
            : null,
          fromMs: nowMs,
        });
        workingMeta = appendClientLedger(workingMeta, {
          at: now,
          type: "cashback_pedido",
          orderId: order.id,
          orderNumber: order.orderNumber,
          cashbackDelta: amount,
          balanceBefore: before,
          balanceAfter: cashbackBalance,
          description: `Cashback do pedido #${order.orderNumber}`,
        });
        workingMeta = { ...workingMeta, cashbackExpiresAt: cashbackExpiry };
        result.cashbackAwarded = true;
        result.cashbackAmount = amount;
        changed = true;
      }
      // Mark awarded even when amount is 0 (below min / 0%) so we never retry.
      nextMeta.cashbackAwarded = true;
      nextMeta.cashbackAmountAwarded = amount;
    }
  }

  if (changed || nextMeta.stampsAwarded || nextMeta.cashbackAwarded) {
    nextMeta.rewardsProcessedAt = now;
    await db
      .update(clubeMembersTable)
      .set({
        points,
        cashbackBalance: cashbackBalance.toFixed(2),
        notes: serializeClientNotes(publicNotes, workingMeta),
      })
      .where(
        and(
          eq(clubeMembersTable.id, member.id),
          eq(clubeMembersTable.companyId, order.companyId),
        ),
      );
  }

  result.meta = nextMeta;
  return result;
}
