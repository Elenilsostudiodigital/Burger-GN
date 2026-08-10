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

export interface ClientMeta {
  origin: ClientOrigin;
}

const META_RE = /<!--BGN_CLIENT:([\s\S]*?):BGN_CLIENT-->/;

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

export function parseClientNotes(notes: string | null | undefined): {
  publicNotes: string;
  meta: ClientMeta;
} {
  const raw = notes ?? "";
  const match = raw.match(META_RE);
  if (!match) {
    return { publicNotes: raw.trim(), meta: { origin: "pedido" } };
  }
  let origin: ClientOrigin = "pedido";
  try {
    const parsed = JSON.parse(match[1] || "{}") as { origin?: unknown };
    origin = resolveOrigin(parsed.origin);
  } catch {
    /* keep default */
  }
  return {
    publicNotes: raw.replace(META_RE, "").trim(),
    meta: { origin },
  };
}

export function serializeClientNotes(publicNotes: string, meta: ClientMeta): string {
  const origin = resolveOrigin(meta.origin);
  const body = (publicNotes || "").trim();
  const tag = `<!--BGN_CLIENT:${JSON.stringify({ origin })}:BGN_CLIENT-->`;
  return body ? `${body}\n\n${tag}` : tag;
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
