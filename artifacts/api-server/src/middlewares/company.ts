import { Request, Response, NextFunction } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Resolves the target company for public (unauthenticated) storefront routes.
 * The frontend passes `?company=<slug>` for `/loja/:slug/...` storefronts;
 * when omitted, requests fall back to the default storefront (root Burger GN URLs).
 * Sets `req.companyId` so downstream handlers can share the same field as
 * `requireCompanyAuth` (admin) routes.
 *
 * IMPORTANT: Catalog routes (/, /cardapio, /clube and their APIs) must never
 * return HTTP 403 just because the company is marked blocked. Blocking only
 * applies to placing new online orders (see POST /orders).
 */
export async function resolvePublicCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = (req.query["company"] as string | undefined)?.trim();

    const [company] = slug
      ? await db.select().from(companiesTable).where(eq(companiesTable.slug, slug))
      : await db.select().from(companiesTable).where(eq(companiesTable.isDefaultStorefront, true));

    if (!company) {
      res.status(404).json({ error: "Loja não encontrada" });
      return;
    }

    req.companyId = company.id;
    req.companySlug = company.slug;
    req.companyBlocked = company.status === "blocked";
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to resolve public company");
    res.status(500).json({ error: "Internal server error" });
  }
}
