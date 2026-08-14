/** Client-side product image validation, crop export, and smart compression. */

export const PRODUCT_IMAGE_ACCEPT =
  "image/jpeg,image/jpg,image/png,image/webp,image/avif,image/gif,image/*";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

/** Max edge after optimization (high quality for menus). */
export const PRODUCT_IMAGE_MAX_EDGE = 1600;
/** Soft size trigger for aggressive compression (~5MB). */
export const PRODUCT_IMAGE_LARGE_BYTES = 5 * 1024 * 1024;
/** Target max data-URL length before upload (~0.9MB binary ≈ 1.2M chars). */
const TARGET_DATA_URL_CHARS = 1_200_000;

export function isAllowedProductImageFile(file: File): { ok: true } | { ok: false; error: string } {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  const extOk = /\.(jpe?g|png|webp|avif|gif)$/i.test(name);
  if (mime && ALLOWED_MIME.has(mime)) return { ok: true };
  if (!mime && extOk) return { ok: true };
  if (mime.startsWith("image/") && extOk) return { ok: true };
  // Future browser formats: accept any image/* that the browser can decode
  if (mime.startsWith("image/")) return { ok: true };
  return { ok: false, error: "Envie apenas imagens (JPG, PNG, WEBP, AVIF ou GIF)." };
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem. Tente outro arquivo."));
    };
    img.src = url;
  });
}

export function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar pré-visualização."));
    img.src = src;
  });
}

export interface CropExportOptions {
  /** Source image */
  image: HTMLImageElement;
  /** Zoom scale (>=1) */
  zoom: number;
  /** Pan offset in CSS pixels relative to crop box center */
  offsetX: number;
  offsetY: number;
  /** Rotation in degrees (0/90/180/270) */
  rotation: number;
  /** Output square size in px */
  outputSize?: number;
}

/** Render a 1:1 crop of the transformed image to a canvas. */
export function renderProductCrop(opts: CropExportOptions): HTMLCanvasElement {
  const size = opts.outputSize ?? PRODUCT_IMAGE_MAX_EDGE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((opts.rotation * Math.PI) / 180);

  const iw = opts.image.naturalWidth || opts.image.width;
  const ih = opts.image.naturalHeight || opts.image.height;
  const base = Math.max(size / iw, size / ih);
  const scale = base * Math.max(1, opts.zoom);
  const dw = iw * scale;
  const dh = ih * scale;
  // offset is in view pixels (same as size viewport)
  ctx.drawImage(opts.image, -dw / 2 + opts.offsetX, -dh / 2 + opts.offsetY, dw, dh);
  ctx.restore();
  return canvas;
}

/** Compress canvas to JPEG data URL with adaptive quality. */
export function compressCanvasToJpeg(
  canvas: HTMLCanvasElement,
  opts?: { preferHighQuality?: boolean },
): string {
  const qualities = opts?.preferHighQuality
    ? [0.92, 0.86, 0.8, 0.72, 0.64, 0.55]
    : [0.88, 0.8, 0.72, 0.64, 0.55, 0.45];
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    if (dataUrl.length <= TARGET_DATA_URL_CHARS) return dataUrl;
  }
  return canvas.toDataURL("image/jpeg", 0.4);
}

/** Downscale canvas if edges exceed max, keeping aspect (square crop already square). */
export function limitCanvasEdge(canvas: HTMLCanvasElement, maxEdge = PRODUCT_IMAGE_MAX_EDGE): HTMLCanvasElement {
  if (canvas.width <= maxEdge && canvas.height <= maxEdge) return canvas;
  const scale = Math.min(maxEdge / canvas.width, maxEdge / canvas.height);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export async function fileToOptimizedJpegDataUrl(
  file: File,
  crop: Omit<CropExportOptions, "image">,
): Promise<string> {
  const check = isAllowedProductImageFile(file);
  if (!check.ok) throw new Error(check.error);
  const image = await loadImageFromFile(file);
  let canvas = renderProductCrop({ ...crop, image });
  const large = file.size >= PRODUCT_IMAGE_LARGE_BYTES
    || image.naturalWidth > PRODUCT_IMAGE_MAX_EDGE * 1.5
    || image.naturalHeight > PRODUCT_IMAGE_MAX_EDGE * 1.5;
  canvas = limitCanvasEdge(canvas, large ? PRODUCT_IMAGE_MAX_EDGE : Math.min(PRODUCT_IMAGE_MAX_EDGE, 1400));
  return compressCanvasToJpeg(canvas, { preferHighQuality: !large });
}
