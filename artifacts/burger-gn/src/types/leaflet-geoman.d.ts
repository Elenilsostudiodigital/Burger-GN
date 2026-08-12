import "leaflet";

declare module "leaflet" {
  interface PMDrawOptions {
    snappable?: boolean;
    allowSelfIntersection?: boolean;
  }

  interface PMControlsOptions {
    position?: string;
    drawMarker?: boolean;
    drawCircleMarker?: boolean;
    drawPolyline?: boolean;
    drawRectangle?: boolean;
    drawCircle?: boolean;
    drawText?: boolean;
    drawPolygon?: boolean;
    editMode?: boolean;
    dragMode?: boolean;
    cutPolygon?: boolean;
    removalMode?: boolean;
    rotateMode?: boolean;
  }

  interface PM {
    setLang: (lang: string) => void;
    addControls: (opts?: PMControlsOptions) => void;
    enableDraw: (shape: string, opts?: PMDrawOptions) => void;
    disableDraw: () => void;
  }

  interface Map {
    pm: PM;
  }
}
