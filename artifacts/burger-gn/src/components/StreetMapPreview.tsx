import { Loader2, MapPin } from 'lucide-react';

export function mapEmbedUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.012}%2C${lng + 0.012}%2C${lat + 0.012}&layer=mapnik&marker=${lat}%2C${lng}`;
}

type StreetMapPreviewProps = {
  lat: number | null;
  lng: number | null;
  loading?: boolean;
};

/**
 * OpenStreetMap embed host with a FIXED React child tree.
 *
 * Root cause of NotFoundError (insertBefore): swapping <iframe> ↔ placeholder/spinner
 * via conditional render unmounts the iframe document while React reconciles siblings.
 *
 * This component NEVER mounts/unmounts the iframe or overlays — it only toggles
 * visibility/src. No Leaflet, no react-leaflet, no direct DOM APIs, no map instance.
 */
export function StreetMapPreview({ lat, lng, loading = false }: StreetMapPreviewProps) {
  const hasCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const src = hasCoords ? mapEmbedUrl(lat, lng) : 'about:blank';

  return (
    <div className="relative rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 min-h-[220px]">
      {/* Child 0 — always present. React only updates the src attribute. */}
      <iframe
        title="Mapa da rua"
        src={src}
        className={`block w-full h-[220px] border-0 bg-zinc-950 ${hasCoords ? 'opacity-100' : 'opacity-0'}`}
        referrerPolicy="no-referrer-when-downgrade"
      />

      {/* Child 1 — always present. Hidden when coords exist. */}
      <div
        className={`absolute inset-0 flex items-center justify-center px-4 text-center text-zinc-600 text-sm bg-zinc-950 ${
          hasCoords ? 'invisible pointer-events-none' : ''
        }`}
        aria-hidden={hasCoords}
      >
        <div>
          <MapPin className="mx-auto mb-2 opacity-50" size={28} />
          Clique em &quot;Localizar Endereço&quot; e escolha um resultado
        </div>
      </div>

      {/* Child 2 — always present. Hidden when not loading. */}
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/75 ${
          loading ? '' : 'invisible pointer-events-none'
        }`}
        aria-hidden={!loading}
        aria-busy={loading}
        aria-live="polite"
      >
        <Loader2 className="animate-spin text-amber-500" />
      </div>
    </div>
  );
}
