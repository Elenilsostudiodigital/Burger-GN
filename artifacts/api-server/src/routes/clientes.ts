import { Router } from "express";
import { db, clubeMembersTable, clubeSettingsTable, ordersTable, couponsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import {
  CLIENT_ORIGIN_LABELS,
  appendClientLedger,
  appendRecoveryContact,
  isClientOrigin,
  isPlaceholderPhone,
  normalizeClientPhone,
  phonesMatch,
  parseClientNotes,
  redeemAvailableReward,
  serializeClientNotes,
  type ClientOrigin,
  type ClientMeta,
} from "../lib/clientMeta";
import { toClientRow } from "../lib/clubeClientSync";
import {
  computeClientOrderStats,
  emptyClientOrderStats,
  filterOrdersForClient,
  indexOrdersByPhone,
  matchesRecoveryFilter,
  ordersForPhone,
  recoverySortScore,
  type OrderForStats,
  type RecoveryFilter,
} from "../lib/clientStats";
import { parseOrderNotes } from "../lib/orderMeta";

async function loadFidelitySettings(companyId: number) {
  const [settings] = await db
    .select()
    .from(clubeSettingsTable)
    .where(eq(clubeSettingsTable.companyId, companyId));
  return {
    fidelityEnabled: settings?.fidelityEnabled ?? true,
    stampsRequired: settings?.stampsRequired ?? 10,
    stampRewardTitle: settings?.stampRewardTitle || "1 hambúrguer grátis",
    cashbackEnabled: settings?.cashbackEnabled ?? true,
    cashbackPercent: settings?.cashbackPercent ?? "5",
    cashbackMinOrder: settings?.cashbackMinOrder ?? "0",
    cashbackMaxPerOrder: settings?.cashbackMaxPerOrder ?? null,
  };
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

function ledgerPayload(meta: ClientMeta) {
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

const router = Router();

async function listCompanyMembers(companyId: number) {
  return db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, companyId))
    .orderBy(desc(clubeMembersTable.joinedAt));
}

async function loadCompanyOrderStats(companyId: number): Promise<OrderForStats[]> {
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

function enrichWithStats(
  member: typeof clubeMembersTable.$inferSelect,
  orderPool: OrderForStats[],
  phoneIndex: Map<string, OrderForStats[]>,
) {
  const byPhone = ordersForPhone(phoneIndex, member.phone);
  const byLink = orderPool.filter((o) => o.clientMemberId === member.id);
  const merged = new Map<number, OrderForStats>();
  for (const o of [...byPhone, ...byLink]) merged.set(o.id, o);
  const stats = computeClientOrderStats([...merged.values()]);
  const { publicNotes, meta } = parseClientNotes(member.notes);
  const base = toClientRow(member);
  return {
    ...base,
    notes: publicNotes,
    orderCount: stats.orderCount,
    totalSpent: stats.totalSpent,
    lastOrderAt: stats.lastOrderAt,
    lastOrderNumber: stats.lastOrderNumber,
    segments: stats.segments,
    daysWithoutOrder: stats.daysWithoutOrder,
    recoveryStatus: stats.recoveryStatus,
    isVip: stats.isVip,
    vipInativo: stats.vipInativo,
    lastRecoveryAt: meta.lastRecovery?.at ?? null,
    lastRecoveryCoupon: meta.lastRecovery?.couponCode ?? null,
  };
}

function isRecoveryFilter(value: string): value is RecoveryFilter {
  return (
    value === "todos" ||
    value === "esfriando" ||
    value === "em_risco" ||
    value === "perdido" ||
    value === "vip_inativo"
  );
}

// ── Origins ──────────────────────────────────────────────────────────────────
router.get("/admin/clientes/origins", requireCompanyAuth, (_req, res) => {
  res.json(CLIENT_ORIGIN_LABELS);
});

// ── Recuperação de clientes (computed from order history) ─────────────────────
router.get("/admin/clientes/recuperacao", requireCompanyAuth, async (req, res) => {
  try {
    const q = String(req.query["q"] || "").trim().toLowerCase();
    const filterRaw = String(req.query["status"] || "todos").trim();
    const filter: RecoveryFilter = isRecoveryFilter(filterRaw) ? filterRaw : "todos";

    const members = await listCompanyMembers(req.companyId!);
    const orderPool = await loadCompanyOrderStats(req.companyId!);
    const phoneIndex = indexOrdersByPhone(orderPool);

    let rows = members.map((m) => enrichWithStats(m, orderPool, phoneIndex));

    // Summary counts (before text search; across all non-filtered recovery buckets)
    const recoverable = rows.filter((r) => r.recoveryStatus !== "ativo");
    const summary = {
      total: recoverable.length,
      esfriando: rows.filter((r) => r.recoveryStatus === "esfriando").length,
      emRisco: rows.filter((r) => r.recoveryStatus === "em_risco").length,
      perdidos: rows.filter((r) => r.recoveryStatus === "perdido").length,
      vipsInativos: rows.filter((r) => r.vipInativo).length,
      historicalRevenue: Math.round(
        recoverable.reduce((sum, r) => sum + (r.totalSpent || 0), 0) * 100,
      ) / 100,
    };

    rows = rows.filter((r) => matchesRecoveryFilter(r, filter));

    if (q) {
      const qDigits = q.replace(/\D/g, "");
      rows = rows.filter((r) => {
        const nameHit = r.name.toLowerCase().includes(q);
        const phoneHit = qDigits
          ? r.phone.replace(/\D/g, "").includes(qDigits)
          : r.phone.toLowerCase().includes(q);
        return nameHit || phoneHit;
      });
    }

    rows.sort((a, b) => recoverySortScore(b) - recoverySortScore(a));

    res.json({
      filter,
      summary,
      count: rows.length,
      clients: rows,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list recovery clients");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Register manual WhatsApp recovery open — "Contato iniciado" (not delivery confirmation).
router.post("/admin/clientes/:id/recuperacao/contato", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as { message?: string; couponCode?: string | null };
    const message = String(body.message || "").trim();
    if (!message) {
      res.status(400).json({ error: "Mensagem é obrigatória." });
      return;
    }

    const [existing] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!existing) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    let couponCode: string | null = null;
    if (body.couponCode && String(body.couponCode).trim()) {
      const code = String(body.couponCode).trim();
      const [coupon] = await db
        .select()
        .from(couponsTable)
        .where(
          and(
            eq(couponsTable.companyId, req.companyId!),
            eq(couponsTable.code, code),
          ),
        );
      // Soft-check: allow recording the code even if inactive; prefer existing coupon match case-insensitive via list
      if (coupon) {
        couponCode = coupon.code;
      } else {
        // Try case-insensitive among company coupons
        const all = await db
          .select()
          .from(couponsTable)
          .where(eq(couponsTable.companyId, req.companyId!));
        const found = all.find((c) => c.code.toLowerCase() === code.toLowerCase());
        couponCode = found?.code ?? code.slice(0, 40);
      }
    }

    const { publicNotes, meta } = parseClientNotes(existing.notes);
    const previousAt = meta.lastRecovery?.at ?? null;
    let previousDays: number | null = null;
    let recentWarning: string | null = null;
    if (previousAt) {
      previousDays = Math.floor(
        (Date.now() - new Date(previousAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (previousDays <= 7) {
        recentWarning =
          previousDays <= 0
            ? "Contato de recuperação iniciado hoje."
            : `Contato de recuperação iniciado há ${previousDays} dia${previousDays === 1 ? "" : "s"}.`;
      }
    }

    const nextMeta = appendRecoveryContact(meta, {
      at: new Date().toISOString(),
      message: message.slice(0, 4000),
      couponCode,
    });

    const [updated] = await db
      .update(clubeMembersTable)
      .set({ notes: serializeClientNotes(publicNotes, nextMeta) })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    const orderPool = await loadCompanyOrderStats(req.companyId!);
    const phoneIndex = indexOrdersByPhone(orderPool);
    const client = enrichWithStats(updated!, orderPool, phoneIndex);

    res.json({
      ok: true,
      result: "contato_iniciado",
      client,
      lastRecoveryAt: nextMeta.lastRecovery!.at,
      previousRecoveryAt: previousAt,
      daysSincePreviousContact: previousDays,
      warning: recentWarning,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to register recovery contact");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── List + search ────────────────────────────────────────────────────────────
router.get("/admin/clientes", requireCompanyAuth, async (req, res) => {
  try {
    const q = String(req.query["q"] || "").trim().toLowerCase();
    const originFilter = String(req.query["origin"] || "").trim();
    const members = await listCompanyMembers(req.companyId!);
    const orderPool = await loadCompanyOrderStats(req.companyId!);
    const phoneIndex = indexOrdersByPhone(orderPool);

    let rows = members.map((m) => enrichWithStats(m, orderPool, phoneIndex));

    if (originFilter && isClientOrigin(originFilter)) {
      rows = rows.filter((r) => r.origin === originFilter);
    }
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      rows = rows.filter((r) => {
        const nameHit = r.name.toLowerCase().includes(q);
        const phoneHit = qDigits
          ? r.phone.replace(/\D/g, "").includes(qDigits)
          : r.phone.toLowerCase().includes(q);
        return nameHit || phoneHit;
      });
    }

    res.json({
      count: rows.length,
      origins: CLIENT_ORIGIN_LABELS,
      clients: rows,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list clients");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Detail + order history ───────────────────────────────────────────────────
router.get("/admin/clientes/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const [member] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!member) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const orderPool = await loadCompanyOrderStats(req.companyId!);
    const linked = filterOrdersForClient(orderPool, { clientId: member.id, phone: member.phone });
    const stats = computeClientOrderStats(linked);

    const history = linked
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: parseFloat(String(o.total)) || 0,
        status: o.status,
        createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
      }));

    const { meta } = parseClientNotes(member.notes);
    const fidelity = await loadFidelitySettings(req.companyId!);
    const progress = fidelityProgress(member.points ?? 0, fidelity.stampsRequired);
    const availableRewards = (meta.availableRewards ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      earnedAt: r.earnedAt,
      orderId: r.orderId ?? null,
      orderNumber: r.orderNumber ?? null,
      redeemedAt: r.redeemedAt ?? null,
      available: !r.redeemedAt,
    }));

    res.json({
      client: {
        ...toClientRow(member),
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent,
        lastOrderAt: stats.lastOrderAt,
        lastOrderNumber: stats.lastOrderNumber,
        segments: stats.segments,
        daysWithoutOrder: stats.daysWithoutOrder,
        recoveryStatus: stats.recoveryStatus,
        isVip: stats.isVip,
        vipInativo: stats.vipInativo,
        lastRecoveryAt: meta.lastRecovery?.at ?? null,
        lastRecoveryCoupon: meta.lastRecovery?.couponCode ?? null,
      },
      history,
      fidelity: {
        enabled: fidelity.fidelityEnabled,
        stamps: progress.stamps,
        goal: progress.goal,
        progress: progress.progress,
        remaining: progress.remaining,
        rewardTitle: fidelity.stampRewardTitle,
        availableRewards,
      },
      cashbackProgram: {
        enabled: fidelity.cashbackEnabled,
        percent: fidelity.cashbackPercent,
        minOrder: fidelity.cashbackMinOrder,
        maxPerOrder: fidelity.cashbackMaxPerOrder,
        balance: member.cashbackBalance,
      },
      ledger: ledgerPayload(meta),
      // Recovery classifications (computed from order history, not persisted).
      recoveryHints: {
        novo: stats.segments.includes("novo"),
        recorrente: stats.segments.includes("recorrente"),
        vip: stats.segments.includes("vip"),
        semComprar7dias: stats.segments.includes("inativo_7"),
        semComprar15dias: stats.segments.includes("inativo_15"),
        semComprar30dias: stats.segments.includes("inativo_30"),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get client detail");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Manual import / create ───────────────────────────────────────────────────
router.post("/admin/clientes", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      phone?: string;
      stamps?: number;
      cashbackBalance?: string | number;
      origin?: string;
      notes?: string;
      /** When true and duplicate exists, apply updates instead of 409. */
      updateIfExists?: boolean;
    };

    const name = (body.name || "").trim();
    const phone = normalizeClientPhone(body.phone || "");
    if (!name) {
      res.status(400).json({ error: "Nome completo é obrigatório." });
      return;
    }
    if (isPlaceholderPhone(phone) || phone.length < 12) {
      res.status(400).json({ error: "WhatsApp inválido. Use DDI+DDD+número." });
      return;
    }

    const origin: ClientOrigin = isClientOrigin(body.origin) ? body.origin : "importacao_manual";
    const stamps = Math.max(0, Math.min(500, Math.round(Number(body.stamps) || 0)));
    const cashback = Math.max(0, Number(body.cashbackBalance) || 0);
    const publicNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

    const existing = (await listCompanyMembers(req.companyId!)).find(
      (m: typeof clubeMembersTable.$inferSelect) => phonesMatch(m.phone, phone),
    );
    if (existing) {
      if (body.updateIfExists) {
        const current = parseClientNotes(existing.notes);
        let nextMeta: ClientMeta = { ...current.meta, origin };
        const prevStamps = existing.points ?? 0;
        const prevCash = parseFloat(String(existing.cashbackBalance)) || 0;
        const now = new Date().toISOString();
        if (stamps !== prevStamps) {
          nextMeta = appendClientLedger(nextMeta, {
            at: now,
            type: "ajuste_selo",
            stampsDelta: stamps - prevStamps,
            description: "Ajuste manual de selos (importação)",
          });
        }
        if (Math.abs(cashback - prevCash) > 0.001) {
          nextMeta = appendClientLedger(nextMeta, {
            at: now,
            type: "ajuste_cashback",
            cashbackDelta: Math.round((cashback - prevCash) * 100) / 100,
            description: "Ajuste manual de cashback (importação)",
          });
        }
        const [updated] = await db
          .update(clubeMembersTable)
          .set({
            name,
            phone,
            points: stamps,
            cashbackBalance: cashback.toFixed(2),
            notes: serializeClientNotes(publicNotes || current.publicNotes, nextMeta),
          })
          .where(
            and(
              eq(clubeMembersTable.id, existing.id),
              eq(clubeMembersTable.companyId, req.companyId!),
            ),
          )
          .returning();
        const orderPool = await loadCompanyOrderStats(req.companyId!);
        const phoneIndex = indexOrdersByPhone(orderPool);
        res.json({
          updated: true,
          client: enrichWithStats(updated!, orderPool, phoneIndex),
        });
        return;
      }

      const orderPool = await loadCompanyOrderStats(req.companyId!);
      const phoneIndex = indexOrdersByPhone(orderPool);
      res.status(409).json({
        error: "Já existe um cliente com este WhatsApp.",
        client: enrichWithStats(existing, orderPool, phoneIndex),
      });
      return;
    }

    const [member] = await db
      .insert(clubeMembersTable)
      .values({
        companyId: req.companyId!,
        name,
        phone,
        email: "",
        points: stamps,
        cashbackBalance: cashback.toFixed(2),
        active: true,
        notes: serializeClientNotes(publicNotes, { origin }),
      })
      .returning();

    res.status(201).json({
      updated: false,
      client: {
        ...toClientRow(member),
        ...emptyClientOrderStats(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create client");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update ───────────────────────────────────────────────────────────────────
router.put("/admin/clientes/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const body = req.body as {
      name?: string;
      phone?: string;
      stamps?: number;
      cashbackBalance?: string | number;
      origin?: string;
      notes?: string;
      active?: boolean;
    };

    const [existing] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!existing) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const current = parseClientNotes(existing.notes);
    const origin = isClientOrigin(body.origin) ? body.origin : current.meta.origin;
    const publicNotes = body.notes !== undefined
      ? String(body.notes).trim().slice(0, 2000)
      : current.publicNotes;

    let nextMeta: ClientMeta = { ...current.meta, origin };
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch["name"] = body.name.trim();
    if (body.phone !== undefined) {
      const phone = normalizeClientPhone(body.phone);
      if (isPlaceholderPhone(phone) || phone.length < 12) {
        res.status(400).json({ error: "WhatsApp inválido." });
        return;
      }
      const dup = (await listCompanyMembers(req.companyId!)).find(
        (m: typeof clubeMembersTable.$inferSelect) => m.id !== id && phonesMatch(m.phone, phone),
      );
      if (dup) {
        res.status(409).json({ error: "Já existe outro cliente com este WhatsApp." });
        return;
      }
      patch["phone"] = phone;
    }
    if (body.stamps !== undefined) {
      const stamps = Math.max(0, Math.min(500, Math.round(Number(body.stamps) || 0)));
      const prev = existing.points ?? 0;
      if (stamps !== prev) {
        nextMeta = appendClientLedger(nextMeta, {
          at: now,
          type: "ajuste_selo",
          stampsDelta: stamps - prev,
          description: "Ajuste manual de selos",
        });
      }
      patch["points"] = stamps;
    }
    if (body.cashbackBalance !== undefined) {
      const cash = Math.max(0, Number(body.cashbackBalance) || 0);
      const prev = parseFloat(String(existing.cashbackBalance)) || 0;
      if (Math.abs(cash - prev) > 0.001) {
        nextMeta = appendClientLedger(nextMeta, {
          at: now,
          type: "ajuste_cashback",
          cashbackDelta: Math.round((cash - prev) * 100) / 100,
          description: "Ajuste manual de cashback",
        });
      }
      patch["cashbackBalance"] = cash.toFixed(2);
    }
    if (body.active !== undefined) patch["active"] = Boolean(body.active);
    patch["notes"] = serializeClientNotes(publicNotes, nextMeta);

    const [updated] = await db
      .update(clubeMembersTable)
      .set(patch)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    const orderPool = await loadCompanyOrderStats(req.companyId!);
    const phoneIndex = indexOrdersByPhone(orderPool);
    res.json(enrichWithStats(updated!, orderPool, phoneIndex));
  } catch (err) {
    req.log.error({ err }, "Failed to update client");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete("/admin/clientes/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db
      .delete(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete client");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Stamp +/- ────────────────────────────────────────────────────────────────
router.post("/admin/clientes/:id/stamps", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const delta = Math.round(Number(req.body?.delta) || 0);
    if (delta !== 1 && delta !== -1) {
      res.status(400).json({ error: "delta deve ser +1 ou -1" });
      return;
    }

    const [existing] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!existing) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const stamps = Math.max(0, (existing.points || 0) + delta);
    const { publicNotes, meta } = parseClientNotes(existing.notes);
    const nextMeta = appendClientLedger(meta, {
      at: new Date().toISOString(),
      type: "ajuste_selo",
      stampsDelta: delta,
      description: delta > 0 ? "Ajuste manual: +1 selo" : "Ajuste manual: −1 selo",
    });

    const [updated] = await db
      .update(clubeMembersTable)
      .set({
        points: stamps,
        notes: serializeClientNotes(publicNotes, nextMeta),
      })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    res.json({ client: toClientRow(updated!), stamps: updated!.points });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust stamps");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Cashback +/- ─────────────────────────────────────────────────────────────
router.post("/admin/clientes/:id/cashback", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ error: "Informe um valor diferente de zero." });
      return;
    }

    const [existing] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!existing) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const current = parseFloat(String(existing.cashbackBalance)) || 0;
    const next = Math.max(0, Math.round((current + amount) * 100) / 100);
    const applied = Math.round((next - current) * 100) / 100;
    const { publicNotes, meta } = parseClientNotes(existing.notes);
    const ledgerType = applied < 0 ? "cashback_utilizado" : "ajuste_cashback";
    const nextMeta = appendClientLedger(meta, {
      at: new Date().toISOString(),
      type: ledgerType,
      cashbackDelta: applied,
      description:
        applied < 0
          ? "Cashback utilizado / debitado"
          : "Ajuste manual de cashback",
    });

    const [updated] = await db
      .update(clubeMembersTable)
      .set({
        cashbackBalance: next.toFixed(2),
        notes: serializeClientNotes(publicNotes, nextMeta),
      })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    res.json({ client: toClientRow(updated!), previous: current, next });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust cashback");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Resgatar recompensa de selos ──────────────────────────────────────────────
router.post("/admin/clientes/:id/rewards/:rewardId/redeem", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const rewardId = String(req.params["rewardId"] || "");
    if (!rewardId) {
      res.status(400).json({ error: "Recompensa inválida." });
      return;
    }

    const [existing] = await db
      .select()
      .from(clubeMembersTable)
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)));
    if (!existing) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const { publicNotes, meta } = parseClientNotes(existing.notes);
    const redeemed = redeemAvailableReward(meta, rewardId);
    if (!redeemed) {
      const rewards = meta.availableRewards ?? [];
      const found = rewards.find((r) => r.id === rewardId);
      if (!found) {
        res.status(404).json({ error: "Recompensa não encontrada." });
        return;
      }
      res.status(409).json({ error: "Esta recompensa já foi resgatada." });
      return;
    }

    const [updated] = await db
      .update(clubeMembersTable)
      .set({ notes: serializeClientNotes(publicNotes, redeemed.meta) })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    res.json({
      ok: true,
      client: toClientRow(updated!),
      reward: redeemed.reward,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to redeem reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
