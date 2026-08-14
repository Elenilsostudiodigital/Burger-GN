import { Router } from "express";
import { requireCompanyAuth } from "../middlewares/auth";

const router = Router();

const MAX_DATA_URL_CHARS = 1_600_000;

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

async function putVercelBlob(
  token: string,
  pathname: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "x-vercel-blob-access": "public",
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Blob upload failed (${res.status})`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Blob upload sem URL de retorno");
  return json.url;
}

/**
 * Upload product image. Prefers Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
 * otherwise returns the optimized data URL for storage in products.image (no schema change).
 */
router.post("/admin/uploads/product-image", requireCompanyAuth, async (req, res) => {
  try {
    const body = (req.body ?? {}) as { dataUrl?: string; fileName?: string };
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!dataUrl.startsWith("data:image/")) {
      res.status(400).json({ error: "Envie uma imagem válida (data URL)." });
      return;
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      res.status(400).json({
        error: "Imagem ainda muito grande após otimização. Tente outra foto ou reduza o zoom do recorte.",
      });
      return;
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed || !parsed.mime.startsWith("image/")) {
      res.status(400).json({ error: "Tipo de imagem inválido." });
      return;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const companyId = req.companyId!;
    const safeName = String(body.fileName || "produto.jpg")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const pathname = `products/${companyId}/${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.jpg`;

    if (token) {
      try {
        const url = await putVercelBlob(token, pathname, parsed.buffer, "image/jpeg");
        res.json({ url, storage: "blob" });
        return;
      } catch (err) {
        req.log.warn({ err }, "Vercel Blob upload failed — falling back to data URL");
      }
    }

    // Fallback: persist as optimized data URL in the existing products.image text field.
    res.json({ url: dataUrl, storage: "inline" });
  } catch (err) {
    req.log.error({ err }, "product image upload failed");
    res.status(500).json({ error: "Falha no upload da imagem." });
  }
});

export default router;
