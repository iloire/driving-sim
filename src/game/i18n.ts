// English and Spanish. The browser's language picks one on a first visit; the menu's EN / ES
// switch overrides it and is remembered. `es` must have every key `en` has (the compiler checks),
// and `{name}` placeholders are filled from t()'s second argument.
// The flight HUD's labels (AB, BRAKE, PULL UP, g) stay English, as on a real cockpit display.

const en = {
  // Loading and the pages around the drive
  'load.island': 'Loading the island…',
  'load.lava': 'Painting the lava fields…',
  'load.road': 'Finding the car a road…',
  'load.failed': 'Could not load the island: {error}',
  'rotate': 'Turn your phone sideways to drive',
  'paused.title': 'Paused',
  'paused.share': 'Share this moment',
  'paused.note': 'A link that starts here: this place, heading, speed and time of day. P to go on.',
  'score.popped': 'popped',
  'score.best': 'best',

  // Touch buttons
  'touch.camera': 'CAM',
  'touch.fly': 'FLY',
  'touch.balloons': 'BALLOONS',
  'touch.reset': 'RESET',
  'touch.menu': 'MENU',
  'touch.pause': 'PAUSE',
  'touch.boost': 'BOOST',

  // Welcome menu
  'menu.kicker': 'Canary Islands · every road on the island',
  'menu.prev': 'Previous place',
  'menu.next': 'Next place',
  'menu.ride': 'Ride',
  'menu.sun': 'Sun',
  'menu.resume': 'Resume',
  'menu.resume.note': 'carry on where you were',
  'menu.drive': 'Drive',
  'menu.fly': 'Fly',
  'menu.again': 'start again from here',
  'menu.from.air': '600 m over this place',
  'menu.from.here': 'from this place',
  'menu.controls': 'Controls',
  'menu.places': 'Places',
  'time.Dawn': 'Dawn',
  'time.Morning': 'Morning',
  'time.Midday': 'Midday',
  'time.Afternoon': 'Afternoon',
  'time.Sunset': 'Sunset',
  'car.roadster': 'electric, 1,400 N·m · F lights the thrusters',
  'car.4x4': 'V8 on all-terrain tyres · F unfolds wings',
  'car.jet': 'delta fighter, 9 g · starts 600 m up',

  // Settings panel
  'gui.title': 'Settings',
  'gui.hour': 'Solar time',
  'gui.balloons': 'Balloon game (B)',
  'gui.round': 'New balloon round',
  'gui.vehicle': 'Vehicle',
  'gui.drivetrain': 'Drivetrain',
  'gui.lang': 'Language',

  // Controls card and the menu's full list
  'ctl.title': 'Controls',
  'mode.drive': 'Driving',
  'mode.hover': 'Hovering',
  'mode.wings': 'On wings',
  'mode.jet': 'Jet',
  'ctl.accelerate': 'Accelerate',
  'ctl.brake': 'Brake · reverse',
  'ctl.brake.more': 'reverses once stopped',
  'ctl.steer': 'Steer',
  'ctl.handbrake': 'Handbrake',
  'ctl.nitro': 'Nitro',
  'ctl.fly': 'Fly',
  'ctl.fly.more': 'the Roadster lights its thrusters, the 4×4 unfolds wings',
  'ctl.climb': 'Climb',
  'ctl.sink': 'Sink',
  'ctl.tilt': 'Tilt to fly',
  'ctl.turn': 'Turn',
  'ctl.boost': 'Boost',
  'ctl.land': 'Land',
  'ctl.pitch': 'Pitch',
  'ctl.pitch.more': 'a tap nudges the stick, a hold pulls harder',
  'ctl.pitch.jet.more': 'up to 9 g — hold it too long and you black out',
  'ctl.roll': 'Roll',
  'ctl.rudder': 'Rudder',
  'ctl.throttle': 'Throttle',
  'ctl.presets': 'Idle · cruise · 80 % · full',
  'ctl.afterburner': 'Afterburner',
  'ctl.afterburner.more': 'hold it with the throttle at full',
  'ctl.fold': 'Fold the wings',
  'ctl.airbrake': 'Airbrake',
  'ctl.anywhere': 'Anywhere',
  'ctl.road': 'Road',
  'ctl.road.more': 'back on the nearest road',
  'ctl.balloons': 'Balloons',
  'ctl.balloons.more': 'fly through them; chain pops for a combo',
  'ctl.camera': 'Camera',
  'ctl.map': 'Map',
  'ctl.hud': 'Show / hide the HUD',
  'ctl.mute': 'Mute',
  'ctl.pause': 'Pause',
  'ctl.menu': 'Menu',
  'ctl.menu.more': 'or Esc; N jumps to the next place',
  'ctl.hide': 'Hide',
  'ctl.arrows': 'Arrow keys work as W A S D.',
  'ctl.gamepad': 'Gamepad',
  'ctl.gamepad.keys': 'RT throttle · LT brake · stick steers · A handbrake · X fly · stick click turbo · Y camera',

  // Messages over the drive
  'hint.pull': 'S to pull up',
  'hint.pull.touch': 'pull the right thumb down',
  'hint.climb': 'Space to climb, Ctrl to sink',
  'hint.climb.touch': 'push the left thumb up to climb',
  'start.jet': 'S to pull, A/D to roll, Shift / Ctrl throttle, Space airbrake',
  'start.jet.touch': 'right thumb to pull and roll, BOOST for the afterburner',
  'start.car': 'W to drive, A/D to steer',
  'start.car.touch': 'right thumb up to drive',
  'say.start': '{place} — {hint}',
  'say.shared': 'A shared drive — {hint}',
  'say.balloons.on': 'Balloon game on — fly through them, chain them for a combo (B to stop)',
  'say.balloons.off': 'Balloon game off',
  'say.round': 'New round — pop them all',
  'say.road': 'Back on the road',
  'say.camera': 'Camera: {name}',
  'cam.chase': 'chase',
  'cam.bonnet': 'bonnet',
  'cam.orbit': 'orbit',
  'say.sound.off': 'Sound off',
  'say.sound.on': 'Sound on',
  'say.go': 'Go',
  'say.jet.only': 'The jet only flies — Shift for the afterburner',
  'say.thrusters.on': 'Thrusters lit — {climb}, W/S to tilt, A/D to turn',
  'say.thrusters.off': 'Thrusters off — back to the road',
  'say.wings.on': "Wings out — the jet's on. Past 160 km/h, {pull}",
  'say.wings.off': 'Wings folded — back to a car',
  'say.copied': 'Link copied — it starts right here',
  'say.copy': 'Copy the link to share it',
  'say.blackout': 'Blacked out — too much g for too long',
  'say.water': 'Into the Atlantic. {reset} to get back on the road',
  'say.roof': 'On its roof. {reset} to get back on the road',
  'say.stall': 'STALL — push the nose down',
  'say.mach': 'Mach 1 — supersonic',
  'say.crash': 'Crashed — back in the air',

  // Road plate and altitude
  'plate.air': 'In the air',
  'plate.offroad': 'Off road',
  'plate.track': 'Dirt track',
  'plate.unnamed': 'Unnamed road',
  'alt.up': 'm up',
};

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  'load.island': 'Cargando la isla…',
  'load.lava': 'Pintando los campos de lava…',
  'load.road': 'Buscando una carretera para el coche…',
  'load.failed': 'No se pudo cargar la isla: {error}',
  'rotate': 'Gira el móvil para conducir',
  'paused.title': 'Pausa',
  'paused.share': 'Compartir este momento',
  'paused.note': 'Un enlace que empieza aquí: este lugar, rumbo, velocidad y hora del día. P para seguir.',
  'score.popped': 'reventados',
  'score.best': 'récord',

  'touch.camera': 'CÁM',
  'touch.fly': 'VOLAR',
  'touch.balloons': 'GLOBOS',
  'touch.reset': 'RESET',
  'touch.menu': 'MENÚ',
  'touch.pause': 'PAUSA',
  'touch.boost': 'TURBO',

  'menu.kicker': 'Islas Canarias · todas las carreteras de la isla',
  'menu.prev': 'Lugar anterior',
  'menu.next': 'Lugar siguiente',
  'menu.ride': 'Vehículo',
  'menu.sun': 'Sol',
  'menu.resume': 'Seguir',
  'menu.resume.note': 'continúa donde estabas',
  'menu.drive': 'Conducir',
  'menu.fly': 'Volar',
  'menu.again': 'empieza de nuevo aquí',
  'menu.from.air': 'a 600 m sobre este lugar',
  'menu.from.here': 'desde este lugar',
  'menu.controls': 'Controles',
  'menu.places': 'Lugares',
  'time.Dawn': 'Amanecer',
  'time.Morning': 'Mañana',
  'time.Midday': 'Mediodía',
  'time.Afternoon': 'Tarde',
  'time.Sunset': 'Atardecer',
  'car.roadster': 'eléctrico, 1.400 N·m · F enciende los propulsores',
  'car.4x4': 'V8 con neumáticos todoterreno · F despliega las alas',
  'car.jet': 'caza de ala delta, 9 g · sale a 600 m de altura',

  'gui.title': 'Ajustes',
  'gui.hour': 'Hora solar',
  'gui.balloons': 'Juego de globos (B)',
  'gui.round': 'Nueva ronda de globos',
  'gui.vehicle': 'Vehículo',
  'gui.drivetrain': 'Tracción',
  'gui.lang': 'Idioma',

  'ctl.title': 'Controles',
  'mode.drive': 'Conduciendo',
  'mode.hover': 'Flotando',
  'mode.wings': 'Con alas',
  'mode.jet': 'Caza',
  'ctl.accelerate': 'Acelerar',
  'ctl.brake': 'Frenar · marcha atrás',
  'ctl.brake.more': 'marcha atrás una vez parado',
  'ctl.steer': 'Girar',
  'ctl.handbrake': 'Freno de mano',
  'ctl.nitro': 'Nitro',
  'ctl.fly': 'Volar',
  'ctl.fly.more': 'el Roadster enciende sus propulsores, el 4×4 despliega alas',
  'ctl.climb': 'Subir',
  'ctl.sink': 'Bajar',
  'ctl.tilt': 'Inclinar para avanzar',
  'ctl.turn': 'Girar',
  'ctl.boost': 'Turbo',
  'ctl.land': 'Aterrizar',
  'ctl.pitch': 'Cabeceo',
  'ctl.pitch.more': 'un toque mueve la palanca, mantenerla tira más',
  'ctl.pitch.jet.more': 'hasta 9 g — si lo aguantas demasiado, pierdes el conocimiento',
  'ctl.roll': 'Alabeo',
  'ctl.rudder': 'Timón',
  'ctl.throttle': 'Potencia',
  'ctl.presets': 'Mín · crucero · 80 % · máx',
  'ctl.afterburner': 'Postcombustión',
  'ctl.afterburner.more': 'mantenla con la potencia al máximo',
  'ctl.fold': 'Plegar las alas',
  'ctl.airbrake': 'Aerofreno',
  'ctl.anywhere': 'Siempre',
  'ctl.road': 'Carretera',
  'ctl.road.more': 'vuelve a la carretera más cercana',
  'ctl.balloons': 'Globos',
  'ctl.balloons.more': 'atraviésalos; encadena para hacer combo',
  'ctl.camera': 'Cámara',
  'ctl.map': 'Mapa',
  'ctl.hud': 'Mostrar / ocultar el HUD',
  'ctl.mute': 'Sonido',
  'ctl.pause': 'Pausa',
  'ctl.menu': 'Menú',
  'ctl.menu.more': 'o Esc; N salta al siguiente lugar',
  'ctl.hide': 'Ocultar',
  'ctl.arrows': 'Las flechas funcionan como W A S D.',
  'ctl.gamepad': 'Mando',
  'ctl.gamepad.keys': 'RT acelera · LT frena · el stick gira · A freno de mano · X volar · clic del stick turbo · Y cámara',

  'hint.pull': 'S para subir el morro',
  'hint.pull.touch': 'baja el pulgar derecho',
  'hint.climb': 'Espacio para subir, Ctrl para bajar',
  'hint.climb.touch': 'sube el pulgar izquierdo para ascender',
  'start.jet': 'S tira, A/D alabeo, Shift / Ctrl potencia, Espacio aerofreno',
  'start.jet.touch': 'pulgar derecho para tirar y alabear, TURBO para la postcombustión',
  'start.car': 'W para avanzar, A/D para girar',
  'start.car.touch': 'pulgar derecho arriba para avanzar',
  'say.start': '{place} — {hint}',
  'say.shared': 'Un recorrido compartido — {hint}',
  'say.balloons.on': 'Globos activados — atraviésalos y encadénalos para hacer combo (B para parar)',
  'say.balloons.off': 'Globos desactivados',
  'say.round': 'Nueva ronda — revienta todos',
  'say.road': 'De vuelta en la carretera',
  'say.camera': 'Cámara: {name}',
  'cam.chase': 'persecución',
  'cam.bonnet': 'capó',
  'cam.orbit': 'órbita',
  'say.sound.off': 'Sonido desactivado',
  'say.sound.on': 'Sonido activado',
  'say.go': 'Adelante',
  'say.jet.only': 'El caza solo vuela — Shift para la postcombustión',
  'say.thrusters.on': 'Propulsores encendidos — {climb}, W/S para inclinar, A/D para girar',
  'say.thrusters.off': 'Propulsores apagados — de vuelta a la carretera',
  'say.wings.on': 'Alas fuera — motor a reacción encendido. Pasados 160 km/h, {pull}',
  'say.wings.off': 'Alas plegadas — otra vez un coche',
  'say.copied': 'Enlace copiado — empieza justo aquí',
  'say.copy': 'Copia el enlace para compartirlo',
  'say.blackout': 'Desmayado — demasiadas g durante demasiado tiempo',
  'say.water': 'Al Atlántico. {reset} para volver a la carretera',
  'say.roof': 'Volcado. {reset} para volver a la carretera',
  'say.stall': 'PÉRDIDA — baja el morro',
  'say.mach': 'Mach 1 — supersónico',
  'say.crash': 'Estrellado — de vuelta en el aire',

  'plate.air': 'En el aire',
  'plate.offroad': 'Fuera de carretera',
  'plate.track': 'Pista de tierra',
  'plate.unnamed': 'Carretera sin nombre',
  'alt.up': 'm de altura',
};

export const DICTIONARIES = { en, es };
export type Lang = keyof typeof DICTIONARIES;
export const LANGS = Object.keys(DICTIONARIES) as Lang[];

/** Where the player's own choice is kept, in this browser only. */
const LANG_KEY = 'lanzarote-drive.lang';

/** The player's saved choice, else the first of the browser's languages we speak, else English. */
export function pickLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved && LANGS.includes(saved as Lang)) return saved as Lang;
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0];
    if (LANGS.includes(base as Lang)) return base as Lang;
  }
  return 'en';
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

let lang: Lang = pickLang(readSaved(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);

export const currentLang = () => lang;

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // Blocked storage: the choice lasts this visit only.
  }
  translatePage();
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return DICTIONARIES[lang][key].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Fills every element marked data-i18n="key" in the static page, and its lang attribute. */
export function translatePage(): void {
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
}
