import { db, deliveryAnalysisRequestsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export const DELIVERY_ANALYSIS_STATUSES = ["pending", "approved", "rejected"] as const;
export type DeliveryAnalysisStatus = (typeof DELIVERY_ANALYSIS_STATUSES)[number];

export type DeliveryAnalysisRow = typeof deliveryAnalysisRequestsTable.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCheckoutAnalysisToken(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export function serializeDeliveryAnalysis(row: DeliveryAnalysisRow) {
  const fee = row.deliveryFee != null ? parseFloat(String(row.deliveryFee)) : 0;
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    trackingId: row.trackingId,
    source: row.source === "checkout" ? "checkout" : "order",
    customerName: row.customerName,
    phone: row.phone,
    address: row.address,
    addressNumber: row.addressNumber,
    neighborhood: row.neighborhood,
    city: row.city || "",
    complement: row.complement || "",
    reference: row.reference || "",
    lat: row.lat != null ? parseFloat(String(row.lat)) : null,
    lng: row.lng != null ? parseFloat(String(row.lng)) : null,
    deliveryFee: Number.isFinite(fee) ? fee.toFixed(2) : "0.00",
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

export async function loadApprovedCheckoutAnalysis(companyId: number, token: string) {
  if (!isCheckoutAnalysisToken(token)) return null;
  const [row] = await db
    .select()
    .from(deliveryAnalysisRequestsTable)
    .where(
      and(
        eq(deliveryAnalysisRequestsTable.companyId, companyId),
        eq(deliveryAnalysisRequestsTable.trackingId, token.trim()),
        eq(deliveryAnalysisRequestsTable.status, "approved"),
      ),
    )
    .orderBy(desc(deliveryAnalysisRequestsTable.reviewedAt), desc(deliveryAnalysisRequestsTable.id))
    .limit(1);
  return row ?? null;
}

export function isUniquePendingViolation(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    code === "23505" ||
    /delivery_analysis_requests_one_pending_per_order/i.test(msg) ||
    /delivery_analysis_requests_one_pending_per_tracking/i.test(msg)
  );
}
