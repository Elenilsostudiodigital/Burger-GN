import { db } from "@workspace/db";
import { clubeMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  normalizeClientPhone,
  phonesMatch,
  parseClientNotes,
  serializeClientNotes,
} from "./clientMeta";

/**
 * Locate Clube member by WhatsApp or auto-create with origin Sistema Burger GN.
 * Additive side-effect — does not alter order payload or checkout.
 */
export async function syncClubeMemberOnOrder(opts: {
  companyId: number;
  customerName: string;
  phone: string;
}): Promise<void> {
  const phone = normalizeClientPhone(opts.phone);
  if (!phone || phone.replace(/0/g, "") === "") return;

  const members = await db
    .select()
    .from(clubeMembersTable)
    .where(eq(clubeMembersTable.companyId, opts.companyId));

  const existing = members.find((m) => phonesMatch(m.phone, phone));
  if (existing) {
    // Keep history — only refresh name if empty-ish, never wipe stamps/cashback.
    const name = (opts.customerName || "").trim();
    if (name && (!existing.name || existing.name === "Cliente")) {
      await db
        .update(clubeMembersTable)
        .set({ name, phone: normalizeClientPhone(existing.phone) || phone })
        .where(
          and(
            eq(clubeMembersTable.id, existing.id),
            eq(clubeMembersTable.companyId, opts.companyId),
          ),
        );
    }
    return;
  }

  const notes = serializeClientNotes("", { origin: "sistema_burger_gn" });
  await db.insert(clubeMembersTable).values({
    companyId: opts.companyId,
    name: (opts.customerName || "").trim() || "Cliente",
    phone,
    email: "",
    points: 0,
    cashbackBalance: "0",
    active: true,
    notes,
  });
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
