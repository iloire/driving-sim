// Loads a site folder from public/sites/<id>/ and converts between lat/lon and the local frame
// (x east, y north, metres from the bbox's south-west corner). The 5 m detail tiles cover the
// whole island, too many to fetch up front: a tile's heights and objects (buildings, lamps, posts)
// load with its photo as the car nears it (terrain-view.ts), and `ensureDetail` waits for the
// tiles around a point.

import proj4 from 'proj4';
import { BuildingIndex, roofline } from '../sim/buildings';
import { parseObjects, type TileObjects, type TileObjectsFile } from '../sim/objects';
import { isPaved, parseRoads, RoadIndex, type RoadsFile } from '../sim/roads';
import { Heightmap } from '../sim/terrain';

export interface SpawnSpec {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Start exactly here facing this point (a runway) instead of on the nearest road. */
  toward?: { lat: number; lon: number };
}

export interface SiteSpec {
  name: string;
  country: string;
  proj4: string;
  crs: string;
  bbox: [number, number, number, number];
  /** `unitM`: metres per stored step, omitted = 0.1. */
  heightmap: { file: string; size: number; unitM?: number };
  ortho: { file: string; size: number };
  /** Native-resolution tiles with the roads carved in, written by scripts/fetch-terrain.ts. */
  detail: { dir: string; tileM: number; orthoSize: number };
  spawns: SpawnSpec[];
}

/** A place to start, already on the road: the nearest paved road to the spec's point. */
export interface Spawn {
  spec: SpawnSpec;
  x: number;
  y: number;
  heading: number;
}

export interface DetailTile {
  col: number;
  row: number;
  orthoUrl: string;
  binUrl: string;
  objectsUrl: string;
  /** Set once the tile's heights and objects are in. */
  objects?: TileObjects;
}

export interface Site {
  spec: SiteSpec;
  terrain: Heightmap;
  orthoUrl: string;
  detailTileM: number;
  detailTiles: DetailTile[];
  roads: RoadIndex;
  /** The buildings of the loaded tiles, for the car to crash into. */
  buildings: BuildingIndex;
  spawns: Spawn[];
  toLatLon(x: number, y: number): [number, number];
  /** Loads the heights of the detail tiles within `radius` of a point (they stay until the view frees them). */
  ensureDetail(x: number, y: number, radius?: number): Promise<void>;
  /** Loads one tile's heights and objects. */
  loadTile(t: DetailTile): Promise<void>;
  /** Frees a tile's heights and objects (the coarse map takes over there). */
  freeTile(t: DetailTile): void;
}

const BASE = `${import.meta.env.BASE_URL}sites/`;

export async function loadSite(id: string): Promise<Site> {
  const base = `${BASE}${id}/`;
  const spec = (await (await fetch(`${base}site.json`)).json()) as SiteSpec;
  const detailDir = `${base}${spec.detail.dir}/`;
  const [heights, roadsFile, index] = await Promise.all([
    fetch(`${base}${spec.heightmap.file}`).then((r) => r.arrayBuffer()),
    fetch(`${base}roads.json`).then((r) => r.json() as Promise<RoadsFile>),
    fetch(`${detailDir}tiles.json`).then((r) => r.json() as Promise<{ size: number; tiles: [number, number][] }>),
  ]);
  const [x0, y0, x1] = spec.bbox;
  const unitM = spec.heightmap.unitM ?? 0.1;
  const tileM = spec.detail.tileM;
  const terrain = Heightmap.fromInt16(heights, spec.heightmap.size, x1 - x0, unitM);
  const roads = new RoadIndex(parseRoads(roadsFile));
  const proj = proj4('EPSG:4326', spec.proj4);

  const detailTiles = index.tiles.map(([col, row]): DetailTile => ({
    col, row, orthoUrl: `${detailDir}${col}_${row}.jpg`, binUrl: `${detailDir}${col}_${row}.bin`,
    objectsUrl: `${base}objects/${col}_${row}.json`,
  }));
  const buildings = new BuildingIndex();
  const pending = new Map<DetailTile, Promise<void>>();
  const loaded = (t: DetailTile) => !!t.objects && !!terrain.detailAt((t.col + 0.5) * tileM, (t.row + 0.5) * tileM);
  const loadTile = (t: DetailTile): Promise<void> => {
    if (loaded(t)) return Promise.resolve();
    let p = pending.get(t);
    if (!p) {
      p = Promise.all([
        fetch(t.binUrl).then((r) => r.arrayBuffer()),
        fetch(t.objectsUrl).then((r) => r.json() as Promise<TileObjectsFile>),
      ]).then(([buf, objects]) => {
        terrain.addDetail(tileM, t.col, t.row, Heightmap.fromInt16(buf, index.size, tileM, unitM, t.col * tileM, t.row * tileM));
        t.objects = parseObjects(objects);
        for (const b of t.objects.buildings) b.top = roofline(b, (x, y) => terrain.heightAt(x, y)).top;
        buildings.add(`${t.col}_${t.row}`, t.objects.buildings);
      }).finally(() => pending.delete(t));
      pending.set(t, p);
    }
    return p;
  };

  const spawns = spec.spawns.map((s): Spawn => {
    const [e, n] = proj.forward([s.lon, s.lat]);
    if (s.toward) {
      const [te, tn] = proj.forward([s.toward.lon, s.toward.lat]);
      return { spec: s, x: e - x0, y: n - y0, heading: (Math.atan2(te - e, tn - n) + 2 * Math.PI) % (2 * Math.PI) };
    }
    const hit = roads.nearest(e - x0, n - y0, 3000, (r) => isPaved(r.kind) && r.kind !== 'service');
    return hit ? { spec: s, x: hit.x, y: hit.y, heading: hit.heading } : { spec: s, x: e - x0, y: n - y0, heading: 0 };
  });

  return {
    spec,
    terrain,
    orthoUrl: `${base}${spec.ortho.file}`,
    detailTileM: tileM,
    detailTiles,
    roads,
    buildings,
    spawns,
    toLatLon(x, y) {
      const [lon, lat] = proj.inverse([x + x0, y + y0]);
      return [lat, lon];
    },
    async ensureDetail(x, y, radius = 600) {
      const near = detailTiles.filter((t) => {
        const dx = Math.max(t.col * tileM - x, 0, x - (t.col + 1) * tileM);
        const dy = Math.max(t.row * tileM - y, 0, y - (t.row + 1) * tileM);
        return Math.hypot(dx, dy) <= radius && !loaded(t);
      });
      await Promise.all(near.map(loadTile));
    },
    loadTile,
    freeTile(t) {
      terrain.removeDetail(t.col, t.row);
      buildings.remove(`${t.col}_${t.row}`);
      t.objects = undefined;
    },
  };
}
