/**
 * Local Burger GN print agent client + ESC/POS text builders.
 * Silent print only — never opens the browser print dialog.
 */
import type { Order, OrderType } from './api';
import { ORDER_TYPE_LABELS, formatPaymentMethod, buildOrderTrackingUrl } from './api';

export const PRINT_AGENT_BASE = 'http://127.0.0.1:19191';

export type PrinterConnection = 'system' | 'usb' | 'bluetooth';
export type PrinterStatus = 'connected' | 'disconnected' | 'offline' | 'error';

export interface PrinterDevice {
  id: string;
  name: string;
  connection: PrinterConnection;
  status: PrinterStatus;
  vendorId?: number;
  productId?: number;
  bluetoothId?: string;
  lastSeenAt?: string | null;
  driverName?: string;
  portName?: string;
}

export interface PrinterSettings {
  printers: PrinterDevice[];
  defaultPrinterId: string | null;
  autoPrintOnAccept: boolean;
  copies: number;
  highlightOrderNumber: boolean;
  printTrackingQr: boolean;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  printers: [],
  defaultPrinterId: null,
  autoPrintOnAccept: false,
  copies: 1,
  highlightOrderNumber: true,
  printTrackingQr: true,
};

export const PRINTER_STATUS_LABELS: Record<PrinterStatus, string> = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  offline: 'Offline',
  error: 'Erro',
};

const LAST_ORDER_KEY = 'bgn_last_printed_order_v1';

function fmtMoney(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export async function pingPrintAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${PRINT_AGENT_BASE}/health`, { method: 'GET' });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return !!data.ok;
  } catch {
    return false;
  }
}

export async function fetchAgentPrinters(): Promise<PrinterDevice[]> {
  const res = await fetch(`${PRINT_AGENT_BASE}/printers`);
  if (!res.ok) throw new Error('Não foi possível listar impressoras do agente local.');
  const data = (await res.json()) as { printers?: PrinterDevice[] };
  return Array.isArray(data.printers) ? data.printers : [];
}

export async function agentPrint(opts: {
  printerName: string;
  text: string;
  copies?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${PRINT_AGENT_BASE}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      printerName: opts.printerName,
      text: opts.text,
      copies: Math.max(1, Math.min(4, opts.copies ?? 1)),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Falha na impressão (HTTP ${res.status})`);
  }
  return { ok: true };
}

/** Plain-text thermal ticket (ESC/POS friendly width ~32 chars). */
export function buildOrderPrintText(
  order: Order,
  opts: { highlightOrderNumber?: boolean; printTrackingQr?: boolean } = {},
): string {
  const w = 32;
  const line = (ch = '-') => ch.repeat(w);
  const center = (s: string) => {
    const t = s.slice(0, w);
    const pad = Math.max(0, Math.floor((w - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  const rows: string[] = [];
  rows.push(center('THE BURGER GN'));
  rows.push(line('='));
  if (opts.highlightOrderNumber) {
    rows.push(center(`*** #${order.orderNumber} ***`));
  } else {
    rows.push(center(`Pedido #${order.orderNumber}`));
  }
  rows.push(line());
  rows.push(`Cliente: ${order.customerName}`);
  rows.push(`Tel: ${order.phone}`);
  rows.push(`Tipo: ${ORDER_TYPE_LABELS[order.orderType as OrderType] || order.orderType}`);
  if (order.orderType === 'delivery') {
    rows.push(`End: ${order.address || ''} ${order.addressNumber || ''}`);
    rows.push(`${order.neighborhood || ''}`);
  }
  rows.push(`Pag: ${formatPaymentMethod(order)}`);
  if (order.changeFor) rows.push(`Troco p/: ${fmtMoney(order.changeFor)}`);
  rows.push(line());
  for (const i of order.items || []) {
    rows.push(`${i.quantity}x ${i.productName}`);
    rows.push(`   ${fmtMoney(i.subtotal)}`);
    if (i.addons?.length) {
      rows.push(`   + ${i.addons.map((a) => a.name).join(', ')}`);
    }
  }
  rows.push(line());
  rows.push(`Subtotal ${fmtMoney(order.subtotal)}`);
  rows.push(
    `Entrega  ${parseFloat(String(order.deliveryFee)) > 0 ? fmtMoney(order.deliveryFee) : 'Gratis'}`,
  );
  if (parseFloat(String(order.discountAmount)) > 0) {
    rows.push(`Desconto -${fmtMoney(order.discountAmount)}`);
  }
  rows.push(`TOTAL    ${fmtMoney(order.total)}`);
  if (order.notes) {
    rows.push(line());
    rows.push(`Obs: ${order.notes}`);
  }
  if (opts.printTrackingQr && order.trackingId) {
    rows.push(line());
    rows.push('Acompanhe:');
    rows.push(buildOrderTrackingUrl(order.trackingId));
  }
  rows.push(line('='));
  rows.push(center('Obrigado!'));
  rows.push('');
  return rows.join('\n');
}

export function buildTestPrintText(printerName?: string): string {
  const now = new Date();
  const data = now.toLocaleDateString('pt-BR');
  const hora = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return [
    '--------------------------------',
    'BURGER GN',
    'TESTE DE IMPRESSAO',
    `Data: ${data}`,
    `Hora: ${hora}`,
    `Impressora: ${printerName || '-'}`,
    'Impressora funcionando corretamente.',
    '--------------------------------',
    '',
  ].join('\n');
}

export function resolveDefaultPrinter(
  settings: PrinterSettings,
): PrinterDevice | null {
  if (!settings.defaultPrinterId) return null;
  return settings.printers.find((p) => p.id === settings.defaultPrinterId) || null;
}

export function saveLastPrintedOrder(order: Order) {
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function loadLastPrintedOrder(): Order | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Order;
  } catch {
    return null;
  }
}

export type SilentPrintResult =
  | { ok: true; printerName: string; copies: number }
  | { ok: false; reason: 'no_agent' | 'no_printer' | 'error'; message: string };

/**
 * Silent print via local agent. Never opens browser print UI.
 */
export async function silentPrintOrder(
  order: Order,
  settings: PrinterSettings,
): Promise<SilentPrintResult> {
  const alive = await pingPrintAgent();
  if (!alive) {
    return {
      ok: false,
      reason: 'no_agent',
      message:
        'Agente de impressão offline. Abra tools/burger-gn-print-agent/start.bat neste computador.',
    };
  }
  const printer = resolveDefaultPrinter(settings);
  if (!printer?.name) {
    return {
      ok: false,
      reason: 'no_printer',
      message: 'Nenhuma impressora padrão configurada em Configurações → Impressoras.',
    };
  }
  const copies = Math.max(1, Math.min(4, settings.copies || 1));
  const text = buildOrderPrintText(order, {
    highlightOrderNumber: settings.highlightOrderNumber,
    printTrackingQr: settings.printTrackingQr,
  });
  try {
    await agentPrint({ printerName: printer.name, text, copies });
    saveLastPrintedOrder(order);
    return { ok: true, printerName: printer.name, copies };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Erro ao imprimir',
    };
  }
}

export async function silentPrintTest(
  settings: PrinterSettings,
): Promise<SilentPrintResult> {
  const alive = await pingPrintAgent();
  if (!alive) {
    return {
      ok: false,
      reason: 'no_agent',
      message:
        'Agente de impressão offline. Abra tools/burger-gn-print-agent/start.bat neste computador.',
    };
  }
  const printer = resolveDefaultPrinter(settings);
  if (!printer?.name) {
    return {
      ok: false,
      reason: 'no_printer',
      message: 'Nenhuma impressora padrão configurada.',
    };
  }
  const copies = Math.max(1, Math.min(4, settings.copies || 1));
  try {
    await agentPrint({
      printerName: printer.name,
      text: buildTestPrintText(printer.name),
      copies,
    });
    return { ok: true, printerName: printer.name, copies };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Erro ao imprimir teste',
    };
  }
}

/** Merge discovered OS printers into saved list. */
export function mergePrinterLists(
  saved: PrinterDevice[],
  discovered: PrinterDevice[],
): PrinterDevice[] {
  const map = new Map<string, PrinterDevice>();
  for (const p of saved) {
    if (p.id === 'system-browser') continue;
    map.set(p.id, p);
  }
  for (const d of discovered) {
    const prev = map.get(d.id);
    map.set(d.id, {
      ...prev,
      ...d,
      status: d.status || prev?.status || 'connected',
      lastSeenAt: new Date().toISOString(),
    });
  }
  return [...map.values()];
}

/**
 * @deprecated Browser print removed — kept name for Dashboard import migration.
 * Prefer silentPrintOrder.
 */
export async function printOrderReceipt(
  order: Order,
  settings?: Partial<PrinterSettings> & { printSecondCopy?: boolean },
): Promise<boolean> {
  const copies =
    typeof settings?.copies === 'number'
      ? settings.copies
      : settings?.printSecondCopy
        ? 2
        : 1;
  const merged: PrinterSettings = {
    ...DEFAULT_PRINTER_SETTINGS,
    ...settings,
    printers: settings?.printers || DEFAULT_PRINTER_SETTINGS.printers,
    copies: Math.max(1, Math.min(4, copies)),
  };
  const result = await silentPrintOrder(order, merged);
  return result.ok;
}
