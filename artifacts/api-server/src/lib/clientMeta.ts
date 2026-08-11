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

/** Ledger of fidelity/cashback events for the client profile. */
export type ClientLedgerType =
  | "selo_pedido"
  | "selo_bloqueado"
  | "cashback_pedido"
  | "cashback_utilizado"
  | "ajuste_selo"
  | "ajuste_cashback"
  | "recompensa_disponivel"
  | "recompensa_resgatada";

/** Rolling window between fidelity stamps (ms). */
export const FIDELITY_STAMP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const STAMP_SKIPPED_MESSAGE =
  "🍔 Você já conquistou o selo referente a este período.\n💰 Seu Cashback foi adicionado normalmente.\nSeu próximo selo estará disponível na primeira compra realizada após completar 24 horas.";

export interface ClientLedgerEntry {
  id: string;
  at: string;
  type: ClientLedgerType;
  orderId?: number | null;
  orderNumber?: number | null;
  stampsDelta?: number;
  cashbackDelta?: number;
  description?: string;
  rewardId?: string | null;
  rewardTitle?: string | null;
}

export interface AvailableReward {
  id: string;
  title: string;
  earnedAt: string;
  orderId?: number | null;
  orderNumber?: number | null;
  redeemedAt?: string | null;
}

export interface ClientMeta {
  origin: ClientOrigin;
  lastRecovery?: RecoveryContactRecord;
  /** Newest first; capped on write. */
  recoveryHistory?: RecoveryContactRecord[];
  /** Newest first; capped on write. */
  ledger?: ClientLedgerEntry[];
  /** Rewards earned via stamp card (not yet / already redeemed). */
  availableRewards?: AvailableReward[];
}

const META_RE = /<!--BGN_CLIENT:([\s\S]*?):BGN_CLIENT-->/;
const MAX_RECOVERY_HISTORY = 20;
const MAX_LEDGER = 200;
const MAX_AVAILABLE_REWARDS = 50;

const LEDGER_TYPES = new Set<ClientLedgerType>([
  "selo_pedido",
  "selo_bloqueado",
  "cashback_pedido",
  "cashback_utilizado",
  "ajuste_selo",
  "ajuste_cashback",
  "recompensa_disponivel",
  "recompensa_resgatada",
]);

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

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseLedgerEntry(value: unknown): ClientLedgerEntry | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Partial<ClientLedgerEntry>;
  if (typeof o.at !== "string" || !o.at) return null;
  if (typeof o.type !== "string" || !LEDGER_TYPES.has(o.type as ClientLedgerType)) return null;
  return {
    id: typeof o.id === "string" && o.id ? o.id : newId(),
    at: o.at,
    type: o.type as ClientLedgerType,
    orderId: typeof o.orderId === "number" ? o.orderId : null,
    orderNumber: typeof o.orderNumber === "number" ? o.orderNumber : null,
    stampsDelta: typeof o.stampsDelta === "number" ? o.stampsDelta : undefined,
    cashbackDelta: typeof o.cashbackDelta === "number" ? o.cashbackDelta : undefined,
    description: typeof o.description === "string" ? o.description.slice(0, 500) : undefined,
    rewardId: typeof o.rewardId === "string" ? o.rewardId : null,
    rewardTitle: typeof o.rewardTitle === "string" ? o.rewardTitle : null,
  };
}

function parseAvailableReward(value: unknown): AvailableReward | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Partial<AvailableReward>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.title !== "string" || !o.title) return null;
  if (typeof o.earnedAt !== "string" || !o.earnedAt) return null;
  return {
    id: o.id,
    title: o.title.slice(0, 200),
    earnedAt: o.earnedAt,
    orderId: typeof o.orderId === "number" ? o.orderId : null,
    orderNumber: typeof o.orderNumber === "number" ? o.orderNumber : null,
    redeemedAt: typeof o.redeemedAt === "string" ? o.redeemedAt : null,
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
      ledger?: unknown;
      availableRewards?: unknown;
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
    if (Array.isArray(parsed.ledger)) {
      const ledger = parsed.ledger
        .map(parseLedgerEntry)
        .filter((e): e is ClientLedgerEntry => !!e)
        .slice(0, MAX_LEDGER);
      if (ledger.length) meta.ledger = ledger;
    }
    if (Array.isArray(parsed.availableRewards)) {
      const rewards = parsed.availableRewards
        .map(parseAvailableReward)
        .filter((r): r is AvailableReward => !!r)
        .slice(0, MAX_AVAILABLE_REWARDS);
      if (rewards.length) meta.availableRewards = rewards;
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
  if (meta.ledger?.length) {
    payload.ledger = meta.ledger.slice(0, MAX_LEDGER).map((e) => ({
      id: e.id,
      at: e.at,
      type: e.type,
      orderId: e.orderId ?? null,
      orderNumber: e.orderNumber ?? null,
      stampsDelta: e.stampsDelta,
      cashbackDelta: e.cashbackDelta,
      description: e.description ? String(e.description).slice(0, 500) : undefined,
      rewardId: e.rewardId ?? null,
      rewardTitle: e.rewardTitle ?? null,
    }));
  }
  if (meta.availableRewards?.length) {
    payload.availableRewards = meta.availableRewards.slice(0, MAX_AVAILABLE_REWARDS).map((r) => ({
      id: r.id,
      title: String(r.title).slice(0, 200),
      earnedAt: r.earnedAt,
      orderId: r.orderId ?? null,
      orderNumber: r.orderNumber ?? null,
      redeemedAt: r.redeemedAt ?? null,
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

export function appendClientLedger(
  meta: ClientMeta,
  entry: Omit<ClientLedgerEntry, "id"> & { id?: string },
): ClientMeta {
  const full: ClientLedgerEntry = {
    id: entry.id || newId(),
    at: entry.at || new Date().toISOString(),
    type: entry.type,
    orderId: entry.orderId ?? null,
    orderNumber: entry.orderNumber ?? null,
    stampsDelta: entry.stampsDelta,
    cashbackDelta: entry.cashbackDelta,
    description: entry.description ? String(entry.description).slice(0, 500) : undefined,
    rewardId: entry.rewardId ?? null,
    rewardTitle: entry.rewardTitle ?? null,
  };
  const ledger = [full, ...(meta.ledger ?? [])].slice(0, MAX_LEDGER);
  return { ...meta, ledger };
}

/** Idempotency helper: did this order already generate this ledger type? */
export function hasLedgerForOrder(
  meta: ClientMeta,
  orderId: number,
  type: ClientLedgerType,
): boolean {
  return (meta.ledger ?? []).some((e) => e.orderId === orderId && e.type === type);
}

export function grantAvailableReward(
  meta: ClientMeta,
  reward: Omit<AvailableReward, "id" | "redeemedAt"> & { id?: string },
): { meta: ClientMeta; reward: AvailableReward } {
  const full: AvailableReward = {
    id: reward.id || newId(),
    title: String(reward.title).slice(0, 200),
    earnedAt: reward.earnedAt || new Date().toISOString(),
    orderId: reward.orderId ?? null,
    orderNumber: reward.orderNumber ?? null,
    redeemedAt: null,
  };
  const availableRewards = [full, ...(meta.availableRewards ?? [])].slice(0, MAX_AVAILABLE_REWARDS);
  return { meta: { ...meta, availableRewards }, reward: full };
}

/** Newest `selo_pedido` timestamp in the ledger (ISO), or null. */
export function lastFidelityStampAt(meta: ClientMeta): string | null {
  for (const entry of meta.ledger ?? []) {
    if (entry.type === "selo_pedido" && entry.at) return entry.at;
  }
  return null;
}

/** ISO timestamp when the next stamp becomes available (after 24h), or null if available now. */
export function nextFidelityStampAvailableAt(
  meta: ClientMeta,
  nowMs: number = Date.now(),
): string | null {
  const last = lastFidelityStampAt(meta);
  if (!last) return null;
  const next = new Date(last).getTime() + FIDELITY_STAMP_COOLDOWN_MS;
  if (!Number.isFinite(next)) return null;
  if (nowMs >= next) return null;
  return new Date(next).toISOString();
}

export function canAwardFidelityStamp(
  meta: ClientMeta,
  nowMs: number = Date.now(),
): boolean {
  return nextFidelityStampAvailableAt(meta, nowMs) == null;
}

/** Mark an available reward as redeemed and append ledger entry. */
export function redeemAvailableReward(
  meta: ClientMeta,
  rewardId: string,
  opts?: { at?: string; orderId?: number | null; orderNumber?: number | null },
): { meta: ClientMeta; reward: AvailableReward } | null {
  const rewards = [...(meta.availableRewards ?? [])];
  const idx = rewards.findIndex((r) => r.id === rewardId);
  if (idx < 0) return null;
  if (rewards[idx]!.redeemedAt) return null;

  const at = opts?.at || new Date().toISOString();
  const reward: AvailableReward = {
    ...rewards[idx]!,
    redeemedAt: at,
    orderId: opts?.orderId !== undefined ? opts.orderId : rewards[idx]!.orderId,
    orderNumber: opts?.orderNumber !== undefined ? opts.orderNumber : rewards[idx]!.orderNumber,
  };
  rewards[idx] = reward;
  let nextMeta: ClientMeta = { ...meta, availableRewards: rewards };
  nextMeta = appendClientLedger(nextMeta, {
    at,
    type: "recompensa_resgatada",
    rewardId: reward.id,
    rewardTitle: reward.title,
    orderId: reward.orderId ?? null,
    orderNumber: reward.orderNumber ?? null,
    description: `Recompensa resgatada: ${reward.title}`,
  });
  return { meta: nextMeta, reward };
}

/** Free-burger eligibility: hamburger/smash categories, never combos. */
export function isFidelityFreeBurgerProduct(opts: {
  categorySlug?: string | null;
  categoryName?: string | null;
  productName?: string | null;
}): boolean {
  const norm = (v: string | null | undefined) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const slug = norm(opts.categorySlug);
  const catName = norm(opts.categoryName);
  const productName = norm(opts.productName);
  if (slug.includes("combo") || catName.includes("combo") || productName.includes("combo")) {
    return false;
  }
  return (
    slug.includes("hamburguer") ||
    slug.includes("burger") ||
    slug.includes("smash") ||
    catName.includes("hamburguer") ||
    catName.includes("burger") ||
    catName.includes("smash") ||
    productName.includes("hamburguer") ||
    productName.includes("smash")
  );
}

/**
 * Canonical Brazilian WhatsApp/phone (digits only, with country code 55).
 * Used as comparison/storage key — not for UI display formatting.
 *
 * Equivalent inputs collapse to the same value, e.g.:
 * (71) 99999-9999 | 71 99999-9999 | 71999999999 | +55 71 99999-9999 | 5571999999999
 * → 5571999999999
 */
export function normalizeClientPhone(phone: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  // Drop trunk/leading zeros: 0719… → 719… ; 0055719… → 55719…
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";

  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length === 10 || national.length === 11) return `55${national}`;
    if (national.length > 11) return `55${national.slice(-11)}`;
    return digits;
  }

  // National DDD + number (landline 10 / mobile 11)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  // Extra digits / unknown prefix — keep trailing national mobile (11)
  if (digits.length > 11) return `55${digits.slice(-11)}`;

  return digits;
}

/**
 * Stable identity key for de-duplication across formats.
 * National part only (DDD + subscriber), 10 or 11 digits.
 */
export function phoneIdentityKey(phone: string): string {
  const n = normalizeClientPhone(phone);
  if (!n) return "";
  const national = n.startsWith("55") ? n.slice(2) : n;
  if (!national) return "";
  if (national.length >= 11) return national.slice(-11);
  return national;
}

/**
 * Equivalent identity keys for BR mobiles with/without the 9th digit.
 * Ex.: 7199999999 ↔ 71999999999 (DDD + 8 vs DDD + 9 + 8).
 */
export function phoneIdentityKeys(phone: string): string[] {
  const key = phoneIdentityKey(phone);
  if (!key) return [];
  const keys = new Set<string>([key]);
  if (key.length === 11 && key[2] === "9") {
    keys.add(key.slice(0, 2) + key.slice(3));
  } else if (key.length === 10) {
    keys.add(key.slice(0, 2) + "9" + key.slice(2));
  }
  return [...keys];
}

/** Placeholder / local-store phones that must not create CRM clients. */
export function isPlaceholderPhone(phone: string): boolean {
  const key = phoneIdentityKey(phone);
  if (!key || key.length < 10) return true;
  if (/^0+$/.test(key)) return true;
  return false;
}

/** Compare two phones ignoring formatting / optional +55 / 9º dígito. */
export function phonesMatch(a: string, b: string): boolean {
  const ka = phoneIdentityKeys(a);
  const kb = phoneIdentityKeys(b);
  if (!ka.length || !kb.length) return false;
  return ka.some((k) => kb.includes(k));
}
