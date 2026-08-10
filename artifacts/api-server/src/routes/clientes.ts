import { Router } from "express";
import { db } from "@workspace/db";
import { clubeMembersTable, ordersTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import {
  CLIENT_ORIGIN_LABELS,
  isClientOrigin,
  isPlaceholderPhone,
  normalizeClientPhone,
  phonesMatch,
  parseClientNotes,
  serializeClientNotes,
  type ClientOrigin,
} from "../lib/clientMeta";
import { toClientRow } from "../lib/clubeClientSync";
import {
  computeClientOrderStats,
  emptyClientOrderStats,
  filterOrdersForClient,
  indexOrdersByPhone,
  ordersForPhone,
  type OrderForStats,
} from "../lib/clientStats";
import { parseOrderNotes } from "../lib/orderMeta";

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
  return {
    ...toClientRow(member),
    orderCount: stats.orderCount,
    totalSpent: stats.totalSpent,
    lastOrderAt: stats.lastOrderAt,
    lastOrderNumber: stats.lastOrderNumber,
    segments: stats.segments,
  };
}

// ── Origins ──────────────────────────────────────────────────────────────────
router.get("/admin/clientes/origins", requireCompanyAuth, (_req, res) => {
  res.json(CLIENT_ORIGIN_LABELS);
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

    res.json({
      client: {
        ...toClientRow(member),
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent,
        lastOrderAt: stats.lastOrderAt,
        lastOrderNumber: stats.lastOrderNumber,
        segments: stats.segments,
      },
      history,
      // Recovery-ready classifications (computed, not persisted).
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
        const [updated] = await db
          .update(clubeMembersTable)
          .set({
            name,
            phone,
            points: stamps,
            cashbackBalance: cashback.toFixed(2),
            notes: serializeClientNotes(publicNotes || current.publicNotes, { origin }),
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

    const patch: Record<string, unknown> = {
      notes: serializeClientNotes(publicNotes, { origin }),
    };
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
      patch["points"] = Math.max(0, Math.min(500, Math.round(Number(body.stamps) || 0)));
    }
    if (body.cashbackBalance !== undefined) {
      const cash = Math.max(0, Number(body.cashbackBalance) || 0);
      patch["cashbackBalance"] = cash.toFixed(2);
    }
    if (body.active !== undefined) patch["active"] = Boolean(body.active);

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

    const [updated] = await db
      .update(clubeMembersTable)
      .set({ points: stamps })
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

    const [updated] = await db
      .update(clubeMembersTable)
      .set({ cashbackBalance: next.toFixed(2) })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    res.json({ client: toClientRow(updated!), previous: current, next });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust cashback");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
