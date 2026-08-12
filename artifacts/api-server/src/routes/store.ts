import { Router } from "express";
import { db, storeSettingsTable, companiesTable, whatsappSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { ensureStoreSettingsSchema } from "../lib/ensureStoreSettingsSchema";
import {
  DayHours,
  defaultOpeningHours,
  parseOpeningHours,
  resolveStoreOpenState,
  serializeOpeningHours,
} from "../lib/storeHours";

const router = Router();

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const MAX_IMAGE_CHARS = 900_000; // ~675KB binary

async function getOrCreateStoreSettings(companyId: number) {
  const [existing] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.companyId, companyId));
  if (existing) return existing;

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

  const [wa] = await db
    .select()
    .from(whatsappSettingsTable)
    .where(eq(whatsappSettingsTable.companyId, companyId));

  const [created] = await db
    .insert(storeSettingsTable)
    .values({
      companyId,
      openingHours: serializeOpeningHours(defaultOpeningHours()),
      manualOpen: true,
      useAutomaticSchedule: false,
      logoUrl: company?.logoUrl ?? "",
      storeName: company?.name ?? "The Burger GN",
      whatsapp: wa?.number ?? "",
      phone: wa?.number ?? "",
    })
    .returning();
  return created;
}

function toAdminDto(row: typeof storeSettingsTable.$inferSelect) {
  const openingHours = parseOpeningHours(row.openingHours);
  const openState = resolveStoreOpenState({
    manualOpen: row.manualOpen,
    useAutomaticSchedule: row.useAutomaticSchedule,
    openingHours,
  });
  return {
    id: row.id,
    companyId: row.companyId,
    openingHours,
    manualOpen: row.manualOpen,
    useAutomaticSchedule: row.useAutomaticSchedule,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    storeName: row.storeName,
    description: row.description,
    phone: row.phone,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    updatedAt: row.updatedAt,
    isOpen: openState.isOpen,
    closedReason: openState.closedReason,
    nextOpenTime: openState.nextOpenTime,
    statusMessage: openState.statusMessage,
  };
}

function toPublicDto(row: typeof storeSettingsTable.$inferSelect) {
  const openingHours = parseOpeningHours(row.openingHours);
  const openState = resolveStoreOpenState({
    manualOpen: row.manualOpen,
    useAutomaticSchedule: row.useAutomaticSchedule,
    openingHours,
  });
  return {
    storeName: row.storeName,
    description: row.description,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    phone: row.phone,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    openingHours,
    useAutomaticSchedule: row.useAutomaticSchedule,
    isOpen: openState.isOpen,
    closedReason: openState.closedReason,
    nextOpenTime: openState.nextOpenTime,
    statusMessage: openState.statusMessage,
    blockOrdersMessage: openState.isOpen
      ? null
      : openState.closedReason === "manual"
        ? "Estabelecimento fechado no momento."
        : openState.statusMessage,
  };
}

function sanitizeImageUrl(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} inválido`);
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    if (trimmed.length > 2048) throw new Error(`${field} URL muito longa`);
    return trimmed;
  }
  if (!IMAGE_DATA_URL_RE.test(trimmed)) {
    throw new Error(`${field} deve ser PNG, JPG ou WEBP`);
  }
  if (trimmed.length > MAX_IMAGE_CHARS) {
    throw new Error(`${field} muito grande. Use uma imagem menor.`);
  }
  return trimmed;
}

// ── Public ────────────────────────────────────────────────────────────────────

router.get("/store-settings", resolvePublicCompany, async (req, res) => {
  try {
    await ensureStoreSettingsSchema();
    const row = await getOrCreateStoreSettings(req.companyId!);
    res.json(toPublicDto(row));
  } catch (err) {
    req.log.error({ err }, "Failed to get public store settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────────

router.get("/admin/store-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureStoreSettingsSchema();
    const row = await getOrCreateStoreSettings(req.companyId!);
    res.json(toAdminDto(row));
  } catch (err) {
    req.log.error({ err }, "Failed to get admin store settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/store-settings", requireCompanyAuth, async (req, res) => {
  try {
    await ensureStoreSettingsSchema();
    const companyId = req.companyId!;
    const existing = await getOrCreateStoreSettings(companyId);
    const body = req.body as Record<string, unknown>;

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.openingHours !== undefined) {
      if (!Array.isArray(body.openingHours)) {
        res.status(400).json({ error: "openingHours inválido" }); return;
      }
      patch.openingHours = serializeOpeningHours(body.openingHours as DayHours[]);
    }
    if (typeof body.manualOpen === "boolean") patch.manualOpen = body.manualOpen;
    if (typeof body.useAutomaticSchedule === "boolean") {
      patch.useAutomaticSchedule = body.useAutomaticSchedule;
    }
    if (typeof body.storeName === "string") {
      patch.storeName = body.storeName.trim().slice(0, 120) || "The Burger GN";
    }
    if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 2000);
    if (typeof body.phone === "string") patch.phone = body.phone.trim().slice(0, 40);
    if (typeof body.whatsapp === "string") patch.whatsapp = body.whatsapp.replace(/\D/g, "").slice(0, 20);
    if (typeof body.instagram === "string") patch.instagram = body.instagram.trim().slice(0, 120);
    if (typeof body.email === "string") patch.email = body.email.trim().slice(0, 160);
    if (typeof body.address === "string") patch.address = body.address.trim().slice(0, 240);
    if (typeof body.city === "string") patch.city = body.city.trim().slice(0, 120);
    if (typeof body.state === "string") patch.state = body.state.trim().slice(0, 2).toUpperCase();
    if (typeof body.zipCode === "string") patch.zipCode = body.zipCode.replace(/\D/g, "").slice(0, 8);

    try {
      if (body.logoUrl !== undefined) patch.logoUrl = sanitizeImageUrl(body.logoUrl, "Logo");
      if (body.bannerUrl !== undefined) patch.bannerUrl = sanitizeImageUrl(body.bannerUrl, "Banner");
    } catch (imgErr) {
      res.status(400).json({ error: imgErr instanceof Error ? imgErr.message : "Imagem inválida" });
      return;
    }

    const [updated] = await db
      .update(storeSettingsTable)
      .set(patch)
      .where(and(eq(storeSettingsTable.id, existing.id), eq(storeSettingsTable.companyId, companyId)))
      .returning();

    // Keep company branding in sync for multi-tenant surfaces.
    const companyPatch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof patch.storeName === "string") companyPatch.name = patch.storeName;
    if (typeof patch.logoUrl === "string") companyPatch.logoUrl = patch.logoUrl;
    if (Object.keys(companyPatch).length > 1) {
      await db.update(companiesTable).set(companyPatch).where(eq(companiesTable.id, companyId));
    }

    // Sync WhatsApp number used elsewhere when provided.
    if (typeof patch.whatsapp === "string" && patch.whatsapp) {
      const [wa] = await db
        .select()
        .from(whatsappSettingsTable)
        .where(eq(whatsappSettingsTable.companyId, companyId));
      if (wa) {
        await db
          .update(whatsappSettingsTable)
          .set({ number: patch.whatsapp as string, updatedAt: new Date() })
          .where(eq(whatsappSettingsTable.id, wa.id));
      } else {
        await db.insert(whatsappSettingsTable).values({
          companyId,
          number: patch.whatsapp as string,
        });
      }
    }

    res.json(toAdminDto(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update store settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Quick open/close — highest priority control. */
router.post("/admin/store-settings/status", requireCompanyAuth, async (req, res) => {
  try {
    await ensureStoreSettingsSchema();
    const companyId = req.companyId!;
    const existing = await getOrCreateStoreSettings(companyId);
    const open = Boolean((req.body as { open?: boolean })?.open);

    const [updated] = await db
      .update(storeSettingsTable)
      .set({ manualOpen: open, updatedAt: new Date() })
      .where(and(eq(storeSettingsTable.id, existing.id), eq(storeSettingsTable.companyId, companyId)))
      .returning();

    res.json(toAdminDto(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update store status");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

/** Used by order create to block when closed. */
export async function assertStoreAcceptsOrders(companyId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureStoreSettingsSchema();
  const row = await getOrCreateStoreSettings(companyId);
  const state = resolveStoreOpenState({
    manualOpen: row.manualOpen,
    useAutomaticSchedule: row.useAutomaticSchedule,
    openingHours: parseOpeningHours(row.openingHours),
  });
  if (state.isOpen) return { ok: true };
  return {
    ok: false,
    error: state.closedReason === "manual"
      ? "Estabelecimento fechado no momento."
      : state.statusMessage || "Estabelecimento fechado no momento.",
  };
}
