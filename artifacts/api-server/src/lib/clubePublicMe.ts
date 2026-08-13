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
  type ClientMeta,
} from "./clientMeta";
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
      howItWorks: [
        `A cada pedido concluído você recebe ${cashbackPercent.toFixed(0)}% de cashback sobre o valor do pedido.`,
        cashbackMinOrder > 0
          ? `O cashback vale para pedidos a partir de R$ ${cashbackMinOrder.toFixed(2).replace(".", ",")}.`
          : "Não há valor mínimo para gerar cashback.",
        cashbackMax != null && Number.isFinite(cashbackMax)
          ? `O limite máximo de cashback por pedido é R$ ${cashbackMax.toFixed(2).replace(".", ",")}.`
          : "Não há limite máximo de cashback por pedido.",
        "Você poderá utilizar o cashback disponível nos próximos pedidos, conforme saldo acumulado.",
      ],
      whenToUse:
        "O cashback fica disponível após a conclusão do pedido e pode ser usado em compras futuras na The Burger GN.",
    },
    fidelity: {
      enabled: settings.fidelityEnabled !== false,
      stampsRequired,
      stampRewardTitle,
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
      };
      cashbackProgram: {
        enabled: boolean;
        percent: string;
        minOrder: string;
        maxPerOrder: string | null;
        balance: string;
        receivedTotal: number;
        usedTotal: number;
      };
      summary: {
        stampsEarned: number;
        cashbackReceived: number;
        cashbackUsed: number;
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

  const { meta } = parseClientNotes(member.notes);
  const progress = fidelityProgress(member.points ?? 0, rules.fidelity.stampsRequired);
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
    .filter((e) => e.type === "cashback_utilizado" || (e.type === "ajuste_cashback" && (e.cashbackDelta ?? 0) < 0))
    .reduce((sum, e) => sum + Math.abs(e.cashbackDelta ?? 0), 0);
  const stampsEarned = (meta.ledger ?? [])
    .filter((e) => e.type === "selo_pedido" || (e.type === "ajuste_selo" && (e.stampsDelta ?? 0) > 0))
    .reduce((sum, e) => sum + Math.max(0, e.stampsDelta ?? 0), 0);

  return {
    found: true,
    rules,
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      cashbackBalance: member.cashbackBalance,
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
      },
    cashbackProgram: {
      enabled: rules.cashback.enabled,
      percent: rules.cashback.percent,
      minOrder: rules.cashback.minOrder,
      maxPerOrder: rules.cashback.maxPerOrder,
      balance: member.cashbackBalance,
      receivedTotal: Math.round(cashbackReceived * 100) / 100,
      usedTotal: Math.round(cashbackUsed * 100) / 100,
    },
    summary: {
      stampsEarned,
      cashbackReceived: Math.round(cashbackReceived * 100) / 100,
      cashbackUsed: Math.round(cashbackUsed * 100) / 100,
    },
    history,
    ledger: publicLedgerPayload(meta),
  };
}
