/**
 * Pix Copia e Cola estático (BR Code / EMV) — Manual Bacen.
 *
 * Importante para QR estático:
 * - ID 01 = 11 (Point of Initiation Method — estático / reutilizável)
 * - GUI = br.gov.bcb.pix (minúsculas, conforme exemplos oficiais)
 * - TXID (ID 05 em Additional Data) = "***" — NÃO usar identificador de cobrança
 *   dinâmica. TXIDs customizados fazem vários apps bancários tratar o QR como
 *   cobrança dinâmica inexistente e retornar "expirado" / falha na confirmação.
 * - Referência do pedido vai no subcampo 02 (descrição) do Merchant Account Info.
 */

function crc16CcittFalse(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function emv(id: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

/** Remove acentos e caracteres fora de A-Z / 0-9 / espaço (exigência comum dos apps). */
function toEmvText(input: string, maxLen: number): string {
  const ascii = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return ascii.slice(0, maxLen) || "NA";
}

/**
 * Normaliza chave Pix sem alterar CPF/CNPJ/EVP válidos.
 * Telefone com máscara → E.164 (+55...).
 */
export function normalizePixKey(raw: string): string {
  const key = raw.trim();
  if (!key) return key;

  if (key.includes("@")) return key.toLowerCase();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.toLowerCase();
  }

  const digits = key.replace(/\D/g, "");
  const looksLikePhone =
    key.startsWith("+") ||
    /[()\-]/.test(key) ||
    digits.length === 10 ||
    (digits.length === 11 && digits.charAt(2) === "9") ||
    (digits.length >= 12 && digits.startsWith("55"));

  if (looksLikePhone && digits.length >= 10) {
    const national = digits.startsWith("55") ? digits.slice(2) : digits;
    return `+55${national}`;
  }

  if (digits.length === 11 || digits.length === 14) return digits;

  return key;
}

export function buildStaticPixPayload(opts: {
  key: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  /** Texto livre curto (ex.: PEDIDO12) — NÃO é TXID de cobrança dinâmica. */
  description?: string;
}): string {
  const key = normalizePixKey(opts.key);
  if (!key) return "";

  const name = toEmvText(opts.merchantName || "RECEBEDOR", 25);
  const city = toEmvText(opts.merchantCity || "BRASIL", 15);

  // MAI (ID 26): GUI + chave + descrição opcional
  let mai = emv("00", "br.gov.bcb.pix") + emv("01", key);
  const desc = (opts.description || "").replace(/[^\w]/g, "").slice(0, 25);
  if (desc) {
    mai += emv("02", desc);
  }

  const amount =
    Number.isFinite(opts.amount) && opts.amount > 0
      ? opts.amount.toFixed(2)
      : "";

  // 00 Payload Format Indicator
  // 01 Point of Initiation Method = 11 (estático)
  // 26 Merchant Account Information
  // 52 MCC
  // 53 Currency BRL
  // 54 Amount (opcional no estático; incluímos o valor do pedido)
  // 58 Country
  // 59 Name
  // 60 City
  // 62 Additional Data Field → 05 TXID = ***
  let payload =
    emv("00", "01") +
    emv("01", "11") +
    emv("26", mai) +
    emv("52", "0000") +
    emv("53", "986");

  if (amount) {
    payload += emv("54", amount);
  }

  payload +=
    emv("58", "BR") +
    emv("59", name) +
    emv("60", city) +
    emv("62", emv("05", "***"));

  const withCrcId = `${payload}6304`;
  return `${withCrcId}${crc16CcittFalse(withCrcId)}`;
}

/** Valida CRC do payload (útil em testes / diagnóstico). */
export function isValidPixCrc(payload: string): boolean {
  if (!payload || payload.length < 8 || !payload.includes("6304")) return false;
  const idx = payload.lastIndexOf("6304");
  const body = payload.slice(0, idx + 4);
  const crc = payload.slice(idx + 4, idx + 8).toUpperCase();
  return crc16CcittFalse(body) === crc;
}

export interface GatewayStoreConfig {
  key: string;
  name: string;
  city: string;
  prepTimeMin: number;
  prepTimeMax: number;
}

const DEFAULT_PREP_MIN = 35;
const DEFAULT_PREP_MAX = 45;

function clampPrep(min: number, max: number): { prepTimeMin: number; prepTimeMax: number } {
  let prepTimeMin = Number.isFinite(min) ? Math.max(5, Math.min(180, Math.round(min))) : DEFAULT_PREP_MIN;
  let prepTimeMax = Number.isFinite(max) ? Math.max(5, Math.min(240, Math.round(max))) : DEFAULT_PREP_MAX;
  if (prepTimeMax < prepTimeMin) prepTimeMax = prepTimeMin;
  return { prepTimeMin, prepTimeMax };
}

/** Encode PIX + prep-time into existing payment_settings.gatewayProvider without schema changes.
 *  Preserves nested `platform` extras (store hours, banners, print prefs, clube program).
 */
export function encodePixSettings(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  prepTimeMin = DEFAULT_PREP_MIN,
  prepTimeMax = DEFAULT_PREP_MAX,
  existingGatewayProvider?: string | null,
): string {
  const prep = clampPrep(prepTimeMin, prepTimeMax);
  let platform: unknown;
  if (existingGatewayProvider) {
    try {
      const parsed = JSON.parse(existingGatewayProvider) as { platform?: unknown };
      if (parsed && typeof parsed === "object" && parsed.platform) {
        platform = parsed.platform;
      }
    } catch {
      /* ignore */
    }
  }
  const payload: Record<string, unknown> = {
    mode: "static_pix",
    key: pixKey.trim(),
    name: merchantName.trim() || "THE BURGER GN",
    city: merchantCity.trim() || "LAURO DE FREITAS",
    prepTimeMin: prep.prepTimeMin,
    prepTimeMax: prep.prepTimeMax,
  };
  if (platform !== undefined) payload.platform = platform;
  return JSON.stringify(payload);
}

export function decodeGatewayConfig(gatewayProvider: string | null | undefined): GatewayStoreConfig {
  const fallback: GatewayStoreConfig = {
    key: "",
    name: "THE BURGER GN",
    city: "LAURO DE FREITAS",
    prepTimeMin: DEFAULT_PREP_MIN,
    prepTimeMax: DEFAULT_PREP_MAX,
  };
  if (!gatewayProvider) return fallback;
  try {
    const parsed = JSON.parse(gatewayProvider) as {
      mode?: string; key?: string; name?: string; city?: string;
      prepTimeMin?: number; prepTimeMax?: number;
    };
    if (parsed && typeof parsed === "object") {
      const prep = clampPrep(Number(parsed.prepTimeMin), Number(parsed.prepTimeMax));
      return {
        key: typeof parsed.key === "string" ? parsed.key : "",
        name: parsed.name || fallback.name,
        city: parsed.city || fallback.city,
        ...prep,
      };
    }
  } catch {
    /* legacy plain string */
  }
  return fallback;
}

export function decodePixSettings(gatewayProvider: string | null | undefined): {
  key: string;
  name: string;
  city: string;
} | null {
  const cfg = decodeGatewayConfig(gatewayProvider);
  if (!cfg.key?.trim()) return null;
  return { key: cfg.key, name: cfg.name, city: cfg.city };
}
