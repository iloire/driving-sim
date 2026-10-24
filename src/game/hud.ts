// The dashboard: the road you're on as a sign plate (top), the speed, gear and revs (bottom left),
// a heading-up map of the roads around you over the island photo (bottom right), and messages.

import type { Balloon } from '../sim/balloons';
import { isPaved, type Road, type RoadKind } from '../sim/roads';

const RPM_SEGMENTS = 24;
/** The balloons' colours on the map, matching their envelopes. */
const BALLOON_DOT = ['#e8432e', '#f2b705', '#2f9e5b', '#2b7de9', '#d23ea0', '#f4f3ee'];
const REDLINE_FROM = 0.85;
const MAP_PX = 200;
const ROAD_STYLE: Record<RoadKind, [string, number]> = {
  highway: ['#f2efe6', 4], primary: ['#f2efe6', 3.4], secondary: ['#e6e2d6', 3], tertiary: ['#d8d3c6', 2.6],
  minor: ['#b9b3a6', 1.8], service: ['#9a9488', 1.3], track: ['#c8a27a', 1.2], runway: ['#f2efe6', 6],
};

export interface HudFrame {
  speedKmh: number;
  /** What the gear box shows: 1–6, D, R, or ✈ in the air. */
  gear: string;
  rpmShare: number;
  road: Road | null;
  x: number;
  y: number;
  heading: number;
  /** Plane mode, and the height above the ground (m). */
  flying: boolean;
  boost: boolean;
  /** The Jet's Mach number, shown with the height. */
  mach?: number;
  /** On wings: the throttle (0..1, shown as AB with the afterburner lit) and whether the airbrake is out. */
  throttle?: number;
  airbrake?: boolean;
  /** Balloons to dot on the map (empty when the game is off). */
  balloons: readonly Balloon[];
  agl: number;
}

/** "LZ-67 · Carretera de Yaiza" → ["LZ-67", "Carretera de Yaiza"]; a name alone has no plate. */
export function splitRoadName(name: string): [string, string] {
  const [first, ...rest] = name.split(' · ');
  if (/^[A-Z]{1,3}-\d+[A-Z]?$/.test(first)) return [first, rest.join(' · ')];
  return ['', name];
}

export class Hud {
  private readonly el = {
    cluster: document.getElementById('cluster')!,
    speed: document.getElementById('speed')!,
    gear: document.getElementById('gear')!,
    alt: document.getElementById('alt')!,
    rpm: document.getElementById('rpm')!,
    plate: document.getElementById('plate')!,
    plateRef: document.getElementById('plate-ref')!,
    plateName: document.getElementById('plate-name')!,
    message: document.getElementById('message')!,
    score: document.getElementById('score')!,
    scoreValue: document.getElementById('score-value')!,
    scorePops: document.getElementById('score-pops')!,
    scoreBest: document.getElementById('score-best')!,
    popToast: document.getElementById('pop-toast')!,
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

  /** The balloon game's panel: score, balloons popped, best; hidden when the game is off. */
  setScore(on: boolean, score: number, popped: number, best: number): void {
    this.el.score.hidden = !on;
    this.el.scoreValue.textContent = score.toLocaleString('en');
    this.el.scorePops.textContent = String(popped);
    this.el.scoreBest.textContent = best.toLocaleString('en');
  }

  /** "+340 ×2" rising from the middle of the screen. */
  pop(points: number, combo: number): void {
    const t = this.el.popToast;
    t.textContent = `+${points}${combo > 1 ? `  ×${combo}` : ''}`;
    t.classList.toggle('big', combo > 2);
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  say(text: string, seconds = 3.5): void {
    this.el.message.textContent = text;
    this.el.message.classList.add('show');
    this.messageTimer = seconds;
  }

  update(dt: number, f: HudFrame): void {
    this.el.speed.textContent = String(Math.round(Math.abs(f.speedKmh)));
    this.el.cluster.classList.toggle('boost', f.boost);
    this.el.gear.textContent = f.gear;
    const up = f.flying && f.agl > 3;
    this.el.alt.hidden = !up;
    if (up) {
      const thrust = f.throttle === undefined ? '' : ` · ${f.boost ? 'AB' : `${Math.round(f.throttle * 100)}%`}${f.airbrake ? ' · BRAKE' : ''}`;
      this.el.alt.textContent = `${Math.round(f.agl)} m up${f.mach === undefined ? '' : ` · M${f.mach.toFixed(2)}`}${thrust}`;
    }
    const lit = Math.round(f.rpmShare * RPM_SEGMENTS);
    this.segs.forEach((s, i) => s.classList.toggle('on', i < lit));

    // Above the treetops the road below is not the one you're on.
    const road = f.flying && f.agl > 15 ? null : f.road;
    const key = road ? `${road.kind}|${road.name}` : f.flying && f.agl > 15 ? 'air' : '';
    if (key !== this.lastRoad) {
      this.lastRoad = key;
      const [ref, name] = road ? splitRoadName(road.name) : ['', ''];
      this.el.plateRef.textContent = ref;
      this.el.plateRef.hidden = !ref;
      this.el.plateName.textContent = key === 'air' ? 'In the air' : !road ? 'Off road' : name || (ref ? '' : road.kind === 'track' ? 'Dirt track' : 'Unnamed road');
      this.el.plate.classList.toggle('off', !road || !isPaved(road.kind));
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
    // Wider with speed, and much wider with height.
    const mPerPx = 2.5 + Math.min(Math.abs(f.speedKmh), 160) * 0.035 + (f.flying ? Math.min(Math.max(f.agl, 0), 1500) * 0.02 : 0);
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
    const kinds: RoadKind[] = ['runway', 'track', 'service', 'minor', 'tertiary', 'secondary', 'primary', 'highway'];
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
    // Balloons: dots in their own colours, heading-up like the map; out of range they sit on the rim.
    const c = Math.cos(f.heading), sn = Math.sin(f.heading);
    for (const bl of f.balloons) {
      const px = bl.x - f.x, py = f.y - bl.y;
      const rx = (px * c + py * sn) / mPerPx, ry = (-px * sn + py * c) / mPerPx;
      const d = Math.hypot(rx, ry), edge = r - 7, k = d > edge ? edge / d : 1;
      g.fillStyle = BALLOON_DOT[bl.colour % BALLOON_DOT.length];
      g.globalAlpha = k < 1 ? 0.6 : 1;
      g.beginPath();
      g.arc(r + rx * k, r + ry * k, k < 1 ? 2.5 : 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
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
