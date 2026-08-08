import { Router } from "express";
import { db } from "@workspace/db";
import { clubeMembersTable, paymentSettingsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import {
  CLIENT_ORIGIN_LABELS,
  isClientOrigin,
  normalizeClientPhone,
  phonesMatch,
  parseClientNotes,
  serializeClientNotes,
  type ClientOrigin,
} from "../lib/clientMeta";
import { toClientRow } from "../lib/clubeClientSync";
import { decodePlatformExtras } from "../lib/platformExtras";

const router = Router();

async function getStampsRequired(companyId: number): Promise<number> {
  try {
    const [settings] = await db
      .select()
      .from(paymentSettingsTable)
      .where(eq(paymentSettingsTable.companyId, companyId));
    const extras = decodePlatformExtras(settings?.gatewayProvider);
    return extras.clubeProgram.stampsRequired || 10;
  } catch {
    return 10;
  }
}

async function listCompanyMembers(companyId: number) {
  return db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, companyId))
    .orderBy(desc(clubeMembersTable.joinedAt));
}

// ── List + search ────────────────────────────────────────────────────────────
router.get("/admin/clientes", requireCompanyAuth, async (req, res) => {
  try {
    const q = String(req.query["q"] || "").trim().toLowerCase();
    const originFilter = String(req.query["origin"] || "").trim();
    const members = await listCompanyMembers(req.companyId!);
    let rows = members.map(toClientRow);

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
        const originHit = CLIENT_ORIGIN_LABELS[r.origin].toLowerCase().includes(q)
          || r.origin.toLowerCase().includes(q);
        return nameHit || phoneHit || originHit;
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

router.get("/admin/clientes/origins", requireCompanyAuth, async (_req, res) => {
  res.json(CLIENT_ORIGIN_LABELS);
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
    };

    const name = (body.name || "").trim();
    const phone = normalizeClientPhone(body.phone || "");
    if (!name) {
      res.status(400).json({ error: "Nome completo é obrigatório." });
      return;
    }
    if (!phone || phone.length < 10) {
      res.status(400).json({ error: "WhatsApp inválido. Use DDI+DDD+número." });
      return;
    }

    const origin: ClientOrigin = isClientOrigin(body.origin) ? body.origin : "manual";
    const stamps = Math.max(0, Math.min(500, Math.round(Number(body.stamps) || 0)));
    const cashback = Math.max(0, Number(body.cashbackBalance) || 0);
    const publicNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

    const existing = (await listCompanyMembers(req.companyId!)).find((m) => phonesMatch(m.phone, phone));
    if (existing) {
      res.status(409).json({
        error: "Já existe um cliente com este WhatsApp no Clube Burger GN.",
        client: toClientRow(existing),
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

    res.status(201).json(toClientRow(member));
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
      if (!phone || phone.length < 10) {
        res.status(400).json({ error: "WhatsApp inválido." });
        return;
      }
      const dup = (await listCompanyMembers(req.companyId!)).find(
        (m) => m.id !== id && phonesMatch(m.phone, phone),
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

    res.json(toClientRow(updated));
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

    const stampsRequired = await getStampsRequired(req.companyId!);
    let stamps = (existing.points || 0) + delta;
    let rewardUnlocked = false;
    const { publicNotes, meta } = parseClientNotes(existing.notes);
    let nextPublic = publicNotes;

    if (stamps < 0) stamps = 0;

    if (delta > 0 && stamps >= stampsRequired) {
      rewardUnlocked = true;
      stamps = 0;
      const stamp = new Date().toISOString();
      nextPublic = `${nextPublic}${nextPublic ? "\n" : ""}[RECOMPENSA ${stamp}] Selos completos — recompensa liberada.`;
    }

    const [updated] = await db
      .update(clubeMembersTable)
      .set({ points: stamps, notes: serializeClientNotes(nextPublic, meta) })
      .where(and(eq(clubeMembersTable.id, id), eq(clubeMembersTable.companyId, req.companyId!)))
      .returning();

    res.json({ client: toClientRow(updated), rewardUnlocked, stampsRequired });
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

    res.json({ client: toClientRow(updated), previous: current, next });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust cashback");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
