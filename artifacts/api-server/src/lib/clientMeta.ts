/**
 * Client/club member metadata embedded in `clube_members.notes`
 * — no database schema changes required.
 *
 * CRM clients reuse `clube_members` (phone = primary identifier).
 */

export type ClientOrigin =
  | "pedido"
  | "importacao_manual"
  | "cadastro_administrativo"
  | "outro";

/** Recovery attempt — not a WhatsApp delivery receipt (manual open only). */
export interface RecoveryContactRecord {
  at: string;
  message: string;
  couponCode?: string | null;
  result: "contato_iniciado";
}

export interface ClientMeta {
  origin: ClientOrigin;
  lastRecovery?: RecoveryContactRecord;
  /** Newest first; capped on write. */
  recoveryHistory?: RecoveryContactRecord[];
}

const META_RE = /<!--BGN_CLIENT:([\s\S]*?):BGN_CLIENT-->/;
const MAX_RECOVERY_HISTORY = 20;

/** Legacy origins from PR #2 — mapped on read. */
const LEGACY_ORIGIN_MAP: Record<string, ClientOrigin> = {
  manual: "cadastro_administrativo",
  sistema_burger_gn: "pedido",
  importado: "importacao_manual",
  pedido: "pedido",
  importacao_manual: "importacao_manual",
  cadastro_administrativo: "cadastro_administrativo",
  outro: "outro",
};

export const CLIENT_ORIGIN_LABELS: Record<ClientOrigin, string> = {
  pedido: "Pedido",
  importacao_manual: "Importação manual",
  cadastro_administrativo: "Cadastro administrativo",
  outro: "Outro",
};

export function isClientOrigin(value: unknown): value is ClientOrigin {
  return (
    value === "pedido" ||
    value === "importacao_manual" ||
    value === "cadastro_administrativo" ||
    value === "outro"
  );
}

function resolveOrigin(value: unknown): ClientOrigin {
  if (isClientOrigin(value)) return value;
  if (typeof value === "string" && value in LEGACY_ORIGIN_MAP) {
    return LEGACY_ORIGIN_MAP[value]!;
  }
  return "outro";
}

function parseRecoveryRecord(value: unknown): RecoveryContactRecord | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Partial<RecoveryContactRecord>;
  if (typeof o.at !== "string" || !o.at) return null;
  if (typeof o.message !== "string") return null;
  return {
    at: o.at,
    message: o.message,
    couponCode: typeof o.couponCode === "string" && o.couponCode ? o.couponCode : null,
    result: "contato_iniciado",
  };
}

export function parseClientNotes(notes: string | null | undefined): {
  publicNotes: string;
  meta: ClientMeta;
} {
  const raw = notes ?? "";
  const match = raw.match(META_RE);
  if (!match) {
    return { publicNotes: raw.trim(), meta: { origin: "pedido" } };
  }
  const meta: ClientMeta = { origin: "pedido" };
  try {
    const parsed = JSON.parse(match[1] || "{}") as {
      origin?: unknown;
      lastRecovery?: unknown;
      recoveryHistory?: unknown;
    };
    meta.origin = resolveOrigin(parsed.origin);
    const last = parseRecoveryRecord(parsed.lastRecovery);
    if (last) meta.lastRecovery = last;
    if (Array.isArray(parsed.recoveryHistory)) {
      const history = parsed.recoveryHistory
        .map(parseRecoveryRecord)
        .filter((r): r is RecoveryContactRecord => !!r)
        .slice(0, MAX_RECOVERY_HISTORY);
      if (history.length) meta.recoveryHistory = history;
    }
  } catch {
    /* keep default */
  }
  return {
    publicNotes: raw.replace(META_RE, "").trim(),
    meta,
  };
}

export function serializeClientNotes(publicNotes: string, meta: ClientMeta): string {
  const payload: ClientMeta = {
    origin: resolveOrigin(meta.origin),
  };
  if (meta.lastRecovery) {
    payload.lastRecovery = {
      at: meta.lastRecovery.at,
      message: String(meta.lastRecovery.message || "").slice(0, 4000),
      couponCode: meta.lastRecovery.couponCode || null,
      result: "contato_iniciado",
    };
  }
  if (meta.recoveryHistory?.length) {
    payload.recoveryHistory = meta.recoveryHistory.slice(0, MAX_RECOVERY_HISTORY).map((r) => ({
      at: r.at,
      message: String(r.message || "").slice(0, 4000),
      couponCode: r.couponCode || null,
      result: "contato_iniciado" as const,
    }));
  }
  const body = (publicNotes || "").trim();
  const tag = `<!--BGN_CLIENT:${JSON.stringify(payload)}:BGN_CLIENT-->`;
  return body ? `${body}\n\n${tag}` : tag;
}

/** Append a recovery contact attempt (manual WhatsApp open). */
export function appendRecoveryContact(
  meta: ClientMeta,
  record: Omit<RecoveryContactRecord, "result"> & { result?: "contato_iniciado" },
): ClientMeta {
  const entry: RecoveryContactRecord = {
    at: record.at,
    message: String(record.message || "").slice(0, 4000),
    couponCode: record.couponCode || null,
    result: "contato_iniciado",
  };
  const history = [entry, ...(meta.recoveryHistory ?? [])].slice(0, MAX_RECOVERY_HISTORY);
  return {
    ...meta,
    lastRecovery: entry,
    recoveryHistory: history,
  };
}

/** Normalize Brazilian WhatsApp/phone to digits (prefer 55…). */
export function normalizeClientPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Placeholder / local-store phones that must not create CRM clients. */
export function isPlaceholderPhone(phone: string): boolean {
  const n = normalizeClientPhone(phone);
  if (!n || n.length < 10) return true;
  const national = n.startsWith("55") ? n.slice(2) : n;
  if (/^0+$/.test(national)) return true;
  return false;
}

/** Compare two phones by normalized digits (last 10–11 national digits). */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizeClientPhone(a);
  const nb = normalizeClientPhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tail = (p: string) => (p.length > 11 ? p.slice(-11) : p);
  return tail(na) === tail(nb);
}
