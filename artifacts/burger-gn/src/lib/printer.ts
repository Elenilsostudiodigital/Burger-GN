/**
 * Device-local printer discovery helpers.
 * Uses browser print APIs where available; structure ready for future ESC/POS.
 */

import type { PrintPrefs } from "./api";

const DEVICE_KEY = "bgn_printer_device";

export interface DiscoveredPrinter {
  id: string;
  name: string;
  type: "usb" | "bluetooth" | "network" | "system";
  detail?: string;
}

export interface DevicePrinterSelection {
  id: string;
  name: string;
  type: PrintPrefs["connectionType"];
  networkAddress?: string;
  savedAt: string;
}

export function loadDevicePrinter(): DevicePrinterSelection | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DevicePrinterSelection;
  } catch {
    return null;
  }
}

export function saveDevicePrinter(selection: DevicePrinterSelection): void {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(selection));
}

export function clearDevicePrinter(): void {
  localStorage.removeItem(DEVICE_KEY);
}

/**
 * List printers available to this device.
 * Browsers do not expose a full printer enumeration API for security reasons.
 * We surface:
 *  - System default (always)
 *  - Previously saved selection
 *  - Optional network target from prefs
 *  - WebUSB / Web Bluetooth candidates when the browser supports them
 */
export async function discoverPrinters(
  connectionType: PrintPrefs["connectionType"],
  networkAddress?: string,
): Promise<DiscoveredPrinter[]> {
  const list: DiscoveredPrinter[] = [
    {
      id: "system-default",
      name: "Impressora do sistema (padrão)",
      type: "system",
      detail: "Usa a caixa de diálogo de impressão do navegador",
    },
  ];

  const saved = loadDevicePrinter();
  if (saved && !list.some((p) => p.id === saved.id)) {
    list.push({
      id: saved.id,
      name: saved.name,
      type: saved.type,
      detail: "Salva neste dispositivo",
    });
  }

  if (connectionType === "network" && networkAddress?.trim()) {
    list.push({
      id: `network:${networkAddress.trim()}`,
      name: `Rede — ${networkAddress.trim()}`,
      type: "network",
      detail: "Impressora LAN/Wi-Fi configurada",
    });
  }

  if (connectionType === "usb" && typeof navigator !== "undefined" && "usb" in navigator) {
    try {
      const usb = (navigator as Navigator & { usb?: { getDevices: () => Promise<Array<{ productName?: string; serialNumber?: string; vendorId: number; productId: number }>> } }).usb;
      const devices = usb ? await usb.getDevices() : [];
      for (const d of devices) {
        const name = d.productName || `USB ${d.vendorId}:${d.productId}`;
        list.push({
          id: `usb:${d.vendorId}:${d.productId}:${d.serialNumber || "0"}`,
          name,
          type: "usb",
          detail: "Dispositivo USB autorizado",
        });
      }
    } catch {
      /* permission / unsupported */
    }
  }

  if (connectionType === "bluetooth" && typeof navigator !== "undefined" && "bluetooth" in navigator) {
    list.push({
      id: "bluetooth-picker",
      name: "Parear Bluetooth…",
      type: "bluetooth",
      detail: "Solicita pareamento (quando suportado pelo navegador)",
    });
  }

  return list;
}

/** Request a WebUSB device (user gesture required). */
export async function requestUsbPrinter(): Promise<DiscoveredPrinter | null> {
  if (typeof navigator === "undefined" || !("usb" in navigator)) return null;
  try {
    const usb = (navigator as Navigator & {
      usb: { requestDevice: (opts: { filters: unknown[] }) => Promise<{ productName?: string; serialNumber?: string; vendorId: number; productId: number }> };
    }).usb;
    const d = await usb.requestDevice({ filters: [] });
    return {
      id: `usb:${d.vendorId}:${d.productId}:${d.serialNumber || "0"}`,
      name: d.productName || `USB ${d.vendorId}:${d.productId}`,
      type: "usb",
      detail: "Dispositivo USB selecionado",
    };
  } catch {
    return null;
  }
}

export function buildTestPageHTML(printerName: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teste de Impressora</title>
  <style>
    body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 12px; }
    h1 { text-align: center; font-size: 14px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    p { margin: 6px 0; }
  </style></head><body>
  <h1>THE BURGER GN<br>Página de Teste</h1>
  <p><b>Impressora:</b> ${printerName || "Sistema"}</p>
  <p><b>Data:</b> ${new Date().toLocaleString("pt-BR")}</p>
  <p>Se você está lendo isto no papel, a impressora está configurada com sucesso.</p>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;
}

export function printHtml(html: string): boolean {
  const win = window.open("", "_blank", "width=360,height=640");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

export function buildOrderReceiptHTML(order: {
  orderNumber: number;
  customerName: string;
  phone: string;
  address?: string | null;
  neighborhood?: string | null;
  paymentMethod: string;
  notes?: string | null;
  createdAt: string;
  items: Array<{ quantity: number; productName: string; subtotal: string | number }>;
  subtotal: string | number;
  deliveryFee: string | number;
  discountAmount: string | number;
  total: string | number;
  orderType?: string;
}): string {
  const fmt = (v: string | number) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",")}`;
  };
  const items = order.items
    .map((i) => `<tr><td>${i.quantity}x ${i.productName}</td><td style="text-align:right">${fmt(i.subtotal)}</td></tr>`)
    .join("");
  const address =
    order.orderType === "delivery" || order.address
      ? `<b>Endereço:</b> ${order.address || ""}${order.neighborhood ? `, ${order.neighborhood}` : ""}<br>`
      : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido #${order.orderNumber}</title>
  <style>
    body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; }
    h1 { text-align: center; font-size: 14px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 2px 0; }
    .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; }
  </style></head><body>
  <h1>THE BURGER GN<br>Pedido #${order.orderNumber}</h1>
  <p><b>Cliente:</b> ${order.customerName}<br>
  <b>WhatsApp:</b> ${order.phone}<br>
  ${address}
  <b>Pagamento:</b> ${order.paymentMethod}<br>
  <b>Horário:</b> ${new Date(order.createdAt).toLocaleString("pt-BR")}</p>
  <table>${items}</table>
  <table class="total">
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(order.subtotal)}</td></tr>
    <tr><td>Entrega</td><td style="text-align:right">${fmt(order.deliveryFee)}</td></tr>
    ${parseFloat(String(order.discountAmount)) > 0 ? `<tr><td>Desconto</td><td style="text-align:right">-${fmt(order.discountAmount)}</td></tr>` : ""}
    <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(order.total)}</b></td></tr>
  </table>
  ${order.notes ? `<p><b>Obs.:</b> ${order.notes}</p>` : ""}
  <script>window.onload=()=>{window.print();window.close();}</script>
  </body></html>`;
}
