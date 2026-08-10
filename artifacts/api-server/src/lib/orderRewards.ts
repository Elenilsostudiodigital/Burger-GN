/**
 * Automatic fidelity (stamps) + cashback when an order reaches "done".
 * Idempotent per order via order meta flags AND client ledger.
 */
import { db, clubeMembersTable, clubeSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  appendClientLedger,
  grantAvailableReward,
  hasLedgerForOrder,
  parseClientNotes,
  serializeClientNotes,
} from "./clientMeta";
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
};

export type ApplyRewardsResult = {
  meta: OrderMeta;
  stampsAwarded: boolean;
  cashbackAwarded: boolean;
  cashbackAmount: number;
  memberId: number | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
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
    cashbackAwarded: false,
    cashbackAmount: 0,
    memberId: typeof meta.clientMemberId === "number" ? meta.clientMemberId : null,
  };

  if (order.status !== "done") {
    return result;
  }

  const settings = await ensureClubeSettings(order.companyId);
  const fidelityOn = settings.fidelityEnabled !== false;
  const cashbackOn = settings.cashbackEnabled !== false;
  const needStamps = fidelityOn && !nextMeta.stampsAwarded;
  const needCashback = cashbackOn && !nextMeta.cashbackAwarded;

  if (!needStamps && !needCashback) {
    // Still mark processed if both already done or both programs off.
    if (!nextMeta.rewardsProcessedAt && (nextMeta.stampsAwarded || nextMeta.cashbackAwarded)) {
      nextMeta.rewardsProcessedAt = new Date().toISOString();
    }
    // If programs are off, mark flags so re-saving done does not retry forever
    // when admin later enables them for *new* orders only — we only skip when
    // already awarded. When disabled, leave flags unset so enabling later can
    // credit historical done orders once. That matches "on completion" semantics
    // at the time of becoming done; for already-done without flags while disabled,
    // we intentionally do nothing.
    result.meta = nextMeta;
    return result;
  }

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

  const { publicNotes, meta: clientMeta } = parseClientNotes(member.notes);
  let workingMeta = { ...clientMeta };
  let points = member.points ?? 0;
  let cashbackBalance = parseFloat(String(member.cashbackBalance)) || 0;
  let changed = false;
  const now = new Date().toISOString();

  // ── Stamps (+1) ────────────────────────────────────────────────────────────
  if (needStamps) {
    const alreadyInLedger = hasLedgerForOrder(workingMeta, order.id, "selo_pedido");
    if (alreadyInLedger) {
      nextMeta.stampsAwarded = true;
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
      }
    }
  }

  // ── Cashback ───────────────────────────────────────────────────────────────
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
        cashbackBalance = roundMoney(cashbackBalance + amount);
        workingMeta = appendClientLedger(workingMeta, {
          at: now,
          type: "cashback_pedido",
          orderId: order.id,
          orderNumber: order.orderNumber,
          cashbackDelta: amount,
          description: `Cashback do pedido #${order.orderNumber}`,
        });
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
