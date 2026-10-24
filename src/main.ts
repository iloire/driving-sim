import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { CarAudio } from './game/audio';
import { BalloonsView } from './game/balloons-view';
import { BONNET_EYE, CameraRig } from './game/camera';
import { cardHtml, HelpFold, modeName, modeOf, referenceHtml, type Mode } from './game/controls';
import { currentLang, LANGS, setLang, t, translatePage, type Lang } from './game/i18n';
import { createCarModel, type CarModel } from './game/car-model';
import { TileDresser } from './game/dress';
import { Hud } from './game/hud';
import { initAnalytics, track } from './game/analytics';
import { formatHour, readMoment, writeMoment, type Moment } from './game/share';
import { CRUISE_THRUST, Input, type Action } from './game/input';
import { FlightHud, secondsToGround } from './game/flight-hud';
import { buffet, JetEffects } from './game/jet-effects';
import { Explosion } from './game/explosion';
import { createJetModel } from './game/jet-model';
import { createRoadsterModel } from './game/roadster-model';
import { RoadView } from './game/road-view';
import { loadSite, type Spawn } from './game/site';
import { TerrainView } from './game/terrain-view';
import { TouchPad } from './game/touch';
import { timesOfDay, Welcome } from './game/welcome';
import { createSurround, Sunlight } from './game/world';
import { BalloonField } from './sim/balloons';
import { createPilot, PILOT, stepPilot } from './sim/pilot';
import { createCar, JET, ROADSTER, TRUCK, stepCar, type CarEnv, type CarSpec, type CarState, type Surface } from './sim/car';
import { isPaved, MAX_HALF_WIDTH, ROAD_WIDTH, type Road } from './sim/roads';
import { dayOfYear, daylightHours, sunPosition } from './sim/sun';
import { blendQuat, lerpV3, rotate, type Quat, type V3 } from './sim/vec';
import { stalled } from './sim/wings';

declare const __COMMIT_SHA__: string;

const STEP = 1 / 120;
const SITE = 'lanzarote';
/** Solar time a drive starts at without ?time=: late afternoon, long shadows over the lava. */
const DEFAULT_HOUR = 16.5;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const KEY = () => TOUCH
  ? { reset: t('touch.reset'), pull: t('hint.pull.touch'), climb: t('hint.climb.touch') }
  : { reset: 'R', pull: t('hint.pull'), climb: t('hint.climb') };
/** What to do first, in whatever it is. */
const START_HINT = (spec: CarSpec) => isJet(spec)
  ? t(TOUCH ? 'start.jet.touch' : 'start.jet')
  : t(TOUCH ? 'start.car.touch' : 'start.car');

/** The cars on offer: the default Roadster, which hovers on thrusters, the 4×4, which unfolds wings, and the Jet, which only flies. */
const VEHICLES: Record<string, { name: string; line: 'car.roadster' | 'car.4x4' | 'car.jet'; spec: CarSpec; model: (spec: CarSpec, heightAt: (x: number, y: number) => number) => CarModel }> = {
  roadster: { name: 'Roadster', line: 'car.roadster', spec: ROADSTER, model: createRoadsterModel },
  '4x4': { name: 'Armoured 4×4', line: 'car.4x4', spec: TRUCK, model: createCarModel },
  jet: { name: 'Jet', line: 'car.jet', spec: JET, model: createJetModel },
};
/** The Jet starts this high above the ground, already at cruise. */
const JET_START = { agl: 600, speed: 230 };
/** How far back the chase camera sits behind the Jet (1 = the 4×4's wingspan). */
const JET_CAMERA = 1.2;
/**
 * The Jet's bonnet view is the pilot's eye, high in the canopy, so the nose drops away about 12°
 * below the line of flight instead of filling the bottom of the screen.
 */
const JET_EYE = new THREE.Vector3(3.4, 1.1, 0);
/** A jet touching down faster than this (m/s), or sinking faster, has crashed rather than landed. */
const LANDING = { speed: 110, sink: 6 };
/** Seconds a crash plays out before the jet is back in the air. */
const WRECK_S = 1.8;
const G = 9.81;
const isJet = (spec: CarSpec) => !!spec.wings?.fbw;

const TARMAC: Surface = { grip: 1, rolling: 0.012 };
const GRAVEL: Surface = { grip: 0.72, rolling: 0.03 };
/** Picón and lava fields: loose and rough. */
const OFFROAD: Surface = { grip: 0.62, rolling: 0.06 };

/** Where the best balloon score is kept, in this browser only. */
const BEST_KEY = 'lanzarote-drive.best';
/** Set once the controls card has folded away, so a returning player starts with it folded. */
const HELP_SEEN_KEY = 'lanzarote-drive.help-seen';

function storageFlag(key: string, set = false): boolean {
  try {
    if (set) localStorage.setItem(key, '1');
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

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

/** What the loading screen says it is doing. */
function loading(text: string): void {
  const line = document.querySelector('.loading-line');
  if (line) line.textContent = text;
}

async function boot(): Promise<void> {
  initAnalytics();
  translatePage();
  const query = new URLSearchParams(location.search);
  const site = await loadSite(SITE);
  loading(t('load.lava'));
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
  loading(t('load.road'));

  // The balloon game is off until B (or the settings panel, or the phone's button) turns it on.
  const vehicleId = VEHICLES[query.get('car') ?? ''] ? query.get('car')! : 'roadster';
  const settings = { vehicle: VEHICLES[vehicleId].name, drivetrain: 'AWD', balloons: false };
  let spec: CarSpec = { ...VEHICLES[vehicleId].spec };
  const heightAt = (x: number, y: number) => terrain.heightAt(x, y);
  let model = VEHICLES[vehicleId].model(spec, heightAt);
  scene.add(model.group);
  if (model.world) scene.add(model.world);
  // The balloon game: a field kept full around the car, scored as you pop them.
  const field = new BalloonField((x, y) => terrain.heightAt(x, y), (x, y) => x > 0 && y > 0 && x < extent && y < extent,
    undefined, Date.now() % 1e9);
  const balloonsView = new BalloonsView(extent);
  balloonsView.visible = false;
  scene.add(balloonsView.group);
  const jetFx = new JetEffects();
  const explosion = new Explosion();
  scene.add(jetFx.group, explosion.group);
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
    hud.say(t(on ? 'say.balloons.on' : 'say.balloons.off'), 3);
  }
  const rig = new CameraRig(camera, canvas);
  const audio = new CarAudio();
  audio.electric = !!spec.engine.electric;
  audio.jet = isJet(spec);
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
  /** U hides the green flight HUD (and its PULL UP warning) for a clean view. */
  let hudShown = true;
  const pausePanel = document.getElementById('paused')!;
  function setPaused(p: boolean): void {
    paused = p;
    pausePanel.hidden = !p;
  }
  let stuck = 0; // seconds on its roof or side, or in the sea
  let detailTimer = 0;
  const helpFold = new HelpFold(storageFlag(HELP_SEEN_KEY));
  const help = document.getElementById('help')!;
  const helpBody = document.getElementById('help-body')!;
  const helpMode = document.getElementById('help-mode')!;
  document.getElementById('help-toggle')!.addEventListener('click', () => helpFold.toggle());
  let shownMode: Mode | null = null;
  let shownPad = false;
  let stallWarned = false;
  /** The pilot's body under g: grey-out, red-out and blacking out. */
  let pilot = createPilot();
  /** The load factor felt along the body's up axis, smoothed over a tenth of a second. */
  let gLoad = 1;
  /** Past Mach 1; it re-arms the boom once back under Mach 0.97. */
  let supersonic = false;
  let crashing = false;
  /** Seconds left of a crash playing out (the jet gone, the explosion going) before it's back up. */
  let wreck = 0;

  /** Puts the car on the road at (x, y) facing `heading`, once the 5 m ground there has loaded. */
  async function place(x: number, y: number, heading: number): Promise<void> {
    await site.ensureDetail(x, y, 1600);
    car = createCar(spec, x, y, terrain.heightAt(x, y) + 0.05, heading);
    if (isJet(spec)) {
      car.flying = true;
      car.wings = 1;
      car.pos[2] += JET_START.agl;
      car.vel = [Math.sin(heading) * JET_START.speed, Math.cos(heading) * JET_START.speed, 0];
    }
    stuck = 0;
    pilot = createPilot();
    gLoad = 1;
    jetFx.reset();
    wreck = 0;
    model.group.visible = true;
    input.lever = CRUISE_THRUST;
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
    if (!welcome.isOpen) hud.say(s.spec.name);
    track('place', { spawn: s.spec.id });
    refreshMenu();
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
    hud.say(t('say.road'));
  }

  // The welcome screen: the car holds still under it while the camera circles it.
  let canResume = false;
  const welcome = new Welcome({
    place: (id) => {
      const s = site.spawns.find((x) => x.spec.id === id);
      if (!s) return;
      canResume = false; // the paused drive was somewhere else
      void goTo(s);
    },
    vehicle: (id) => {
      settings.vehicle = VEHICLES[id].name;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      switchVehicle();
    },
    time: (name) => {
      sky.hour = times()[name];
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      applySun();
      refreshMenu();
    },
    drive: () => {
      if (canResume) { canResume = false; void goTo(spawn).then(leaveMenu); } // start over at the place
      else leaveMenu();
    },
    resume: leaveMenu,
    lang: (l) => relabel(l),
  }, referenceHtml);

  /** From a drive the menu offers to carry on; at boot there is nothing to carry on. */
  function openMenu(fromDrive = true): void {
    if (!welcome.isOpen) canResume = fromDrive;
    setPaused(false);
    refreshMenu();
    welcome.open();
    rig.showcase();
  }

  function leaveMenu(): void {
    welcome.close();
    rig.drive();
    track('start', { shared: false, spawn: spawn.spec.id, car: vehicleKey(), touch: TOUCH, resume: canResume });
    if (!canResume) hud.say(t('say.start', { place: spawn.spec.name, hint: START_HINT(spec) }), 5);
  }

  function refreshMenu(): void {
    const named = times();
    welcome.render({
      places: site.spawns.map((s) => ({ id: s.spec.id, name: s.spec.name })), place: spawn.spec.id,
      vehicles: Object.entries(VEHICLES).map(([id, v]) => ({ id, name: v.name, line: t(v.line) })), vehicle: vehicleKey(),
      times: Object.keys(named), time: Object.keys(named).find((k) => Math.abs(named[k] - sky.hour) < 0.01) ?? '',
      canResume, flies: isJet(spec), lang: currentLang(), langs: LANGS,
    });
  }

  const actions: Record<Action, () => void> = {
    reset: () => { track('reset'); void recover(); },
    camera: () => hud.say(t('say.camera', { name: t(`cam.${rig.next()}`) }), 1.5),
    mute: () => { audio.setMuted(!audio.muted); hud.say(t(audio.muted ? 'say.sound.off' : 'say.sound.on'), 1.5); },
    pause: () => { setPaused(!paused); if (!paused) hud.say(t('say.go'), 1.5); },
    help: () => helpFold.toggle(),
    menu: () => { if (!welcome.isOpen) openMenu(); else if (canResume) leaveMenu(); },
    next: () => void goTo(site.spawns[(site.spawns.indexOf(spawn) + 1) % site.spawns.length]),
    map: () => document.getElementById('minimap')!.classList.toggle('hidden'),
    balloons: () => setBalloons(!settings.balloons),
    hud: () => { hudShown = !hudShown; },
    transform: () => {
      if (isJet(spec)) { hud.say(t('say.jet.only'), 2); return; }
      car.flying = !car.flying;
      track('fly', { on: car.flying, car: vehicleKey() });
      if (spec.thrusters) hud.say(car.flying ? t('say.thrusters.on', { climb: KEY().climb }) : t('say.thrusters.off'), 3);
      else hud.say(car.flying ? t('say.wings.on', { pull: KEY().pull }) : t('say.wings.off'), 3);
    },
  };
  // Under the menu only M / Esc (back to the drive) and mute mean anything.
  const input = new Input((a) => { if (!welcome.isOpen || a === 'menu' || a === 'mute') actions[a](); });
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
  const times = () => timesOfDay(hours.first, hours.last);
  const applySun = () => {
    const sun = sunPosition(lat, day, sky.hour);
    sunlight.set(sun.dir, sun.elevationDeg);
  };
  applySun();
  const gui = new GUI({ title: t('gui.title') });
  /** Each control's label key, so a language switch can rename them. */
  const guiLabels = new Map<ReturnType<GUI['add']>, Parameters<typeof t>[0]>();
  guiLabels.set(gui.add(sky, 'hour', hours.first, hours.last, 0.05).onChange(applySun), 'gui.hour');
  guiLabels.set(gui.add(settings, 'balloons').listen().onChange((on: boolean) => setBalloons(on)), 'gui.balloons');
  guiLabels.set(gui.add({ restart: () => { field.reset(car.pos[0], car.pos[1]); hud.say(t('say.round'), 2); } }, 'restart'), 'gui.round');
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
    model = VEHICLES[id].model(spec, heightAt);
    scene.add(model.group);
    if (model.world) scene.add(model.world);
    audio.electric = !!spec.engine.electric;
    audio.jet = isJet(spec);
    const q = new URLSearchParams(location.search);
    if (id === 'roadster') q.delete('car'); else q.set('car', id);
    history.replaceState(null, '', `?${q}`);
    void place(car.pos[0], car.pos[1], car.heading).then(() => {
      if (!welcome.isOpen) hud.say(VEHICLES[id].name, 2);
      refreshMenu();
    });
  };
  guiLabels.set(gui.add(settings, 'vehicle', Object.values(VEHICLES).map((v) => v.name)).onChange(switchVehicle), 'gui.vehicle');
  guiLabels.set(gui.add(settings, 'drivetrain', Object.keys(DRIVETRAINS)).onChange(applyDrivetrain), 'gui.drivetrain');
  const langSetting = { lang: currentLang() };
  guiLabels.set(gui.add(langSetting, 'lang', { English: 'en', Español: 'es' }).onChange((l: Lang) => relabel(l)), 'gui.lang');
  gui.close();

  /** Everything already on screen in the new language; messages pick it up as they're said. */
  function relabel(l?: Lang): void {
    if (l) setLang(l);
    langSetting.lang = currentLang();
    gui.title(t('gui.title'));
    guiLabels.forEach((key, c) => c.name(t(key)).updateDisplay());
    shownMode = null; // the controls card redraws on the next frame
    refreshMenu();
  }
  relabel();

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
      () => hud.say(t('say.copied'), 3),
      () => hud.say(t('say.copy'), 3),
    );
  });

  // A shared link is an invitation to that exact moment: straight in, no menu.
  const moment = readMoment(query);
  if (moment && moment.x > 0 && moment.y > 0 && moment.x < extent && moment.y < extent) {
    await resume(moment);
    track('start', { shared: true, car: vehicleId });
    hud.say(t('say.shared', { hint: START_HINT(spec) }), 5);
  } else {
    await place(spawn.x, spawn.y, spawn.heading);
    openMenu(false);
  }

  // Dev builds expose the live state for poking at from the console.
  const perf = { physics: 0, terrain: 0, render: 0, frames: 0, worst: 0 };
  if (import.meta.env.DEV) Object.assign(window, { drive: { car: () => car, pilot: () => pilot, controls: input.controls, terrain, site, perf, renderer, field } });

  const carPos = new THREE.Vector3();
  const carVel = new THREE.Vector3();
  const ground = (p: THREE.Vector3) => terrain.heightAt(p.x + extent / 2, extent / 2 - p.z);
  // The pose one physics step back. A frame runs 1, 2 or 3 steps as its length wobbles around two
  // of them, so drawing only the latest step jerks the car along (2 to 6 m a frame in the Jet);
  // drawing it between the last two steps keeps its motion even.
  const prevPos: V3 = [0, 0, 0];
  let prevQ: Quat = [1, 0, 0, 0];
  let prevOf: CarState | null = null; // a new car (a reset, a place, a vehicle swap) has no step behind it yet
  let last = performance.now();
  let acc = 0;
  const flightHud = new FlightHud(document.getElementById('flight-hud') as HTMLCanvasElement);
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    input.plane = car.flying && !!spec.wings;
    input.update(dt);
    // Blacked out, the pilot's hands fall off the stick and the flight computer flies 1 g.
    if (pilot.out) Object.assign(input.controls.flight, { pitch: 0, roll: 0, yaw: 0 });
    // A crash plays out, the jet gone and the physics held, before it's back in the air.
    if (wreck > 0 && !paused && (wreck -= dt) <= 0) void place(car.pos[0], car.pos[1], car.heading).finally(() => { crashing = false; });
    if (!paused && !welcome.isOpen && wreck <= 0) {
      acc += dt;
      const t0 = performance.now();
      const v0 = [...car.vel];
      let steps = 0;
      while (acc >= STEP) {
        prevPos.splice(0, 3, ...car.pos);
        prevQ = car.q;
        prevOf = car;
        stepCar(car, spec, input.controls, env, STEP);
        acc -= STEP;
        steps++;
      }
      if (steps) {
        const up = rotate(car.q, [0, 0, 1]);
        const a = car.vel.map((v, i) => (v - v0[i]) / (steps * STEP) + (i === 2 ? G : 0));
        gLoad += ((a[0] * up[0] + a[1] * up[1] + a[2] * up[2]) / G - gLoad) * (1 - Math.exp(-dt / 0.1));
      }
      const wasOut = pilot.out;
      stepPilot(pilot, PILOT, car.flying ? gLoad : 1, dt);
      if (pilot.out && !wasOut) {
        hud.say(t('say.blackout'), 3);
        track('blackout');
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
        if (stuck === 0) hud.say(t(car.inWater ? 'say.water' : 'say.roof', { reset: KEY().reset }));
        stuck += dt;
        if (stuck > 4) void recover();
      }
      // Past the stall in the air: say so once, until it's flying again.
      const agl = car.pos[2] - terrain.heightAt(car.pos[0], car.pos[1]);
      const isStalled = !!spec.wings && car.wings > 0.5 && agl > 5 && car.airspeed > 5 && stalled(spec.wings, car.alpha);
      if (isStalled && !stallWarned) hud.say(t('say.stall'), 2);
      stallWarned = isStalled;
      // Through the sound barrier: the boom, once a crossing.
      const mach = car.mach;
      if (isJet(spec) && !supersonic && mach > 1) {
        audio.boom();
        hud.say(t('say.mach'), 2);
        track('supersonic');
      }
      supersonic = mach > 1 || (supersonic && mach > 0.97);
      // The jet into the ground or a building: back up in the sky where it went down.
      if (isJet(spec) && !crashing) {
        const low = agl < spec.cgHeight + 0.6;
        const hard = car.airspeed > LANDING.speed || car.vel[2] < -LANDING.sink || !upright;
        if ((low && hard) || site.buildings.wall(car.pos[0], car.pos[1], car.pos[2])) {
          crashing = true;
          track('crash', { speed: Math.round(car.airspeed) });
          hud.say(t('say.crash'), 2.5);
          wreck = WRECK_S;
          model.group.visible = false;
          explosion.burst(model.group.position, carVel);
          audio.explode();
        }
      }
    }
    // Keep the 5 m heights under the car whatever the view has loaded.
    if ((detailTimer -= dt) <= 0) {
      detailTimer = 0.5;
      void site.ensureDetail(car.pos[0], car.pos[1], 400);
    }

    // The controls card shows the keys for what the car is doing now (see HelpFold for when it folds).
    const mode = modeOf(car.flying, !!spec.thrusters, isJet(spec));
    const pad = !!navigator.getGamepads?.().some((p) => p?.connected);
    if (mode !== shownMode || pad !== shownPad) {
      shownMode = mode;
      shownPad = pad;
      helpMode.textContent = ` · ${modeName(mode)}`;
      helpBody.innerHTML = cardHtml(mode, pad);
    }
    if (!paused && !welcome.isOpen) helpFold.update(dt, mode, Math.abs(car.speed) > 8);
    if (helpFold.folded !== help.classList.contains('collapsed')) {
      help.classList.toggle('collapsed', helpFold.folded);
      if (helpFold.folded) storageFlag(HELP_SEEN_KEY, true);
    }
    const braking = car.gear > 0 ? input.controls.brake > 0.1 : input.controls.throttle > 0.1;
    const boosting = input.controls.boost && !paused;
    const alpha = acc / STEP;
    const drawn = prevOf === car ? { ...car, pos: lerpV3(prevPos, car.pos, alpha), q: blendQuat(prevQ, car.q, alpha) } : car;
    model.update(drawn, braking, extent, input.controls.flight.thrust, boosting, camera, dt);
    carPos.copy(model.group.position);
    // Follow the way the car is travelling when it slides, its nose when it is slow.
    const moving = Math.hypot(car.vel[0], car.vel[1]);
    const travel = Math.atan2(car.vel[0], car.vel[1]);
    const followHeading = moving > 4 && (car.speed > 0 || car.flying) ? travel : car.heading;
    // Hovering, the chase camera only drops back a little: there's no wingspan to fit in.
    carVel.set(car.vel[0], car.vel[2], -car.vel[1]);
    if (wreck > 0) carVel.set(0, 0, 0); // the camera settles on the wreck
    // The Jet buffets through the sound barrier and skimming the ground; the airbrake shakes it too.
    const groundZ = terrain.heightAt(car.pos[0], car.pos[1]);
    const agl = car.pos[2] - spec.cgHeight - Math.max(groundZ, 0);
    const jetBuffet = isJet(spec) && car.flying ? buffet(car.mach, agl, car.airspeed) : 0;
    // Crashed, the camera backs well off from the fireball.
    const reach = wreck > 0 ? 3 : car.wings * (isJet(spec) ? JET_CAMERA : spec.wings ? 1 : 0.3);
    rig.eye = isJet(spec) ? JET_EYE : BONNET_EYE;
    rig.update(dt, model.group, carVel, followHeading, ground, reach, boosting,
      Math.min(car.airbrake * Math.min(car.airspeed / 250, 1) + jetBuffet + wreck / WRECK_S, 1));
    jetFx.update(paused ? 0 : dt, {
      body: model.group, on: isJet(spec) && car.flying && !welcome.isOpen && wreck <= 0, altitude: car.pos[2], agl, airspeed: car.airspeed,
      g: gLoad, alpha: car.alpha, groundY: Math.max(groundZ, 0), sea: groundZ < 0, vel: carVel,
    }, camera);
    explosion.update(paused ? 0 : dt, camera, ground);
    // Fighting HUD on wings. PULL UP when the line it's flying meets the ground within 5 s at a
    // speed or sink rate that would crash rather than land.
    const plane = car.flying && !!spec.wings && !welcome.isOpen && wreck <= 0;
    const pullUp = plane && (car.airspeed > LANDING.speed || -car.vel[2] > LANDING.sink)
      && secondsToGround([car.pos[0], car.pos[1], car.pos[2] - spec.cgHeight], car.vel, (x, y) => terrain.heightAt(x, y)) < 5;
    hud.setVeil(welcome.isOpen ? 0 : pilot.grey, welcome.isOpen ? 0 : pilot.red);
    audio.setMuffle(welcome.isOpen ? 0 : pilot.grey);
    flightHud.update(camera, plane && hudShown ? { vel: carVel, heading: followHeading, g: gLoad, alpha: car.alpha, pullUp, airbrake: car.airbrake } : null, now / 1000);
    sunlight.follow(carPos);
    sunlight.setViewHeight(camera.position.y);
    const t1 = performance.now();
    terrainView.update(camera.position, camera.position.y - ground(camera.position), Math.hypot(...car.vel));
    perf.terrain += performance.now() - t1;

    const road = onRoad(site.roads, car.pos[0], car.pos[1], 2);
    balloonsView.update(dt, field.balloons);
    hud.setScore(settings.balloons, field.score, field.popped, best);
    hud.update(dt, {
      speedKmh: (car.flying ? car.airspeed : car.speed) * 3.6, rpmShare: car.rpm / spec.engine.redline,
      gear: car.flying ? '✈' : car.gear < 0 ? 'R' : spec.engine.electric ? 'D' : String(car.gear),
      road, x: car.pos[0], y: car.pos[1], heading: car.heading,
      flying: car.flying, boost: boosting, mach: isJet(spec) ? car.mach : undefined,
      throttle: input.plane ? input.controls.flight.thrust : undefined, airbrake: !!input.controls.flight.airbrake && !!spec.wings?.airbrake, balloons: settings.balloons ? field.balloons : [], agl: car.pos[2] - spec.cgHeight - terrain.heightAt(car.pos[0], car.pos[1]),
    });
    const slip = Math.max(...car.wheels.map((w) => (w.contact ? w.slip : 0)));
    const pedal = car.flying ? input.controls.flight.thrust : car.gear > 0 ? input.controls.throttle : input.controls.brake;
    audio.setPaused(paused || welcome.isOpen);
    // A wreck makes no engine noise.
    audio.update(car.rpm, wreck > 0 ? 0 : pedal, slip, wreck > 0 ? 0 : Math.abs(car.speed), boosting && wreck <= 0, car.lift);
    audio.airbrake(welcome.isOpen ? 0 : car.airbrake, car.airspeed);
    // The horn sounds at the wing's angle-of-attack limit: the flight computer's, or the stall.
    const alphaLimit = spec.wings ? spec.wings.fbw?.alphaMax ?? spec.wings.stall : Infinity;
    audio.warnings({
      pullUp, out: pilot.out,
      stall: plane && agl > 5 && car.airspeed > 5 && Math.abs(car.alpha) > 0.92 * alphaLimit,
      strain: plane ? Math.min(Math.max((pilot.felt - 4) / (PILOT.blackAt - 4), 0), 1) : 0,
    });

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
  if (line) line.textContent = t('load.failed', { error: err instanceof Error ? err.message : String(err) });
});
