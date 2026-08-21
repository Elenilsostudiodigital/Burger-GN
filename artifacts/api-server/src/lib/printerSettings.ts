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
  printSecondCopy: boolean;
  highlightOrderNumber: boolean;
  printTrackingQr: boolean;
}

export const SYSTEM_PRINTER_ID = "system-browser";

export const DEFAULT_PRINTER_SETTINGS: PrinterSettingsConfig = {
  printers: [
    {
      id: SYSTEM_PRINTER_ID,
      name: "Impressora do sistema (navegador)",
      connection: "system",
      status: "connected",
      lastSeenAt: null,
    },
  ],
  defaultPrinterId: null,
  autoPrintOnAccept: false,
  printSecondCopy: false,
  highlightOrderNumber: true,
  printTrackingQr: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
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

  if (!printers.some((p) => p.id === SYSTEM_PRINTER_ID)) {
    printers.unshift({ ...DEFAULT_PRINTER_SETTINGS.printers[0]! });
  }

  let defaultPrinterId =
    typeof src.defaultPrinterId === "string" && src.defaultPrinterId
      ? src.defaultPrinterId
      : null;
  if (defaultPrinterId && !printers.some((p) => p.id === defaultPrinterId)) {
    defaultPrinterId = null;
  }

  return {
    printers,
    defaultPrinterId,
    autoPrintOnAccept: asBool(src.autoPrintOnAccept, false),
    printSecondCopy: asBool(src.printSecondCopy, false),
    highlightOrderNumber: asBool(src.highlightOrderNumber, true),
    printTrackingQr: asBool(src.printTrackingQr, true),
  };
}
