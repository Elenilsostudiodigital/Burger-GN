/**
 * Client/club member metadata embedded in `clube_members.notes`
 * — no database schema changes required.
 */

export type ClientOrigin = "manual" | "sistema_burger_gn" | "importado";

export interface ClientMeta {
  origin: ClientOrigin;
}

const META_RE = /<!--BGN_CLIENT:([\s\S]*?):BGN_CLIENT-->/;

export const CLIENT_ORIGIN_LABELS: Record<ClientOrigin, string> = {
  manual: "Manual",
  sistema_burger_gn: "Sistema Burger GN",
  importado: "Importado",
};

export function isClientOrigin(value: unknown): value is ClientOrigin {
  return value === "manual" || value === "sistema_burger_gn" || value === "importado";
}

export function parseClientNotes(notes: string | null | undefined): {
  publicNotes: string;
  meta: ClientMeta;
} {
  const raw = notes ?? "";
  const match = raw.match(META_RE);
  if (!match) {
    return { publicNotes: raw.trim(), meta: { origin: "sistema_burger_gn" } };
  }
  let origin: ClientOrigin = "sistema_burger_gn";
  try {
    const parsed = JSON.parse(match[1] || "{}") as { origin?: unknown };
    if (isClientOrigin(parsed.origin)) origin = parsed.origin;
  } catch {
    /* keep default */
  }
  return {
    publicNotes: raw.replace(META_RE, "").trim(),
    meta: { origin },
  };
}

export function serializeClientNotes(publicNotes: string, meta: ClientMeta): string {
  const origin = isClientOrigin(meta.origin) ? meta.origin : "sistema_burger_gn";
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

/** Compare two phones by normalized digits (last 10–11 national digits). */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizeClientPhone(a);
  const nb = normalizeClientPhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tail = (p: string) => (p.length > 11 ? p.slice(-11) : p);
  return tail(na) === tail(nb);
}
