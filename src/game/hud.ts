// The dashboard: the road you're on as a sign plate (top), the speed, gear and revs (bottom left),
// a heading-up map of the roads around you over the island photo (bottom right), and messages.

import { isPaved, type Road, type RoadKind } from '../sim/roads';

const RPM_SEGMENTS = 24;
const REDLINE_FROM = 0.85;
const MAP_PX = 200;
const ROAD_STYLE: Record<RoadKind, [string, number]> = {
  highway: ['#f2efe6', 4], primary: ['#f2efe6', 3.4], secondary: ['#e6e2d6', 3], tertiary: ['#d8d3c6', 2.6],
  minor: ['#b9b3a6', 1.8], service: ['#9a9488', 1.3], track: ['#c8a27a', 1.2],
};

export interface HudFrame {
  speedKmh: number;
  gear: number;
  rpmShare: number;
  road: Road | null;
  x: number;
  y: number;
  heading: number;
}

/** "LZ-67 · Carretera de Yaiza" → ["LZ-67", "Carretera de Yaiza"]; a name alone has no plate. */
export function splitRoadName(name: string): [string, string] {
  const [first, ...rest] = name.split(' · ');
  if (/^[A-Z]{1,3}-\d+[A-Z]?$/.test(first)) return [first, rest.join(' · ')];
  return ['', name];
}

export class Hud {
  private readonly el = {
    speed: document.getElementById('speed')!,
    gear: document.getElementById('gear')!,
    rpm: document.getElementById('rpm')!,
    plate: document.getElementById('plate')!,
    plateRef: document.getElementById('plate-ref')!,
    plateName: document.getElementById('plate-name')!,
    message: document.getElementById('message')!,
    map: document.getElementById('minimap') as HTMLCanvasElement,
  };
  private readonly segs: HTMLElement[] = [];
  private readonly g: CanvasRenderingContext2D;
  private readonly roads: { road: Road; box: [number, number, number, number] }[];
  private lastRoad = '';
  private mapTimer = 0;
  private messageTimer = 0;

  constructor(sha: string, roads: Road[], private readonly ortho: HTMLImageElement, private readonly extent: number) {
    if (sha) document.getElementById('sha')!.textContent = sha;
    for (let i = 0; i < RPM_SEGMENTS; i++) {
      const s = document.createElement('i');
      if (i / RPM_SEGMENTS >= REDLINE_FROM) s.className = 'red';
      this.el.rpm.append(s);
      this.segs.push(s);
    }
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.el.map.width = this.el.map.height = MAP_PX * dpr;
    this.g = this.el.map.getContext('2d')!;
    this.g.scale(dpr, dpr);
    this.roads = roads.map((road) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < road.pts.length; i += 2) {
        x0 = Math.min(x0, road.pts[i]); x1 = Math.max(x1, road.pts[i]);
        y0 = Math.min(y0, road.pts[i + 1]); y1 = Math.max(y1, road.pts[i + 1]);
      }
      return { road, box: [x0, y0, x1, y1] };
    });
  }

  say(text: string, seconds = 3.5): void {
    this.el.message.textContent = text;
    this.el.message.classList.add('show');
    this.messageTimer = seconds;
  }

  update(dt: number, f: HudFrame): void {
    this.el.speed.textContent = String(Math.round(Math.abs(f.speedKmh)));
    this.el.gear.textContent = f.gear < 0 ? 'R' : String(f.gear);
    const lit = Math.round(f.rpmShare * RPM_SEGMENTS);
    this.segs.forEach((s, i) => s.classList.toggle('on', i < lit));

    const key = f.road ? `${f.road.kind}|${f.road.name}` : '';
    if (key !== this.lastRoad) {
      this.lastRoad = key;
      const [ref, name] = f.road ? splitRoadName(f.road.name) : ['', ''];
      this.el.plateRef.textContent = ref;
      this.el.plateRef.hidden = !ref;
      this.el.plateName.textContent = !f.road ? 'Off road' : name || (ref ? '' : f.road.kind === 'track' ? 'Dirt track' : 'Unnamed road');
      this.el.plate.classList.toggle('off', !f.road || !isPaved(f.road.kind));
      // Replay the swap-in so a new road reads as an event.
      this.el.plate.classList.remove('swap');
      void this.el.plate.offsetWidth;
      this.el.plate.classList.add('swap');
    }

    if (this.messageTimer > 0 && (this.messageTimer -= dt) <= 0) this.el.message.classList.remove('show');
    if ((this.mapTimer -= dt) <= 0) {
      this.mapTimer = 1 / 15;
      this.drawMap(f);
    }
  }

  /** Heading-up: the car at the centre pointing up, the view widening with speed. */
  private drawMap(f: HudFrame): void {
    const g = this.g, r = MAP_PX / 2, e = this.extent;
    const mPerPx = 2.5 + Math.min(Math.abs(f.speedKmh), 160) * 0.035;
    const reach = r * mPerPx * 1.45;
    g.save();
    g.clearRect(0, 0, MAP_PX, MAP_PX);
    g.beginPath();
    g.arc(r, r, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0d2633';
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    g.translate(r, r);
    g.rotate(-f.heading);
    g.scale(1 / mPerPx, 1 / mPerPx);
    // Site frame → map: x east stays right, y north goes up the canvas.
    const imgPx = this.ortho.naturalWidth / e;
    g.globalAlpha = 0.55;
    g.drawImage(this.ortho, (f.x - reach) * imgPx, (e - f.y - reach) * imgPx, 2 * reach * imgPx, 2 * reach * imgPx,
      -reach, -reach, 2 * reach, 2 * reach);
    g.globalAlpha = 1;
    g.lineCap = g.lineJoin = 'round';
    const kinds: RoadKind[] = ['track', 'service', 'minor', 'tertiary', 'secondary', 'primary', 'highway'];
    for (const kind of kinds) {
      const [color, width] = ROAD_STYLE[kind];
      g.strokeStyle = color;
      g.lineWidth = width * mPerPx;
      g.beginPath();
      for (const { road, box } of this.roads) {
        if (road.kind !== kind || box[2] < f.x - reach || box[0] > f.x + reach || box[3] < f.y - reach || box[1] > f.y + reach) continue;
        const p = road.pts;
        g.moveTo(p[0] - f.x, f.y - p[1]);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] - f.x, f.y - p[i + 1]);
      }
      g.stroke();
    }
    g.restore();
    // The car: a rust chevron, always pointing up.
    g.fillStyle = '#e0683a';
    g.strokeStyle = '#16130f';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(r, r - 9);
    g.lineTo(r + 6.5, r + 7);
    g.lineTo(r, r + 3.5);
    g.lineTo(r - 6.5, r + 7);
    g.closePath();
    g.stroke();
    g.fill();
  }
}
