import { Router } from "express";
import { db } from "@workspace/db";
import { paymentSettingsTable, externalLinksTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

function maskToken(token: string | null): string {
  if (!token) return "";
  if (token.length <= 4) return "••••";
  return `••••${token.slice(-4)}`;
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
    const mercadoPagoConfigured = !!settings.mercadoPagoAccessToken;
    res.json({
      onlinePaymentEnabled: settings.onlinePaymentEnabled && mercadoPagoConfigured,
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

function toAdminPaymentSettings(settings: typeof paymentSettingsTable.$inferSelect) {
  const { mercadoPagoAccessToken, mercadoPagoPublicKey, ...rest } = settings;
  return {
    ...rest,
    mercadoPagoConfigured: !!mercadoPagoAccessToken,
    mercadoPagoAccessTokenPreview: maskToken(mercadoPagoAccessToken),
    mercadoPagoPublicKey: mercadoPagoPublicKey ?? "",
  };
}

router.get("/admin/payment-settings", requireAdmin, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings();
    res.json(toAdminPaymentSettings(settings));
  } catch (err) {
    req.log.error({ err }, "Failed to get admin payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/payment-settings", requireAdmin, async (req, res) => {
  try {
    const body = req.body as {
      onlinePaymentEnabled?: boolean; gatewayProvider?: string; cashOnDeliveryEnabled?: boolean;
      mercadoPagoAccessToken?: string; mercadoPagoPublicKey?: string; clearMercadoPagoCredentials?: boolean;
    };
    const settings = await getOrCreatePaymentSettings();
    const patch: Record<string, unknown> = {
      onlinePaymentEnabled: body.onlinePaymentEnabled,
      gatewayProvider: body.gatewayProvider,
      cashOnDeliveryEnabled: body.cashOnDeliveryEnabled,
      updatedAt: new Date(),
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    if (body.clearMercadoPagoCredentials) {
      patch["mercadoPagoAccessToken"] = null;
      patch["mercadoPagoPublicKey"] = null;
    } else {
      // Only overwrite the access token when a non-empty value is submitted, so the masked
      // preview shown by the admin UI never wipes a previously-saved credential.
      if (body.mercadoPagoAccessToken) patch["mercadoPagoAccessToken"] = body.mercadoPagoAccessToken.trim();
      if (body.mercadoPagoPublicKey !== undefined) patch["mercadoPagoPublicKey"] = body.mercadoPagoPublicKey.trim();
    }

    const [updated] = await db.update(paymentSettingsTable)
      .set(patch)
      .where(eq(paymentSettingsTable.id, settings.id))
      .returning();
    res.json(toAdminPaymentSettings(updated));
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
