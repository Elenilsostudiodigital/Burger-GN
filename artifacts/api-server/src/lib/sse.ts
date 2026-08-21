import { Response } from "express";

interface SSEClient {
  res: Response;
  companyId: number;
}

interface CustomerSSEClient {
  res: Response;
  companyId: number;
  phone: string;
}

const clients = new Set<SSEClient>();
const customerClients = new Set<CustomerSSEClient>();

export function addSSEClient(res: Response, companyId: number) {
  clients.add({ res, companyId });
}

export function removeSSEClient(res: Response) {
  for (const client of clients) {
    if (client.res === res) clients.delete(client);
  }
}

export function broadcastSSE(companyId: number, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.companyId !== companyId) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function addCustomerSSEClient(res: Response, companyId: number, phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return;
  customerClients.add({ res, companyId, phone: digits });
}

export function removeCustomerSSEClient(res: Response) {
  for (const client of customerClients) {
    if (client.res === res) customerClients.delete(client);
  }
}

function phonesEqual(a: string, b: string): boolean {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  const strip55 = (v: string) => (v.startsWith("55") && v.length >= 12 ? v.slice(2) : v);
  return strip55(da) === strip55(db);
}

/** Push a live event to customer apps identified by WhatsApp (when the PWA is open). */
export function broadcastCustomerSSE(companyId: number, phone: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of customerClients) {
    if (client.companyId !== companyId) continue;
    if (!phonesEqual(client.phone, phone)) continue;
    try {
      client.res.write(payload);
    } catch {
      customerClients.delete(client);
    }
  }
}
