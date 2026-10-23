import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { CarAudio } from './game/audio';
import { BalloonsView } from './game/balloons-view';
import { CameraRig } from './game/camera';
import { createCarModel, type CarModel } from './game/car-model';
import { TileDresser } from './game/dress';
import { Hud } from './game/hud';
import { initAnalytics, track } from './game/analytics';
import { formatHour, readMoment, writeMoment, type Moment } from './game/share';
import { Input, type Action } from './game/input';
import { createRoadsterModel } from './game/roadster-model';
import { SpawnPicker } from './game/picker';
import { RoadView } from './game/road-view';
import { loadSite, type Spawn } from './game/site';
import { TerrainView } from './game/terrain-view';
import { TouchPad } from './game/touch';
import { createSurround, Sunlight } from './game/world';
import { BalloonField } from './sim/balloons';
import { createCar, ROADSTER, TRUCK, stepCar, type CarEnv, type CarSpec, type CarState, type Surface } from './sim/car';
import { isPaved, MAX_HALF_WIDTH, ROAD_WIDTH, type Road } from './sim/roads';
import { dayOfYear, daylightHours, sunPosition } from './sim/sun';
import { rotate } from './sim/vec';
import { stalled } from './sim/wings';

declare const __COMMIT_SHA__: string;

const STEP = 1 / 120;
const SITE = 'lanzarote';
/** Solar time a drive starts at without ?time=: late afternoon, long shadows over the lava. */
const DEFAULT_HOUR = 16.5;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const KEY = TOUCH
  ? { reset: 'RESET', pull: 'pull the right thumb down', climb: 'push the left thumb up to climb' }
  : { reset: 'R', pull: 'S to pull up', climb: 'Space to climb, Ctrl to sink' };

/** The cars on offer: the default Roadster, which hovers on thrusters, and the 4×4, which unfolds wings. */
const VEHICLES: Record<string, { name: string; spec: CarSpec; model: (spec: CarSpec) => CarModel }> = {
  roadster: { name: 'Roadster', spec: ROADSTER, model: createRoadsterModel },
  '4x4': { name: 'Armoured 4×4', spec: TRUCK, model: createCarModel },
};

const TARMAC: Surface = { grip: 1, rolling: 0.012 };
const GRAVEL: Surface = { grip: 0.72, rolling: 0.03 };
/** Picón and lava fields: loose and rough. */
const OFFROAD: Surface = { grip: 0.62, rolling: 0.06 };

/** Where the best balloon score is kept, in this browser only. */
const BEST_KEY = 'lanzarote-drive.best';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Private mode or blocked storage: the best score just doesn't survive the visit.
  }
}

/** AWD keeps the car's own front/rear split. */
const DRIVETRAINS: Record<string, number | null> = { AWD: null, RWD: 0, FWD: 1 };

/** The road under a point, if it is on the carriageway (or a track) rather than beside it. */
function onRoad(roads: { nearest(x: number, y: number, r: number): { road: Road; dist: number } | undefined }, x: number, y: number, margin: number): Road | null {
  const hit = roads.nearest(x, y, MAX_HALF_WIDTH + margin);
  return hit && hit.dist < ROAD_WIDTH[hit.road.kind] / 2 + margin ? hit.road : null;
}

function parseHour(q: URLSearchParams): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : undefined;
}

async function boot(): Promise<void> {
  initAnalytics();
  const query = new URLSearchParams(location.search);
  const site = await loadSite(SITE);
  const terrain = site.terrain;
  const extent = terrain.extent;

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200000);
  const sunlight = new Sunlight(scene, renderer);
  const ortho = await new THREE.TextureLoader().loadAsync(site.orthoUrl);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const roadView = new RoadView(site.roads.roads, terrain, anisotropy);
  const dresser = new TileDresser(terrain, roadView, site.detailTileM, anisotropy);
  const terrainView = new TerrainView(terrain, ortho, site.detailTileM, site.detailTiles, anisotropy, {
    load: (t) => site.loadTile(t),
    free: (t) => { dresser.free(t); site.freeTile(t); },
    dress: (t, level) => dresser.dress(t, level),
  });
  scene.add(terrainView.group, createSurround(extent));

  // The balloon game is off until B (or the settings panel, or the phone's button) turns it on.
  const vehicleId = query.get('car') === '4x4' ? '4x4' : 'roadster';
  const settings = { vehicle: VEHICLES[vehicleId].name, drivetrain: 'AWD', balloons: false };
  let spec: CarSpec = { ...VEHICLES[vehicleId].spec };
  let model = VEHICLES[vehicleId].model(spec);
  scene.add(model.group);
  if (model.world) scene.add(model.world);
  // The balloon game: a field kept full around the car, scored as you pop them.
  const field = new BalloonField((x, y) => terrain.heightAt(x, y), (x, y) => x > 0 && y > 0 && x < extent && y < extent,
    undefined, Date.now() % 1e9);
  const balloonsView = new BalloonsView(extent);
  balloonsView.visible = false;
  scene.add(balloonsView.group);
  let best = readBest();
  const lastPos: [number, number, number] = [0, 0, 0];

  /** Turns the balloon game on (a fresh sky around the car, the score kept) or off. */
  function setBalloons(on: boolean): void {
    settings.balloons = on;
    balloonsView.visible = on;
    track('balloons', { on, score: field.score });
    if (on) {
      field.fill(car.pos[0], car.pos[1]);
      lastPos.splice(0, 3, ...car.pos);
    }
    hud.say(on ? 'Balloon game on — fly through them, chain them for a combo (B to stop)' : 'Balloon game off', 3);
  }
  const rig = new CameraRig(camera, canvas);
  const audio = new CarAudio();
  audio.electric = !!spec.engine.electric;
  const hud = new Hud(__COMMIT_SHA__, site.roads.roads, ortho.image as HTMLImageElement, extent);

  const env: CarEnv = {
    height: (x, y) => terrain.heightAt(x, y),
    surface: (x, y) => {
      const road = onRoad(site.roads, x, y, 0.75);
      return !road ? OFFROAD : isPaved(road.kind) ? TARMAC : GRAVEL;
    },
    wall: (x, y, z) => site.buildings.wall(x, y, z),
  };

  let spawn: Spawn = site.spawns.find((s) => s.spec.id === query.get('spawn')) ?? site.spawns[0];
  let car: CarState = createCar(spec, spawn.x, spawn.y, terrain.heightAt(spawn.x, spawn.y), spawn.heading);
  let paused = false;
  const pausePanel = document.getElementById('paused')!;
  function setPaused(p: boolean): void {
    paused = p;
    pausePanel.hidden = !p;
  }
  let stuck = 0; // seconds on its roof or side, or in the sea
  let detailTimer = 0;
  let helpFolded = false;
  let stallWarned = false;

  /** Puts the car on the road at (x, y) facing `heading`, once the 5 m ground there has loaded. */
  async function place(x: number, y: number, heading: number): Promise<void> {
    await site.ensureDetail(x, y, 1600);
    car = createCar(spec, x, y, terrain.heightAt(x, y) + 0.05, heading);
    stuck = 0;
    model.update(car, false, extent, 0, false, camera, 0);
    rig.snap(model.group, heading);
    lastPos.splice(0, 3, ...car.pos);
    // A new place gets a fresh sky of balloons (the score carries on).
    field.fill(x, y);
  }

  async function goTo(s: Spawn): Promise<void> {
    spawn = s;
    const q = new URLSearchParams(location.search);
    q.set('spawn', s.spec.id);
    q.delete('at');
    q.delete('fly');
    history.replaceState(null, '', `?${q}`);
    await place(s.x, s.y, s.heading);
    hud.say(s.spec.name);
    track('place', { spawn: s.spec.id });
  }

  /** Puts the car back into a shared moment: there, pointing that way, at that speed, in the air if it was. */
  async function resume(m: Moment): Promise<void> {
    await place(m.x, m.y, m.heading);
    car.vel = [Math.sin(m.heading) * m.speed, Math.cos(m.heading) * m.speed, 0];
    car.speed = m.speed;
    if (m.flying) {
      car.flying = true;
      car.wings = 1;
      car.pos[2] = Math.max(m.z, car.pos[2]);
    }
    model.update(car, false, extent, 0, false, camera, 0);
    rig.snap(model.group, m.heading);
  }

  /** Back on the nearest paved road, facing the way the car was going; else back to the spawn. */
  async function recover(): Promise<void> {
    const hit = site.roads.nearest(car.pos[0], car.pos[1], 400, (r) => isPaved(r.kind) && r.kind !== 'service');
    if (!hit) { await goTo(spawn); return; }
    const along = Math.cos(car.heading - hit.heading) >= 0 ? hit.heading : (hit.heading + Math.PI) % (2 * Math.PI);
    await place(hit.x, hit.y, along);
    hud.say('Back on the road');
  }

  const picker = new SpawnPicker(site.spawns, (s) => void goTo(s));
  const actions: Record<Action, () => void> = {
    reset: () => { track('reset'); void recover(); },
    camera: () => hud.say(`Camera: ${rig.next()}`, 1.5),
    mute: () => { audio.setMuted(!audio.muted); hud.say(audio.muted ? 'Sound off' : 'Sound on', 1.5); },
    pause: () => { setPaused(!paused); if (!paused) hud.say('Go', 1.5); },
    help: () => document.getElementById('help')!.classList.toggle('collapsed'),
    spawns: () => picker.toggle(spawn),
    next: () => void goTo(site.spawns[(site.spawns.indexOf(spawn) + 1) % site.spawns.length]),
    map: () => document.getElementById('minimap')!.classList.toggle('hidden'),
    balloons: () => setBalloons(!settings.balloons),
    transform: () => {
      car.flying = !car.flying;
      track('fly', { on: car.flying, car: vehicleKey() });
      if (spec.thrusters) hud.say(car.flying ? `Thrusters lit — ${KEY.climb}, W/S to tilt, A/D to turn` : 'Thrusters off — back to the road', 3);
      else hud.say(car.flying ? `Wings out — the jet's on. Past 160 km/h, ${KEY.pull}` : 'Wings folded — back to a car', 3);
    },
  };
  const input = new Input((a) => actions[a]());
  if (TOUCH) {
    document.body.classList.add('touch');
    const pad = new TouchPad(canvas);
    input.touch = () => pad.read();
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
      b.addEventListener('click', () => actions[b.dataset.action as Action]()));
    // BOOST works while held, not on a click.
    const boostBtn = document.getElementById('boost-btn')!;
    boostBtn.addEventListener('pointerdown', () => { input.boostHeld = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) boostBtn.addEventListener(ev, () => { input.boostHeld = false; });
  }

  // Time of day and drivetrain, live.
  const lat = site.toLatLon(extent / 2, extent / 2)[0];
  const day = dayOfYear(new Date());
  const hours = daylightHours(lat, day);
  const sky = { hour: Math.min(Math.max(parseHour(query) ?? DEFAULT_HOUR, hours.first), hours.last) };
  const applySun = () => {
    const sun = sunPosition(lat, day, sky.hour);
    sunlight.set(sun.dir, sun.elevationDeg);
  };
  applySun();
  const gui = new GUI({ title: 'Settings' });
  gui.add(sky, 'hour', hours.first, hours.last, 0.05).name('Solar time').onChange(applySun);
  gui.add(settings, 'balloons').name('Balloon game (B)').listen().onChange((on: boolean) => setBalloons(on));
  gui.add({ restart: () => { field.reset(car.pos[0], car.pos[1]); hud.say('New round — pop them all', 2); } }, 'restart').name('New balloon round');
  const applyDrivetrain = () => {
    const split = DRIVETRAINS[settings.drivetrain];
    spec.driveFront = split ?? VEHICLES[vehicleKey()].spec.driveFront;
  };
  const vehicleKey = () => Object.keys(VEHICLES).find((k) => VEHICLES[k].name === settings.vehicle) ?? 'roadster';
  /** Swaps the car where it stands: new body, new physics, the same place and heading. */
  const switchVehicle = () => {
    const id = vehicleKey();
    track('car', { car: id });
    scene.remove(model.group);
    if (model.world) scene.remove(model.world);
    spec = { ...VEHICLES[id].spec };
    applyDrivetrain();
    model = VEHICLES[id].model(spec);
    scene.add(model.group);
    if (model.world) scene.add(model.world);
    audio.electric = !!spec.engine.electric;
    const q = new URLSearchParams(location.search);
    if (id === 'roadster') q.delete('car'); else q.set('car', id);
    history.replaceState(null, '', `?${q}`);
    void place(car.pos[0], car.pos[1], car.heading).then(() => hud.say(VEHICLES[id].name, 2));
  };
  gui.add(settings, 'vehicle', Object.values(VEHICLES).map((v) => v.name)).name('Car').onChange(switchVehicle);
  gui.add(settings, 'drivetrain', Object.keys(DRIVETRAINS)).name('Drivetrain').onChange(applyDrivetrain);
  gui.close();

  // Paused, a link to this moment: here, this way, this fast, at this time of day, in this car.
  const shareLink = document.getElementById('share-link') as HTMLInputElement;
  document.getElementById('share-btn')!.addEventListener('click', () => {
    const q = new URLSearchParams(location.search);
    writeMoment({ x: car.pos[0], y: car.pos[1], z: car.pos[2], heading: car.heading, speed: car.speed, flying: car.flying }, q);
    q.set('time', formatHour(sky.hour));
    const url = `${location.origin}${location.pathname}?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`;
    track('share', { flying: car.flying });
    shareLink.value = url;
    shareLink.hidden = false;
    shareLink.select();
    navigator.clipboard.writeText(url).then(
      () => hud.say('Link copied — it starts right here', 3),
      () => hud.say('Copy the link to share it', 3),
    );
  });

  const moment = readMoment(query);
  if (moment && moment.x > 0 && moment.y > 0 && moment.x < extent && moment.y < extent) {
    await resume(moment);
    track('start', { shared: true, car: vehicleId });
    hud.say(`A shared drive — ${TOUCH ? 'right thumb up to drive' : 'W to drive, A/D to steer'}`, 5);
  } else {
    await place(spawn.x, spawn.y, spawn.heading);
    track('start', { shared: false, spawn: spawn.spec.id, car: vehicleId, touch: TOUCH });
    hud.say(`${spawn.spec.name} — ${TOUCH ? 'right thumb up to drive' : 'W to drive, A/D to steer'}`, 5);
  }

  // Dev builds expose the live state for poking at from the console.
  const perf = { physics: 0, terrain: 0, render: 0, frames: 0, worst: 0 };
  if (import.meta.env.DEV) Object.assign(window, { drive: { car: () => car, controls: input.controls, terrain, site, perf, renderer, field } });

  const carPos = new THREE.Vector3();
  const ground = (p: THREE.Vector3) => terrain.heightAt(p.x + extent / 2, extent / 2 - p.z);
  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    input.update(dt);
    if (!paused && !picker.open) {
      acc += dt;
      const t0 = performance.now();
      while (acc >= STEP) {
        stepCar(car, spec, input.controls, env, STEP);
        acc -= STEP;
      }
      perf.physics += performance.now() - t0;
      if (settings.balloons) {
        const speed = Math.hypot(...car.vel);
        for (const pop of field.update(dt, lastPos, car.pos, speed)) {
          balloonsView.burst(pop.balloon);
          audio.pop(pop.combo);
          hud.pop(pop.points, pop.combo);
        }
        if (field.score > best) {
          best = field.score;
          saveBest(best);
        }
      }
      lastPos.splice(0, 3, ...car.pos);
      const upright = rotate(car.q, [0, 0, 1])[2] > 0.3;
      if (car.inWater || (!upright && Math.hypot(...car.vel) < 1)) {
        if (stuck === 0) hud.say(car.inWater ? `Into the Atlantic. ${KEY.reset} to get back on the road` : `On its roof. ${KEY.reset} to get back on the road`);
        stuck += dt;
        if (stuck > 4) void recover();
      }
      // Past the stall in the air: say so once, until it's flying again.
      const agl = car.pos[2] - terrain.heightAt(car.pos[0], car.pos[1]);
      const isStalled = !!spec.wings && car.wings > 0.5 && agl > 5 && car.airspeed > 5 && stalled(spec.wings, car.alpha);
      if (isStalled && !stallWarned) hud.say('STALL — push the nose down', 2);
      stallWarned = isStalled;
    }
    // Keep the 5 m heights under the car whatever the view has loaded.
    if ((detailTimer -= dt) <= 0) {
      detailTimer = 0.5;
      void site.ensureDetail(car.pos[0], car.pos[1], 400);
    }

    // The help folds away once the car is moving; H brings it back.
    if (!helpFolded && Math.abs(car.speed) > 8) {
      helpFolded = true;
      document.getElementById('help')!.classList.add('collapsed');
    }
    const braking = car.gear > 0 ? input.controls.brake > 0.1 : input.controls.throttle > 0.1;
    const boosting = input.controls.boost && !paused;
    model.update(car, braking, extent, input.controls.flight.thrust, boosting, camera, dt);
    carPos.copy(model.group.position);
    // Follow the way the car is travelling when it slides, its nose when it is slow.
    const moving = Math.hypot(car.vel[0], car.vel[1]);
    const travel = Math.atan2(car.vel[0], car.vel[1]);
    const followHeading = moving > 4 && (car.speed > 0 || car.flying) ? travel : car.heading;
    // Hovering, the chase camera only drops back a little: there's no wingspan to fit in.
    rig.update(dt, model.group, followHeading, ground, car.wings * (spec.wings ? 1 : 0.3), boosting);
    sunlight.follow(carPos);
    const t1 = performance.now();
    terrainView.update(camera.position, camera.position.y - ground(camera.position));
    perf.terrain += performance.now() - t1;

    const road = onRoad(site.roads, car.pos[0], car.pos[1], 2);
    balloonsView.update(dt, field.balloons);
    hud.setScore(settings.balloons, field.score, field.popped, best);
    hud.update(dt, {
      speedKmh: (car.flying ? car.airspeed : car.speed) * 3.6, rpmShare: car.rpm / spec.engine.redline,
      gear: car.flying ? '✈' : car.gear < 0 ? 'R' : spec.engine.electric ? 'D' : String(car.gear),
      road, x: car.pos[0], y: car.pos[1], heading: car.heading,
      flying: car.flying, boost: boosting, balloons: settings.balloons ? field.balloons : [], agl: car.pos[2] - spec.cgHeight - terrain.heightAt(car.pos[0], car.pos[1]),
    });
    const slip = Math.max(...car.wheels.map((w) => (w.contact ? w.slip : 0)));
    const pedal = car.flying ? input.controls.flight.thrust : car.gear > 0 ? input.controls.throttle : input.controls.brake;
    audio.setPaused(paused || picker.open);
    audio.update(car.rpm, pedal, slip, Math.abs(car.speed), boosting, car.lift);

    const t2 = performance.now();
    renderer.render(scene, camera);
    perf.render += performance.now() - t2;
    perf.frames++;
    perf.worst = Math.max(perf.worst, dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  requestAnimationFrame((t) => {
    last = t;
    document.getElementById('loading')!.classList.add('done');
    frame(t);
  });
}

boot().catch((err) => {
  console.error(err);
  const line = document.querySelector('.loading-line');
  if (line) line.textContent = `Could not load the island: ${err instanceof Error ? err.message : err}`;
});
