/**
 * Static PIX (BR Code / EMV) generator — no Mercado Pago required.
 * Uses CRC16-CCITT as specified by Bacen Pix.
 */

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

export interface StaticPixInput {
  key: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txid?: string;
}

/** Build Pix Copia e Cola (EMV) payload for a static/dynamic amount QR. */
export function buildStaticPixPayload(input: StaticPixInput): string {
  const key = input.key.trim();
  const name = (input.merchantName || "THE BURGER GN").slice(0, 25).toUpperCase();
  const city = (input.merchantCity || "LAURO DE FREITAS").slice(0, 15).toUpperCase();
  const amount = Math.max(0, input.amount).toFixed(2);
  const txid = (input.txid || "***").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";

  const mai = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);
  const additional = tlv("05", txid);

  let payload = "";
  payload += tlv("00", "01");
  payload += tlv("26", mai);
  payload += tlv("52", "0000");
  payload += tlv("53", "986");
  payload += tlv("54", amount);
  payload += tlv("58", "BR");
  payload += tlv("59", name);
  payload += tlv("60", city);
  payload += tlv("62", additional);
  payload += "6304";
  payload += crc16(payload);
  return payload;
}

/** Encode PIX key into existing payment_settings columns without schema changes. */
export function encodePixSettings(pixKey: string, merchantName: string, merchantCity: string): string {
  return JSON.stringify({
    mode: "static_pix",
    key: pixKey.trim(),
    name: merchantName.trim() || "THE BURGER GN",
    city: merchantCity.trim() || "LAURO DE FREITAS",
  });
}

export function decodePixSettings(gatewayProvider: string | null | undefined): {
  key: string;
  name: string;
  city: string;
} | null {
  if (!gatewayProvider) return null;
  try {
    const parsed = JSON.parse(gatewayProvider) as { mode?: string; key?: string; name?: string; city?: string };
    if (parsed.mode === "static_pix" && parsed.key) {
      return {
        key: parsed.key,
        name: parsed.name || "THE BURGER GN",
        city: parsed.city || "LAURO DE FREITAS",
      };
    }
  } catch {
    /* legacy plain string */
  }
  return null;
}
