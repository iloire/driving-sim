import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { CarAudio } from './game/audio';
import { BirdsView } from './game/birds-view';
import { PlacesView } from './game/places-view';
import { BONNET_EYE, CameraRig } from './game/camera';
import { cardHtml, HelpFold, modeName, modeOf, modesOf, referenceHtml, type Mode } from './game/controls';
import { currentLang, LANGS, setLang, t, translatePage, type Lang } from './game/i18n';
import { createCarModel, type CarModel } from './game/car-model';
import { TileDresser } from './game/dress';
import { Hud } from './game/hud';
import { initAnalytics, track } from './game/analytics';
import { formatHour, readMoment, readView, vehicleOf, writeMoment, writeView, type Moment } from './game/share';
import { CRUISE_THRUST, Input, type Action } from './game/input';
import { FlightHud, secondsToGround } from './game/flight-hud';
import { buffet, JetEffects } from './game/jet-effects';
import { Explosion } from './game/explosion';
import { createJetModel } from './game/jet-model';
import { PeopleView } from './game/people-view';
import { createRoadsterModel } from './game/roadster-model';
import { TrafficView } from './game/traffic-view';
import { GroundPhoto, ScatterView } from './game/scatter-view';
import { RocketHud } from './game/rocket-hud';
import { createLaunchView } from './game/starship-model';
import { applyPose, poseOf, ReplayBuffer } from './game/replay';
import { RoadView } from './game/road-view';
import { loadSite, ZONES, zoneOf, type Spawn } from './game/site';
import { TerrainView } from './game/terrain-view';
import { TouchPad } from './game/touch';
import { Welcome } from './game/welcome';
import { CLEAR_SKY, createSurround, Sunlight, toScene, type SkyWeather } from './game/world';
import { CloudsView } from './game/clouds-view';
import { drawCloudShadows, setCloudShadows, shadeByClouds } from './game/cloud-shadow';
import { setSeaWind, stepSea } from './game/sea';
import { Birds } from './sim/birds';
import { buildingStyle } from './sim/objects';
import { People } from './sim/people';
import { Traffic } from './sim/traffic';
import { FAR_LAYERS, NEAR_LAYERS, ScatterField, scatterSpec, type ScatterWorld } from './sim/scatter';
import { createPilot, PILOT, stepPilot } from './sim/pilot';
import { createCar, JET, ROADSTER, TRUCK, stepCar, type CarEnv, type CarSpec, type CarState, type Surface } from './sim/car';
import { isPaved, MAX_HALF_WIDTH, ROAD_WIDTH, type Road } from './sim/roads';
import { dayOfYear, daylightHours, sunPosition } from './sim/sun';
import { blendQuat, lerpV3, rotate, type Quat, type V3 } from './sim/vec';
import { alphaLimit, stalled } from './sim/wings';
import { CLEAR, CloudField, seedOf, type WeatherSpec } from './sim/weather';
import { createLaunch, stepLaunch, SUPER_HEAVY, type Launch, type LaunchControls, type LaunchEvent } from './sim/starship';

declare const __COMMIT_SHA__: string;

const STEP = 1 / 120;
/** Solar time a drive starts at without ?time=: late afternoon, long shadows over the lava. */
const DEFAULT_HOUR = 16.5;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const KEY = () => TOUCH
  ? { reset: t('touch.reset'), pull: t('hint.pull.touch'), climb: t('hint.climb.touch') }
  : { reset: 'R', pull: t('hint.pull'), climb: t('hint.climb') };
/** What to do first, in whatever it is. */
const START_HINT = (spec: CarSpec, rocket = false) => rocket ? t('start.rocket') : isJet(spec)
  ? t(TOUCH ? 'start.jet.touch' : 'start.jet')
  : t(TOUCH ? 'start.car.touch' : 'start.car');

/** The cars on offer: the Roadster, which hovers on thrusters, the 4×4, which unfolds wings, and the Jet, which only flies. */
const VEHICLES: Record<string, { name: string; line: 'car.roadster' | 'car.4x4' | 'car.jet'; spec: CarSpec; model: (spec: CarSpec, heightAt: (x: number, y: number) => number) => CarModel }> = {
  roadster: { name: 'Roadster', line: 'car.roadster', spec: ROADSTER, model: createRoadsterModel },
  '4x4': { name: 'Buggy', line: 'car.4x4', spec: TRUCK, model: createCarModel },
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
/** Starship: not a car but its own sim, picked like one where the zone has a launch tower. */
const ROCKET = 'starship';
const ROCKET_NAME = 'Starship';
/** How far back the chase camera sits behind the rocket (in the 4×4's wingspans: about 240 m). */
const ROCKET_CAMERA = 22;
/**
 * The launch in the background, whatever you're flying: the first countdown this long into the
 * drive (s), a fresh stack on the tower this long after the booster is home (or lost), and the next
 * countdown this long after that.
 */
const BACKGROUND = { first: 40, restack: 60, between: 120 };
/** Time warp steps on T, and the height (m) under which it's off: near the ground it all happens fast. */
const WARPS = [1, 4, 10];
const WARP_FLOOR = 20e3;
/** What the background launch is told: nothing; its autopilot flies. */
const HANDS_OFF: LaunchControls = { pitch: 0, yaw: 0, throttle: 1, fire: false, auto: false };

const TARMAC: Surface = { grip: 1, rolling: 0.012 };
const GRAVEL: Surface = { grip: 0.72, rolling: 0.03 };
/** Picón and lava fields: loose and rough. */
const OFFROAD: Surface = { grip: 0.62, rolling: 0.06 };

// The storage keys keep the name the game had when it was Lanzarote alone, so nobody loses them.
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
  const zone = zoneOf(query);
  document.getElementById('brand-zone')!.textContent = ZONES.find((z) => z.id === zone)!.name.toUpperCase();
  const site = await loadSite(zone);
  document.title = `${site.spec.name} Drive`;
  loading(t('load.ground'));
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
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1.5e6);
  const sunlight = new Sunlight(scene, renderer);
  const ortho = await new THREE.TextureLoader().loadAsync(site.orthoUrl);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const roadView = new RoadView(site.roads.roads, terrain, anisotropy);
  const dresser = new TileDresser(terrain, roadView, site.detailTileM, anisotropy, buildingStyle(site.spec.buildings));
  const terrainView = new TerrainView(terrain, ortho, site.detailTileM, site.detailTiles, anisotropy, {
    load: (t) => site.loadTile(t),
    free: (t) => { dresser.free(t); site.freeTile(t); },
    dress: (t, level) => dresser.dress(t, level),
  });
  scene.add(terrainView.group, createSurround(extent, site.spec.plainM));
  loading(t('load.road'));

  const vehicleId = vehicleOf(query, [...Object.keys(VEHICLES), ...(site.launch ? [ROCKET] : [])]);
  /** Flying Starship: the car is parked out of sight and the frame flies the launch instead. */
  let rocketMode = vehicleId === ROCKET;
  // Under Starship there's still a car, parked: the Roadster, until another is picked.
  const carId = rocketMode ? 'roadster' : vehicleId;
  const settings = { vehicle: rocketMode ? ROCKET_NAME : VEHICLES[carId].name, drivetrain: 'AWD' };
  let spec: CarSpec = { ...VEHICLES[carId].spec };
  const heightAt = (x: number, y: number) => terrain.heightAt(x, y);
  /** A vehicle's body, darkened like the land when a cloud passes over it. */
  const build = (id: string): CarModel => {
    const m = VEHICLES[id].model(spec, heightAt);
    m.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) shadeByClouds(o.material);
    });
    return m;
  };
  let model = build(carId);
  model.group.visible = !rocketMode;
  scene.add(model.group);
  if (model.world) scene.add(model.world);
  const jetFx = new JetEffects();
  const explosion = new Explosion();
  scene.add(jetFx.group, explosion.group);
  // Starship on its tower, launching in the background whatever you're in, or flown by you.
  const newLaunch = (): Launch | null => site.launch
    ? createLaunch([site.launch.x, site.launch.y, terrain.heightAt(site.launch.x, site.launch.y)], site.launch.azimuth)
    : null;
  let launch = newLaunch();
  const launchView = launch ? createLaunchView(extent, launch.pad, launch.azimuth) : null;
  if (launchView && launch) {
    launchView.update(launch, camera, 0);
    scene.add(launchView.group);
  }
  const boosterBlast = new Explosion(8);
  scene.add(boosterBlast.group);
  const rocketHud = new RocketHud();
  /** Seconds until the background autopilot's next step: a countdown, or a fresh stack. */
  let launchIdle = BACKGROUND.first;
  let launchAcc = 0;
  let warp = 1;
  /** Space (the countdown, or lighting the booster by hand) and F, waiting for the next launch step. */
  let fireAsked = false;
  let autoAsked = false;
  /** What the camera follows: the car, or the launch. */
  const focus = () => (rocketMode && launchView ? launchView.focus : model.group);
  const placesView = new PlacesView(site.places, extent, heightAt);
  scene.add(placesView.group);
  const rig = new CameraRig(camera, canvas);
  const audio = new CarAudio();
  audio.electric = !!spec.engine.electric;
  audio.jet = isJet(spec);
  audio.quiet = rocketMode;
  document.body.classList.toggle('rocket', rocketMode);
  const hud = new Hud(__COMMIT_SHA__, site.roads.roads, ortho.image as HTMLImageElement, extent);

  // Trees, bushes, grass and rocks round the car, from what the photo shows growing there.
  const photo = new GroundPhoto(ortho.image as HTMLImageElement, extent);
  const scatterWorld: ScatterWorld = {
    ground: (x, y) => photo.at(x, y),
    height: heightAt,
    clear: (x, y, r) => !onRoad(site.roads, x, y, r)
      && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => !site.buildings.wall(x + dx, y + dy, -Infinity)),
    ready: (x, y) => !!terrain.detailAt(x, y),
  };
  const scatter = scatterSpec(site.spec.scatter);
  const nearScatter = new ScatterField(NEAR_LAYERS, 25, 240, scatterWorld, scatter);
  const farScatter = new ScatterField(FAR_LAYERS, 50, 680, scatterWorld, scatter);
  const scatterView = new ScatterView([nearScatter, farScatter], extent);
  scene.add(scatterView.group);
  const birds = new Birds();
  const birdsView = new BirdsView(extent);
  scene.add(birdsView.mesh);
  // Cars on the roads round the camera, solid to crash into.
  const traffic = new Traffic({ roads: site.roads, height: heightAt, wall: (x, y, z) => site.buildings.wall(x, y, z) });
  const trafficView = new TrafficView(extent, heightAt);
  scene.add(trafficView.group);
  let trafficAcc = 0;
  // People on the pavements in town, by the street lamps.
  const people = new People({
    roads: site.roads,
    height: heightAt,
    wall: (x, y, z) => site.buildings.wall(x, y, z),
    lamps: (x, y, r) => site.detailTiles.flatMap((t) => {
      const x0 = t.col * site.detailTileM, y0 = t.row * site.detailTileM;
      if (!t.objects || x < x0 - r || x > x0 + site.detailTileM + r || y < y0 - r || y > y0 + site.detailTileM + r) return [];
      return t.objects.lamps.filter((l) => Math.abs(l.x - x) < r && Math.abs(l.y - y) < r);
    }),
  });
  const peopleView = new PeopleView(extent);
  scene.add(peopleView.mesh);
  /** What the car hits: a building, a tree or a boulder, or another car. */
  const obstacle = (x: number, y: number, z: number) => site.buildings.wall(x, y, z) ?? farScatter.solid(x, y, z) ?? traffic.contact(x, y, z);

  const env: CarEnv = {
    height: (x, y) => terrain.heightAt(x, y),
    surface: (x, y) => {
      const road = onRoad(site.roads, x, y, 0.75);
      return !road ? OFFROAD : isPaved(road.kind) ? TARMAC : GRAVEL;
    },
    wall: obstacle,
  };

  let spawn: Spawn = site.spawns.find((s) => s.spec.id === query.get('spawn')) ?? site.spawns[0];
  let car: CarState = createCar(spec, spawn.x, spawn.y, terrain.heightAt(spawn.x, spawn.y), spawn.heading);
  let paused = false;
  /** U shows or hides the green flight HUD (and its PULL UP warning); the Jet starts with it off, for a clean view. */
  let hudShown = !isJet(spec);
  const minimap = document.getElementById('minimap')!;
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
  /** I plays back the last half-minute; the drive holds still under it and carries on after. */
  const replay = new ReplayBuffer();
  /** Where the replay is, in drive time; null while driving. */
  let replayAt: number | null = null;
  /** Drive time, counted while live, that the replay is kept in. */
  let liveClock = 0;
  /** Whether the replay last drew the jet: when it goes, the crash goes off again. */
  let replayShown = true;
  const replayBadge = document.getElementById('replay')!;
  const replayBar = document.getElementById('replay-bar')!;
  function setReplay(on: boolean): void {
    if (on === (replayAt !== null)) return;
    if (on && replay.end - replay.start < 1) { hud.say(t('say.replay.none'), 2); return; }
    replayAt = on ? replay.start : null;
    replayShown = true;
    replayBadge.hidden = !on;
    model.group.visible = on || wreck <= 0;
    if (on) track('replay');
    else acc = 0; // the physics picks up where it was, not with the replay's seconds to catch up on
    // The camera cuts to the start of the replay, and back to the car after it.
    const s = on ? applyPose(car, replay.at(replay.start)!) : car;
    model.update(s, false, extent, 0, false, camera, 0);
    rig.snap(focus(), s.heading);
    jetFx.reset();
  }

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
    setReplay(false);
    replay.cut();
    stuck = 0;
    pilot = createPilot();
    gLoad = 1;
    jetFx.reset();
    wreck = 0;
    model.group.visible = true;
    input.lever = CRUISE_THRUST;
    model.update(car, false, extent, 0, false, camera, 0);
    model.group.visible = !rocketMode;
    if (!rocketMode) rig.snap(model.group, heading);
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

  /** A fresh stack on the tower: under your hands it waits for Space, in the background for the next countdown. */
  function restack(): void {
    launch = newLaunch();
    launchIdle = BACKGROUND.between;
    launchAcc = 0;
    warp = 1;
  }

  /** Time warp only up high, never on the pad or in the landing burn. */
  const warpable = (l: Launch) => l.phase !== 'pad' && l.phase !== 'landing' && l.phase !== 'caught' && l.phase !== 'lost'
    && l.booster.pos[2] - l.pad[2] > WARP_FLOOR;

  // The welcome screen: the car holds still under it while the camera circles it.
  let canResume = false;
  const welcome = new Welcome({
    // Another zone is another page load: the car, the sun and the language come along.
    zone: (id) => {
      const q = new URLSearchParams(location.search);
      // Each zone has its own weather.
      for (const k of ['spawn', 'at', 'fly', 'wx']) q.delete(k);
      q.set('site', id);
      q.set('time', formatHour(sky.hour));
      track('zone', { site: id });
      location.search = q.toString().replace(/%3A/g, ':');
    },
    place: (id) => {
      const s = site.spawns.find((x) => x.spec.id === id);
      if (!s) return;
      canResume = false; // the paused drive was somewhere else
      void goTo(s);
    },
    vehicle: (id) => {
      settings.vehicle = id === ROCKET ? ROCKET_NAME : VEHICLES[id].name;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      switchVehicle();
    },
    drive: () => {
      if (canResume) { canResume = false; void goTo(spawn).then(leaveMenu); } // start over at the place
      else leaveMenu();
    },
    resume: leaveMenu,
    lang: (l) => relabel(l),
  }, () => referenceHtml(rocketMode ? ['rocket'] : modesOf(!!spec.thrusters, isJet(spec))));

  /** From a drive the menu offers to carry on; at boot there is nothing to carry on. */
  function openMenu(fromDrive = true): void {
    if (!welcome.isOpen) canResume = fromDrive;
    setPaused(false);
    setReplay(false);
    refreshMenu();
    welcome.open();
    rig.showcase();
  }

  function leaveMenu(): void {
    welcome.close();
    rig.drive();
    track('start', { shared: false, site: zone, spawn: spawn.spec.id, car: vehicleKey(), touch: TOUCH, resume: canResume });
    if (!canResume) hud.say(t('say.start', { place: rocketMode && site.launch ? site.launch.name : spawn.spec.name, hint: START_HINT(spec, rocketMode) }), 5);
  }

  function refreshMenu(): void {
    welcome.render({
      title: site.spec.name, kicker: site.spec.kicker[currentLang()], zones: ZONES, zone,
      places: site.spawns.map((s) => ({ id: s.spec.id, name: s.spec.name })), place: spawn.spec.id,
      vehicles: [
        ...Object.entries(VEHICLES).map(([id, v]) => ({ id, name: v.name, line: t(v.line) })),
        ...(site.launch ? [{ id: ROCKET, name: ROCKET_NAME, line: t('car.starship', { launch: site.launch.name }) }] : []),
      ],
      vehicle: vehicleKey(),
      canResume, flies: !rocketMode && isJet(spec), launches: rocketMode, lang: currentLang(), langs: LANGS,
    });
  }

  const actions: Record<Action, () => void> = {
    reset: () => {
      track('reset');
      if (rocketMode) restack();
      else void recover();
    },
    camera: () => {
      const mode = rig.next();
      hud.say(t('say.camera', { name: t(rocketMode && mode === 'bonnet' ? 'cam.tracking' : `cam.${mode}`) }), 1.5);
    },
    mute: () => { audio.setMuted(!audio.muted); hud.say(t(audio.muted ? 'say.sound.off' : 'say.sound.on'), 1.5); },
    pause: () => { setPaused(!paused); if (!paused) hud.say(t('say.go'), 1.5); },
    help: () => helpFold.toggle(),
    menu: () => { if (!welcome.isOpen) openMenu(); else if (canResume) leaveMenu(); },
    next: () => void goTo(site.spawns[(site.spawns.indexOf(spawn) + 1) % site.spawns.length]),
    map: () => minimap.classList.toggle('hidden'),
    hud: () => { hudShown = !hudShown; },
    labels: () => { placesView.visible = !placesView.visible; hud.say(t(placesView.visible ? 'say.labels.on' : 'say.labels.off'), 1.5); },
    replay: () => { if (!rocketMode) setReplay(replayAt === null); },
    warp: () => {
      if (!rocketMode || !launch) return;
      const next = WARPS[(WARPS.indexOf(warp) + 1) % WARPS.length];
      if (next > 1 && !warpable(launch)) { hud.say(t('say.rocket.nowarp'), 2); return; }
      warp = next;
      hud.say(t('say.rocket.warp', { k: warp }), 1.5);
    },
    transform: () => {
      if (replayAt !== null) return;
      if (rocketMode) { autoAsked = true; return; }
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
  // The weather: the zone's presets (site.json), ?wx= picks one, the first by default.
  const weathers: WeatherSpec[] = site.spec.weather?.length ? site.spec.weather : [CLEAR];
  let weather = weathers.find((w) => w.id === query.get('wx')) ?? weathers[0];
  let clouds: CloudField | null = null;
  const cloudsView = new CloudsView(extent);
  scene.add(cloudsView.mesh);
  const skyWeather = (w: WeatherSpec): SkyWeather => w.light || w.haze || w.hazeColor
    ? { light: w.light ?? 1, haze: w.haze ?? 1, hazeColor: w.hazeColor ? new THREE.Color(w.hazeColor) : null }
    : CLEAR_SKY;
  const applySun = () => {
    const sun = sunPosition(lat, day, sky.hour);
    sunlight.set(sun.dir, sun.elevationDeg, skyWeather(weather));
    dresser.setSun(sun.elevationDeg);
    cloudsView.setLight(sunlight.toLight, sunlight.cloudLit, sunlight.cloudShade);
    drawCloudShadows(clouds, extent, sun.dir, site.spec.plainM ?? 150);
  };
  /** A fresh sky for this weather; the same preset always brings the same clouds. */
  const setWeather = (w: WeatherSpec) => {
    weather = w;
    clouds = w.layers?.length ? new CloudField(w.layers, extent, seedOf(`${zone}/${w.id}`), TOUCH ? 0.6 : 1) : null;
    cloudsView.setField(clouds);
    setSeaWind(w.wind ?? [0, 0]);
    scatterView.setWind(Math.hypot(...(w.wind ?? [0, 0])));
    applySun();
  };
  setWeather(weather);
  const gui = new GUI({ title: t('gui.title') });
  /** Each control's label key, so a language switch can rename them. */
  const guiLabels = new Map<ReturnType<GUI['add']>, Parameters<typeof t>[0]>();
  guiLabels.set(gui.add(sky, 'hour', hours.first, hours.last, 0.05).onChange(applySun), 'gui.hour');
  const wxSetting = { weather: weather.id };
  const wxNames = Object.fromEntries(weathers.map((w) => [w.name[currentLang()] ?? w.name.en, w.id]));
  guiLabels.set(gui.add(wxSetting, 'weather', wxNames).onChange((id: string) => {
    setWeather(weathers.find((w) => w.id === id)!);
    track('weather', { id });
  }), 'gui.weather');
  /** The car in use, or parked under Starship. */
  let carKey = carId;
  const applyDrivetrain = () => {
    const split = DRIVETRAINS[settings.drivetrain];
    spec.driveFront = split ?? VEHICLES[carKey].spec.driveFront;
  };
  const vehicleKey = () => settings.vehicle === ROCKET_NAME ? ROCKET : Object.keys(VEHICLES).find((k) => VEHICLES[k].name === settings.vehicle) ?? 'roadster';
  /**
   * Swaps the car where it stands: new body, new physics, the same place and heading. Starship
   * parks the car out of sight and takes over the launch: a flight under way carries on in your
   * hands, otherwise a fresh stack waits on the tower for Space.
   */
  const switchVehicle = () => {
    const id = vehicleKey();
    track('car', { car: id });
    const q = new URLSearchParams(location.search);
    q.set('car', id);
    history.replaceState(null, '', `?${q}`);
    const wasRocket = rocketMode;
    rocketMode = id === ROCKET;
    audio.quiet = rocketMode;
    document.body.classList.toggle('rocket', rocketMode);
    warp = 1;
    if (rocketMode && launch) {
      setReplay(false);
      model.group.visible = false;
      if (['pad', 'caught', 'lost'].includes(launch.phase)) restack();
      rig.snap(focus(), launch.azimuth);
      if (!welcome.isOpen) hud.say(ROCKET_NAME, 2);
      refreshMenu();
      return;
    }
    // Back to a car: the autopilot takes the launch on in the background.
    if (wasRocket && launch) {
      launch.auto = true;
      if (launch.phase === 'pad' && !launch.counting) launchIdle = BACKGROUND.between;
    }
    carKey = id;
    scene.remove(model.group);
    if (model.world) scene.remove(model.world);
    spec = { ...VEHICLES[id].spec };
    hudShown = !isJet(spec);
    applyDrivetrain();
    setReplay(false);
    replay.clear(); // it would be drawn in the new body
    model = build(id);
    scene.add(model.group);
    if (model.world) scene.add(model.world);
    audio.electric = !!spec.engine.electric;
    audio.jet = isJet(spec);
    void place(car.pos[0], car.pos[1], car.heading).then(() => {
      if (!welcome.isOpen) hud.say(VEHICLES[id].name, 2);
      refreshMenu();
    });
  };
  guiLabels.set(gui.add(settings, 'vehicle', [...Object.values(VEHICLES).map((v) => v.name), ...(site.launch ? [ROCKET_NAME] : [])]).onChange(switchVehicle), 'gui.vehicle');
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
    writeMoment({ x: car.pos[0], y: car.pos[1], z: car.pos[2], heading: car.heading, speed: car.speed, flying: car.flying }, zone, q);
    writeView({ cam: rig.mode, hud: hudShown, map: !minimap.classList.contains('hidden'), drive: settings.drivetrain }, q, !isJet(spec));
    q.set('time', formatHour(sky.hour));
    if (weather === weathers[0]) q.delete('wx');
    else q.set('wx', weather.id);
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

  // Paused, a picture of the scene alone: the canvas holds only the 3D view, so the panel and HUD stay out of it.
  // The drawing buffer is cleared once shown, so the frame loop saves it straight after rendering.
  let shotPending = false;
  document.getElementById('shot-btn')!.addEventListener('click', () => { shotPending = true; });
  function saveShot(): void {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lanzarote-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
    track('screenshot', { flying: car.flying });
  }

  // A shared link is an invitation to that exact moment: straight in, no menu, seen as the sharer saw it.
  const moment = readMoment(query);
  if (moment && moment.x > 0 && moment.y > 0 && moment.x < extent && moment.y < extent) {
    const view = readView(query, Object.keys(DRIVETRAINS), !isJet(spec));
    while (rig.mode !== view.cam) rig.next();
    hudShown = view.hud;
    minimap.classList.toggle('hidden', !view.map);
    settings.drivetrain = view.drive;
    applyDrivetrain();
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    await resume(moment);
    track('start', { shared: true, site: zone, car: vehicleId });
    hud.say(t('say.shared', { hint: START_HINT(spec) }), 5);
  } else {
    await place(spawn.x, spawn.y, spawn.heading);
    if (rocketMode && launch) rig.snap(focus(), launch.azimuth);
    openMenu(false);
  }

  // Dev builds expose the live state for poking at from the console.
  const perf = { physics: 0, terrain: 0, scatter: 0, render: 0, frames: 0, worst: 0 };
  if (import.meta.env.DEV) Object.assign(window, { drive: { car: () => car, pilot: () => pilot, controls: input.controls, terrain, site, perf, renderer, clouds: () => clouds, launch: () => launch, birds, traffic, people,
    // Fast-forwards the launch on its autopilot, for looking at a phase without waiting for it.
    skip: (seconds: number) => {
      for (let t = 0; launch && t < seconds; t += STEP) {
        stepLaunch(launch, { ...HANDS_OFF, fire: launch.phase === 'pad' }, (x, y) => terrain.heightAt(x, y), STEP);
        launch.events.forEach(onLaunchEvent);
      }
    } } });

  const carPos = new THREE.Vector3();
  const carVel = new THREE.Vector3();
  const boosterAt = new THREE.Vector3();
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

  /** What a launch event says, and does: flying it you hear all of it; in the background, only the lift-off and how it ended. */
  function onLaunchEvent(e: LaunchEvent): void {
    if (!launch) return;
    const b = launch.booster;
    if (e === 'lost') {
      boosterBlast.burst(toScene(extent, b.pos[0], b.pos[1], b.pos[2]), carVel.set(b.vel[0], b.vel[2], -b.vel[1]));
      audio.explode();
    }
    if (e === 'caught' || e === 'lost') launchIdle = BACKGROUND.restack;
    if (rocketMode && ['liftoff', 'caught', 'lost'].includes(e)) track('launch', { event: e, auto: launch.auto });
    if (rocketMode || e === 'liftoff' || e === 'caught' || e === 'lost') {
      hud.say(t(`say.rocket.${e}`, { launch: site.launch?.name ?? '' }), e === 'manual' ? 3 : 2.5);
    }
  }

  /**
   * Steps the launch: flown by you as Starship, by its autopilot in the background, which also
   * starts the countdowns and puts a fresh stack on the tower after each flight.
   */
  function flyLaunch(dt: number): void {
    if (!launch) return;
    const c = input.controls;
    if (input.took('Space') && rocketMode) fireAsked = true;
    const over = launch.phase === 'caught' || launch.phase === 'lost';
    if (over || (!rocketMode && launch.phase === 'pad' && !launch.counting)) {
      if ((launchIdle -= dt) <= 0) {
        if (over) restack();
        else fireAsked = true;
      }
    }
    if (warp > 1 && !warpable(launch)) warp = 1;
    launchAcc += dt * warp;
    while (launchAcc >= STEP) {
      const ctl: LaunchControls = rocketMode
        ? { pitch: c.flight.pitch, yaw: c.flight.roll, throttle: c.flight.thrust, fire: fireAsked, auto: autoAsked }
        : { ...HANDS_OFF, fire: fireAsked };
      fireAsked = autoAsked = false;
      stepLaunch(launch, ctl, (x, y) => terrain.heightAt(x, y), STEP);
      launchAcc -= STEP;
      launch.events.forEach(onLaunchEvent);
    }
  }

  /** The tracking camera: on the ground well off the tower, zooming to keep the rocket in frame. */
  function trackingCamera(l: Launch, target: THREE.Vector3): void {
    const back = 1100, side = 450;
    const x = l.pad[0] - Math.sin(l.azimuth) * back - Math.cos(l.azimuth) * side;
    const y = l.pad[1] - Math.cos(l.azimuth) * back + Math.sin(l.azimuth) * side;
    toScene(extent, x, y, Math.max(terrain.heightAt(x, y), 0) + 25, camera.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(170 / camera.position.distanceTo(target))), 0.6, 45);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    input.plane = rocketMode || (car.flying && !!spec.wings);
    input.update(dt);
    // Blacked out, the pilot's hands fall off the stick and the flight computer flies 1 g.
    if (pilot.out) Object.assign(input.controls.flight, { pitch: 0, roll: 0, yaw: 0 });
    // A crash plays out, the jet gone and the physics held, before it's back in the air.
    const live = replayAt === null;
    if (wreck > 0 && !paused && live && (wreck -= dt) <= 0) void place(car.pos[0], car.pos[1], car.heading).finally(() => { crashing = false; });
    if (!paused && !welcome.isOpen && live) flyLaunch(dt);
    else input.took('Space'); // a press on the menu or paused isn't a countdown
    if (!paused && !welcome.isOpen && wreck <= 0 && live && !rocketMode) {
      acc += dt;
      const t0 = performance.now();
      const v0 = [...car.vel];
      const hits = traffic.hits;
      let steps = 0;
      while (acc >= STEP) {
        prevPos.splice(0, 3, ...car.pos);
        prevQ = car.q;
        prevOf = car;
        stepCar(car, spec, input.controls, env, STEP);
        acc -= STEP;
        steps++;
      }
      if (traffic.hits > hits) audio.crash(Math.hypot(...car.vel.map((v, i) => v - v0[i])) / 12);
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
        if ((low && hard) || obstacle(car.pos[0], car.pos[1], car.pos[2])) {
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
      const at = (replayAt !== null && replay.at(replayAt)?.car.pos) || car.pos;
      void site.ensureDetail(at[0], at[1], 400);
    }

    // The controls card shows the keys for what the car is doing now (see HelpFold for when it folds).
    const mode: Mode = rocketMode ? 'rocket' : modeOf(car.flying, !!spec.thrusters, isJet(spec));
    const pad = !!navigator.getGamepads?.().some((p) => p?.connected);
    if (mode !== shownMode || pad !== shownPad) {
      shownMode = mode;
      shownPad = pad;
      helpMode.textContent = ` · ${modeName(mode)}`;
      helpBody.innerHTML = cardHtml(mode, pad);
    }
    if (!paused && !welcome.isOpen && live) helpFold.update(dt, mode, rocketMode ? launch?.phase !== 'pad' : Math.abs(car.speed) > 8);
    if (helpFold.folded !== help.classList.contains('collapsed')) {
      help.classList.toggle('collapsed', helpFold.folded);
      if (helpFold.folded) storageFlag(HELP_SEEN_KEY, true);
    }
    const c = input.controls;
    if (live && !paused && !welcome.isOpen && !rocketMode) {
      liveClock += dt;
      replay.push(() => poseOf(liveClock, car, {
        braking: car.gear > 0 ? c.brake > 0.1 : c.throttle > 0.1, boost: c.boost, thrust: c.flight.thrust,
        pedal: car.flying ? c.flight.thrust : car.gear > 0 ? c.throttle : c.brake, g: gLoad, shown: wreck <= 0,
      }), liveClock);
    }
    // Live, the car is drawn between its last two physics steps; in a replay, as the replay has it.
    const alpha = acc / STEP;
    const shown = replayAt === null ? null : replay.at(replayAt += paused ? 0 : dt);
    const view = shown ? applyPose(car, shown) : prevOf === car ? { ...car, pos: lerpV3(prevPos, car.pos, alpha), q: blendQuat(prevQ, car.q, alpha) } : car;
    const braking = shown ? shown.braking : car.gear > 0 ? c.brake > 0.1 : c.throttle > 0.1;
    const boosting = (shown ? shown.boost : c.boost) && !paused;
    const thrust = shown ? shown.thrust : c.flight.thrust;
    const g = shown ? shown.g : gLoad;
    /** The jet is gone: a crash playing out, now or in the replay. */
    const gone = shown ? !shown.shown : wreck > 0;
    if (shown && shown.shown !== replayShown) {
      model.group.visible = replayShown = shown.shown;
      if (!shown.shown) explosion.burst(model.group.position, carVel);
    }
    model.update(view, braking, extent, thrust, boosting, camera, shown && paused ? 0 : dt);
    carPos.copy(model.group.position);
    // Follow the way the car is travelling when it slides, its nose when it is slow.
    const moving = Math.hypot(view.vel[0], view.vel[1]);
    const travel = Math.atan2(view.vel[0], view.vel[1]);
    const followHeading = moving > 4 && (view.speed > 0 || view.flying) ? travel : view.heading;
    // Hovering, the chase camera only drops back a little: there's no wingspan to fit in.
    carVel.set(view.vel[0], view.vel[2], -view.vel[1]);
    if (gone) carVel.set(0, 0, 0); // the camera settles on the wreck
    // The Jet buffets through the sound barrier and skimming the ground; the airbrake shakes it too.
    const groundZ = terrain.heightAt(view.pos[0], view.pos[1]);
    const agl = view.pos[2] - spec.cgHeight - Math.max(groundZ, 0);
    const jetBuffet = isJet(spec) && view.flying ? buffet(view.mach, agl, view.airspeed) : 0;
    // Through a cloud the air is rougher.
    const cloudBumps = view.flying && clouds ? 0.12 * clouds.density(view.pos[0], view.pos[1], view.pos[2]) * Math.min(view.airspeed / 60, 1) : 0;
    // Crashed, the camera backs well off from the fireball.
    const reach = gone ? 3 : view.wings * (isJet(spec) ? JET_CAMERA : spec.wings ? 1 : 0.3);
    if (launch && launchView) launchView.update(launch, camera, paused ? 0 : dt);
    if (rocketMode && launch && launchView) {
      // Behind the booster the way it's going (east, while it climbs straight up), shaking near the pad.
      const b = launch.booster;
      carVel.set(b.vel[0], b.vel[2], -b.vel[1]);
      const heading = Math.hypot(b.vel[0], b.vel[1]) > 30 ? Math.atan2(b.vel[0], b.vel[1]) : launch.azimuth;
      const lit = b.prop > 0 ? (b.lit * b.throttle) / SUPER_HEAVY.engines : 0;
      const rumble = Math.min(lit * Math.max(0, 1 - (b.pos[2] - launch.pad[2]) / 2000) * 2, 1);
      if (rig.mode === 'bonnet' && !welcome.isOpen) trackingCamera(launch, launchView.focus.position);
      else rig.update(dt, launchView.focus, carVel, heading, ground, ROCKET_CAMERA, false, rumble);
    } else {
      rig.eye = isJet(spec) ? JET_EYE : BONNET_EYE;
      rig.update(dt, model.group, carVel, followHeading, ground, reach, boosting,
        Math.min(view.airbrake * Math.min(view.airspeed / 250, 1) + jetBuffet + cloudBumps + (gone ? (live ? wreck / WRECK_S : 0.5) : 0), 1));
    }
    jetFx.update(paused ? 0 : dt, {
      body: model.group, on: isJet(spec) && view.flying && !welcome.isOpen && !gone && !rocketMode, altitude: view.pos[2], agl, airspeed: view.airspeed,
      g, alpha: view.alpha, groundY: Math.max(groundZ, 0), sea: groundZ < 0, vel: carVel,
    }, camera);
    explosion.update(paused ? 0 : dt, camera, ground);
    boosterBlast.update(paused ? 0 : dt, camera, ground);
    // Fighting HUD on wings. PULL UP when the line it's flying meets the ground within 5 s at a
    // speed or sink rate that would crash rather than land.
    const plane = view.flying && !!spec.wings && !welcome.isOpen && !gone && !rocketMode;
    const pullUp = plane && (view.airspeed > LANDING.speed || -view.vel[2] > LANDING.sink)
      && secondsToGround([view.pos[0], view.pos[1], view.pos[2] - spec.cgHeight], view.vel, (x, y) => terrain.heightAt(x, y)) < 5;
    // The pilot's eyes are the live drive's: a replay is watched with clear ones.
    const eyes = welcome.isOpen || shown ? { grey: 0, red: 0, out: false, felt: 1 } : pilot;
    hud.setVeil(eyes.grey, eyes.red);
    audio.setMuffle(eyes.grey);
    flightHud.update(camera, plane && hudShown ? { vel: carVel, heading: followHeading, g, alpha: view.alpha, pullUp, airbrake: view.airbrake } : null, now / 1000);
    sunlight.follow(rocketMode && launchView ? launchView.focus.position : carPos);
    clouds?.step(paused ? 0 : dt, weather.wind ?? [0, 0]);
    stepSea(paused ? 0 : dt);
    setCloudShadows(clouds ? 0.8 * sunlight.daylight : 0, clouds?.drift ?? [0, 0]);
    cloudsView.update(dt, camera);
    const inCloud = clouds ? clouds.density(camera.position.x + extent / 2, extent / 2 - camera.position.z, camera.position.y) : 0;
    sunlight.setViewHeight(camera.position.y, inCloud);
    const t1 = performance.now();
    terrainView.update(camera.position, camera.position.y - ground(camera.position), Math.hypot(...view.vel));
    perf.terrain += performance.now() - t1;
    const t3 = performance.now();
    const eye = { x: camera.position.x + extent / 2, y: extent / 2 - camera.position.z };
    nearScatter.update(eye.x, eye.y, 1);
    farScatter.update(eye.x, eye.y, 1);
    scatterView.update(paused ? 0 : dt, eye);
    if (!paused) birds.update(dt, [eye.x, eye.y, camera.position.y], view.pos, followHeading, heightAt,
      (x, y) => !terrain.isWater(x, y) && scatterWorld.clear(x, y, 4), !view.flying && !rocketMode);
    birdsView.update(paused ? 0 : dt, birds.poses());
    if (!paused && live) {
      trafficAcc = Math.min(trafficAcc + dt, 4 * STEP);
      const knocked = people.hits;
      const hitter = rocketMode || wreck > 0 ? null : { pos: car.pos, vel: car.vel, heading: car.heading, front: spec.body[1], back: spec.body[0], side: spec.body[2], top: spec.body[4] };
      for (; trafficAcc >= STEP; trafficAcc -= STEP) {
        traffic.step(STEP, [eye.x, eye.y, 0], [{ pos: car.pos, vel: car.vel }]);
        people.step(STEP, [eye.x, eye.y, 0], hitter);
      }
      if (people.hits > knocked) audio.crash(0.2);
    }
    trafficView.update(traffic.cars);
    peopleView.update(people.people);
    perf.scatter += performance.now() - t3;

    const road = onRoad(site.roads, view.pos[0], view.pos[1], 2);
    placesView.update(camera);
    const rb = rocketMode && launch ? launch.booster : null;
    hud.update(dt, rb && launch ? {
      speedKmh: Math.hypot(...rb.vel) * 3.6, rpmShare: 0, gear: '', road: null, x: rb.pos[0], y: rb.pos[1],
      heading: Math.hypot(rb.vel[0], rb.vel[1]) > 30 ? Math.atan2(rb.vel[0], rb.vel[1]) : launch.azimuth,
      flying: true, boost: false, agl: rb.pos[2] - launch.pad[2],
    } : {
      speedKmh: (view.flying ? view.airspeed : view.speed) * 3.6, rpmShare: view.rpm / spec.engine.redline,
      gear: view.flying ? '✈' : view.gear < 0 ? 'R' : spec.engine.electric ? 'D' : String(view.gear),
      road, x: view.pos[0], y: view.pos[1], heading: view.heading,
      flying: view.flying, boost: boosting, mach: isJet(spec) ? view.mach : undefined,
      throttle: view.flying && spec.wings ? thrust : undefined, airbrake: view.airbrake > 0.5 && !!spec.wings?.airbrake, agl: view.pos[2] - spec.cgHeight - terrain.heightAt(view.pos[0], view.pos[1]),
    });
    if (replayAt !== null) {
      replayBar.style.width = `${(100 * (replayAt - replay.start)) / Math.max(replay.end - replay.start, 1e-6)}%`;
      if (replayAt >= replay.end) setReplay(false);
    }
    const slip = Math.max(...view.wheels.map((w) => (w.contact ? w.slip : 0)));
    const pedal = shown ? shown.pedal : car.flying ? c.flight.thrust : car.gear > 0 ? c.throttle : c.brake;
    audio.setPaused(paused || welcome.isOpen);
    // A wreck makes no engine noise.
    audio.update(view.rpm, gone ? 0 : pedal, slip, gone ? 0 : Math.abs(view.speed), boosting && !gone, view.lift);
    audio.airbrake(welcome.isOpen ? 0 : view.airbrake, view.airspeed);
    if (launch && launchView) {
      // Starship heard from wherever the camera is: the booster's engines, or the ship's while they're stacked and near.
      const b = launch.booster;
      const level = b.prop > 0 ? (b.lit * (0.4 + 0.6 * b.throttle)) / SUPER_HEAVY.engines : 0;
      audio.rocket(Math.min(level * 1.6, 1), camera.position.distanceTo(toScene(extent, b.pos[0], b.pos[1], b.pos[2], boosterAt)));
    }
    const ended = !launch || launch.phase === 'caught' || launch.phase === 'lost';
    rocketHud.update(launch, welcome.isOpen ? 'off' : rocketMode ? 'full' : launch?.counting && !ended ? 'chip' : 'off', warp);
    // The horn sounds at the wing's angle-of-attack limit: the flight computer's for this stick, or the stall.
    const aLimit = !spec.wings ? Infinity : spec.wings.fbw ? alphaLimit(spec.wings.fbw, c.flight.pitch) : spec.wings.stall;
    audio.warnings({
      pullUp, out: eyes.out,
      stall: plane && agl > 5 && view.airspeed > 5 && Math.abs(view.alpha) > 0.92 * aLimit,
      strain: plane ? Math.min(Math.max((eyes.felt - 4) / (PILOT.blackAt - 4), 0), 1) : 0,
    });

    const t2 = performance.now();
    renderer.render(scene, camera);
    if (shotPending) { shotPending = false; saveShot(); }
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
