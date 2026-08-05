import { Router } from "express";
import { db } from "@workspace/db";
import { paymentSettingsTable, externalLinksTable, whatsappSettingsTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { decodePixSettings, encodePixSettings } from "../lib/staticPix";

const router = Router();
const DEFAULT_WHATSAPP_NUMBER = "5571996981707";

function maskToken(token: string | null): string {
  if (!token) return "";
  if (token.length <= 4) return "••••";
  return `••••${token.slice(-4)}`;
}

function maskPixKey(key: string): string {
  if (!key) return "";
  if (key.length <= 6) return "••••••";
  return `${key.slice(0, 3)}•••${key.slice(-3)}`;
}

async function getOrCreatePaymentSettings(companyId: number) {
  const [existing] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.companyId, companyId));
  if (existing) return existing;
  const [created] = await db.insert(paymentSettingsTable).values({ companyId }).returning();
  return created;
}

async function getOrCreateWhatsappSettings(companyId: number) {
  const [existing] = await db.select().from(whatsappSettingsTable).where(eq(whatsappSettingsTable.companyId, companyId));
  if (existing) return existing;
  const [created] = await db.insert(whatsappSettingsTable).values({ companyId, number: DEFAULT_WHATSAPP_NUMBER }).returning();
  return created;
}

// ── Public ────────────────────────────────────────────────────────────────────

router.get("/payment-settings", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const mercadoPagoConfigured = !!settings.mercadoPagoAccessToken;
    const pixCfg = decodePixSettings(settings.gatewayProvider);
    res.json({
      onlinePaymentEnabled: false, // Mercado Pago reserved for future — static Pix is active
      cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
      pixConfigured: !!pixCfg?.key,
      pixKeyPreview: pixCfg?.key ? maskPixKey(pixCfg.key) : "",
      mercadoPagoReady: mercadoPagoConfigured,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/whatsapp-settings", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreateWhatsappSettings(req.companyId!);
    res.json({ number: settings.number || DEFAULT_WHATSAPP_NUMBER });
  } catch (err) {
    req.log.error({ err }, "Failed to get whatsapp settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/external-links", resolvePublicCompany, async (req, res) => {
  try {
    const links = await db
      .select()
      .from(externalLinksTable)
      .where(and(eq(externalLinksTable.companyId, req.companyId!), eq(externalLinksTable.active, true)))
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
  const pixCfg = decodePixSettings(settings.gatewayProvider);
  return {
    ...rest,
    mercadoPagoConfigured: !!mercadoPagoAccessToken,
    mercadoPagoAccessTokenPreview: maskToken(mercadoPagoAccessToken),
    mercadoPagoPublicKey: mercadoPagoPublicKey ?? "",
    pixKey: pixCfg?.key ?? "",
    pixMerchantName: pixCfg?.name ?? "THE BURGER GN",
    pixMerchantCity: pixCfg?.city ?? "LAURO DE FREITAS",
    pixConfigured: !!pixCfg?.key,
  };
}

router.get("/admin/payment-settings", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    res.json(toAdminPaymentSettings(settings));
  } catch (err) {
    req.log.error({ err }, "Failed to get admin payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/payment-settings", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as {
      onlinePaymentEnabled?: boolean; gatewayProvider?: string; cashOnDeliveryEnabled?: boolean;
      mercadoPagoAccessToken?: string; mercadoPagoPublicKey?: string; clearMercadoPagoCredentials?: boolean;
      pixKey?: string; pixMerchantName?: string; pixMerchantCity?: string;
    };
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const patch: Record<string, unknown> = {
      // Keep MP toggle stored, but storefront uses static Pix until MP is intentionally enabled later.
      onlinePaymentEnabled: body.onlinePaymentEnabled,
      cashOnDeliveryEnabled: body.cashOnDeliveryEnabled,
      updatedAt: new Date(),
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    if (body.pixKey !== undefined) {
      const existingPix = decodePixSettings(settings.gatewayProvider);
      patch["gatewayProvider"] = encodePixSettings(
        body.pixKey.trim(),
        body.pixMerchantName ?? existingPix?.name ?? "THE BURGER GN",
        body.pixMerchantCity ?? existingPix?.city ?? "LAURO DE FREITAS",
      );
    } else if (body.gatewayProvider !== undefined) {
      patch["gatewayProvider"] = body.gatewayProvider;
    }

    if (body.clearMercadoPagoCredentials) {
      patch["mercadoPagoAccessToken"] = null;
      patch["mercadoPagoPublicKey"] = null;
    } else {
      if (body.mercadoPagoAccessToken) patch["mercadoPagoAccessToken"] = body.mercadoPagoAccessToken.trim();
      if (body.mercadoPagoPublicKey !== undefined) patch["mercadoPagoPublicKey"] = body.mercadoPagoPublicKey.trim();
    }

    const [updated] = await db.update(paymentSettingsTable)
      .set(patch)
      .where(and(eq(paymentSettingsTable.id, settings.id), eq(paymentSettingsTable.companyId, req.companyId!)))
      .returning();
    res.json(toAdminPaymentSettings(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update payment settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: WhatsApp settings ──────────────────────────────────────────────────

router.get("/admin/whatsapp-settings", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreateWhatsappSettings(req.companyId!);
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to get admin whatsapp settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/whatsapp-settings", requireCompanyAuth, async (req, res) => {
  try {
    const { number } = req.body as { number?: string };
    const digits = (number ?? "").replace(/\D/g, "");
    if (!digits || digits.length < 10 || digits.length > 15) {
      res.status(400).json({ error: "Número de WhatsApp inválido. Use o formato com DDI+DDD, ex: 5571999998888." });
      return;
    }
    const settings = await getOrCreateWhatsappSettings(req.companyId!);
    const [updated] = await db.update(whatsappSettingsTable)
      .set({ number: digits, updatedAt: new Date() })
      .where(and(eq(whatsappSettingsTable.id, settings.id), eq(whatsappSettingsTable.companyId, req.companyId!)))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update whatsapp settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: external links ────────────────────────────────────────────────────

router.get("/admin/external-links", requireCompanyAuth, async (req, res) => {
  try {
    const links = await db.select().from(externalLinksTable)
      .where(eq(externalLinksTable.companyId, req.companyId!))
      .orderBy(asc(externalLinksTable.displayOrder));
    res.json(links);
  } catch (err) {
    req.log.error({ err }, "Failed to list admin external links");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/external-links", requireCompanyAuth, async (req, res) => {
  try {
    const { label, url, active, displayOrder } = req.body as { label: string; url: string; active?: boolean; displayOrder?: number };
    if (!label || !url) { res.status(400).json({ error: "label and url are required" }); return; }
    const [link] = await db.insert(externalLinksTable).values({
      companyId: req.companyId!,
      label: label.trim(), url: url.trim(), active: active ?? true, displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(link);
  } catch (err) {
    req.log.error({ err }, "Failed to create external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/external-links/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { label, url, active, displayOrder } = req.body as { label?: string; url?: string; active?: boolean; displayOrder?: number };
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch["label"] = label.trim();
    if (url !== undefined) patch["url"] = url.trim();
    if (active !== undefined) patch["active"] = active;
    if (displayOrder !== undefined) patch["displayOrder"] = displayOrder;
    const [link] = await db.update(externalLinksTable).set(patch)
      .where(and(eq(externalLinksTable.id, id), eq(externalLinksTable.companyId, req.companyId!)))
      .returning();
    if (!link) { res.status(404).json({ error: "Not found" }); return; }
    res.json(link);
  } catch (err) {
    req.log.error({ err }, "Failed to update external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/external-links/:id", requireCompanyAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    await db.delete(externalLinksTable).where(and(eq(externalLinksTable.id, id), eq(externalLinksTable.companyId, req.companyId!)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete external link");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
