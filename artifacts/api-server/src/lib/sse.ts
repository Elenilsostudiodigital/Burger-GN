import { Response } from "express";

interface SSEClient {
  res: Response;
  companyId: number;
}

const clients = new Set<SSEClient>();

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
