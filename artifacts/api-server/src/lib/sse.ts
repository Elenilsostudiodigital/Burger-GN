import { Response } from "express";

const clients = new Set<Response>();

export function addSSEClient(res: Response) {
  clients.add(res);
}

export function removeSSEClient(res: Response) {
  clients.delete(res);
}

export function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}
