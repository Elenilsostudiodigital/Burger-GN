/**
 * Public Clube Burger member payload (GET /clube/me and post-order sync).
 */
import { db, clubeMembersTable, clubeSettingsTable, ordersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  isPlaceholderPhone,
  normalizeClientPhone,
  nextFidelityStampAvailableAt,
  parseClientNotes,
  phonesMatch,
  serializeClientNotes,
  type ClientMeta,
} from "./clientMeta";
import {
  applyLazyCashbackExpiry,
  applyLazyFidelityExpiry,
  buildExpiryWarning,
  parseExpiryMode,
  readMaxUsePercent,
} from "./clubBenefits";
import {
  computeClientOrderStats,
  filterOrdersForClient,
  type OrderForStats,
} from "./clientStats";
import { parseOrderNotes } from "./orderMeta";

async function ensureSettings(companyId: number) {
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

function fidelityProgress(stamps: number, stampsRequired: number) {
  const goal = Math.max(1, stampsRequired);
  const current = Math.max(0, stamps);
  return {
    stamps: current,
    goal,
    progress: Math.min(100, Math.round((current / goal) * 100)),
    remaining: Math.max(0, goal - current),
  };
}

function publicLedgerPayload(meta: ClientMeta) {
  return (meta.ledger ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    type: e.type,
    orderId: e.orderId ?? null,
    orderNumber: e.orderNumber ?? null,
    stampsDelta: e.stampsDelta ?? null,
    cashbackDelta: e.cashbackDelta ?? null,
    balanceBefore: e.balanceBefore ?? null,
    balanceAfter: e.balanceAfter ?? null,
    description: e.description ?? null,
    rewardId: e.rewardId ?? null,
    rewardTitle: e.rewardTitle ?? null,
  }));
}

export function publicClubRules(settings: Awaited<ReturnType<typeof ensureSettings>>) {
  const cashbackPercent = parseFloat(String(settings.cashbackPercent)) || 0;
  const cashbackMinOrder = parseFloat(String(settings.cashbackMinOrder)) || 0;
  const stampsRequired = Math.max(1, Number(settings.stampsRequired) || 10);
  const stampRewardTitle =
    (settings.stampRewardTitle || "").trim() || "1 hambúrguer grátis";
  const cashbackMax =
    settings.cashbackMaxPerOrder != null && String(settings.cashbackMaxPerOrder).trim() !== ""
      ? parseFloat(String(settings.cashbackMaxPerOrder))
      : null;
  const maxUsePercent = readMaxUsePercent(settings.cashbackMaxUsePercent);
  const cashbackExpiryMode = parseExpiryMode(settings.cashbackExpiryMode);
  const fidelityExpiryMode = parseExpiryMode(settings.fidelityExpiryMode);

  return {
    enabled: settings.enabled !== false,
    clubName: settings.clubName || "Clube Burger GN",
    welcomeMessage:
      settings.welcomeMessage ||
      "Bem-vindo ao Clube Burger GN! Acumule cashback e selos a cada pedido.",
    cashback: {
      enabled: settings.cashbackEnabled !== false,
      percent: settings.cashbackPercent,
      minOrder: settings.cashbackMinOrder,
      maxPerOrder: settings.cashbackMaxPerOrder ?? null,
      maxUsePercent: maxUsePercent != null ? String(maxUsePercent) : null,
      expiryMode: cashbackExpiryMode,
      expiryDays: settings.cashbackExpiryDays ?? null,
      expiryDate: settings.cashbackExpiryDate
        ? String(settings.cashbackExpiryDate).slice(0, 10)
        : null,
      warningDays: settings.cashbackWarningDays ?? 7,
      howItWorks: [
        `A cada pedido concluído você recebe ${cashbackPercent.toFixed(0)}% de cashback sobre o valor do pedido.`,
        cashbackMinOrder > 0
          ? `O cashback vale para pedidos a partir de R$ ${cashbackMinOrder.toFixed(2).replace(".", ",")}.`
          : "Não há valor mínimo para gerar cashback.",
        cashbackMax != null && Number.isFinite(cashbackMax)
          ? `O limite máximo de cashback por pedido é R$ ${cashbackMax.toFixed(2).replace(".", ",")}.`
          : "Não há limite máximo de cashback por pedido.",
        maxUsePercent != null
          ? `No checkout você pode utilizar até ${maxUsePercent.toFixed(0)}% do valor do pedido em cashback.`
          : "No checkout você pode utilizar todo o saldo disponível (até o total do pedido).",
        "Você poderá utilizar o cashback disponível nos próximos pedidos, conforme saldo acumulado.",
      ],
      whenToUse:
        "O cashback fica disponível após a conclusão do pedido e pode ser usado em compras futuras na The Burger GN.",
    },
    fidelity: {
      enabled: settings.fidelityEnabled !== false,
      stampsRequired,
      stampRewardTitle,
      expiryMode: fidelityExpiryMode,
      expiryDays: settings.fidelityExpiryDays ?? null,
      expiryDate: settings.fidelityExpiryDate
        ? String(settings.fidelityExpiryDate).slice(0, 10)
        : null,
      warningDays: settings.fidelityWarningDays ?? 7,
      howItWorks: [
        "Você ganha no máximo 1 selo por dia elegível (fuso de Brasília), na primeira compra do dia.",
        "Pedidos extras no mesmo dia geram Cashback normalmente, mas não geram novo selo.",
        `Ao completar ${stampsRequired} selos, você desbloqueia: ${stampRewardTitle}.`,
        "O prêmio vale para qualquer hambúrguer do cardápio (não inclui Combos). Na entrega, cobra-se apenas a taxa quando houver.",
        "Os selos reiniciam o ciclo após a recompensa ser conquistada.",
      ],
      whenToUse:
        "Na próxima compra após completar a meta, você poderá resgatar o hambúrguer grátis no checkout ou guardar para depois.",
    },
  };
}

async function loadPublicOrderStats(companyId: number): Promise<OrderForStats[]> {
  const orders = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      phone: ordersTable.phone,
      total: ordersTable.total,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      notes: ordersTable.notes,
    })
    .from(ordersTable)
    .where(eq(ordersTable.companyId, companyId))
    .orderBy(desc(ordersTable.createdAt));

  return orders.map((o) => {
    const { meta } = parseOrderNotes(o.notes);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      phone: o.phone,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt,
      clientMemberId: typeof meta.clientMemberId === "number" ? meta.clientMemberId : null,
    };
  });
}

export type PublicClubeMePayload =
  | {
      found: false;
      member: null;
      rules: ReturnType<typeof publicClubRules>;
    }
  | {
      found: true;
      rules: ReturnType<typeof publicClubRules>;
      member: {
        id: number;
        name: string;
        phone: string;
        cashbackBalance: string;
        stamps: number;
        orderCount: number;
        lastOrderAt: string | null;
        lastOrderNumber: number | null;
        joinedAt: string;
      };
      fidelity: {
        enabled: boolean;
        stamps: number;
        goal: number;
        progress: number;
        remaining: number;
        rewardTitle: string;
        availableRewards: Array<{
          id: string;
          title: string;
          earnedAt: string;
          orderId: number | null;
          orderNumber: number | null;
          redeemedAt: string | null;
          available: boolean;
        }>;
        nextStampAvailableAt: string | null;
        nextRewardMessage: string;
        expiresAt: string | null;
        warning: { active: boolean; daysLeft: number; message: string } | null;
      };
      cashbackProgram: {
        enabled: boolean;
        percent: string;
        minOrder: string;
        maxPerOrder: string | null;
        maxUsePercent: string | null;
        balance: string;
        receivedTotal: number;
        usedTotal: number;
        expiresAt: string | null;
        warning: { active: boolean; daysLeft: number; message: string } | null;
      };
      summary: {
        stampsEarned: number;
        cashbackReceived: number;
        cashbackUsed: number;
        cashbackRemaining: number;
      };
      warnings?: {
        cashback: { active: boolean; daysLeft: number; message: string } | null;
        fidelity: { active: boolean; daysLeft: number; message: string } | null;
      };
      history: Array<{
        id: number;
        orderNumber: number;
        total: number;
        status: string;
        createdAt: string;
      }>;
      ledger: ReturnType<typeof publicLedgerPayload>;
    };

/**
 * Build the public Clube payload for a WhatsApp number.
 * When `memberId` is provided, prefer that row (then verify phone equivalence).
 */
export async function buildPublicClubeMe(
  companyId: number,
  rawPhone: string,
  opts?: { memberId?: number | null },
): Promise<PublicClubeMePayload> {
  const settings = await ensureSettings(companyId);
  const rules = publicClubRules(settings);
  const phone = normalizeClientPhone(rawPhone);

  if (!phone || isPlaceholderPhone(phone)) {
    return { found: false, member: null, rules };
  }

  const members = await db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, companyId));

  let member =
    opts?.memberId != null
      ? members.find((m) => m.id === opts.memberId) ?? null
      : null;

  if (member && !phonesMatch(member.phone, phone)) {
    // Stale clientMemberId — fall back to phone match.
    member = null;
  }

  if (!member) {
    member = members.find((m) => phonesMatch(m.phone, phone)) ?? null;
  }

  if (!member || member.active === false) {
    return { found: false, member: null, rules };
  }

  const orderPool = await loadPublicOrderStats(companyId);
  const linked = filterOrdersForClient(orderPool, {
    clientId: member.id,
    phone: member.phone,
  });
  const stats = computeClientOrderStats(linked);
  const history = linked
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: parseFloat(String(o.total)) || 0,
      status: o.status,
      createdAt:
        o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
    }));

  const { publicNotes, meta: rawMeta } = parseClientNotes(member.notes);
  let meta = rawMeta;
  let cashBalance = parseFloat(String(member.cashbackBalance)) || 0;
  let stamps = member.points ?? 0;

  const expiredCb = applyLazyCashbackExpiry({ balance: cashBalance, meta });
  cashBalance = expiredCb.balance;
  meta = expiredCb.meta;
  const expiredFid = applyLazyFidelityExpiry({ stamps, meta });
  stamps = expiredFid.stamps;
  meta = expiredFid.meta;

  if (expiredCb.changed || expiredFid.changed) {
    await db
      .update(clubeMembersTable)
      .set({
        cashbackBalance: cashBalance.toFixed(2),
        points: stamps,
        notes: serializeClientNotes(publicNotes, meta),
      })
      .where(eq(clubeMembersTable.id, member.id));
  }

  const progress = fidelityProgress(stamps, rules.fidelity.stampsRequired);
  const availableRewards = (meta.availableRewards ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    earnedAt: r.earnedAt,
    orderId: r.orderId ?? null,
    orderNumber: r.orderNumber ?? null,
    redeemedAt: r.redeemedAt ?? null,
    available: !r.redeemedAt,
  }));

  const cashbackReceived = (meta.ledger ?? [])
    .filter((e) => e.type === "cashback_pedido" || (e.type === "ajuste_cashback" && (e.cashbackDelta ?? 0) > 0))
    .reduce((sum, e) => sum + (e.cashbackDelta ?? 0), 0);
  const cashbackUsed = (meta.ledger ?? [])
    .filter((e) =>
      e.type === "cashback_utilizado"
      || e.type === "cashback_expirado"
      || (e.type === "ajuste_cashback" && (e.cashbackDelta ?? 0) < 0),
    )
    .reduce((sum, e) => sum + Math.abs(e.cashbackDelta ?? 0), 0);
  const stampsEarned = (meta.ledger ?? [])
    .filter((e) => e.type === "selo_pedido" || (e.type === "ajuste_selo" && (e.stampsDelta ?? 0) > 0))
    .reduce((sum, e) => sum + Math.max(0, e.stampsDelta ?? 0), 0);

  const cashWarn = buildExpiryWarning(
    meta.cashbackExpiresAt,
    rules.cashback.warningDays ?? 7,
  );
  const fidWarn = buildExpiryWarning(
    meta.fidelityExpiresAt,
    rules.fidelity.warningDays ?? 7,
  );

  return {
    found: true,
    rules,
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      cashbackBalance: cashBalance.toFixed(2),
      stamps: progress.stamps,
      orderCount: stats.orderCount,
      lastOrderAt: stats.lastOrderAt,
      lastOrderNumber: stats.lastOrderNumber,
      joinedAt: member.joinedAt instanceof Date ? member.joinedAt.toISOString() : String(member.joinedAt),
    },
      fidelity: {
        enabled: rules.fidelity.enabled,
        stamps: progress.stamps,
        goal: progress.goal,
        progress: progress.progress,
        remaining: progress.remaining,
        rewardTitle: rules.fidelity.stampRewardTitle,
        availableRewards,
        nextStampAvailableAt: nextFidelityStampAvailableAt(meta),
        nextRewardMessage:
          progress.remaining <= 0
            ? `Você completou a meta! Recompensa: ${rules.fidelity.stampRewardTitle}.`
            : `Faltam apenas ${progress.remaining} selo${progress.remaining === 1 ? "" : "s"} para ganhar ${rules.fidelity.stampRewardTitle}.`,
        expiresAt: meta.fidelityExpiresAt ?? null,
        warning: fidWarn
          ? { ...fidWarn, message: `⚠️ Sua fidelidade vence em ${fidWarn.daysLeft} dia${fidWarn.daysLeft === 1 ? "" : "s"}. Utilize antes de perder.` }
          : null,
      },
    cashbackProgram: {
      enabled: rules.cashback.enabled,
      percent: rules.cashback.percent,
      minOrder: rules.cashback.minOrder,
      maxPerOrder: rules.cashback.maxPerOrder,
      maxUsePercent: rules.cashback.maxUsePercent,
      balance: cashBalance.toFixed(2),
      receivedTotal: Math.round(cashbackReceived * 100) / 100,
      usedTotal: Math.round(cashbackUsed * 100) / 100,
      expiresAt: meta.cashbackExpiresAt ?? null,
      warning: cashWarn
        ? {
            ...cashWarn,
            message:
              cashWarn.daysLeft === 0
                ? "⚠️ Seu cashback vence hoje. Utilize antes de perder."
                : `⚠️ Seu cashback vence em ${cashWarn.daysLeft} dia${cashWarn.daysLeft === 1 ? "" : "s"}. Utilize antes de perder.`,
          }
        : null,
    },
    summary: {
      stampsEarned,
      cashbackReceived: Math.round(cashbackReceived * 100) / 100,
      cashbackUsed: Math.round(cashbackUsed * 100) / 100,
      cashbackRemaining: Math.round(cashBalance * 100) / 100,
    },
    warnings: {
      cashback: cashWarn
        ? {
            ...cashWarn,
            message:
              cashWarn.daysLeft === 0
                ? "⚠️ Seu cashback vence hoje. Utilize antes de perder."
                : `⚠️ Seu cashback vence em ${cashWarn.daysLeft} dia${cashWarn.daysLeft === 1 ? "" : "s"}. Utilize antes de perder.`,
          }
        : null,
      fidelity: fidWarn
        ? {
            ...fidWarn,
            message: `⚠️ Sua fidelidade vence em ${fidWarn.daysLeft} dia${fidWarn.daysLeft === 1 ? "" : "s"}. Utilize antes de perder.`,
          }
        : null,
    },
    history,
    ledger: publicLedgerPayload(meta),
  };
}
