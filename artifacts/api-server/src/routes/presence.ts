import { Router } from "express";
import { pool } from "@workspace/db";
import { requireCompanyAuth } from "../middlewares/auth";
import { resolvePublicCompany } from "../middlewares/company";
import { ensureMenuPresenceSchema } from "../lib/ensureMenuPresenceSchema";
import { broadcastSSE } from "../lib/sse";

const router = Router();

/** Sessions idle longer than this are treated as offline. */
const TTL_MS = 3 * 60 * 1000;
const STATUSES = new Set(["browsing", "cart", "checkout"]);

function normalizeStatus(raw: unknown): "browsing" | "cart" | "checkout" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (STATUSES.has(s)) return s as "browsing" | "cart" | "checkout";
  return "browsing";
}

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 80);
}

function cleanPhone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(0, 15);
}

async function purgeStale(companyId: number) {
  const cutoff = new Date(Date.now() - TTL_MS);
  await pool.query(
    `DELETE FROM menu_presence_sessions
     WHERE company_id = $1 AND last_seen_at < $2`,
    [companyId, cutoff],
  );
}

async function loadPresenceSnapshot(companyId: number) {
  await purgeStale(companyId);

  const { rows } = await pool.query(
    `SELECT session_id, status, customer_name, customer_phone, cart_items,
            entered_at, last_seen_at, checkout_started_at
     FROM menu_presence_sessions
     WHERE company_id = $1
     ORDER BY last_seen_at DESC
     LIMIT 100`,
    [companyId],
  );

  const now = Date.now();
  const sessions = rows.map((r) => {
    const enteredAt = new Date(r.entered_at).toISOString();
    const lastSeenAt = new Date(r.last_seen_at).toISOString();
    const browsingMs = Math.max(0, now - new Date(r.entered_at).getTime());
    const name = String(r.customer_name || "").trim();
    const phone = String(r.customer_phone || "").trim();
    return {
      sessionId: r.session_id as string,
      status: r.status as string,
      displayName: name || "Cliente Anônimo",
      phone: phone || null,
      cartItems: Number(r.cart_items) || 0,
      enteredAt,
      lastSeenAt,
      browsingSeconds: Math.floor(browsingMs / 1000),
      checkoutStartedAt: r.checkout_started_at
        ? new Date(r.checkout_started_at).toISOString()
        : null,
    };
  });

  const summary = {
    online: sessions.length,
    cart: sessions.filter((s) => s.status === "cart").length,
    checkout: sessions.filter((s) => s.status === "checkout").length,
    browsing: sessions.filter((s) => s.status === "browsing").length,
  };

  return { summary, sessions, ttlSeconds: Math.floor(TTL_MS / 1000) };
}

async function broadcastPresenceIfAdminListening(companyId: number) {
  try {
    broadcastSSE(companyId, "presence_update", await loadPresenceSnapshot(companyId));
  } catch {
    /* Pedidos bar falls back to a slow poll */
  }
}

router.post("/presence/heartbeat", resolvePublicCompany, async (req, res) => {
  try {
    await ensureMenuPresenceSchema();
    const companyId = req.companyId!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 64) : "";
    if (!sessionId || sessionId.length < 8) {
      res.status(400).json({ error: "sessionId inválido" });
      return;
    }

    const status = normalizeStatus(body.status);
    const name = cleanName(body.name);
    const phone = cleanPhone(body.phone);
    const cartItems = Math.max(0, Math.min(99, Number(body.cartItems) || 0));
    const now = new Date();

    // Lightweight: purge only this company on write path.
    await purgeStale(companyId);

    const existing = await pool.query(
      `SELECT status, cart_items, checkout_started_at FROM menu_presence_sessions
       WHERE session_id = $1 AND company_id = $2`,
      [sessionId, companyId],
    );

    let checkoutStartedAt: Date | null = existing.rows[0]?.checkout_started_at ?? null;
    if (status === "checkout" && !checkoutStartedAt) {
      checkoutStartedAt = now;
    }
    if (status !== "checkout") {
      checkoutStartedAt = null;
    }

    if (existing.rowCount) {
      await pool.query(
        `UPDATE menu_presence_sessions SET
           status = $1,
           customer_name = CASE WHEN $2 <> '' THEN $2 ELSE customer_name END,
           customer_phone = CASE WHEN $3 <> '' THEN $3 ELSE customer_phone END,
           cart_items = $4,
           last_seen_at = $5,
           checkout_started_at = $6
         WHERE session_id = $7 AND company_id = $8`,
        [status, name, phone, cartItems, now, checkoutStartedAt, sessionId, companyId],
      );
    } else {
      await pool.query(
        `INSERT INTO menu_presence_sessions
           (session_id, company_id, status, customer_name, customer_phone, cart_items, entered_at, last_seen_at, checkout_started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)`,
        [sessionId, companyId, status, name, phone, cartItems, now, checkoutStartedAt],
      );
    }

    const prevStatus = existing.rows[0]?.status as string | undefined;
    const prevCart = Number(existing.rows[0]?.cart_items) || 0;
    const isNew = !existing.rowCount;
    const meaningfulChange = isNew || prevStatus !== status || prevCart !== cartItems;

    res.json({ ok: true });
    if (meaningfulChange) void broadcastPresenceIfAdminListening(companyId);
  } catch (err) {
    req.log.error({ err }, "presence heartbeat failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/presence/leave", resolvePublicCompany, async (req, res) => {
  try {
    await ensureMenuPresenceSchema();
    const companyId = req.companyId!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 64) : "";
    if (!sessionId) {
      res.status(400).json({ error: "sessionId inválido" });
      return;
    }
    await pool.query(
      `DELETE FROM menu_presence_sessions WHERE session_id = $1 AND company_id = $2`,
      [sessionId, companyId],
    );
    res.json({ ok: true });
    void broadcastPresenceIfAdminListening(companyId);
  } catch (err) {
    req.log.error({ err }, "presence leave failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/presence", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMenuPresenceSchema();
    res.json(await loadPresenceSnapshot(req.companyId!));
  } catch (err) {
    req.log.error({ err }, "admin presence failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
