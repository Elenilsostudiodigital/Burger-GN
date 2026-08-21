/** Printer settings defaults + normalize (server). */

export type PrinterConnection = "system" | "usb" | "bluetooth";
export type PrinterStatus = "connected" | "disconnected" | "offline" | "error";

export interface PrinterDeviceConfig {
  id: string;
  name: string;
  connection: PrinterConnection;
  status: PrinterStatus;
  vendorId?: number;
  productId?: number;
  bluetoothId?: string;
  lastSeenAt?: string | null;
}

export interface PrinterSettingsConfig {
  printers: PrinterDeviceConfig[];
  defaultPrinterId: string | null;
  autoPrintOnAccept: boolean;
  /** Number of copies (1–4). Replaces legacy printSecondCopy. */
  copies: number;
  /** @deprecated migrated to copies */
  printSecondCopy?: boolean;
  highlightOrderNumber: boolean;
  printTrackingQr: boolean;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettingsConfig = {
  printers: [],
  defaultPrinterId: null,
  autoPrintOnAccept: false,
  copies: 1,
  highlightOrderNumber: true,
  printTrackingQr: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asCopies(v: unknown, legacySecond?: unknown): number {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return Math.floor(n);
  if (legacySecond === true) return 2;
  return 1;
}

function asStatus(v: unknown): PrinterStatus {
  if (v === "connected" || v === "disconnected" || v === "offline" || v === "error") return v;
  return "disconnected";
}

function asConnection(v: unknown): PrinterConnection {
  if (v === "system" || v === "usb" || v === "bluetooth") return v;
  return "system";
}

export function normalizePrinterSettings(raw: unknown): PrinterSettingsConfig {
  const src = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  const list = Array.isArray(src.printers) ? src.printers : [];
  const printers: PrinterDeviceConfig[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name || seen.has(id)) continue;
    // Drop legacy browser-only printer entry
    if (id === "system-browser") continue;
    seen.add(id);
    printers.push({
      id,
      name: name.slice(0, 120),
      connection: asConnection(row.connection),
      status: asStatus(row.status),
      vendorId: typeof row.vendorId === "number" ? row.vendorId : undefined,
      productId: typeof row.productId === "number" ? row.productId : undefined,
      bluetoothId: typeof row.bluetoothId === "string" ? row.bluetoothId : undefined,
      lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : null,
    });
  }

  let defaultPrinterId =
    typeof src.defaultPrinterId === "string" && src.defaultPrinterId
      ? src.defaultPrinterId
      : null;
  if (defaultPrinterId === "system-browser") defaultPrinterId = null;
  if (defaultPrinterId && !printers.some((p) => p.id === defaultPrinterId)) {
    defaultPrinterId = null;
  }

  return {
    printers,
    defaultPrinterId,
    autoPrintOnAccept: asBool(src.autoPrintOnAccept, false),
    copies: asCopies(src.copies, src.printSecondCopy),
    highlightOrderNumber: asBool(src.highlightOrderNumber, true),
    printTrackingQr: asBool(src.printTrackingQr, true),
  };
}
