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

export function requireCompanyAuth(req: Request, res: Response, next: NextFunction) {
  const signed = (req as unknown as { signedCookies?: Record<string, string> }).signedCookies;
  const session = parseCompanySession(signed?.["company_session"]);
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
