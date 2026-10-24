# Architecture

How it stays fast (merging, instancing, level of detail, streaming, offline work): [performance.md](performance.md).

```
src/sim/    pure TypeScript, no three.js, no DOM — unit-tested
  car.ts      the car: rigid body, struts, tyres, engine, gearbox
  wings.ts    the 4×4's plane half and the Jet: lift, drag, stability, control surfaces, jet, fly-by-wire
  thrusters.ts  the Roadster's hover: lift on its exhaust, height hold, attitude assists
  roads.ts    road model: profiles, carving, nearest-road index
  buildings.ts  building footprints as obstacles: point-in-polygon, way out, per-tile index
  objects.ts  per-tile objects file, building heights, lamp and edge-post placement
  terrain.ts  Heightmap with 5 m detail tiles (shared with paragliding-sim)
  sun.ts      sun position and daylight hours (shared with paragliding-sim)
src/game/   three.js scene, input, HUD, audio — the rendering layer
public/sites/lanzarote/   site.json + generated terrain and road data
scripts/fetch-terrain.ts  IGN + OSM download → height.bin, ortho.jpg, roads.json, carved detail tiles
```

The terrain pipeline, `Heightmap`, the LOD terrain view and the sky come from
[paragliding-sim](https://github.com/iloire/paragliding-sim). The differences are listed under each
section below.

## Frames

Site frame: **x east, y north, z up**, metres, origin at the bbox's south-west corner (UTM 28N).
three.js: `X = x − e/2, Y = z, Z = e/2 − y`, so the site is centred on the origin.
Car body frame: **X forward, Y left, Z up**, origin at the centre of mass. A heading is a compass
bearing in radians (0 = north, clockwise).

## Car (`src/sim/car.ts`)

One rigid body, integrated at 480 Hz (4
sub-steps of each 120 Hz game step). Newton handles the centre of mass and Euler's equations the
rotation.

The car is `TRUCK`, an armoured 4×4 pickup: 1850 kg, its centre of mass 0.8 m up, a 2.9 m
wheelbase and 1.86 m track, 0.5 m radius tyres on 45 cm struts with 30 cm of travel, and 50/50
four-wheel drive. Its `allTerrain` of 0.45 wins back that share of the grip a loose surface takes
away (picón 0.62 → 0.79, gravel 0.72 → 0.85) and halves the extra rolling drag. The model draws
the shell on a 22 cm lift kit above where the physics puts it, so the wheels and solid axles show.

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
  along the wall is capped like the ground friction.

`src/sim/car.test.ts` pins the envelope: 0–100 km/h in 5–9 s, a top speed of 200–260 km/h,
100–0 km/h in 35–50 m, under ~1.1 g steady cornering, holding on a 10 % grade, the handbrake
kicking the tail out, keeping more grip on picón than plain tyres would, surviving an upside-down landing, stopping against a wall, and noticing the sea.

## The vehicles

`ROADSTER` (the default), `TRUCK` and `JET` share everything above. They differ in their numbers, and in
how `flying` flies: `CarSpec.wings` unfolds into a plane, and `CarSpec.thrusters` hovers. Each has
its own model (`roadster-model.ts`, `car-model.ts`, `jet-model.ts`), and Settings → Vehicle (or
`?car=4x4`, `?car=jet`) swaps them where the car stands. The Jet is placed 600 m up at 230 m/s
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

## Balloon game (`src/sim/balloons.ts`, `src/game/balloons-view.ts`)

- **Off by default.** B (a BALLOONS button on phones, or the settings panel) turns it on with a
  fresh sky around the car, keeping the score, and turns it off again. While it's off, nothing is
  drawn, scored or dotted on the map.
- **The field.** `BalloonField` keeps 40 balloons in a ring 300–2,500 m around the car, their centres
  40–400 m above the ground, and only over the map. A balloon left more than 3.5 km behind is moved
  on, and every popped one is replaced at once, so there is always something to chase. A new place
  (M, N) gets a fresh sky. The score carries on until "New balloon round".
- **Hits.** Each frame tests the segment the car moved along, not just where it ended up, against
  every balloon (radius 5 m, plus 4 m for the car's reach). A 600 km/h pass covers several metres a
  frame and still can't step over one. Checking only the end of the step fails the test that pins it.
- **Score.** 100 a balloon, plus 10 for every 36 km/h, times the combo. The combo goes up by one
  with each pop that comes within 4 s of the last, to ×5, and drops back to nothing after 4 s
  without one. The best score lives in `localStorage` (`lanzarote-drive.best`) and degrades quietly
  when storage is blocked.
- **Drawing.** All balloons are instances of one glossy mesh (envelope and knot), each with its own
  colour and a slow bob and sway, plus an instanced mesh for the strings. A pop throws 70 flakes
  from a pooled, instanced mesh of 900 confetti pieces, with a faint 0.2 s puff, a snap-and-squeak
  sound pitched up with the combo, and a rising "+points ×combo". The map dots balloons in their
  colours, pinning those out of range to its rim.

## Flight (`src/sim/wings.ts`)

The car stays the same rigid body when it transforms. `flying` sends `wings` (0..1) towards fully
out at 1.1 per second. While they're out, `aero()` adds its force and torque in the same sub-step
as the struts and tyres, scaled by how far out they are, and the wheel drive switches off
(Space still locks the rear wheels). The extra inertia of the wings is added in proportion.

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
  lights it. The keys also work the stick differently on wings (`Input.plane`): out at 1.2 a
  second, back at 4, squared on the way out (`shapeStick`). A 0.15 s tap is under 5 % stick, so under
  1.4 g in the Jet, and a second's hold is full. `src/game/input.test.ts` pins that curve.

With the truck's heavier mass its wings are bigger (15 m², 9.4 m span) and its jet stronger
(13,000 N). It rotates at about 210 km/h after a 9 s run and climbs at about 11° on full thrust. Hands-off
at cruise it climbs gently through a slow, well-damped phugoid. Banking turns it, and slowing past
the stall drops it. `src/sim/wings.test.ts` pins all of that, plus folding the wings in the air
(it falls). Making the airframe unstable (a negative pitch stiffness) fails the take-off and
hands-off tests.

### The Jet

`JET` is the same rigid body on the same wheels, with a fighter's `WingSpec`: 9 t, 28 m² of
cropped delta (CL = 0.05 + 3.6α, stall at 24°), drag 0.022 + 0.12 CL² (the body's own `cdA` is
only 0.1 m², since the wing's 0.022 already counts the airframe), 52 kN dry and 45 kN more on
the afterburner. Two additions make it a fighter rather than a fast light plane:

- **Fly-by-wire** (`WingSpec.fbw`, `flyByWire()`). The bare surfaces get stronger with V², so at
  300 m/s the stick would be some 36× as sharp as at 50. Instead the stick asks for a load factor
  (1 g hands-off, 9 g full pull, −3 g full push) and a roll rate (4.5 rad/s at full stick). The
  computer flies that load factor as the angle of attack that gives it, capped at 22° (under the
  stall), and sets each surface to what holds the target steady plus a correction for the error. The
  pitch-rate target is capped at the g the wing can reach, so a slow pull doesn't overshoot the cap.
  Deflections clamp at full travel, so below about 150 m/s it runs out of authority as the bare wing would.
  The rudder's travel shrinks with (120 / V)².
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

- **The air** (`atmosphere()`): the International Standard Atmosphere by height above the sea.
  The temperature falls 6.5 °C a kilometre to −56.5 °C at 11 km, the density follows (0.36 kg/m³ at
  11 km, 0.09 at 20 km), and the speed of sound falls from 340 to 295 m/s. Lift, drag, the flight
  computer and the body's own drag all use the local density, and Mach (`CarState.mach`, shown on the
  HUD and driving the boom and the vapour cone) uses the local speed of sound. Jet thrust and the
  afterburner fall with the density to the 0.7 power up to 11 km, and in step with it above
  (`thrustLapse()`). So up high the Jet is faster (past Mach 1.5 at 11 km on the afterburner) and
  has a ceiling near 18 km, where the afterburner can no longer make up the drag of holding it up.

Low down (the tests fly at 500 m) it cruises at about 920 km/h, does Mach 0.94 dry, and on the afterburner passes Mach 1 about 18 s
from cruise and tops out at Mach 1.2 (about 1,470 km/h). It pulls 9 g above about 180 m/s and mushes downwards below about 60 m/s.
Crossing Mach 1 plays a sonic boom (`CarAudio.boom`, the N-wave's two cracks 0.11 s apart) and says
so; it re-arms below Mach 0.97. The model wraps a vapour cone round the fuselage between about
Mach 0.95 and 1.03, thickest at 0.99 and flickering as the shock moves. `src/sim/jet.test.ts`
pins those, as well as an equal roll rate at 250 and 300 m/s, no stall even at full pull at 80 m/s, the airbrake,
the standard atmosphere's values, the speed at 11 km and the ceiling (by energy height, since the
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
  stall in the 4×4.
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
ever with a hint of grey, and holding 9 g blacks out after about 8 s. Blacked out (G-LOC), the
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
  `height` or `building:levels` when tagged, capped at two 3.2 m storeys as the island's planning
  rules have it (churches get 11 m for their towers). Otherwise it is one or two storeys, picked
  from the OSM id so it never changes, with bigger footprints likelier to be taller. Each building is
  filed under the tile holding its centroid in `objects/<col>_<row>.json`.
- **Furniture**, placed offline from the roads and buildings. A road with a building within 30 m
  is in town and gets street lamps every 28 m, alternating sides, 1.4 m past the kerb, with their
  arms over the road. Main roads in the open get edge posts (*hitos*) every 50 m on both sides,
  1 m past the edge. Nothing is placed inside a building or on another road's carriageway.
- **Drawing.** Walls sit on the lowest ground under the footprint and rise the building's height
  above it (at least 2.6 m clear on the high side), so a slope doesn't add a storey. Only the real
  storeys get windows; where the ground falls away below them the wall is plain. The walls are
  always lime white, with a canvas texture of one window bay per storey in one of four styles
  (shuttered, small square, arched, a narrow pair) and three woodwork colours. Each house is varied
  from a seed of where it stands: most have a low parapet round the flat roof, some two-storey
  houses have the upper floor over only one end with a terrace over the rest, and roofs carry the
  island's capped white chimney or a small stair room. A tile's buildings merge into thirteen
  meshes (twelve wall textures and the white roofs and roof furniture), and its
  lamps and posts are instanced, so a town costs a handful of draw calls. A tile is dressed once
  it is within 4.5 km (about 20 ms for Arrecife's busiest tile) and freed with its heights.
- **Collisions.** `BuildingIndex` buckets the loaded tiles' footprints in a 25 m grid, and
  `env.wall` asks it for the way out. Each building's roofline (`roofline`, the same one the
  renderer draws) is set once its tile's ground loads, and above it there is no wall, so a car
  flying over a roof isn't shoved sideways. Roofs aren't solid to land on, and lamps and posts
  aren't solid.

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

The page opens on a menu laid over the live scene. You pick a place (← → or the Places tab), a vehicle and
a named time of day (`timesOfDay` clamps Dawn…Sunset to the day's daylight), then Drive. Under it the
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
  with speed (to Jet speeds, so the rim stays about 12 s of travel ahead) and with height.

The palette is black picón, lime-wash white, Manrique's shutter green and Timanfaya rust.

### Flying HUD (`src/game/flight-hud.ts`)

On wings, a 2D canvas over the view draws a fighter's HUD in phosphor green, each line on a dark
halo so it reads against a white sky. Every symbol is a world direction projected through the live
camera, so it's true in chase, bonnet and orbit views alike:

- **Flight path marker**: the velocity's direction, so where the plane is going, not where its nose points.
- **Pitch ladder**: rungs every 5° within 22° of the flight path, built from the real horizon along
  the travel heading. They bank as the view banks. Solid above the horizon, dashed below, tips
  pointing at the horizon.
- **Heading tape** along the bottom, with the heading boxed; **G** and **α** to the left.
  `main.ts` takes the g from the change in velocity over each frame's physics steps, along the body's up axis, smoothed over 0.1 s.
- **PULL UP**, flashing, when the straight line the plane is flying passes under the ground
  within 5 s (`secondsToGround`, sampled every 0.25 s, so it sees ridges ahead as well as the
  ground below), at a speed or sink rate that `main.ts` would call a crash rather than a landing.
