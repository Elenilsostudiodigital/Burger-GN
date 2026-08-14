import React, { useEffect, useRef, useState } from "react";
import {
  Camera, ImagePlus, Loader2, RotateCw, Trash2, ZoomIn, ZoomOut, X, Maximize2, Check,
} from "lucide-react";
import { uploadProductImage } from "../lib/api";
import {
  PRODUCT_IMAGE_ACCEPT,
  fileToOptimizedJpegDataUrl,
  isAllowedProductImageFile,
  loadImageFromFile,
} from "../lib/productImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProductImageFieldProps {
  value: string;
  onChange: (url: string) => void;
}

export function ProductImageField({ value, onChange }: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  // Crop editor state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetCrop = () => {
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const openFile = (file: File) => {
    setError("");
    setSuccess("");
    const check = isAllowedProductImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    // Warm decode check
    loadImageFromFile(file)
      .then(() => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setPendingFile(file);
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Imagem inválida"));
  };

  const onPick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) openFile(file);
  };

  const confirmCropAndUpload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setProgress(8);
    setError("");
    setSuccess("");
    try {
      setProgress(25);
      const dataUrl = await fileToOptimizedJpegDataUrl(pendingFile, {
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
        rotation,
      });
      setProgress(55);
      const result = await uploadProductImage(dataUrl, pendingFile.name);
      setProgress(100);
      onChange(result.url);
      setSuccess("✅ Imagem enviada com sucesso.");
      resetCrop();
      setTimeout(() => setSuccess(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no upload da imagem.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onPick(e.dataTransfer.files);
    },
  };

  return (
      <div className="col-span-2 space-y-3">
      <div>
        <Label className="text-amber-400 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
          <Camera size={13} className="text-amber-500" /> Imagem do Produto
        </Label>
        <p className="text-zinc-500 text-[11px] mt-1">
          Escolha uma foto do computador ou da galeria. Não precisa colar URL.
        </p>
        <div
          {...dropHandlers}
          className={`mt-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-amber-500 bg-amber-500/10" : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
          <ImagePlus size={28} className="mx-auto text-zinc-500 mb-2" />
          <p className="text-zinc-300 text-sm font-bold">Selecionar Imagem</p>
          <p className="text-zinc-600 text-[11px] mt-1">
            Toque (câmera/galeria) ou arraste e solte · JPG PNG WEBP AVIF GIF
          </p>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 h-10 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
          >
            Selecionar Imagem
          </Button>
        </div>
      </div>

      {busy || progress > 0 ? (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <p className="text-zinc-500 text-[11px] flex items-center gap-1">
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {busy ? "Otimizando e enviando…" : "Concluído"}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-red-400 text-xs bg-red-950/40 border border-red-900 rounded-xl px-3 py-2">{error}</p>
      ) : null}
      {success ? (
        <p className="text-emerald-400 text-xs bg-emerald-950/30 border border-emerald-900/50 rounded-xl px-3 py-2">{success}</p>
      ) : null}

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
          <img
            src={value}
            alt="Imagem atual do produto"
            className="w-full h-40 object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.style.opacity = "0.3"; }}
          />
          <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="flex-1 h-8 rounded-lg bg-zinc-900/90 text-white text-[10px] font-bold uppercase flex items-center justify-center gap-1"
            >
              <Maximize2 size={12} /> Ampliar
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 h-8 rounded-lg bg-amber-500 text-zinc-950 text-[10px] font-bold uppercase flex items-center justify-center gap-1"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={() => { onChange(""); setSuccess(""); }}
              className="h-8 px-3 rounded-lg bg-red-900/80 text-red-200 text-[10px] font-bold uppercase flex items-center justify-center gap-1"
            >
              <Trash2 size={12} /> Remover
            </button>
          </div>
        </div>
      ) : null}

      <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
        <summary className="text-zinc-500 text-xs font-bold uppercase cursor-pointer select-none">
          Opção avançada · URL da Imagem
        </summary>
        <div className="mt-2 space-y-1">
          <Label className="text-zinc-600 text-[10px]">Preenchido automaticamente após o upload</Label>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… ou deixe o upload preencher"
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
          />
        </div>
      </details>

      {pendingFile && previewUrl ? (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h3 className="text-white font-black uppercase text-sm">Recortar imagem</h3>
              <button type="button" disabled={busy} onClick={resetCrop} className="text-zinc-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-zinc-500 text-xs">
                Ajuste zoom, posição e rotação. Assim o produto fica padronizado no cardápio.
              </p>
              <div
                className="relative mx-auto w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 touch-none select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  src={previewUrl}
                  alt="Recorte"
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: "center center",
                  }}
                />
                <div className="absolute inset-0 pointer-events-none ring-1 ring-amber-500/40 rounded-2xl" />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <ZoomOut size={16} />
                </button>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
                <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
                  title="Girar"
                >
                  <RotateCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1); }}
                  className="px-2 h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase text-zinc-400"
                >
                  Centralizar
                </button>
              </div>
              <div className="flex gap-2">
                <Button type="button" disabled={busy} variant="outline" onClick={resetCrop}
                  className="flex-1 h-11 border-zinc-700 text-zinc-300">
                  Cancelar
                </Button>
                <Button type="button" disabled={busy} onClick={() => void confirmCropAndUpload()}
                  className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold">
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  <span className="ml-1">Confirmar e enviar</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox && value ? (
        <div
          className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={value} alt="Ampliação" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
      ) : null}
    </div>
  );
}
