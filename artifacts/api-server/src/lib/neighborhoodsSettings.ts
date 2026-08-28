/**
 * Official Bairros master switch.
 * The only writers are: first-time km_delivery_config insert, and
 * PUT /admin/delivery-zones/settings. Seed/migration must never UPDATE this flag.
 */
import { db } from "@workspace/db";
import { kmDeliveryConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureDeliveryAreasSchema } from "./ensureDeliveryAreasSchema";

export async function getNeighborhoodsEnabled(companyId: number): Promise<boolean> {
  await ensureDeliveryAreasSchema();
  const [row] = await db
    .select({ neighborhoodsEnabled: kmDeliveryConfigTable.neighborhoodsEnabled })
    .from(kmDeliveryConfigTable)
    .where(eq(kmDeliveryConfigTable.companyId, companyId))
    .limit(1);
  return Boolean(row?.neighborhoodsEnabled);
}

export async function setNeighborhoodsEnabled(
  companyId: number,
  neighborhoodsEnabled: boolean,
): Promise<boolean> {
  await ensureDeliveryAreasSchema();
  const enabled = Boolean(neighborhoodsEnabled);
  const [existing] = await db
    .select({ id: kmDeliveryConfigTable.id })
    .from(kmDeliveryConfigTable)
    .where(eq(kmDeliveryConfigTable.companyId, companyId))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(kmDeliveryConfigTable)
      .set({ neighborhoodsEnabled: enabled, updatedAt: new Date() })
      .where(eq(kmDeliveryConfigTable.id, existing.id))
      .returning({ neighborhoodsEnabled: kmDeliveryConfigTable.neighborhoodsEnabled });
    return Boolean(updated?.neighborhoodsEnabled);
  }
  const [created] = await db
    .insert(kmDeliveryConfigTable)
    .values({ companyId, neighborhoodsEnabled: enabled })
    .returning({ neighborhoodsEnabled: kmDeliveryConfigTable.neighborhoodsEnabled });
  return Boolean(created?.neighborhoodsEnabled);
}
