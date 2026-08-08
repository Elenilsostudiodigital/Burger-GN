/**
 * Platform extras stored inside payment_settings.gatewayProvider JSON
 * under the `platform` key — no database schema changes required.
 */

export type BannerType = "mais_vendidos" | "combos" | "promocoes" | "novidades";

export interface StoreHoursConfig {
  openTime: string;
  closeTime: string;
  /** 0 = Domingo … 6 = Sábado */
  days: number[];
  /** Force closed regardless of schedule */
  forceClosed: boolean;
  /** Force open regardless of schedule */
  forceOpen: boolean;
}

export interface BannerItem {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  type: BannerType;
  active: boolean;
  order: number;
  link: string;
}

export interface PrintPrefs {
  /** Auto-print is OFF by default — structure ready for future use */
  autoPrintOnAccept: boolean;
  autoPrintOnPaid: boolean;
  autoPrintOnDone: boolean;
  connectionType: "usb" | "bluetooth" | "network";
  selectedPrinterId: string;
  selectedPrinterName: string;
  networkAddress: string;
}

export interface ClubeProgramExtras {
  cashbackEnabled: boolean;
  fidelityEnabled: boolean;
  /** Stamps required to unlock reward (default 10) */
  stampsRequired: number;
  stampRewardTitle: string;
  stampRewardDescription: string;
}

export interface PlatformExtras {
  storeHours: StoreHoursConfig;
  banners: BannerItem[];
  printPrefs: PrintPrefs;
  clubeProgram: ClubeProgramExtras;
}

const DEFAULT_STORE_HOURS: StoreHoursConfig = {
  openTime: "18:00",
  closeTime: "23:30",
  days: [0, 1, 2, 3, 4, 5, 6],
  forceClosed: false,
  forceOpen: false,
};

const DEFAULT_PRINT_PREFS: PrintPrefs = {
  autoPrintOnAccept: false,
  autoPrintOnPaid: false,
  autoPrintOnDone: false,
  connectionType: "usb",
  selectedPrinterId: "",
  selectedPrinterName: "",
  networkAddress: "",
};

const DEFAULT_CLUBE_PROGRAM: ClubeProgramExtras = {
  cashbackEnabled: true,
  fidelityEnabled: true,
  stampsRequired: 10,
  stampRewardTitle: "Hambúrguer grátis",
  stampRewardDescription: "Ao completar os selos, ganhe um hambúrguer grátis na próxima compra.",
};

const DEFAULT_BANNERS: BannerItem[] = [
  {
    id: "banner-mais-vendidos",
    title: "Mais vendidos",
    subtitle: "Os favoritos da casa",
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&h=600&fit=crop",
    type: "mais_vendidos",
    active: true,
    order: 0,
    link: "/cardapio",
  },
  {
    id: "banner-combos",
    title: "Combos",
    subtitle: "Monte o combo perfeito",
    imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&h=600&fit=crop",
    type: "combos",
    active: true,
    order: 1,
    link: "/cardapio",
  },
  {
    id: "banner-promocoes",
    title: "Promoções",
    subtitle: "Ofertas especiais pra você",
    imageUrl: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=1200&h=600&fit=crop",
    type: "promocoes",
    active: true,
    order: 2,
    link: "/cardapio",
  },
  {
    id: "banner-novidades",
    title: "Novidades",
    subtitle: "Sabores que acabaram de chegar",
    imageUrl: "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=1200&h=600&fit=crop",
    type: "novidades",
    active: true,
    order: 3,
    link: "/cardapio",
  },
];

export function defaultPlatformExtras(): PlatformExtras {
  return {
    storeHours: { ...DEFAULT_STORE_HOURS, days: [...DEFAULT_STORE_HOURS.days] },
    banners: DEFAULT_BANNERS.map((b) => ({ ...b })),
    printPrefs: { ...DEFAULT_PRINT_PREFS },
    clubeProgram: { ...DEFAULT_CLUBE_PROGRAM },
  };
}

function parseGatewayRaw(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* legacy plain string */
  }
  return {};
}

function normalizeStoreHours(input: unknown): StoreHoursConfig {
  const base = defaultPlatformExtras().storeHours;
  if (!input || typeof input !== "object") return base;
  const o = input as Partial<StoreHoursConfig>;
  const days = Array.isArray(o.days)
    ? o.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
    : base.days;
  return {
    openTime: typeof o.openTime === "string" && /^\d{2}:\d{2}$/.test(o.openTime) ? o.openTime : base.openTime,
    closeTime: typeof o.closeTime === "string" && /^\d{2}:\d{2}$/.test(o.closeTime) ? o.closeTime : base.closeTime,
    days: days.length ? [...new Set(days)].sort() : base.days,
    forceClosed: Boolean(o.forceClosed),
    forceOpen: Boolean(o.forceOpen),
  };
}

function normalizeBanner(input: unknown, index: number): BannerItem | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Partial<BannerItem>;
  const type = (["mais_vendidos", "combos", "promocoes", "novidades"] as BannerType[]).includes(o.type as BannerType)
    ? (o.type as BannerType)
    : "novidades";
  return {
    id: typeof o.id === "string" && o.id ? o.id : `banner-${index}-${Date.now()}`,
    title: typeof o.title === "string" ? o.title : "Banner",
    subtitle: typeof o.subtitle === "string" ? o.subtitle : "",
    imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : DEFAULT_BANNERS[0].imageUrl,
    type,
    active: o.active !== false,
    order: Number.isFinite(Number(o.order)) ? Number(o.order) : index,
    link: typeof o.link === "string" ? o.link : "/cardapio",
  };
}

function normalizePrintPrefs(input: unknown): PrintPrefs {
  const base = defaultPlatformExtras().printPrefs;
  if (!input || typeof input !== "object") return base;
  const o = input as Partial<PrintPrefs>;
  const connectionType = (["usb", "bluetooth", "network"] as const).includes(o.connectionType as PrintPrefs["connectionType"])
    ? (o.connectionType as PrintPrefs["connectionType"])
    : base.connectionType;
  return {
    autoPrintOnAccept: Boolean(o.autoPrintOnAccept),
    autoPrintOnPaid: Boolean(o.autoPrintOnPaid),
    autoPrintOnDone: Boolean(o.autoPrintOnDone),
    connectionType,
    selectedPrinterId: typeof o.selectedPrinterId === "string" ? o.selectedPrinterId : "",
    selectedPrinterName: typeof o.selectedPrinterName === "string" ? o.selectedPrinterName : "",
    networkAddress: typeof o.networkAddress === "string" ? o.networkAddress : "",
  };
}

function normalizeClubeProgram(input: unknown): ClubeProgramExtras {
  const base = defaultPlatformExtras().clubeProgram;
  if (!input || typeof input !== "object") return base;
  const o = input as Partial<ClubeProgramExtras>;
  const stamps = Number(o.stampsRequired);
  return {
    cashbackEnabled: o.cashbackEnabled !== false,
    fidelityEnabled: o.fidelityEnabled !== false,
    stampsRequired: Number.isFinite(stamps) ? Math.max(1, Math.min(50, Math.round(stamps))) : base.stampsRequired,
    stampRewardTitle: typeof o.stampRewardTitle === "string" && o.stampRewardTitle.trim()
      ? o.stampRewardTitle.trim()
      : base.stampRewardTitle,
    stampRewardDescription: typeof o.stampRewardDescription === "string"
      ? o.stampRewardDescription
      : base.stampRewardDescription,
  };
}

export function decodePlatformExtras(gatewayProvider: string | null | undefined): PlatformExtras {
  const raw = parseGatewayRaw(gatewayProvider);
  const platform = (raw["platform"] && typeof raw["platform"] === "object"
    ? raw["platform"]
    : {}) as Partial<PlatformExtras>;

  const bannersRaw = Array.isArray(platform.banners) ? platform.banners : null;
  const banners = bannersRaw
    ? bannersRaw.map((b, i) => normalizeBanner(b, i)).filter((b): b is BannerItem => !!b)
    : defaultPlatformExtras().banners;

  return {
    storeHours: normalizeStoreHours(platform.storeHours),
    banners: banners.length ? banners.sort((a, b) => a.order - b.order) : defaultPlatformExtras().banners,
    printPrefs: normalizePrintPrefs(platform.printPrefs),
    clubeProgram: normalizeClubeProgram(platform.clubeProgram),
  };
}

/** Merge platform extras into existing gatewayProvider JSON, preserving Pix/prep fields. */
export function encodePlatformExtras(
  gatewayProvider: string | null | undefined,
  extras: PlatformExtras,
): string {
  const raw = parseGatewayRaw(gatewayProvider);
  const next: Record<string, unknown> = {
    ...raw,
    mode: typeof raw["mode"] === "string" ? raw["mode"] : "static_pix",
    platform: {
      storeHours: normalizeStoreHours(extras.storeHours),
      banners: (extras.banners || [])
        .map((b, i) => normalizeBanner(b, i))
        .filter((b): b is BannerItem => !!b)
        .sort((a, b) => a.order - b.order),
      printPrefs: normalizePrintPrefs(extras.printPrefs),
      clubeProgram: normalizeClubeProgram(extras.clubeProgram),
    },
  };
  return JSON.stringify(next);
}

/** Patch a subset of platform extras while preserving the rest + Pix fields. */
export function patchPlatformExtras(
  gatewayProvider: string | null | undefined,
  patch: Partial<PlatformExtras>,
): string {
  const current = decodePlatformExtras(gatewayProvider);
  return encodePlatformExtras(gatewayProvider, {
    storeHours: patch.storeHours ?? current.storeHours,
    banners: patch.banners ?? current.banners,
    printPrefs: patch.printPrefs ?? current.printPrefs,
    clubeProgram: patch.clubeProgram ?? current.clubeProgram,
  });
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** Evaluate whether the store is open right now (America/Sao_Paulo-ish local clock of server). */
export function evaluateStoreOpen(
  hours: StoreHoursConfig,
  now: Date = new Date(),
): { isOpen: boolean; reason: "force_open" | "force_closed" | "outside_hours" | "closed_day" | "open" } {
  if (hours.forceOpen) return { isOpen: true, reason: "force_open" };
  if (hours.forceClosed) return { isOpen: false, reason: "force_closed" };

  const day = now.getDay();
  if (!hours.days.includes(day)) return { isOpen: false, reason: "closed_day" };

  const mins = now.getHours() * 60 + now.getMinutes();
  const open = parseHm(hours.openTime);
  const close = parseHm(hours.closeTime);

  // Overnight window (e.g. 18:00 → 02:00)
  if (close <= open) {
    const openNow = mins >= open || mins < close;
    return openNow ? { isOpen: true, reason: "open" } : { isOpen: false, reason: "outside_hours" };
  }

  const openNow = mins >= open && mins < close;
  return openNow ? { isOpen: true, reason: "open" } : { isOpen: false, reason: "outside_hours" };
}
