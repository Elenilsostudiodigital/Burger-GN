import { Request, Response, NextFunction } from "express";

export interface CompanySessionCookie {
  companyId: number;
  userId: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      companyId?: number;
      companyUserId?: number;
      companySlug?: string;
      /** True when company.status is blocked — catalog stays public; orders must refuse. */
      companyBlocked?: boolean;
    }
  }
}

function parseCompanySession(raw: string | undefined): CompanySessionCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompanySessionCookie>;
    if (typeof parsed.companyId === "number" && typeof parsed.userId === "number") {
      return { companyId: parsed.companyId, userId: parsed.userId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Read company session from signed cookie without failing the request. */
export function tryGetCompanySession(req: Request): CompanySessionCookie | null {
  const signed = (req as unknown as { signedCookies?: Record<string, string> }).signedCookies;
  return parseCompanySession(signed?.["company_session"]);
}

export function requireCompanyAuth(req: Request, res: Response, next: NextFunction) {
  const session = tryGetCompanySession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.companyId = session.companyId;
  req.companyUserId = session.userId;
  next();
}

export function requireMasterAuth(req: Request, res: Response, next: NextFunction) {
  const signed = (req as unknown as { signedCookies?: Record<string, string> }).signedCookies;
  if (signed?.["master_session"] === "true") {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

/** @deprecated kept temporarily for legacy references during the multi-tenant migration */
export const requireAdmin = requireCompanyAuth;
