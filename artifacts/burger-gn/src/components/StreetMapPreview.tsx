/**
 * Map preview without <iframe>.
 *
 * Previous OSM iframe embeds caused React NotFoundError (insertBefore) when the
 * surrounding admin form reconciled. This component uses a static map <img>
 * only — no Leaflet, no react-leaflet, no iframe, no DOM APIs.
 *
 * Child tree is fixed: always the same elements; visibility via CSS only.
 */

type StreetMapPreviewProps = {
  lat: number | null;
  lng: number | null;
  loading?: boolean;
  message?: string;
};

function staticMapUrl(lat: number, lng: number): string {
  const center = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    `https://staticmap.openstreetmap.de/staticmap.php` +
    `?center=${center}&zoom=16&size=640x240&maptype=mapnik` +
    `&markers=${center},red-pushpin`
  );
}

function osmBrowseUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

export function StreetMapPreview({
  lat,
  lng,
  loading = false,
  message = '',
}: StreetMapPreviewProps) {
  const hasCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const showMap = hasCoords && !loading;
  const coordText =
    hasCoords && lat != null && lng != null
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : '—';
  const mapSrc = hasCoords
    ? staticMapUrl(lat as number, lng as number)
    : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const browseHref = hasCoords
    ? osmBrowseUrl(lat as number, lng as number)
    : '#';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="relative h-[220px] bg-zinc-950">
        <img
          alt={hasCoords ? 'Mapa do endereço selecionado' : ''}
          src={mapSrc}
          className={`block h-[220px] w-full object-cover ${showMap ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
        />

        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center ${
            showMap ? 'invisible pointer-events-none' : ''
          }`}
          aria-hidden={showMap}
        >
          <p
            className={`text-amber-500 text-sm font-bold ${loading ? '' : 'invisible'}`}
          >
            Localizando endereço…
          </p>
          <p className={`text-zinc-500 text-sm ${loading ? 'invisible' : ''}`}>
            Mapa do endereço
          </p>
          <p className={`text-zinc-600 text-xs ${loading ? 'invisible' : ''}`}>
            Clique em Localizar Endereço e escolha um resultado.
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-800 px-3 py-2.5 space-y-1 min-h-[3.25rem]">
        <p className={`text-zinc-300 text-xs ${hasCoords ? '' : 'invisible'}`}>
          Coordenadas: <span className="text-white font-mono">{coordText}</span>
        </p>
        <a
          href={browseHref}
          target="_blank"
          rel="noreferrer"
          tabIndex={hasCoords ? 0 : -1}
          aria-disabled={!hasCoords}
          className={`text-amber-500 text-xs font-bold hover:underline ${
            hasCoords ? '' : 'invisible pointer-events-none'
          }`}
        >
          Abrir no OpenStreetMap
        </a>
        <p className={`text-zinc-600 text-xs ${hasCoords ? 'invisible' : ''}`}>
          {message || 'Nenhum ponto selecionado ainda.'}
        </p>
      </div>
    </div>
  );
}
