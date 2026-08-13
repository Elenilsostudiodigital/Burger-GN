/** Compress a receipt photo so the upload JSON stays well under the API body limit. */
const MAX_DATA_URL_CHARS = 450_000;
const MAX_WIDTH = 1080;

export function compressReceiptImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.72, 0.58, 0.44, 0.32]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length <= MAX_DATA_URL_CHARS) {
            resolve(dataUrl);
            return;
          }
        }
        const fallback = canvas.toDataURL("image/jpeg", 0.22);
        if (fallback.length > 1_100_000) {
          reject(new Error("Comprovante muito grande. Tire uma foto mais próxima ou escolha outra imagem."));
          return;
        }
        resolve(fallback);
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
