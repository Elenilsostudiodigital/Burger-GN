import type { Request } from "express";

/** Public origin of this API (used as Mercado Pago notification_url). */
export function publicApiBase(req: Request): string {
  const explicit = process.env["PUBLIC_API_URL"] || process.env["APP_URL"];
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel =
    process.env["VERCEL_PROJECT_PRODUCTION_URL"] || process.env["VERCEL_URL"];
  if (vercel) {
    const host = String(vercel).replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
    req.protocol ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers.host as string | undefined);
  if (host) return `${proto}://${host}`;
  return "";
}

export function mercadoPagoNotificationUrl(req: Request, companySlug: string): string {
  const base = publicApiBase(req);
  if (!base) return "";
  const slug = encodeURIComponent(companySlug);
  return `${base}/api/payments/mercadopago/webhook?company=${slug}`;
}
