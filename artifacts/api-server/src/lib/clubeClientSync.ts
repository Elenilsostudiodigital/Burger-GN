import { db } from "@workspace/db";
import { clubeMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  isPlaceholderPhone,
  normalizeClientPhone,
  parseClientNotes,
  phonesMatch,
  serializeClientNotes,
  type ClientOrigin,
} from "./clientMeta";

export type SyncedClubeMember = typeof clubeMembersTable.$inferSelect;

/** Lookup only — does not create a CRM row. */
export async function findClubeMemberByPhone(
  companyId: number,
  rawPhone: string,
): Promise<SyncedClubeMember | null> {
  if (isPlaceholderPhone(rawPhone)) return null;
  const phone = normalizeClientPhone(rawPhone);
  if (!phone) return null;
  const members = await db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, companyId));
  return members.find((m) => phonesMatch(m.phone, phone)) ?? null;
}

/**
 * Locate CRM client (clube member) by WhatsApp or auto-create.
 * Additive side-effect — does not alter order pricing/status.
 */
export async function syncClubeMemberOnOrder(opts: {
  companyId: number;
  customerName: string;
  phone: string;
  origin?: ClientOrigin;
}): Promise<SyncedClubeMember | null> {
  if (isPlaceholderPhone(opts.phone)) return null;

  const phone = normalizeClientPhone(opts.phone);
  const members = await db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, opts.companyId));

  const existing = members.find((m) => phonesMatch(m.phone, phone));
  if (existing) {
    const name = (opts.customerName || "").trim();
    const patch: Record<string, unknown> = {};
    const normalizedExisting = normalizeClientPhone(existing.phone);

    // Keep history — never wipe stamps/cashback. Normalize phone if needed.
    if (normalizedExisting !== phone) {
      patch["phone"] = phone;
    }
    if (name && (!existing.name || existing.name === "Cliente" || existing.name === "Cliente na loja")) {
      patch["name"] = name;
    }
    // Orders from an inactive member re-activate the same cadastro (no duplicate).
    if (existing.active === false) {
      patch["active"] = true;
    }

    if (Object.keys(patch).length > 0) {
      const [updated] = await db
        .update(clubeMembersTable)
        .set(patch)
        .where(
          and(
            eq(clubeMembersTable.id, existing.id),
            eq(clubeMembersTable.companyId, opts.companyId),
          ),
        )
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const origin: ClientOrigin = opts.origin ?? "pedido";
  const notes = serializeClientNotes("", { origin });
  const [created] = await db
    .insert(clubeMembersTable)
    .values({
      companyId: opts.companyId,
      name: (opts.customerName || "").trim() || "Cliente",
      phone,
      email: "",
      points: 0,
      cashbackBalance: "0",
      active: true,
      notes,
    })
    .returning();

  return created ?? null;
}

export function toClientRow<T extends {
  id: number;
  name: string;
  phone: string;
  points: number;
  cashbackBalance: string;
  notes: string;
  joinedAt: Date | string;
  createdAt: Date | string;
  active: boolean;
}>(member: T) {
  const { publicNotes, meta } = parseClientNotes(member.notes);
  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    stamps: member.points ?? 0,
    cashbackBalance: member.cashbackBalance,
    origin: meta.origin,
    notes: publicNotes,
    joinedAt: member.joinedAt,
    createdAt: member.createdAt,
    active: member.active,
  };
}
