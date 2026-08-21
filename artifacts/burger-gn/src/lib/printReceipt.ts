import type { Order, OrderType } from './api';
import { ORDER_TYPE_LABELS, formatPaymentMethod, buildOrderTrackingUrl } from './api';

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
}

export interface PrinterSettings {
  printers: PrinterDevice[];
  defaultPrinterId: string | null;
  autoPrintOnAccept: boolean;
  printSecondCopy: boolean;
  highlightOrderNumber: boolean;
  printTrackingQr: boolean;
}

export const SYSTEM_PRINTER_ID = 'system-browser';

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  printers: [
    {
      id: SYSTEM_PRINTER_ID,
      name: 'Impressora do sistema (navegador)',
      connection: 'system',
      status: 'connected',
      lastSeenAt: null,
    },
  ],
  defaultPrinterId: null,
  autoPrintOnAccept: false,
  printSecondCopy: false,
  highlightOrderNumber: true,
  printTrackingQr: true,
};

export const PRINTER_STATUS_LABELS: Record<PrinterStatus, string> = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  offline: 'Offline',
  error: 'Erro',
};

function fmtMoney(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export type PrintReceiptOptions = {
  highlightOrderNumber?: boolean;
  printTrackingQr?: boolean;
  copies?: number;
  autoPrint?: boolean;
};

/** Kitchen / test receipt HTML (thermal-friendly). */
export function buildReceiptHTML(
  order: Order,
  opts: PrintReceiptOptions = {},
): string {
  const highlight = opts.highlightOrderNumber === true;
  const withQr = opts.printTrackingQr === true && !!order.trackingId;
  const copies = Math.max(1, Math.min(3, opts.copies ?? 1));
  const autoPrint = opts.autoPrint !== false;
  const trackingUrl = order.trackingId
    ? buildOrderTrackingUrl(order.trackingId)
    : '';
  const qrSrc = withQr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(trackingUrl)}`
    : '';

  const items = (order.items || []).map((i) =>
    `<tr><td>${i.quantity}x ${i.productName}</td><td style="text-align:right">${fmtMoney(i.subtotal)}</td></tr>`,
  ).join('');

  const orderTitle = highlight
    ? `<div class="order-num">#${order.orderNumber}</div>`
    : `Pedido #${order.orderNumber}`;

  const sheet = `
  <div class="sheet">
    <h1>THE BURGER GN</h1>
    ${orderTitle}
    <p><b>Cliente:</b> ${escapeHtml(order.customerName)}<br>
    <b>Tel:</b> ${escapeHtml(order.phone)}<br>
    <b>Tipo:</b> ${ORDER_TYPE_LABELS[order.orderType as OrderType] || order.orderType}<br>
    ${order.orderType === 'delivery' ? `<b>End.:</b> ${escapeHtml(order.address || '')}, ${escapeHtml(order.neighborhood || '')}<br>` : ''}
    <b>Pagamento:</b> ${escapeHtml(formatPaymentMethod(order))}
    ${order.changeFor ? ` (troco p/ ${fmtMoney(order.changeFor)})` : ''}</p>
    <table>${items}</table>
    <table class="total">
      <tr><td>Subtotal</td><td style="text-align:right">${fmtMoney(order.subtotal)}</td></tr>
      <tr><td>Entrega</td><td style="text-align:right">${parseFloat(String(order.deliveryFee)) > 0 ? fmtMoney(order.deliveryFee) : 'Grátis'}</td></tr>
      ${parseFloat(String(order.discountAmount)) > 0 ? `<tr><td>Desconto</td><td style="text-align:right">-${fmtMoney(order.discountAmount)}</td></tr>` : ''}
      <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${fmtMoney(order.total)}</b></td></tr>
    </table>
    ${order.notes ? `<p><b>Obs.:</b> ${escapeHtml(order.notes)}</p>` : ''}
    ${withQr ? `<div class="qr"><img src="${qrSrc}" alt="QR" width="120" height="120" /><p>Acompanhe o pedido</p></div>` : ''}
  </div>`;

  const body = Array.from({ length: copies }, () => sheet).join('<div class="break"></div>');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido #${order.orderNumber}</title>
  <style>
    body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; color:#000; }
    h1 { text-align: center; font-size: 14px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin: 0 0 8px; }
    .order-num { text-align:center; font-size: 28px; font-weight: 900; letter-spacing: 1px; margin: 4px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 2px 0; }
    .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; }
    .qr { text-align:center; margin-top: 10px; }
    .qr p { font-size: 10px; margin: 4px 0 0; }
    .break { page-break-after: always; height: 0; }
    @media print { .break { page-break-after: always; } }
  </style></head><body>
  ${body}
  ${autoPrint ? '<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400);}</script>' : ''}
  </body></html>`;
}

export function buildTestPrintHTML(printerName?: string): string {
  const now = new Date();
  const data = now.toLocaleDateString('pt-BR');
  const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const nome = escapeHtml(printerName || 'Impressora do sistema');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teste de impressão</title>
  <style>
    body { font-family: monospace; font-size: 13px; max-width: 300px; margin: 0 auto; padding: 16px; text-align: center; color:#000; }
    .line { border-top: 1px dashed #000; margin: 10px 0; }
    h1 { font-size: 18px; margin: 0 0 6px; letter-spacing: 1px; }
    .sub { font-size: 14px; font-weight: 700; margin: 8px 0; }
  </style></head><body>
  <div class="line"></div>
  <h1>BURGER GN</h1>
  <div class="sub">TESTE DE IMPRESSÃO</div>
  <p>Data: ${data}<br>Hora: ${hora}</p>
  <p>Impressora: ${nome}</p>
  <p><b>Impressora funcionando corretamente.</b></p>
  <div class="line"></div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400);}</script>
  </body></html>`;
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Opens a print window with the given HTML. Returns false if popup blocked. */
export function openPrintHtml(html: string): boolean {
  const win = window.open('', '_blank', 'width=360,height=640');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

export function printOrderReceipt(order: Order, settings?: Partial<PrinterSettings>): boolean {
  const copies = settings?.printSecondCopy ? 2 : 1;
  return openPrintHtml(
    buildReceiptHTML(order, {
      highlightOrderNumber: !!settings?.highlightOrderNumber,
      printTrackingQr: !!settings?.printTrackingQr,
      copies,
      autoPrint: true,
    }),
  );
}

export function printTestReceipt(printerName?: string): boolean {
  return openPrintHtml(buildTestPrintHTML(printerName));
}

/** Refresh USB devices previously authorized in this browser. */
export async function refreshUsbPrinters(): Promise<PrinterDevice[]> {
  const nav = navigator as Navigator & { usb?: { getDevices: () => Promise<USBDevice[]> } };
  if (!nav.usb?.getDevices) return [];
  try {
    const devices = await nav.usb.getDevices();
    return devices.map((d, i) => ({
      id: `usb-${d.vendorId}-${d.productId}-${i}`,
      name: d.productName || `USB ${d.vendorId}:${d.productId}`,
      connection: 'usb' as const,
      status: 'connected' as const,
      vendorId: d.vendorId,
      productId: d.productId,
      lastSeenAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function requestUsbPrinter(): Promise<PrinterDevice | null> {
  const nav = navigator as Navigator & {
    usb?: { requestDevice: (opts: { filters: object[] }) => Promise<USBDevice> };
  };
  if (!nav.usb?.requestDevice) return null;
  try {
    const d = await nav.usb.requestDevice({ filters: [] });
    return {
      id: `usb-${d.vendorId}-${d.productId}`,
      name: d.productName || `USB ${d.vendorId}:${d.productId}`,
      connection: 'usb',
      status: 'connected',
      vendorId: d.vendorId,
      productId: d.productId,
      lastSeenAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function bluetoothSupported(): boolean {
  return !!(navigator as Navigator & { bluetooth?: unknown }).bluetooth;
}

export async function requestBluetoothPrinter(): Promise<PrinterDevice | null> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: {
        acceptAllDevices?: boolean;
        optionalServices?: string[];
      }) => Promise<BluetoothDevice>;
    };
  };
  if (!nav.bluetooth?.requestDevice) return null;
  try {
    const d = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });
    return {
      id: `bt-${d.id}`,
      name: d.name || 'Impressora Bluetooth',
      connection: 'bluetooth',
      status: d.gatt?.connected ? 'connected' : 'disconnected',
      bluetoothId: d.id,
      lastSeenAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Minimal typings for WebUSB / Web Bluetooth used above
interface USBDevice {
  vendorId: number;
  productId: number;
  productName?: string;
}
interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: { connected: boolean };
}

/** Merge discovered devices into saved list (by id). */
export function mergePrinterLists(
  saved: PrinterDevice[],
  discovered: PrinterDevice[],
): PrinterDevice[] {
  const map = new Map<string, PrinterDevice>();
  for (const p of saved) map.set(p.id, p);
  for (const d of discovered) {
    const prev = map.get(d.id);
    map.set(d.id, { ...prev, ...d, status: d.status || prev?.status || 'connected' });
  }
  if (![...map.keys()].includes(SYSTEM_PRINTER_ID)) {
    map.set(SYSTEM_PRINTER_ID, DEFAULT_PRINTER_SETTINGS.printers[0]!);
  }
  return [...map.values()];
}
