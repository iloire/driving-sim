// Downloads the open IGN data and the OpenStreetMap roads for a site, and writes the files the game loads:
//   height.bin — Int16 little-endian, heightmap.unitM metres a step (default 0.1),
//                row 0 = north edge, sea = SEA_FLOOR_M
//   ortho.jpg  — PNOA orthophoto over exactly the same bbox
//   roads.json — the drivable OSM ways in the site frame (see src/sim/roads.ts)
//   objects/   — per detail tile: OSM buildings, street lamps and edge posts (src/sim/objects.ts)
//   detail/    — the same pair at the DEM's native 5 m (and a sharper photo) for every square
//                tile with land, the roads carved into their heights, plus tiles.json listing them
// Downloads are cached in cache/<site>/ (git-ignored) and reused, so re-carving after a change
// to the road model is offline. --refresh downloads everything again.
// Usage: npm run fetch-terrain -- lanzarote
//        npm run fetch-terrain -- lanzarote --refresh
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import { area, BuildingIndex, type Building } from '../src/sim/buildings';
import { buildingHeight, placeFurniture, type TileObjectsFile } from '../src/sim/objects';
import { carveRoads, parseRoads, type RoadKind, type RoadsFile } from '../src/sim/roads';
import { Heightmap } from '../src/sim/terrain';

const WCS = 'https://servicios.idee.es/wcs-inspire/mdt';
const WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NODATA = -32768;
const SEA_FLOOR_M = -15; // 15 m below the water plane, so the coastline reads clearly
const DEM_RES = 5; // MDT05 native resolution (m)
/** A detail tile needs at least this much land to be worth fetching. */
const MIN_LAND = 0.01;

interface SiteFile {
  proj4: string;
  crs: string;
  bbox: [number, number, number, number];
  heightmap: { file: string; size: number; unitM?: number };
  ortho: { file: string; size: number };
  detail: { dir: string; tileM: number; orthoSize: number };
}

/** OSM highway=* values worth driving, and what the game calls them. */
const HIGHWAYS: Record<string, RoadKind> = {
  motorway: 'highway', motorway_link: 'highway', trunk: 'highway', trunk_link: 'highway',
  primary: 'primary', primary_link: 'primary', secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary',
  unclassified: 'minor', residential: 'minor', living_street: 'minor',
  service: 'service', track: 'track',
};
/** Service ways that are car parks and private drives, not roads. */
const SKIP_SERVICE = new Set(['driveway', 'parking_aisle', 'drive-through']);

// IGN answers the odd request with a 502 partway through a long run; retry those.
async function download(url: string, tries = 4): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (res.ok) return res.arrayBuffer();
  if (res.status >= 500 && tries > 1) {
    await new Promise((r) => setTimeout(r, 5000));
    return download(url, tries - 1);
  }
  throw new Error(`${res.status} ${res.statusText} for ${url}`);
}

// The WCS returns whole metres; a 3×3 box blur removes the 1 m terracing on gentle slopes.
function smooth(src: Float32Array, n: number, isSea: Uint8Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (isSea[i]) { out[i] = src[i]; continue; }
      let sum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const j = yy * n + xx;
          if (isSea[j]) continue;
          sum += src[j]; count++;
        }
      }
      out[i] = sum / count;
    }
  }
  return out;
}

/**
 * DEM over a square, as game-ready Int16 in `unitM` steps. `n` samples a side; omitting it takes
 * the native 5 m grid with a one-pixel margin that is cropped after smoothing, so
 * neighbouring tiles blur across their shared edge identically.
 */
async function fetchDem(epsg: string, unitM: number, x0: number, y0: number, x1: number, y1: number, n?: number): Promise<Int16Array> {
  const m = n === undefined ? DEM_RES : 0;
  let url = `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&CoverageId=Elevacion${epsg}_5` +
    `&FORMAT=image/tiff&SUBSET=x(${x0 - m},${x1 + m})&SUBSET=y(${y0 - m},${y1 + m})`;
  if (n !== undefined) url += `&SCALESIZE=x(${n}),y(${n})`;
  const image = await (await fromArrayBuffer(await download(url))).getImage();
  const w = image.getWidth();
  if (image.getHeight() !== w) throw new Error(`expected a square DEM, got ${w}×${image.getHeight()}`);
  const [raster] = (await image.readRasters()) as unknown as [ArrayLike<number>];
  const raw = new Float32Array(w * w);
  const isSea = new Uint8Array(w * w);
  for (let i = 0; i < w * w; i++) {
    const v = raster[i];
    // Some IGN tiles store open sea as 0 m rather than nodata.
    if (v === NODATA || v <= 0) { isSea[i] = 1; raw[i] = SEA_FLOOR_M; } else raw[i] = v;
  }
  const height = smooth(raw, w, isSea);
  const crop = m ? 1 : 0;
  const size = w - 2 * crop;
  const out = new Int16Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = (r + crop) * w + c + crop;
      const v = Math.round((isSea[i] ? SEA_FLOOR_M : height[i]) / unitM);
      // An Int16Array would silently wrap a peak above 32767 steps (3276 m in decimetres).
      if (v > 32767) throw new Error(`${(v * unitM).toFixed(0)} m is above the ${(32767 * unitM).toFixed(0)} m Int16 holds at ${unitM} m a step — raise heightmap.unitM`);
      out[r * size + c] = v;
    }
  }
  return out;
}

async function fetchOrtho(crs: string, x0: number, y0: number, x1: number, y1: number, size: number): Promise<Buffer> {
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=` +
    `&CRS=${crs}&BBOX=${x0},${y0},${x1},${y1}&WIDTH=${size}&HEIGHT=${size}&FORMAT=image/jpeg`;
  return Buffer.from(await download(url));
}

/** Tiles (col from the west, row from the south) with any land worth driving on. */
function pickTiles(site: SiteFile, base: Int16Array): [number, number][] {
  const { tileM } = site.detail;
  const [x0, , x1] = site.bbox;
  const extent = x1 - x0, n = site.heightmap.size, px = extent / n, unitM = site.heightmap.unitM ?? 0.1;
  const tiles: [number, number][] = [];
  const count = Math.round(extent / tileM);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      let land = 0, total = 0;
      for (let y = row * tileM; y < (row + 1) * tileM; y += px) {
        for (let x = col * tileM; x < (col + 1) * tileM; x += px) {
          const r = Math.min(Math.floor((extent - y) / px), n - 1), c = Math.floor(x / px);
          total++;
          if (base[r * n + c] * unitM > 5) land++;
        }
      }
      if (land / total >= MIN_LAND) tiles.push([col, row]);
    }
  }
  return tiles;
}

interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

/** Ways matching an Overpass filter over the site's bbox, with their geometry. */
async function fetchOsm(site: SiteFile, filter: string): Promise<OsmWay[]> {
  const [x0, y0, x1, y1] = site.bbox;
  const proj = proj4('EPSG:4326', site.proj4);
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([e, n]) => proj.inverse([e, n]));
  const lons = corners.map((c) => c[0]), lats = corners.map((c) => c[1]);
  const box = `${Math.min(...lats)},${Math.min(...lons)},${Math.max(...lats)},${Math.max(...lons)}`;
  const query = `[out:json][timeout:600];way${filter}(${box});out tags geom;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': 'driving-sim fetch-terrain (github.com/iloire/driving-sim)' },
  });
  if (!res.ok) throw new Error(`Overpass: ${res.status} ${res.statusText}`);
  return ((await res.json()) as { elements: OsmWay[] }).elements;
}

/** OSM building ways → footprints in the site frame (to the decimetre), slivers dropped. */
function toBuildings(site: SiteFile, ways: OsmWay[]): Building[] {
  const [x0, y0] = site.bbox;
  const proj = proj4('EPSG:4326', site.proj4);
  const out: Building[] = [];
  for (const way of ways) {
    if (['construction', 'ruins', 'collapsed'].includes(way.tags.building)) continue;
    const pts: number[] = [];
    for (const g of way.geometry) {
      const [e, n] = proj.forward([g.lon, g.lat]);
      pts.push(Math.round((e - x0) * 10) / 10, Math.round((n - y0) * 10) / 10);
    }
    if (pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1]) pts.length -= 2; // OSM closes the ring
    const footprint = Math.abs(area(pts));
    if (pts.length < 6 || footprint < 8) continue;
    out.push({ pts, height: Math.round(buildingHeight(way.tags, way.id, footprint) * 10) / 10 });
  }
  return out;
}

/** OSM ways → roads.json: site-frame coordinates to the decimetre, the private drives dropped. */
function toRoads(site: SiteFile, ways: OsmWay[]): RoadsFile {
  const [x0, y0] = site.bbox;
  const proj = proj4('EPSG:4326', site.proj4);
  const roads: RoadsFile['roads'] = [];
  for (const way of ways) {
    const t = way.tags;
    const kind: RoadKind | undefined = t.aeroway === 'runway' ? 'runway' : HIGHWAYS[t.highway];
    if (!kind || t.area === 'yes' || t.access === 'private' || t.tunnel === 'yes') continue;
    if (kind === 'service' && SKIP_SERVICE.has(t.service)) continue;
    const p: number[] = [];
    for (const g of way.geometry) {
      const [e, n] = proj.forward([g.lon, g.lat]);
      p.push(Math.round((e - x0) * 10) / 10, Math.round((n - y0) * 10) / 10);
    }
    if (p.length < 4) continue;
    const name = kind === 'runway' ? `Runway ${t.ref ?? ''}`.trim() : [t.ref, t.name].filter(Boolean).join(' · ');
    roads.push({ k: kind, ...(name && { n: name }), ...(t.bridge === 'yes' && { b: 1 as const }), p });
  }
  return { roads };
}

async function main(): Promise<void> {
  const siteId = process.argv[2] ?? 'lanzarote';
  const refresh = process.argv.includes('--refresh');
  const dir = join('public', 'sites', siteId);
  const cache = join('cache', siteId);
  const site = JSON.parse(readFileSync(join(dir, 'site.json'), 'utf8')) as SiteFile;
  const [x0, y0, x1, y1] = site.bbox;
  const epsg = site.crs.split(':')[1];
  const heightFile = join(dir, site.heightmap.file);
  const unitM = site.heightmap.unitM ?? 0.1;
  const fresh = (path: string) => refresh || !existsSync(path);

  if (fresh(heightFile)) {
    const n = site.heightmap.size;
    console.log(`DEM ${n}×${n} from IGN MDT05 …`);
    writeFileSync(heightFile, Buffer.from((await fetchDem(epsg, unitM, x0, y0, x1, y1, n)).buffer));
    console.log(`Ortho ${site.ortho.size}² from PNOA …`);
    writeFileSync(join(dir, site.ortho.file), await fetchOrtho(site.crs, x0, y0, x1, y1, site.ortho.size));
  }

  const osmFile = join(cache, 'osm.json');
  mkdirSync(cache, { recursive: true });
  if (fresh(osmFile)) {
    console.log('Roads from OpenStreetMap (Overpass) …');
    writeFileSync(osmFile, JSON.stringify(await fetchOsm(site, `["highway"~"^(${Object.keys(HIGHWAYS).join('|')})$"]`)));
  }
  // The airport's runway is a road too: something to take off from.
  const runwayFile = join(cache, 'runways-osm.json');
  if (fresh(runwayFile)) writeFileSync(runwayFile, JSON.stringify(await fetchOsm(site, '["aeroway"="runway"]')));
  const roadsFile = toRoads(site, [...JSON.parse(readFileSync(osmFile, 'utf8')), ...JSON.parse(readFileSync(runwayFile, 'utf8'))] as OsmWay[]);
  writeFileSync(join(dir, 'roads.json'), JSON.stringify(roadsFile));
  console.log(`${roadsFile.roads.length} roads`);

  // Raw 5 m tiles go to the cache; the game gets them with the roads carved in.
  const { tileM, orthoSize } = site.detail;
  const detailDir = join(dir, site.detail.dir);
  const rawDir = join(cache, 'detail');
  mkdirSync(detailDir, { recursive: true });
  mkdirSync(rawDir, { recursive: true });
  const base = new Int16Array(readFileSync(heightFile).buffer.slice(0));
  const tiles = pickTiles(site, base);
  console.log(`${tiles.length} detail tiles of ${tileM / 1000} km at ${DEM_RES} m …`);
  for (const [col, row] of tiles) {
    const tx0 = x0 + col * tileM, ty0 = y0 + row * tileM;
    const bin = join(rawDir, `${col}_${row}.bin`), jpg = join(detailDir, `${col}_${row}.jpg`);
    if (fresh(bin)) writeFileSync(bin, Buffer.from((await fetchDem(epsg, unitM, tx0, ty0, tx0 + tileM, ty0 + tileM)).buffer));
    if (fresh(jpg)) writeFileSync(jpg, await fetchOrtho(site.crs, tx0, ty0, tx0 + tileM, ty0 + tileM, orthoSize));
    process.stdout.write('.');
  }
  const size = tileM / DEM_RES;
  writeFileSync(join(detailDir, 'tiles.json'), JSON.stringify({ size, tiles }) + '\n');

  console.log('\nCarving the roads …');
  const toBuffer = (b: Buffer) => new Uint8Array(b).buffer;
  const terrain = Heightmap.fromInt16(toBuffer(readFileSync(heightFile)), site.heightmap.size, x1 - x0, unitM);
  for (const [col, row] of tiles) {
    const raw = toBuffer(readFileSync(join(rawDir, `${col}_${row}.bin`)));
    terrain.addDetail(tileM, col, row, Heightmap.fromInt16(raw, size, tileM, unitM, col * tileM, row * tileM));
  }
  carveRoads(terrain, parseRoads(roadsFile));
  for (const tile of terrain.details()) {
    const out = new Int16Array(tile.data.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.round(tile.data[i] / unitM);
    const col = Math.round(tile.x0 / tileM), row = Math.round(tile.y0 / tileM);
    writeFileSync(join(detailDir, `${col}_${row}.bin`), Buffer.from(out.buffer));
  }

  // Buildings and street furniture, filed under the tile that holds each one.
  const buildingsFile = join(cache, 'buildings-osm.json');
  if (fresh(buildingsFile)) {
    console.log('Buildings from OpenStreetMap (Overpass) …');
    writeFileSync(buildingsFile, JSON.stringify(await fetchOsm(site, '["building"]')));
  }
  const buildings = toBuildings(site, JSON.parse(readFileSync(buildingsFile, 'utf8')) as OsmWay[]);
  const index = new BuildingIndex();
  index.add('all', buildings);
  const { lamps, posts } = placeFurniture(parseRoads(roadsFile), index);
  const objects = new Map(tiles.map(([col, row]): [string, TileObjectsFile] => [`${col}_${row}`, { b: [], l: [], p: [] }]));
  const fileOf = (x: number, y: number) => objects.get(`${Math.floor(x / tileM)}_${Math.floor(y / tileM)}`);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  for (const b of buildings) {
    let cx = 0, cy = 0;
    for (let i = 0; i < b.pts.length; i += 2) { cx += b.pts[i]; cy += b.pts[i + 1]; }
    fileOf(cx / (b.pts.length / 2), cy / (b.pts.length / 2))?.b.push([b.height, ...b.pts]);
  }
  for (const l of lamps) fileOf(l.x, l.y)?.l.push(r1(l.x), r1(l.y), Math.round(l.heading * 100) / 100);
  for (const p of posts) fileOf(p.x, p.y)?.p.push(r1(p.x), r1(p.y));
  const objectsDir = join(dir, 'objects');
  mkdirSync(objectsDir, { recursive: true });
  for (const [key, file] of objects) writeFileSync(join(objectsDir, `${key}.json`), JSON.stringify(file));
  console.log(`${buildings.length} buildings, ${lamps.length} lamps, ${posts.length} edge posts`);
  console.log('Done');
}

main().catch((err) => { console.error(err); process.exit(1); });
