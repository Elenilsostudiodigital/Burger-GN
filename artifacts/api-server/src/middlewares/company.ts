import { Request, Response, NextFunction } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Resolves the target company for public (unauthenticated) storefront routes.
 * The frontend passes `?company=<slug>` for `/loja/:slug/...` storefronts;
 * when omitted, requests fall back to the default storefront (root Burger GN URLs).
 * Sets `req.companyId` so downstream handlers can share the same field as
 * `requireCompanyAuth` (admin) routes.
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
    if (company.status === "blocked") {
      res.status(403).json({ error: "Esta loja está temporariamente indisponível" });
      return;
    }

    req.companyId = company.id;
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to resolve public company");
    res.status(500).json({ error: "Internal server error" });
  }
}
