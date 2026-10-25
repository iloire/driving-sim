// Places of interest: the named spots a zone labels in the sky over them. Each zone picks its own
// in site.json's `places` block, in either or both of two ways: a class of OSM features (its
// peaks), which scripts/fetch-terrain.ts asks OpenStreetMap for, thins to the few worth a label
// and writes to places.json; or a hand-picked list of spots by lat/lon, read as the game loads.

/** A hand-picked place, as lat/lon like a spawn. */
export interface Spot {
  name: string;
  lat: number;
  lon: number;
}

/** site.json's `places`: which places to label. */
export interface PlacesSpec {
  /** Overpass selectors, each one element type and its tags, e.g. `node[natural=peak][name]`. */
  osm?: string[];
  /** The most OSM places the zone gets, highest first; omitted = all of them. */
  max?: number;
  /** A place is dropped if a higher one already kept is closer than this (m): one label per mountain, not one per needle. */
  spacingM?: number;
  /** Places named by hand, always labelled. */
  spots?: Spot[];
}

/** One labelled place in places.json, site frame (m). */
export interface Place {
  n: string;
  x: number;
  y: number;
  /** Elevation from OSM (m), when it has one. */
  ele?: number;
}

export interface PlacesFile {
  places: Place[];
}

/** The name to show: the Spanish one when OSM has it, else the first of `name`'s ' / ' alternatives. */
export function placeName(tags: Record<string, string>): string | undefined {
  return (tags['name:es'] ?? tags.name)?.split(' / ')[0].trim() || undefined;
}

/** The candidates worth a label: highest first, none within `spacingM` of a higher one kept, at most `max`. */
export function pickPlaces(candidates: Place[], spec: Pick<PlacesSpec, 'max' | 'spacingM'>): Place[] {
  const spacing = spec.spacingM ?? 0;
  const max = spec.max ?? Infinity;
  const kept: Place[] = [];
  for (const p of [...candidates].sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0))) {
    if (kept.length >= max) break;
    if (!kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < spacing)) kept.push(p);
  }
  return kept;
}
