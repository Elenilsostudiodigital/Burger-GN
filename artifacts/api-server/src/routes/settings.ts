import { Router } from "express";
import { db } from "@workspace/db";
import { paymentSettingsTable, externalLinksTable, whatsappSettingsTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { decodePixSettings, decodeGatewayConfig, encodePixSettings } from "../lib/staticPix";
import {
  decodePlatformExtras,
  patchPlatformExtras,
  evaluateStoreOpen,
  type StoreHoursConfig,
  type BannerItem,
  type PrintPrefs,
  type ClubeProgramExtras,
} from "../lib/platformExtras";

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
    const storeCfg = decodeGatewayConfig(settings.gatewayProvider);
    const pixCfg = decodePixSettings(settings.gatewayProvider);
    res.json({
      onlinePaymentEnabled: false, // Mercado Pago reserved for future — static Pix is active
      cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
      pixConfigured: !!pixCfg?.key,
      pixKeyPreview: pixCfg?.key ? maskPixKey(pixCfg.key) : "",
      mercadoPagoReady: mercadoPagoConfigured,
      prepTimeMin: storeCfg.prepTimeMin,
      prepTimeMax: storeCfg.prepTimeMax,
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
  const storeCfg = decodeGatewayConfig(settings.gatewayProvider);
  const pixCfg = decodePixSettings(settings.gatewayProvider);
  return {
    ...rest,
    mercadoPagoConfigured: !!mercadoPagoAccessToken,
    mercadoPagoAccessTokenPreview: maskToken(mercadoPagoAccessToken),
    mercadoPagoPublicKey: mercadoPagoPublicKey ?? "",
    pixKey: pixCfg?.key ?? storeCfg.key ?? "",
    pixMerchantName: storeCfg.name ?? "THE BURGER GN",
    pixMerchantCity: storeCfg.city ?? "LAURO DE FREITAS",
    pixConfigured: !!pixCfg?.key,
    prepTimeMin: storeCfg.prepTimeMin,
    prepTimeMax: storeCfg.prepTimeMax,
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
      prepTimeMin?: number; prepTimeMax?: number;
    };
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const existingCfg = decodeGatewayConfig(settings.gatewayProvider);
    const patch: Record<string, unknown> = {
      // Keep MP toggle stored, but storefront uses static Pix until MP is intentionally enabled later.
      onlinePaymentEnabled: body.onlinePaymentEnabled,
      cashOnDeliveryEnabled: body.cashOnDeliveryEnabled,
      updatedAt: new Date(),
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    if (
      body.pixKey !== undefined ||
      body.pixMerchantName !== undefined ||
      body.pixMerchantCity !== undefined ||
      body.prepTimeMin !== undefined ||
      body.prepTimeMax !== undefined
    ) {
      patch["gatewayProvider"] = encodePixSettings(
        body.pixKey !== undefined ? body.pixKey.trim() : existingCfg.key,
        body.pixMerchantName ?? existingCfg.name,
        body.pixMerchantCity ?? existingCfg.city,
        body.prepTimeMin ?? existingCfg.prepTimeMin,
        body.prepTimeMax ?? existingCfg.prepTimeMax,
        settings.gatewayProvider,
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

// ── Platform extras (store hours / banners / print / clube program) ───────────
// Stored inside payment_settings.gatewayProvider.platform — no schema changes.

async function savePlatformPatch(
  companyId: number,
  patch: Parameters<typeof patchPlatformExtras>[1],
) {
  const settings = await getOrCreatePaymentSettings(companyId);
  const next = patchPlatformExtras(settings.gatewayProvider, patch);
  const [updated] = await db
    .update(paymentSettingsTable)
    .set({ gatewayProvider: next, updatedAt: new Date() })
    .where(and(eq(paymentSettingsTable.id, settings.id), eq(paymentSettingsTable.companyId, companyId)))
    .returning();
  return decodePlatformExtras(updated.gatewayProvider);
}

router.get("/store-hours", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    const status = evaluateStoreOpen(extras.storeHours);
    res.json({
      ...extras.storeHours,
      isOpen: status.isOpen,
      statusReason: status.reason,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get store hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/store-hours", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    const status = evaluateStoreOpen(extras.storeHours);
    res.json({
      ...extras.storeHours,
      isOpen: status.isOpen,
      statusReason: status.reason,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get admin store hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/store-hours", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as Partial<StoreHoursConfig>;
    const extras = await savePlatformPatch(req.companyId!, {
      storeHours: {
        openTime: body.openTime ?? "18:00",
        closeTime: body.closeTime ?? "23:30",
        days: Array.isArray(body.days) ? body.days : [0, 1, 2, 3, 4, 5, 6],
        forceClosed: Boolean(body.forceClosed),
        forceOpen: Boolean(body.forceOpen),
      },
    });
    const status = evaluateStoreOpen(extras.storeHours);
    res.json({
      ...extras.storeHours,
      isOpen: status.isOpen,
      statusReason: status.reason,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update store hours");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/banners", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    res.json(extras.banners.filter((b) => b.active).sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to get banners");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/banners", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    res.json(extras.banners.sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to get admin banners");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/banners", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as { banners?: BannerItem[] };
    if (!Array.isArray(body.banners)) {
      res.status(400).json({ error: "banners array is required" });
      return;
    }
    const extras = await savePlatformPatch(req.companyId!, { banners: body.banners });
    res.json(extras.banners.sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to update banners");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/print-prefs", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    res.json(extras.printPrefs);
  } catch (err) {
    req.log.error({ err }, "Failed to get print prefs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/print-prefs", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as Partial<PrintPrefs>;
    const extras = await savePlatformPatch(req.companyId!, {
      printPrefs: {
        autoPrintOnAccept: Boolean(body.autoPrintOnAccept),
        autoPrintOnPaid: Boolean(body.autoPrintOnPaid),
        autoPrintOnDone: Boolean(body.autoPrintOnDone),
        connectionType: body.connectionType ?? "usb",
        selectedPrinterId: body.selectedPrinterId ?? "",
        selectedPrinterName: body.selectedPrinterName ?? "",
        networkAddress: body.networkAddress ?? "",
      },
    });
    res.json(extras.printPrefs);
  } catch (err) {
    req.log.error({ err }, "Failed to update print prefs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clube-program", resolvePublicCompany, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    res.json(extras.clubeProgram);
  } catch (err) {
    req.log.error({ err }, "Failed to get clube program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/clube-program", requireCompanyAuth, async (req, res) => {
  try {
    const settings = await getOrCreatePaymentSettings(req.companyId!);
    const extras = decodePlatformExtras(settings.gatewayProvider);
    res.json(extras.clubeProgram);
  } catch (err) {
    req.log.error({ err }, "Failed to get admin clube program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/clube-program", requireCompanyAuth, async (req, res) => {
  try {
    const body = req.body as Partial<ClubeProgramExtras>;
    const extras = await savePlatformPatch(req.companyId!, {
      clubeProgram: {
        cashbackEnabled: body.cashbackEnabled !== false,
        fidelityEnabled: body.fidelityEnabled !== false,
        stampsRequired: Number(body.stampsRequired) || 10,
        stampRewardTitle: body.stampRewardTitle ?? "Hambúrguer grátis",
        stampRewardDescription: body.stampRewardDescription ?? "",
      },
    });
    res.json(extras.clubeProgram);
  } catch (err) {
    req.log.error({ err }, "Failed to update clube program");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
