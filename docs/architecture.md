# Architecture

How it stays fast (merging, instancing, level of detail, streaming, offline work): [performance.md](performance.md).

```
src/sim/    pure TypeScript, no three.js, no DOM — unit-tested
  car.ts      the car: rigid body, struts, tyres, engine, gearbox
  wings.ts    the Buggy's plane half and the Jet: lift, drag, stability, control surfaces, jet, fly-by-wire
  thrusters.ts  the Roadster's hover: lift on its exhaust, height hold, attitude assists
  starship.ts   Starship: the stack, staging, the booster flown home and caught, and its autopilot
  roads.ts    road model: profiles, carving, nearest-road index
  scatter.ts  trees, bushes, grass and rocks round the car, picked from the aerial photo
  birds.ts    flocks round the camera: soaring, passing, and perched ones the car startles
  traffic.ts  cars on the roads round the camera: lanes, bends, queues, junctions, crashes
  buildings.ts  building footprints as obstacles: point-in-polygon, way out, per-tile index
  objects.ts  per-tile objects file, building heights, lamp and edge-post placement
  terrain.ts  Heightmap with 5 m detail tiles (shared with paragliding-sim)
  sun.ts      sun position and daylight hours (shared with paragliding-sim)
src/game/   three.js scene, input, HUD, audio — the rendering layer
public/sites/<zone>/      site.json + generated terrain and road data (lanzarote, tenerife, zaragoza, benasque)
scripts/fetch-terrain.ts  IGN + OSM download → height.bin, ortho.jpg, roads.json, carved detail tiles
```

The terrain pipeline, `Heightmap`, the LOD terrain view and the sky come from
[paragliding-sim](https://github.com/iloire/paragliding-sim). The differences are listed under each
section below.

## Zones (`src/game/site.ts`, `public/sites/<zone>/site.json`)

The game plays one zone a page load: `?site=` picks it from `ZONES`, and a link without one (every
link from before there were zones) opens the first, Lanzarote. Choosing another zone on the welcome
screen reloads the page with the car, the time and the language kept. A shared moment writes
`?site=` next to `?at=`, because x and y only mean something in the zone they came from.

Each zone is a folder with a `site.json`, which `scripts/fetch-terrain.ts` fills in:

| field | meaning |
|---|---|
| `name`, `kicker` | the welcome screen's title and the line under it (`en`, `es`) |
| `proj4`, `crs` | the map projection, and the code IGN's services know it by |
| `bbox` | the square, in that projection's metres: a multiple of `detail.tileM` a side |
| `plainM` | inland only: the farmland's height around the square. Omitted means an island with sea all round |
| `buildings` | how the buildings stand and look, every field optional, Lanzarote's by default: `maxStoreys` the tallest a building gets (two, the island's planning rule), `storeys` the relative odds of one, two, three … storeys for a building OSM gives no height (`[0.7, 0.3]`), `walls` and `roofs` the colours one is picked from per building (list one twice to make it twice as common; Lanzarote's are all near-whites) |
| `places` | the places of interest labelled over the land (`src/sim/places.ts`), omitted = none: `osm` the Overpass selectors to ask for (one element type and its tags each, e.g. `node[natural=peak][name][ele]`), `max` how many labels, highest first, `spacingM` a place closer than this to a higher one already kept is dropped, so each mountain gets one label rather than one per needle. The build writes them to `places.json`, named in Spanish where OSM has it. And/or `spots`, a hand-picked list of `{ name, lat, lon }` (like `spawns`), always labelled and read as the page loads, so adding one needs no rebuild |
| `heightmap.unitM` | metres per stored step. 0.1 (default) holds 3,276 m. Tenerife and Benasque use 0.2 for Teide and Aneto |
| `spawns` | the places, as lat/lon, snapped to the nearest paved road; `toward` starts on a runway facing that way |
| `weather` | the weather on offer, the first the default; omitted = a clear sky. See *Weather* below |
| `scatter` | the plant life off the roads, every field optional: `trees` and `bushes` the relative odds of each species (`broadleaf`, `pine`, `umbrella`, `cypress`, `palm`; `bush`, `cactus`), `lone` how thick trees stand in open ground the photo doesn't show green, `density` a multiplier on everything. Omitted = a Mediterranean mix. See *Scatter* below |

| zone | square | projection | notes |
|---|---|---|---|
| Lanzarote | 42 km | UTM 28 (`EPSG:4083`) | island, two storeys |
| Tenerife | 42 km | UTM 28 (`EPSG:4083`) | the middle of the island: Teide, Masca, La Orotava, the south airport |
| Zaragoza | 30 km | UTM 30 (`EPSG:25830`) | inland, plain at 220 m, up to 14 storeys |
| Benasque | 30 km | UTM 30 (`EPSG:25830`) | inland, plain at 1,100 m. It is in zone 31 by longitude, but IGN only serves the peninsula in 30 (about 0.06 % stretch, 2.4° grid convergence). The north edge stops short of France, where IGN's data has holes that would read as sea |

The data is IGN's, so a zone has to be in Spain. Everything else (roads, buildings) is OSM.
Buildings have flat roofs everywhere; their heights and colours are the zone's (`buildings` above).

Labels (`src/game/places-view.ts`): Benasque labels its 10 highest peaks, 2 km apart at least
(`natural=peak`); Tenerife Teide alone (`max: 1` over peaks and volcanoes, since OSM tags Teide a
`volcano`); Lanzarote eight `spots` (Mirador del Río, Peñas del Chache, Jameos del Agua, Cueva de los
Verdes, Jardín de Cactus, Castillo de Santa Bárbara, Fundación César Manrique, Montañas del Fuego;
El Golfo, Los Hervideros, Janubio and Papagayo are outside its square); Zaragoza none yet. Each is a
sprite on a pin 25 m over the ground (the OSM summit height when it has one), the same size on screen
at any range, hidden by the hills in front, fading out past 30 km and when you are on top of it.
Where two overlap on screen the nearer shows. **L** shows or hides them.

## Weather (`src/sim/weather.ts`, `src/game/clouds-view.ts`, `src/game/cloud-shadow.ts`, `src/game/sea.ts`)

Each zone lists its weather in `site.json`; Settings picks one, `?wx=<id>` asks for one, and a
shared moment carries it unless it is the zone's first.

| field | meaning |
|---|---|
| `id`, `name` | the link's name, and Settings' (`en`, `es`) |
| `layers` | the cloud layers, none = clear: `base` and `top` (m above the sea), `cover` 0..1, `size` a typical cloud's radius (m), optional `box` `[west, south, east, north]` as fractions of the site (beyond 0..1 is over the sea) |
| `wind` | `[east, north]` m/s the clouds drift on and the waves run with; omitted = still |
| `light` | the sun's strength, times the usual (overcast, fog) |
| `haze`, `hazeColor` | thicker haze in that colour (calima: about 2, a pale dust) |

| zone | presets |
|---|---|
| Lanzarote | trade-wind cumulus (900–1,500 m, drifting SW), calima, clear |
| Tenerife | sea of clouds (a deck at 950–1,550 m over the north slopes, the peaks out of it), trade-wind cumulus, calima, clear |
| Zaragoza | fair-weather cumulus, high cloud at 6.5 km, clear |
| Benasque | cumulus on the peaks, cloud in the valley (1,050–1,500 m: drive in fog), clear |

- **The field.** `CloudField` scatters clouds over a square 1.6 times the site's side, seeded by the
  zone and preset, so a preset always looks the same. A cloud is 7–14 puffs, wide at the base and
  narrowing into a dome. The square repeats: the wind slides it, and the clouds are always drawn in
  the copy nearest the camera, so there are clouds all round wherever you fly.
- **Drawing.** One instanced draw of soft camera-facing discs, about 10,000 of them (60 % on a
  phone). Each is lit as a ball, bright towards the sun and grey underneath, has a silver edge with
  the sun behind it, and is cut flat at its layer's base. They fade out where the square repeats and
  as the camera reaches them, and are sorted far to near four times a second.
- **Inside.** `density()` says how deep a point is in a cloud. At the camera it closes the fog in to
  a grey-white wall (about 150 m to see by). At the car in the air, it adds a little buffeting.
- **Shadows.** The puffs are stamped as soft discs into one 1,024 px texture of the square, moved
  along the sun's rays down to the ground, redrawn when the sun or the weather changes. The land,
  roads, buildings, sea and the car read it and dim the sun's light, not the sky's, by up to 80 %.
  The wind slides the texture with the clouds.
- **Waves.** The sea stays one flat plane; its material tilts the normal with ten travelling
  waves (60 m swell down to 0.8 m ripples) at deep-water speed, so the sky's reflection and the
  sun's glitter move like water. They run downwind, within about 75° of it, and roughen with the
  wind up to 10 m/s; still air keeps a third of that as swell from the north-west. Each wave comes
  in groups and its crests bend a little, so they don't read as ruled lines. A wave fades out
  where it shrinks below a couple of pixels and the roughness rises in its place, so the far sea
  stays calm without shimmering and the sun's path on it widens with the chop. It is shading only:
  the car still meets a flat sea at 0 m.
- **Calima.** Thicker haze in a dust colour; the sky fades to the same colour towards the horizon,
  mixed in the same colour space as three's fog so the two meet without a line.

## Frames

Site frame: **x east, y north, z up**, metres, origin at the bbox's south-west corner (in the zone's UTM projection).
three.js: `X = x − e/2, Y = z, Z = e/2 − y`, so the site is centred on the origin.
Car body frame: **X forward, Y left, Z up**, origin at the centre of mass. A heading is a compass
bearing in radians (0 = north, clockwise).

## Car (`src/sim/car.ts`)

One rigid body, integrated at 480 Hz (4
sub-steps of each 120 Hz game step). Newton handles the centre of mass and Euler's equations the
rotation.

The car is `TRUCK`, the Buggy (still `?car=4x4`): 1850 kg, its centre of mass 0.68 m up, a 2.9 m
wheelbase and a wide 2.24 m track, 0.58 m radius tyres on 45 cm struts with 30 cm of travel, and 50/50
four-wheel drive. Its `allTerrain` of 0.45 wins back that share of the grip a loose surface takes
away (picón 0.62 → 0.79, gravel 0.72 → 0.85) and halves the extra rolling drag. The model is an
open-cage buggy sitting low between its wheels; its upper and lower arms and coilovers are re-aimed
at the hubs every frame, and the Piratas Aéreos badge (`public/decals/piratas-aereos.png`, loaded
by `logo.ts`) sits on the nose and both sides.

- **Struts.** Each wheel casts down its strut from the mount. The strut length is the distance to
  the terrain minus the wheel radius, and the cast is capped at the strut's reach, so a steeply
  pitched car can't find a cliff top tens of metres along it. The spring and damper force is the
  tyre's load, applied at the contact point along the body's up axis. A bump stop takes over past
  the travel.
- **Tyres.** The axes are laid in the ground plane under the contact point. Lateral force uses a
  lean Pacejka on the slip angle (`B = 10, C = 1.4`), peaking near 8° and keeping about 80 % in a
  full slide. The slip angle is taken against at least 2.5 m/s, so a parked car doesn't jitter.
  Drive, brake and rolling resistance make up the longitudinal force. A friction circle caps the
  total at μ × load, so wheelspin or hard braking steals cornering grip.
- **Brakes and handbrake.** A brake resists rolling like a stiff damper up to its cap, so a car
  stops dead instead of oscillating. The handbrake locks the rear wheels, which then skate with
  kinetic friction against their sliding direction.
- **Powertrain.** The torque curve is a broad hump (a V8's 520 N m peak at 4000 rpm, nothing past
  the 6200 redline), feeding six gears, a 4.1 final drive and 90 % efficiency. It does 0–100 km/h
  in 5.3 s and tops out at about 230 km/h. The clutch slips
  pulling away. It changes up near the redline and down below 2400 rpm. Off the throttle the
  engine brakes a little. When stopped, the brake pedal engages reverse (and the pedals swap).
  With no pedal and under 0.4 m/s, the hill hold keeps it parked.
- **Body contact.** Eight corners of the body box push out of the ground with friction (a roll, a
  bottomed landing, the roof). The friction is capped at what would stop the corner's slide in one
  sub-step, which keeps it stable at rest.

- **Walls.** Eight points round the body's waist are pushed back out of any building they enter
  below its roofline, along the nearest wall's outward normal. The push is stiff (1 MN/m) and close to
  critically damped (40 kN·s/m), so a crash stops the car without bouncing it back, and the rub
  along the wall is capped like the ground friction. The same goes for trees, boulders and other
  cars (`env.wall`); a wall that moves gives its velocity, so the damping works on the closing
  speed, and is handed the force it takes back (`WallContact.react`).

`src/sim/car.test.ts` pins the envelope: 0–100 km/h in 5–9 s, a top speed of 200–260 km/h,
100–0 km/h in 35–50 m, under ~1.1 g steady cornering, holding on a 10 % grade, the handbrake
kicking the tail out, keeping more grip on picón than plain tyres would, surviving an upside-down landing, stopping against a wall, and noticing the sea.

## The vehicles

`ROADSTER`, `TRUCK` and `JET` share everything above. They differ in their numbers, and in
how `flying` flies: `CarSpec.wings` unfolds into a plane, and `CarSpec.thrusters` hovers. Each has
its own model (`roadster-model.ts`, `car-model.ts`, `jet-model.ts`), and Settings → Vehicle (or
`?car=4x4`, `?car=jet`) swaps them where the car stands. A link without `?car` starts in the Jet, except a shared moment
(`?at=`), which starts in the Roadster: those links were written before the page always set `?car`,
when leaving it out meant the Roadster (`vehicleOf` in `share.ts`). The Jet is placed 600 m up at 230 m/s
with its wings already out, and never drives (see [The Jet](#the-jet) below).

The Roadster is electric (`engine.electric`). Its torque is flat at 1,400 N·m from a standstill
to 5,000 rpm, then falls off at constant power to 20,000 rpm, through one 7:1 gear. With no clutch to
slip and nothing to shift, 0–100 km/h is grip-limited at about 2 s and it tops out near 390 km/h.
The sound changes with it: a quiet sine hum, about 260 Hz flat out, with no sub-octave.

## Hovering (`src/sim/thrusters.ts`)

Lit, the thrusters push along the body's up axis. The lift is whatever holds the asked-for climb
rate (Space +14 m/s, Ctrl −14 m/s, nothing pressed is 0, which holds your height), divided by
how upright the car is and capped at 2.2× its weight. Two assists do the flying. The attitude
assist is a spring and damper (14/s², 7/s) that tilts the body to the stick: up to 0.55 rad nose
down or up on W/S, and 0.4 rad of bank on A/D, with a yaw rate of up to 1.3 rad/s. The thrust,
tilted with the body, is what moves it across the ground. The wash of the thrusters drags it
horizontally (6 % of its momentum a second), so it settles at a cruise near 290 km/h instead of
running away. Shift fires the tail nozzles (24,000 N). `src/sim/roadster.test.ts` pins lifting off,
holding height within 2 m, flying forwards, turning, and dropping when the thrusters go out. An
unstable assist fails the hold and cruise tests.

On screen, four nozzles drop out of the floor as the thrusters spool. Their flames and smoke scale
with the lift: pooled, camera-facing puffs in the scene (`smoke.ts`), blown down at up to 38 m/s,
spreading and fading behind the car. The hiss of the thrusters rides on the turbo's roar.

## Turbo

`Controls.boost` (Shift, a stick click, or the BOOST button on a phone) adds a force straight along
the nose at the centre of mass, whatever the gear: the 14,000 N nitro rocket as a car, blending into
the wings' 20,000 N afterburner as they come out (on top of a full jet). Drag is the only limit,
so on the road the truck does 0–100 km/h in under 3.5 s and passes 450 km/h. In the air it gains
over 150 km/h on the full jet alone and passes 500 km/h. The tests pin both, and zeroing the
boost fails them. On screen, two blue-white jets light under the rear bumper (on the plane, the
jet's flame doubles and turns blue). The camera's field of view widens from 60° to 80° with a
slight shake, the speed readout glows, and a low rocket roar plays.

## Flight (`src/sim/wings.ts`)

The car stays the same rigid body when it transforms. `flying` sends `wings` (0..1) towards fully
out at 1.1 per second. While they're out, `aero()` adds its force and torque in the same sub-step
as the struts and tyres, scaled by how far out they are, and the wheel drive switches off
(Space brakes all four at 70 %, `ANTI_SKID`, never locking them: a locked rear wheel has no side
grip left, so the jet would ground-loop off the runway; from 270 km/h at idle it stops straight in
about 700 m). The extra inertia of the wings is added in proportion.

- **Lift.** On 12 m²: CL = 0.25 + 5α up to the stall at 15° (CL ≈ 1.55). Over the next 9° it
  collapses onto a flat plate's 0.9 sin 2α. Drag is 0.035 + 0.06 CL². The lift acts perpendicular to
  the airflow in the body's plane of symmetry, and there's a side force against sideslip.
- **Stability and controls.** They're coefficients times dynamic pressure, so the controls go soft
  as it slows. In pitch, the tail noses it into the airflow (1.2 per rad of α) with a small
  nose-up trim, plus the elevator and pitch damping. In roll, the ailerons and roll damping. In
  yaw, a weathervane on sideslip, the rudder and yaw damping. All damping scales with rate × size
  / airspeed.
- **Jet.** Along the nose, at the throttle lever's setting (`Input.lever`, 10–100 %, cruise 60 %).
  Shift and Ctrl move it at 80 % a second, 1–4 set it, and the pad's triggers move it as far as
  they're pressed. Shift held at full is the afterburner: a detent, so a tap of Shift no longer
  lights it. The keys also work the stick differently on wings (`Input.plane`). W A S D are the fine
  stick: out at 2 a second on a square, back at 4, and never past 40 % (`shapeStick`,
  `KEY_STICK_MAX`) however long they're held, so they start moving at once and stay gentle. On
  the Jet A/D roll at most 40°/s (a one-second hold banks about 25°, two seconds about 65°), and
  S held at cruise pulls at most about 4.3 g.
  On wings the arrows are a second, hard stick: linear, out and back at 8 a second
  (`PLANE_ARROW_RATE`, full in 0.125 s), for snapping into a turn or a pull out of a dive (from 60°
  at 800 km/h the down arrow levels out in under 400 m); on the Jet they also go past the
  limiter (below), while W A S D keep the fine curve. Off wings the arrows are just W A S D. `src/game/input.test.ts` pins the curves.

With the truck's heavier mass its wings are bigger (15 m², 9.4 m span) and its jet stronger
(13,000 N). It rotates at about 210 km/h after a 9 s run and climbs at about 11° on full thrust. Hands-off
at cruise it climbs gently through a slow, well-damped phugoid. Banking turns it, and slowing past
the stall drops it. `src/sim/wings.test.ts` pins all of that, plus folding the wings in the air
(it falls). Making the airframe unstable (a negative pitch stiffness) fails the take-off and
hands-off tests.

### The Jet

`JET` is the same rigid body on the same wheels, with a fighter's `WingSpec`: 9 t, 28 m² of
cropped delta (CL = 0.05 + 3.6α, stall at 30°), drag 0.022 + 0.12 CL² (the body's own `cdA` is
only 0.1 m², since the wing's 0.022 already counts the airframe), 52 kN dry and 45 kN more on
the afterburner. Two additions make it a fighter rather than a fast light plane:

- **Fly-by-wire** (`WingSpec.fbw`, `flyByWire()`). The bare surfaces get stronger with V², so at
  300 m/s the stick would be some 36× as sharp as at 50. Instead pitch asks for a rate: how fast the
  flight path turns, 0.35 rad/s (20°/s) at full stick. That is the load factor 1 + V·rate/g
  (1 g hands-off), kept between −3 g and 9 g, so above about 230 m/s a full pull is simply the 9 g
  limit, the hardest dive recovery the jet has, and slower the same stick swings the path no
  faster than 20°/s. Roll asks for a roll rate (1.75 rad/s, 100°/s, at full stick). The computer flies the
  load factor as the angle of attack that gives it, capped at 22° (under the
  stall), and sets each surface to what holds the target steady plus a correction for the error. The
  pitch-rate target is capped at the g the wing can reach, so a slow pull doesn't overshoot the cap.
  Deflections clamp at full travel, so below about 150 m/s it runs out of authority as the bare wing would.
  The rudder's travel shrinks with (120 / V)².
  **Past the limiter** (`fbw.override`): stick beyond 40 %, which W A S D never reach, opens the
  limits towards 12 g (−6 g pushing), 27° angle of attack and 4.4 rad/s (250°/s) of roll at full stick, and
  asks for up to 3× the pitch rate, so the arrows (or a pad's full stick) snap the jet round:
  about 29°/s of turn at 230 m/s where the limiter held 20°/s. The pilot pays for it (12 g greys
  the view in about 2 s and blacks out after about 4.5 s). `alphaLimit()` gives the limit in
  force, which the stall horn uses.
- **Wave drag** (`WingSpec.mach`, `waveDrag()`): from Mach 0.85, CD climbs as the square to a
  0.015 hump at Mach 1.05, then eases off towards 0.005 past it. Full dry thrust can't push through
  the hump. The afterburner beats it by a few kN, so the run to Mach 1 is slow and dramatic, and once
  through, the falling drag lets it run on to Mach 1.2.
- **Airbrake** (`WingSpec.airbrake`, Space): adds 0.08 to CD when fully out. At idle from 830 km/h it
  sheds about 260 km/h in 10 s where the clean jet sheds 90. The panel swings up over 0.5 s
  (`CarState.airbrake`, 0..1) and the drag follows it. It shows as a panel hinged up on the spine
  behind the canopy (`jet-model.ts`), an amber AIRBRAKE box on the flying HUD with a bar for how far
  out it is (flashing while it moves), a buffet in the camera that grows with airspeed, and in
  `audio.ts` a clunk as it goes out (a lighter one as it stows) and a low fluttering rumble while it's out.
- **Control surfaces** (`CarState.surfaces`): the pitch, roll and yaw the wing actually got this
  step, after the fly-by-wire (so the rudder shrinks at speed and a steady pull shows its trim). In
  `jet-model.ts` the all-moving tailplanes tilt together to pitch and against each other to roll,
  ailerons cut out of the wing's trailing edge roll, and a rudder on each fin yaws, all up to 20°,
  easing towards the sim's value at 12/s so the fly-by-wire's corrections don't jitter them.

- **The air** (`atmosphere()`): the International Standard Atmosphere by height above the sea.
  The temperature falls 6.5 °C a kilometre to −56.5 °C at 11 km, the density follows (0.36 kg/m³ at
  11 km, 0.09 at 20 km), and the speed of sound falls from 340 to 295 m/s. Lift, drag, the flight
  computer and the body's own drag all use the local density, and Mach (`CarState.mach`, shown on the
  HUD and driving the boom and the vapour cone) uses the local speed of sound. Jet thrust and the
  afterburner fall with the density the engine breathes, to the 0.7 power up to 11 km and in step
  with it above (`thrustLapse()`). At speed the intake rams the air in, packing it to (1 + 0.3 M²)
  times as dense, never past the sea's: that leaves low level as it was and wins back much of what
  the height took. So on the afterburner the Jet tops out at Mach 1.2 (about 1,480 km/h) low down,
  Mach 1.6 at 4 km and Mach 2.05 (about 2,250 km/h) from 8 km up, while dry it stays near Mach 1
  at any height; it has a ceiling near 18 km, where the afterburner can no longer make up the drag
  of holding it up. Nose down, gravity adds to the thrust: a 45° dive held from 8 km is over 30 %
  faster after 20 s than level flight, and a vertical one passes 1,900 km/h. Hands-off, the flight
  computer holds 1 g, which bends a dive back towards level, so a dive needs the stick held forward.

Low down (the tests fly at 500 m) it cruises at about 920 km/h, does Mach 0.94 dry, and on the afterburner passes Mach 1 about 18 s
from cruise and tops out at Mach 1.2 (about 1,470 km/h). It pulls 9 g above about 180 m/s (12 g on the arrows above about 220 m/s) and mushes downwards below about 60 m/s.
Crossing Mach 1 plays a sonic boom (`CarAudio.boom`, the N-wave's two cracks 0.11 s apart) and says
so; it re-arms below Mach 0.97. The model wraps a vapour cone round the fuselage between about
Mach 0.95 and 1.03, thickest at 0.99 and flickering as the shock moves. `src/sim/jet.test.ts`
pins those, as well as an equal roll rate at 250 and 300 m/s, no stall even at full pull at 80 m/s, the airbrake,
the standard atmosphere's values, the top speed low down and at 8 km, dry and on the afterburner, a held dive and the ceiling (by energy height, since the
flight computer trades speed for height). Taking
out the fly-by-wire fails eight of them.

The haze (`Sunlight.setViewHeight`) thins with the camera's height above 1,000 m, at 1,500 / (h + 500)
of its low-level density, since real haze lies in the low air: from 8 km the whole island reads clearly.

**Cockpit warnings** (`src/game/warnings.ts`), all synthesised, into a headset bus that skips the
grey-out muffle but still mutes and pauses:

- **PULL UP** whenever the HUD shows it: two rising sawtooth "whoops" (320 to 1,150 Hz), then the
  words in the browser's speech voice (`speechSynthesis`, in English like a real ground-proximity
  warning, whatever the game's language), every 1.6 s while it holds.
- **Stall horn**: a 760 Hz square tone gated at 7 Hz, past 92 % of the wing's angle-of-attack
  limit: the flight computer's 22° in the Jet (it never lets the wing reach the stall itself), the
  stall in the Buggy.
- **Breathing**: from a felt 4 g up to the blackout, the anti-g strain: a short inhale and a held
  grunt let out in a burst (`breath()`), noise through a band that drops for the grunt, quicker
  (1.8 s down to 1 s a breath) and louder as the blackout nears, silent once out cold.

**Showing the speed and the height** (`src/game/jet-effects.ts`). Up high nothing near the jet moves,
and low down the ground blurs past without touching it, so the Jet leaves marks in the air:

- **Contrail**: a ribbon from the nozzle once the air is cold enough, fading in from 7.5 km to full
  at 9 km. It forms a few tens of metres behind, widens from 1 to 16 m and lingers 25 s.
- **Wingtip vapour**: thin ribbons off both tips, pulling past 4 g (full at 7 g) or flying past
  10° of angle of attack, gone in 1.2 s.

  Both are `Trail`s: points dropped at a fixed interval and led by the live source, built each
  frame into a camera-facing strip with an alpha map feathering both edges, widening and fading
  with age. They live in the scene, so they stay where the jet has been, and a jump of more than
  2 km (a respawn) starts them afresh.
- **Ground wash**: below 50 m and past 80 m/s, puffs from the `Smoke` pool (dimmer than the
  roadster's thruster smoke, since they pile up) thrown off the surface under the jet. They're dragged
  along in its wake at about two-thirds of its speed, so they billow round it instead of vanishing
  under the camera: tan dust over land, white spray over the sea.
- **Buffet**: the chase camera's shake, strongest at Mach 1 (fading by Mach 0.9 and 1.1) and when
  skimming the ground fast, on top of the airbrake's.

The chase camera's speed lag is capped at 20 m (`MAX_LAG`), so near Mach 1 the Jet stays a size you
can see instead of falling 40 m further away. `src/game/jet-effects.test.ts` pins when each effect
starts and stops.

`main.ts` checks for a crash each frame: low over the ground while too fast (110 m/s), sinking
faster than 6 m/s or not upright, or inside a building. A crash hides the jet and sets off the
`Explosion` (`src/game/explosion.ts`): a soft additive flash (gone by 0.4 s, `flash()`), a fireball of
orange puffs from a `Smoke` pool carrying 15 % of the jet's speed, sixteen bits of debris flung
out under gravity and bouncing off the terrain (`fling()`), trailing fire for 1.5 s, a column of
grey smoke rising for several seconds, and an orange point light that fades over 0.9 s (it stays in
the scene at zero, so lighting it doesn't recompile shaders). `CarAudio.explode()` plays a blast of
low-passed noise over a sub-bass drop, then a crackling roar. For `WRECK_S` (1.8 s) the physics
holds, the engine is silent, the HUD is off and the chase camera backs off from the wreck and
shakes; then the jet is back in the air over the same spot. The terrain view stops at the 10 m level above 150 m/s (`terrainView.update`'s
`speed`), since the 5 m mesh would be built for a tile you pass in seconds.

**The pilot under g** (`src/sim/pilot.ts`). Blood takes seconds to leave the head, so the g the
eyes feel chases the load factor with a 4 s lag as it builds and 1.5 s as it eases. Felt g from
5.5 greys the view, and at 8.3 it's black. So a 2 s snap to 9 g does almost nothing, 6 g can be held for
ever with a hint of grey, holding 9 g blacks out after about 8 s, and the arrows' 12 g after about 4.5 s. Blacked out (G-LOC), the
pilot lets go of the stick for at least 3 s, so the flight computer settles back to 1 g, and wakes once the grey is under
0.6. Negative g reddens the view from −1.8 to −3.2. `main.ts` feeds it the same g as the HUD (any
flying vehicle), `Hud.setVeil` draws it as a grey `mix-blend-mode: saturation` layer that drains
the colour plus a tunnel closing in from the edges (dark red for red-out), and `CarAudio.setMuffle`
low-passes all the sound from 18 kHz down to 300 Hz with it. `src/sim/pilot.test.ts` pins those
timings.

The airport's runway (OSM `aeroway=runway`) is a road kind: 45 m wide, carved, marked and tarmac.
The `airport` spawn sits on its threshold, facing down runway 03 (a spawn with `toward` is placed
exactly and not snapped to a road).

**Surfaces** come from the road index: on a paved carriageway grip ×1.0 and rolling 0.012, on a
track ×0.72 and 0.03, anywhere else (picón, lava, sand) ×0.62 and 0.06.

## Starship (`src/sim/starship.ts`, `src/game/starship-model.ts`, `src/game/rocket-hud.ts`)

A zone with a `launch` in its `site.json` (`{ name, lat, lon, azimuth }`) has Starship on a tower.
Lanzarote's stands in the sand plain of El Jable (29.042 N, 13.594 W, 193 m up, under 8 m of relief
over 800 m), launching east over Teguise and out to sea. It is not a `CarSpec`: picking Starship
parks the car out of sight and the frame flies the launch instead. Whatever you are in, the launch
runs on its autopilot in the background (`BACKGROUND` in `main.ts`): a countdown 40 s into the drive,
the booster home (or lost), a fresh stack on the tower a minute later and the next countdown two
minutes after that, with a chip at the bottom of the screen keeping the mission clock.

- **The model.** Each stage is a point mass at the middle of its engine plane, with an axis (nose and
  thrust) that turns at a commanded rate: the stack at 3°/s, the booster at 10°/s, the ship at 3°/s.
  No gimbal dynamics; the flight computer is taken to hold whatever attitude it asks for.
  `SUPER_HEAVY`: 275 t dry, 3,400 t of propellant, 33 Raptors of 2.26 MN at sea level and 2.45 MN in
  vacuum (Isp 347 s), throttling to 30 %. `SHIP`: 130 t + 1,500 t, six engines lumped. Thrust lies
  between the two by the air's pressure; propellant burns at a fixed rate per engine and throttle.
- **The air** is wings.ts' standard atmosphere: drag along the wind (0.35, with a hump to 0.8 through
  Mach 1.1) and, when the body meets the wind at an angle, a normal force (slender-body lift plus
  the crossflow on the cylinder's side). Falling engines first with the grid fins out the drag is
  2.5 times the nose-first value, which is what slows the booster from Mach 4 to about 300 m/s.
- **The earth** is flat with a constant g, less the pull that going round its curve takes away
  (v²/R on the horizontal speed), which is what holds the ship up as it nears orbital speed.
- **The autopilot.** Countdown from Space: T−10, the engines light at T−3 and come up over 2.5 s,
  release at zero once they lift more than the stack weighs. A gravity turn scheduled on height
  (straight up to 400 m, then tipping to 72° from vertical by 60 km), throttled back to hold the
  dynamic pressure near 32 kPa. MECO at 12 % propellant left (T+2:07, 55 km up, 1.7 km/s), hot
  staging two seconds later. The booster flips and burns back on 13 engines along the predicted miss
  (`predictImpact`, a coarse fall with drag), easing off as it closes, until the fall would bring it
  home. Coming down, the grid fins tilt it (aimed 400 m long, for the way the landing burn falls
  short). The landing burn lights when 13 engines at 85 % and the drag would just stop it at the arms
  (`stoppingDistance`), steers across by zero-effort miss and velocity, hovers 12 m over the arms to
  slide in over the mount, then settles through them: **caught** within 3.5 m of the mount's axis,
  under 4 m/s and 5° of upright. Anything else through the arms, or into the ground, is lost: an
  `Explosion` eight times the Jet's.
- **By hand.** Any stick past 15 % (or F) hands it over: W/S tip the nose towards or away from where
  it leans (the azimuth when upright), A/D tilt it across, the lever is the throttle (on the booster,
  13 engines' worth, dropping to the centre three below their lowest setting), Space lights or cuts the
  booster. F gives it back. T warps time ×4 or ×10 above 20 km, never in the landing burn.

`src/sim/starship.test.ts` pins the countdown and lift-off, MECO's height, speed and climb, max-q, the
booster caught on the autopilot launching east and north-east, lost with the flight computer off
after staging, and the engine rings. Taking away the engines-first drag or the long aim fails both
catches.

On screen: a lattice tower 146 m tall with its chopsticks (open for the launch and the way home,
closing round a caught booster), the launch mount over a steel deflector, a concrete pad and a tank
farm; Super Heavy in bare steel with its grid fins, hot-staging ring and 33 bells; Ship with its black
heat shield and four flaps. The plumes are additive cones that brighten with the engines lit and
balloon into the thin air up high. Steam boils off the pad at lift-off and the low air keeps a trail.
The sky darkens towards black from 15 to 70 km, and above 5 km a thin far haze hides the sea's edge.
C cycles chase (about 240 m behind), a long-lens tracking camera on the ground 1.2 km off the tower
that zooms to keep the rocket in frame, and orbit. The telemetry strip is a launch webcast's: the
mission clock and phase, and each stage's speed, height, propellant and engine ring. The sound is a
low rumble and a crackle that fade and dull with distance.

## Roads (`src/sim/roads.ts`, `scripts/fetch-terrain.ts`)

- **Source.** Overpass returns every `highway=*` way of a drivable kind over the bbox, and they
  are mapped to seven kinds (`highway` … `track`). Driveways, parking aisles, private ways,
  areas and tunnels are dropped. Bridges are kept but never carved. Coordinates go to the site
  frame, to the decimetre, in `roads.json` (2.2 MB, gzipped by Pages).
- **Profile.** Each road is resampled every 4 m, and its height under the centreline is smoothed
  along its length (three passes of a ±20 m moving average, with the window shrinking at the
  ends). That gives a graded ride and keeps the climbs. The road never goes below sea level.
- **Carving** (offline, in `fetch-terrain`). Every 5 m cell within reach of a segment takes the
  profile height, weighted 1 across the carriageway plus a 1 m verge and blending to 0 over a 6 m
  shoulder. Where roads meet, cells average the heights by weight, and the strongest weight sets
  how much of the natural ground is replaced. All profiles are taken before any cutting. The
  raw IGN tiles stay in `cache/`, and the tiles in `public/` are the carved ones.
- **Index.** `RoadIndex` buckets segments in a 100 m grid for nearest-road lookups. It gives the
  tyre surfaces (16 lookups per 120 Hz step), the HUD plate, the spawn points (snapped to the
  nearest paved road) and the **R** recovery.

## Buildings and street furniture (`src/sim/objects.ts`, `src/game/dress.ts`)

- **Buildings.** OSM `building=*` ways (about 27,500 on the island; OSM is incomplete outside the
  towns). Construction sites, ruins and footprints under 8 m² are dropped. The height comes from
  `height` or `building:levels` when tagged, capped at the zone's `maxStoreys` of 3.2 m (two on
  Lanzarote, as the island's planning rules have it; churches get 11 m for their towers). Garages
  and sheds are 2.6 m, warehouses, barns and the like one storey. Anything else is rolled from the
  zone's `storeys` odds by the OSM id, so it never changes: a footprint over 300 m² or a block of
  flats rolls from the taller half, and a house, or a building with fewer than 12 others in the
  150 m square round it (a farm, a village), stops at two. Each building is
  filed under the tile holding its centroid in `objects/<col>_<row>.json`.
- **Furniture**, placed offline from the roads and buildings. A road with a building within 30 m
  is in town and gets street lamps every 28 m, alternating sides, 1.4 m past the kerb, with their
  arms over the road. Main roads in the open get edge posts (*hitos*) every 50 m on both sides,
  1 m past the edge. Nothing is placed inside a building or on another road's carriageway.
- **Drawing.** Walls sit on the lowest ground under the footprint and rise the building's height
  above it (at least 2.6 m clear on the high side), so a slope doesn't add a storey. Only the real
  storeys get windows; where the ground falls away below them the wall is plain. The walls are
  the zone's colours, one wall and one roof colour picked per building from a seed of where it
  stands and carried as vertex colours over a white canvas texture. A small patch to the standard
  material (`wallShader`: one extra texture read and a hash a pixel, nothing in the shadow pass)
  puts the colour on the wall only, through a mask drawn with the texture (red wall, green glass),
  so the woodwork keeps its own; darkens the first metre and a half of wall; starts each building's
  window bays at its own place along the wall; and as the sun goes down (from 10° above the horizon)
  lights about half the windows warm, picked per bay and building of one window bay per storey in one of four styles
  (shuttered, small square, arched, a narrow pair) and three woodwork colours. Each house is varied
  from a seed of where it stands: most have a low parapet round the flat roof, some two-storey
  houses have the upper floor over only one end with a terrace over the rest, and roofs carry the
  island's capped white chimney or a small stair room. A tile's buildings merge into thirteen
  meshes (twelve wall textures and the roofs and roof furniture), and its
  lamps and posts are instanced, so a town costs a handful of draw calls. A tile is dressed once
  it is within 4.5 km (about 20 ms for Arrecife's busiest tile) and freed with its heights.
- **Collisions.** `BuildingIndex` buckets the loaded tiles' footprints in a 25 m grid, and
  `env.wall` asks it for the way out. Each building's roofline (`roofline`, the same one the
  renderer draws) is set once its tile's ground loads, and above it there is no wall, so a car
  flying over a roof isn't shoved sideways. Roofs aren't solid to land on, and lamps and posts
  aren't solid.

## Scatter (`src/sim/scatter.ts`, `src/game/scatter-view.ts`)

Trees, bushes, grass tufts, stones and boulders, placed only round the camera and the same every
visit: the land is cut into cells, and each cell rolls its own dice (a hash of its column and row).

- **What grows where.** The island photo is read once into a 2048² canvas (`GroundPhoto`), and each
  candidate spot asks it for its pixel: `groundOf` turns the colour into how green, dark (lava),
  warm (farmland, scrub) and bare (sand, salt, snow) it is. Each layer has a top density a 1000 m²
  and a chance from those: grass up to 30 on green ground, stones up to 24 and boulders up to 2.5
  on lava, bushes up to 6 on farmland, trees up to 8 where the photo is green. Trees also stand in
  open ground at the zone's `lone` density, gathered into groves by a 300 m noise. Rocks take the
  colour of the photo under them; grass and bushes go from straw to green with the ground.
- **Where it can't.** Nothing within its clearance of a carriageway (0.6 m for a stone, 3 m for a
  tree) or inside a building, nothing below 0.5 m (the sea), and a cell waits until its 5 m ground
  has loaded, so nothing is placed on the coarse heights and left floating.
- **Two fields.** Grass, stones and bushes in 25 m cells out to 240 m; trees and boulders in 50 m
  cells out to 680 m. Missing cells fill nearest first, about a millisecond a frame each, and cells
  more than a quarter past the radius are dropped.
- **Drawing.** One flat-shaded low-poly model per kind (a broadleaf is three lumpy balls on a
  trunk, a palm fourteen drooping fronds), one `InstancedMesh` per kind, coloured per instance. A
  few lines of vertex shader grow each one up out of the ground over the last quarter of its kind's
  reach (grass 110 m, bushes 220 m, trees 640 m), which is the pop-in, and sway grass and leaves
  with the square of their height, more in a stronger wind. The CPU only refills the instance lists
  when cells come or go, at most four times a second, copying matrices worked out once per cell.
- **Collisions.** Trees and boulders are solid: `env.wall` asks the far field after the buildings,
  and a trunk pushes the car out radially. Each obstacle is fattened by half a metre, because the
  car feels walls at eight points round its waist about a metre apart and a bare trunk could slip
  between two. Above the tree top there's nothing, so the Jet clears a forest it flies over, and
  crashes into one it doesn't.

## Birds (`src/sim/birds.ts`, `src/game/birds-view.ts`)

A handful of flocks of gulls round the camera, never more: three soaring, two passing and, while
the car is on the ground, two perched.

- **Soaring** flocks circle a fixed point 35–125 m across, each bird at its own radius and height,
  gliding with a few wingbeats every so often. **Passing** ones fly straight across the camera's
  patch of sky in a loose V behind a leader. Both appear 150–700 m from the camera, 20–140 m over
  the ground, and are dropped past 1.3 km.
- **Perched** flocks settle 120–320 m ahead of the car, roughly the way it's going, on dry ground
  off the roads and out of the buildings, standing with their wings folded. When the car comes
  within 45 m they **flee**: each bird takes off away from it, fanned out and climbing, and after six
  seconds the flock forms up into a passing V. A perched flock left 450 m behind goes.
- **Drawing.** One small gull (white body, grey wings with black tips, yellow legs), 1.5 times life
  size so a flock reads at a few hundred metres, in one `InstancedMesh`. Each instance carries its
  flap phase and strength; the vertex shader beats the wings, folds them and lets the legs down
  when standing, tucks the legs up in flight, and grows a bird in over the last quarter of its 1.2 km
  reach. The CPU only places them, nose along the way they fly.

## Traffic (`src/sim/traffic.ts`, `src/game/traffic-view.ts`)

About fourteen cars on the paved roads round the camera (highway to minor; not service roads,
tracks or bridges), stepped at 120 Hz like the car.

- **Lanes.** A car follows its road's polyline, a quarter of the carriageway to the right of the
  centreline (Spain drives on the right). The offset is taken off its eased heading rather than the
  segment's, so it doesn't jump sideways at each vertex. OSM's dual carriageways are two roads with
  no one-way tag in `roads.json`, so each carries traffic both ways, in its two lanes.
- **Speed.** The road's pace (27 m/s on a highway, 22 primary, 19 secondary, 15 tertiary, 11 minor),
  capped for the sharpest bend in the next 40 m at 3 m/s² of sideways grip, and for anything in its
  lane within 70 m (another car, a wreck, or the player): it aims to stop 8 m short. It speeds up at
  2.5 m/s² and brakes at up to 7.
- **Junctions.** At the end of its road it looks for other roads with a vertex at the same point
  (`RoadIndex.within`) and picks one, the straighter the likelier (no U-turns); with none it turns
  round. A road it meets mid-way it drives straight through.
- **Crashes.** Each car is a 4.4 × 1.8 m box, 1.5 m tall, fattened by 0.3 m. `contact` is the
  player car's `env.wall` for it, giving the way out of the nearest side, the car's velocity, and a
  `react` that applies the force the player puts on it at that point (1300 kg, a box's inertia). The
  first push makes it a wreck: it slides on 7 m/s² of friction, its spin dying away, pushed out of
  buildings, and the crash sound plays scaled by the speed the player lost. Once still for 3 s
  within 4 m of a road and facing along it (either way), it drives on; otherwise it goes after 40 s,
  once 120 m from the camera.
- **Coming and going.** A new car appears on a random driven road 220–650 m from the camera, at
  least 40 m from any other; one past 900 m goes.
- **Drawing.** Three models from extruded side profiles (a hatchback, a saloon and a van), each
  two `InstancedMesh`es: the paintwork, tinted per car from a palette that is mostly white and
  silver, and everything else (glass, tyres, bumpers, lamps). Pitched to the ground under the axles.

## Terrain loading (`src/game/site.ts`, `terrain-view.ts`)

paragliding-sim fetches every detail tile's heights up front (54 tiles near the launches).
Here all 105 land tiles have detail (about 74 MB of heights), so they load lazily:

- A chunk loads its photo, heights and objects together when the camera comes within 4.5 km,
  nearest first and two tiles at a time, so the ground under the car never queues behind the
  horizon. It frees them all when it drops back to the coarse mesh (64² segments a chunk, about
  47 m between vertices).
- `site.ensureDetail(x, y, r)` waits for the tiles around a point. It runs before the car is
  placed (1.6 km) and every half second around the car (400 m), so the physics always runs on
  the 5 m ground, whatever the view has loaded.
- At the finest level (within 1.5 km) a chunk also gets its road ribbons (`road-view.ts`): asphalt
  strips 6 cm above the carved surface, with a canvas texture of white edge lines and a dashed
  centre line on main roads, and bare worn tarmac on minor ones. A segment belongs to the chunk
  holding its start, so chunks never double up.

## Welcome screen (`src/game/welcome.ts`, `camera.ts`)

The page opens on a menu laid over the live scene, set out as a rally roadbook: a tilted paper sheet
whose numbered boxes are the zone, the place (with a tulip that turns as you step through places, ← → or
the Places tab) and the vehicle, the picked one under a stroke of yellow highlighter. Then Drive. The sun
starts at `DEFAULT_HOUR` (afternoon) unless a shared link says otherwise. The side panel's Controls
tab lists every mode's keys, the picked vehicle's modes first (`referenceOrder` in `controls.ts`). Under it the
physics stops and the audio is paused. The HUD, the settings panel and the touch buttons are hidden by
`body.in-menu`. `CameraRig.showcase()` circles the car slowly, wider and higher with the wings out. A
place far across the island is a cut, not a sweep over the mountains. `drive()` blends into the camera
mode over 1.4 s. **M** / **Esc** reopens it from a drive with **Resume**, and **Drive** then starts
over at the chosen place. The place and the vehicle stay in the URL (`?spawn=`, `?car=`), so a deep link
opens the menu already set. A shared moment (`?at=`) skips the menu entirely. The menu replaces the old
spawn picker.

The loading screen comes before it: the name rises in over a slow Timanfaya glow, a road's centre
line runs under it, and the status line follows the boot (terrain, photo, a road for the car).

## HUD (`src/game/hud.ts`)

- **The road plate.** An OSM `ref` like `LZ-67` goes in a green plate, with the name beside it,
  and it swaps in whenever you turn onto a different road.
- **Speed and revs.** A segmented rev strip with the redline in rust.
- **The map.** Heading-up and redrawn at 15 Hz: the site photo under the road vectors, zooming out
  with speed (to Jet speeds, so the rim stays about 12 s of travel ahead) and with height. An "N"
  rides the rim to show where north is, since the map turns with you.

The palette is black picón, lime-wash white, Manrique's shutter green and Timanfaya rust.

### Flying HUD (`src/game/flight-hud.ts`)

On wings, a 2D canvas over the view draws a fighter's HUD in phosphor green, each line on a dark
halo so it reads against a white sky. Every symbol is a world direction projected through the live
camera, so it's true in chase, bonnet and orbit views alike. **U** toggles it; the Jet starts with it
off (and goes back to off whenever you swap into it), the Buggy with it on:

- **Flight path marker**: the velocity's direction, so where the plane is going, not where its nose points.
- **Pitch ladder**: rungs every 5° within 22° of the flight path, built from the real horizon along
  the travel heading. They bank as the view banks. Solid above the horizon, dashed below, tips
  pointing at the horizon.
- **Heading tape** along the bottom, with the heading boxed; **G** and **α** to the left.
  `main.ts` takes the g from the change in velocity over each frame's physics steps, along the body's up axis, smoothed over 0.1 s.
- **PULL UP**, flashing, when the straight line the plane is flying passes under the ground
  within 5 s (`secondsToGround`, sampled every 0.25 s, so it sees ridges ahead as well as the
  ground below), at a speed or sink rate that `main.ts` would call a crash rather than a landing.

## Instant replay (`src/game/replay.ts`)

I plays back the last 30 s. The replay keeps **poses, not inputs**: 30 times a second of drive
time, `main.ts` pushes the car's position, orientation and velocity, the few numbers its model
animates (steer, wings, lift, airbrake, control surfaces, each wheel's strut, spin, contact and
slip), and what the HUD and sound read (gear, revs, airspeed, Mach, α, g, pedal, thrust, boost,
braking). It also notes whether the jet was showing, so a crash replays with its explosion. A pose is
a couple of hundred bytes, so the 900 of them come to a few hundred KB.

Playback runs no physics. `ReplayBuffer.at(t)` blends the two poses either side of `t` (positions
and numbers lerped, the orientation nlerped, on/off values taken from the nearer pose), and
`applyPose` lays the result over the live `CarState` so the model, camera, HUD and sound draw it
exactly as they draw the live car. Replaying inputs would have been smaller, but the physics changes
almost every commit and the floating point isn't bit-identical across browsers, so a recorded drive
would drift off the line that was driven.

While it plays, the live drive holds still: no physics steps, no recording, the crash timer frozen.
When it ends (I again, the end of the buffer, the menu, a reset or a new place) the physics carries
on from where it stopped. `place()` marks a **cut**, so a reset or a respawn after a crash jumps
instead of sliding the car across the island. A change of vehicle clears the buffer, since the old
poses would be drawn in the new body.
