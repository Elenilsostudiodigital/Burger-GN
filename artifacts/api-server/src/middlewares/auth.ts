import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const signed = (req as { signedCookies?: Record<string, string> }).signedCookies;
  if (signed?.["admin_session"] === "true") {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}
