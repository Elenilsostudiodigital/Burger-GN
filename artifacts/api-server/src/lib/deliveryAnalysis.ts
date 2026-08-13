import { db, deliveryAnalysisRequestsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export const DELIVERY_ANALYSIS_STATUSES = ["pending", "approved", "rejected"] as const;
export type DeliveryAnalysisStatus = (typeof DELIVERY_ANALYSIS_STATUSES)[number];

export type DeliveryAnalysisRow = typeof deliveryAnalysisRequestsTable.$inferSelect;

export function serializeDeliveryAnalysis(row: DeliveryAnalysisRow) {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    trackingId: row.trackingId,
    customerName: row.customerName,
    phone: row.phone,
    address: row.address,
    addressNumber: row.addressNumber,
    neighborhood: row.neighborhood,
    deliveryFee: row.deliveryFee,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    customerNote: row.customerNote,
    status: row.status as DeliveryAnalysisStatus,
    rejectReason: row.rejectReason || null,
    requestedAt: row.requestedAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadLatestDeliveryAnalysis(orderId: number) {
  const [row] = await db
    .select()
    .from(deliveryAnalysisRequestsTable)
    .where(eq(deliveryAnalysisRequestsTable.orderId, orderId))
    .orderBy(desc(deliveryAnalysisRequestsTable.requestedAt), desc(deliveryAnalysisRequestsTable.id))
    .limit(1);
  return row ?? null;
}

export function isUniquePendingViolation(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return code === "23505" || /delivery_analysis_requests_one_pending_per_order/i.test(msg);
}
