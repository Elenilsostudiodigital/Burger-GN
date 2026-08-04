import net from "net";
import iconv from "iconv-lite";

export type PaperWidth = "58" | "80";

export type ReceiptItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  isFreeReward?: boolean;
};

export type ReceiptOrder = {
  code: string;
  customerName: string;
  customerPhone: string;
  status: string;
  notes?: string;
  subtotalCents: number;
  cashbackUsedCents: number;
  cashbackEarnedCents: number;
  freeBurgerApplied: boolean;
  totalCents: number;
  createdAt: Date | string;
  items: ReceiptItem[];
};

export type StoreInfo = {
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
};

const ESC = 0x1b;
const GS = 0x1d;

function encoder(text: string): Buffer {
  return iconv.encode(text, "CP860");
}

function line(text = ""): Buffer {
  return encoder(`${text}\n`);
}

function separator(width: number, char = "-"): Buffer {
  return line(char.repeat(width));
}

function center(text: string, width: number): string {
  const trimmed = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return " ".repeat(pad) + trimmed;
}

function columns(left: string, right: string, width: number): string {
  const gap = 1;
  const maxLeft = width - right.length - gap;
  const leftText = left.length > maxLeft ? `${left.slice(0, maxLeft - 1)}.` : left;
  const spaces = Math.max(gap, width - leftText.length - right.length);
  return leftText + " ".repeat(spaces) + right;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("pt-BR");
}

export function buildEscPosReceipt(
  order: ReceiptOrder,
  store: StoreInfo,
  paperWidth: PaperWidth = "80",
): Buffer {
  const cols = paperWidth === "58" ? 32 : 48;
  const chunks: Buffer[] = [];

  // Initialize + code page CP860 (Brazil)
  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(Buffer.from([ESC, 0x74, 0x03]));

  // Bold + double height for store name
  chunks.push(Buffer.from([ESC, 0x61, 0x01])); // center
  chunks.push(Buffer.from([ESC, 0x45, 0x01])); // bold on
  chunks.push(Buffer.from([GS, 0x21, 0x11])); // double size
  chunks.push(line(store.storeName || "Burger GN"));
  chunks.push(Buffer.from([GS, 0x21, 0x00])); // normal size
  chunks.push(Buffer.from([ESC, 0x45, 0x00])); // bold off

  if (store.storeAddress) chunks.push(line(store.storeAddress));
  if (store.storePhone) chunks.push(line(store.storePhone));
  chunks.push(line(formatDate(order.createdAt)));
  chunks.push(Buffer.from([ESC, 0x61, 0x00])); // left

  chunks.push(separator(cols));
  chunks.push(line(`Pedido: ${order.code}`));
  chunks.push(line(`Cliente: ${order.customerName}`));
  chunks.push(line(`Tel: ${order.customerPhone}`));
  chunks.push(line(`Status: ${order.status}`));
  chunks.push(separator(cols));

  for (const item of order.items) {
    const label = item.isFreeReward
      ? `${item.quantity}x ${item.name} (GRATIS)`
      : `${item.quantity}x ${item.name}`;
    const price = item.isFreeReward
      ? formatBRL(0)
      : formatBRL(item.unitPriceCents * item.quantity);
    chunks.push(line(columns(label, price, cols)));
  }

  chunks.push(separator(cols));
  chunks.push(line(columns("Subtotal", formatBRL(order.subtotalCents), cols)));

  if (order.cashbackUsedCents > 0) {
    chunks.push(
      line(columns("Cashback usado", `-${formatBRL(order.cashbackUsedCents)}`, cols)),
    );
  }
  if (order.freeBurgerApplied) {
    chunks.push(line(columns("Clube Burger", "1 burger gratis", cols)));
  }

  chunks.push(Buffer.from([ESC, 0x45, 0x01]));
  chunks.push(line(columns("TOTAL", formatBRL(order.totalCents), cols)));
  chunks.push(Buffer.from([ESC, 0x45, 0x00]));

  if (order.cashbackEarnedCents > 0) {
    chunks.push(line(columns("Cashback ganho", formatBRL(order.cashbackEarnedCents), cols)));
  }

  if (order.notes) {
    chunks.push(separator(cols));
    chunks.push(line("Obs:"));
    chunks.push(line(order.notes));
  }

  chunks.push(separator(cols));
  chunks.push(Buffer.from([ESC, 0x61, 0x01]));
  chunks.push(line(center("Obrigado! Clube Burger", cols)));
  chunks.push(line(center("Burger GN", cols)));
  chunks.push(Buffer.from([ESC, 0x61, 0x00]));

  // Feed + partial cut
  chunks.push(Buffer.from([0x0a, 0x0a, 0x0a]));
  chunks.push(Buffer.from([GS, 0x56, 0x01]));

  return Buffer.concat(chunks);
}

export function sendToNetworkPrinter(params: {
  host: string;
  port: number;
  data: Buffer;
  timeoutMs?: number;
}): Promise<void> {
  const { host, port, data, timeoutMs = 5000 } = params;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error("Timeout ao conectar na impressora")));
    socket.once("error", (err) => finish(err));
    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        if (err) return finish(err);
        socket.end(() => finish());
      });
    });
  });
}

export async function printOrderReceipt(params: {
  host: string;
  port: number;
  paperWidth: PaperWidth | string;
  order: ReceiptOrder;
  store: StoreInfo;
}): Promise<void> {
  const width: PaperWidth = params.paperWidth === "58" ? "58" : "80";
  const payload = buildEscPosReceipt(params.order, params.store, width);
  await sendToNetworkPrinter({
    host: params.host,
    port: params.port,
    data: payload,
  });
}
