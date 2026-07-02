import { Router } from "express";
import { db } from "@workspace/db";
import { paymentSettingsTable, externalLinksTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// Any known payment-gateway secret env vars — presence indicates a gateway is wired up.
const GATEWAY_KEY_ENV_VARS = ["MERCADOPAGO_ACCESS_TOKEN", "STRIPE_SECRET_KEY"];

function isGatewayKeyConfigured(): boolean {
  return GATEWAY_KEY_ENV_VARS.some((key) => !!process.env[key]);
}

async function getOrCreatePaymentSettings() {
  const [existing] = await db.select().from(paymentSettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(paymentSettingsTable).values({}).returning();
  return created;
}

// ── Public ────────────────────────────────────────────────────────────────────

router.get("/payment-settings", async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings();
    const gatewayKeyConfigured = isGatewayKeyConfigured();
    res.json({
      onlinePaymentEnabled: settings.onlinePaymentEnabled && gatewayKeyConfigured,
      cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/external-links", async (req, res) => {
  try {
    const links = await db
      .select()
      .from(externalLinksTable)
      .where(eq(externalLinksTable.active, true))
      .orderBy(asc(externalLinksTable.displayOrder));
    res.json(links);
  } catch (err) {
    req.log.error({ err }, "Failed to list external links");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: payment settings ──────────────────────────────────────────────────

router.get("/admin/payment-settings", requireAdmin, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings();
    res.json({ ...settings, gatewayKeyConfigured: isGatewayKeyConfigured(), gatewayKeyEnvVars: GATEWAY_KEY_ENV_VARS });
  } catch (err) {
    req.log.error({ err }, "Failed to get admin payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/payment-settings", requireAdmin, async (req, res) => {
  try {
    const body = req.body as { onlinePaymentEnabled?: boolean; gatewayProvider?: string; cashOnDeliveryEnabled?: boolean };
    const settings = await getOrCreatePaymentSettings();
    const [updated] = await db.update(paymentSettingsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(paymentSettingsTable.id, settings.id))
      .returning();
    res.json({ ...updated, gatewayKeyConfigured: isGatewayKeyConfigured(), gatewayKeyEnvVars: GATEWAY_KEY_ENV_VARS });
  } catch (err) {
    req.log.error({ err }, "Failed to update payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: external links ────────────────────────────────────────────────────

router.get("/admin/external-links", requireAdmin, async (req, res) => {
  try {
    const links = await db.select().from(externalLinksTable).orderBy(asc(externalLinksTable.displayOrder));
    res.json(links);
  } catch (err) {
    req.log.error({ err }, "Failed to list admin external links");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/external-links", requireAdmin, async (req, res) => {
  try {
    const { label, url, active, displayOrder } = req.body as { label: string; url: string; active?: boolean; displayOrder?: number };
    if (!label || !url) { res.status(400).json({ error: "label and url are required" }); return; }
    const [link] = await db.insert(externalLinksTable).values({
      label: label.trim(), url: url.trim(), active: active ?? true, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(link);
  } catch (err) {
    req.log.error({ err }, "Failed to create external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/external-links/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { label, url, active, displayOrder } = req.body as { label?: string; url?: string; active?: boolean; displayOrder?: number };
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch["label"] = label.trim();
    if (url !== undefined) patch["url"] = url.trim();
    if (active !== undefined) patch["active"] = active;
    if (displayOrder !== undefined) patch["displayOrder"] = displayOrder;
    const [link] = await db.update(externalLinksTable).set(patch).where(eq(externalLinksTable.id, id)).returning();
    if (!link) { res.status(404).json({ error: "Not found" }); return; }
    res.json(link);
  } catch (err) {
    req.log.error({ err }, "Failed to update external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/external-links/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(externalLinksTable).where(eq(externalLinksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
