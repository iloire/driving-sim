# Changelog

## 2026-10-25 08:25

- Peaks have their names over them. Benasque labels its 10 highest mountains (Aneto, Posets, Maladeta,
  Perdiguero …, one label per mountain, not one per needle), Tenerife labels Teide. **L** turns them
  off and on. Which places a zone labels is a `places` block in its `site.json` (OSM selectors, how
  many, how far apart), so another zone can label its own without code.

## 2026-10-25 08:14

- The Jet starts with the green flight HUD off, for a clean view; **U** still brings it up. Swapping
  into the Jet turns it off again, the 4×4 on wings keeps it on. A shared link from the Jet says
  `hud=1` when the HUD was showing.

## 2026-10-25 08:05

- Buildings take their zone's heights and colours: `site.json` has a `buildings` block (`maxStoreys`,
  `storeys` odds for untagged buildings, `walls` and `roofs` palettes). Lanzarote stays two storeys
  and near-white; Tenerife gets ochre, cream, terracotta and up to 10 storeys, Zaragoza brick, sand
  and grey blocks up to 14, Benasque stone and slate up to 4. Untagged blocks of flats and big
  footprints roll taller, houses and anything out on its own stop at two, warehouses at one. The
  colours are vertex colours over a white wall texture, so no new draw calls; objects/ regenerated.

## 2026-10-25 08:00

- W/S are smooth too: W A S D are now one fine stick, out at 2 a second on a square and never past
  40 %, however long they're held. Held S at cruise pulls at most about 4.3 g. The arrows are the
  hard stick for the whole jet: ↓ pulls 9 g and levels a 60° dive at 800 km/h in under 500 m.

## 2026-10-25 07:46

- A/D roll gently the whole time and the arrows roll hard. A/D now only ever give 40 % of the
  stick, 40°/s on the Jet, so a one-second hold banks about 25° and two seconds about 65°. ← / →
  still go to the full 100°/s in an eighth of a second, about 40° of bank in half a second.

## 2026-10-25 07:40

- The Jet rolls at 100°/s at full stick, down from 258°/s. With the quicker key, A/D whipped it
  past 90° in under a second. Now a tap moves the wings a degree, half a second's hold banks about
  13° and a one-second hold about 60°, and the roll still starts the moment the key goes down.

## 2026-10-25 07:38

- Instant replay. Press I to watch the last 30 seconds again, crashes and all. C changes the camera
  and P pauses it. The end of the replay, or I again, puts you back where you were. It keeps 30
  poses a second in memory (position, orientation, and what the wheels, wings, engine and HUD were
  doing) and draws between them. It runs no physics and records no inputs, so physics changes
  can't knock it off the line you drove. A reset or a respawn is a cut, not a slide across the map.
  On a phone it's the REPLAY button.

## 2026-10-24 23:20

- On the jet the arrow keys are now a hard stick and W A S D the fine one. W A S D keep the
  gentle curves (pitch cubed, full in 0.67 s; roll squared, full in 0.5 s) for small corrections,
  while the arrows go straight out, linear, full in an eighth of a second, to snap into a turn or
  a pull. In the car and on thrusters the arrows still work as W A S D.
- The H card and the menu's Controls list say so: on wings and in the Jet a row of arrow keys reads
  "Same, hard stick", and the menu adds that W A S D move the stick finely.

## 2026-10-24 22:59

- No more accidental text selection on phones. A held thumb on the HUD, a button or the menu
  used to start selecting text and pop up the copy/look-up callout; the page now turns
  selection and the iOS callout off, leaving input fields selectable.

||||||| parent of 95c5f68 (feat: instant replay on I - the last 30 s play back from memory, crashes included; it keeps 30 poses a second (position, orientation, wheels, wings, engine, HUD numbers) and draws between them with no physics, so a physics change can't knock it off the line that was driven; the live drive holds still under it and carries on after; a reset or respawn is a cut, a vehicle swap clears it; C changes the camera, P pauses, REPLAY button on touch)
## 2026-10-24 16:24

- The Jet pulls out of dives. Pitch now asks the fly-by-wire for how fast the flight path turns
  (20°/s at full stick) instead of for a load, kept under 9 g. At speed a full pull is the 9 g
  limit, and slower the same pull can't whip the nose round. With that, the keys can work the
  stick faster again: full in 0.67 s instead of 1.7 s, on the same cubic curve, so a tap is still
  a fine correction. From a 60° dive at 800 km/h a held S now levels out in about 500 m instead of
  630. A 0.4 s press at cruise moves the nose about 2° and it stays there.

## 2026-10-24 16:23

- Three new zones next to Lanzarote: **Tenerife** (Teide, Masca, La Orotava, the south airport),
  **Zaragoza** (the city, the Ebro, a takeoff from the air base's runway 12L) and **Benasque** (the
  Pyrenees: Aneto, Posets, the A-139 to Llanos del Hospital). The welcome screen has a Zone row,
  and `?site=` links to one. A link without it opens Lanzarote, as before.
- Sharing a moment now writes the zone into the link (`?site=`), so it opens where it was taken.
- Each zone's `site.json` sets how tall its buildings get (`maxStoreys`: Zaragoza 14, Tenerife 10,
  Benasque 4, Lanzarote still 2) and, inland, the farmland around it (`plainM`) instead of sea.
- The title, loading screen and welcome screen name the zone instead of Lanzarote.
- `fetch-terrain` asks IGN for uncompressed replies: its WMS failed one Maladeta photo with a steady
  500 when asked to compress it. A missing site file now says which one instead of a JSON error.

## 2026-10-24 15:54

- A shared moment now carries the view too: the camera (chase, bonnet or orbit), the flight HUD and
  the map on or off, the balloon game and the drivetrain. Whoever opens the link sees it the way you
  had it. Only settings changed from the defaults go into the link (`cam`, `hud=0`, `map=0`,
  `balloons=1`, `drive`).

## 2026-10-24 15:45

- Roll starts as soon as you press A/D. The gentler key stick slowed roll down along with pitch:
  half a second in, it was only 3 % stick. Roll asks the fly-by-wire for a roll rate, which can't
  overshoot, so it now goes out at 2 a second on a square curve, a quarter stick (about 65°/s) at
  0.25 s and full at 0.5 s. Pitch keeps its slow, gentle curve.

## 2026-10-24 15:45

- The Jet's gear only comes down when it is slow (under 400 km/h) and low (under 150 m over the
  ground or sea), or when a wheel is on the ground. It used to hang out at any height once slow.

## 2026-10-24 15:41

- U shows or hides the green flight HUD, for a clean view of the plane and the ground. The
  controls card lists it on wings and in the Jet.

## 2026-10-24 15:38

- The Jet's nose comes to a point. From above it used to be a square chisel the full 1.7 m width
  of the fuselage, a bright slab across the cockpit view. Ahead of the cockpit it now narrows
  in a smooth curve to the tip.

## 2026-10-24 15:34

- The Jet's control surfaces move. The tailplanes tilt together when you pull or push and against
  each other when you roll, ailerons on the wing's trailing edge roll, and a rudder on each fin
  swings with Q/E. They follow what the fly-by-wire gives the wing, not the raw keys, so the rudder
  goes out less at speed. It only rotates a few extra small meshes, so it costs nothing to draw.

## 2026-10-24 15:34

- The Jet's bonnet view is now the pilot's eye, high in the canopy, so the nose drops away about
  12° below the line of flight. The camera used to sit just above the nose, and the fuselage
  filled the bottom half of the screen.

## 2026-10-24 15:25

- On wings the keys work the stick more gently, because a held key was too much and hard to
  control. The stick goes out half as fast (0.6 a second) on a cubic curve instead of a square,
  so a short press is a fine correction, a one-second hold is about a fifth of the stick and full
  stick takes about 1.7 s. Letting go still snaps it back.

## 2026-10-24 15:23

- The Jet is properly faster up high. The engine had been losing thrust to the thin air as if it
  were standing still. Now its intake rams the air in at speed, so on the afterburner it does about
  2,250 km/h (Mach 2) from 8 km up against about 1,480 km/h (Mach 1.2) low down, where nothing has
  changed. Dry it still stays near Mach 1. Tests pin the speed at both heights and that a held dive
  runs well past level flight.

## 2026-10-24 15:20

- A better crash. Fly the Jet into the ground or a building and it explodes: a white flash, a
  fireball, burning debris that bounces off the ground, a column of smoke and an orange glow on
  the terrain, with a deep blast and the crackle of the fire. The camera backs off and shakes, and
  after 1.8 s you're back in the air.

## 2026-10-24 15:14

- Cockpit warnings, all synthesised. PULL UP now sounds as well as flashes: two rising whoops,
  then a voice says "Pull up". A stall horn beeps at the wing's angle-of-attack limit. As the g
  builds towards a blackout, you hear the pilot straining, the breaths quicker and harder the
  closer it gets. They play in the pilot's headset, so the grey-out doesn't muffle them.

## 2026-10-24 15:11

- The Jet's speed and height show. Above about 8 km it lays a contrail that lingers and spreads
  for 25 s behind it. Hard pulls stream vapour off both wingtips. Fast and below 50 m it throws up
  dust over land and spray over the sea, and the camera shakes as it skims the ground and as it
  goes through the sound barrier. The chase camera no longer falls far behind near Mach 1, so the
  Jet stays a size you can see.

## 2026-10-24 15:12

- English and Spanish. The browser's language picks one on a first visit; EN / ES at the end of
  the menu's tab bar (or Settings → Language) switches everything on screen at once and is
  remembered. The menu, the controls, the messages, the road plate and the settings are
  translated; the flight HUD's AB, BRAKE, PULL UP and g stay English, as in a real cockpit. The
  words live in `src/game/i18n.ts`: the compiler refuses a Spanish dictionary missing a key, and a
  test checks both say the same placeholders and that no control label is too long to fit.

## 2026-10-24 15:05

- The controls card shows only the keys for what you're in: Driving, Hovering, On wings or Jet,
  six or seven short rows, with the keys drawn as bright keycaps and the keys that work anywhere
  (R B C G V P M) on one line under them. It opens for 6 s whenever the keys change meaning
  (taking off, landing, a new vehicle), folds after 4 s on the move, and starts folded for a
  returning player; H overrides it either way. The gamepad line shows only with a pad plugged in.
  The menu's Controls tab lists every mode with the longer notes. One source for both:
  `src/game/controls.ts`.

## 2026-10-24 15:02

- The airbrake sounds. A heavy hydraulic clunk as it goes out and a lighter one as it stows, and
  while it's out a low rumble fluttering at about 11 Hz that grows with the square of the airspeed.

## 2026-10-24 14:59

- The air thins with height (the International Standard Atmosphere). Up high there's less drag
  and less thrust, and the sound barrier comes sooner, since the speed of sound falls from 340 to
  295 m/s by 11 km. The Jet is faster up there, past Mach 1.5 at 11 km on the afterburner, and it
  has a ceiling near 18 km. The HUD's Mach, the boom and the vapour cone all use the local speed of
  sound. The haze thins as you climb, so from high up the whole island stands out against the sea.

## 2026-10-24 15:58

- The minimap keeps zooming out at Jet speeds. The speed zoom used to stop at 160 km/h, so at
  900 km/h low down the rim was barely 3 s away; it now keeps widening to Mach 1.3, holding the rim
  about 12 s of travel ahead. Road driving zooms exactly as before.

## 2026-10-24 14:52

- The Jet's airbrake shows. A panel on the spine behind the canopy swings up over half a second
  and shudders in the airflow; the flying HUD shows an amber AIRBRAKE box with a bar for how far it
  is out, flashing while it moves; and the chase and bonnet cameras buffet harder the faster you go.
  The drag now builds and fades with the panel instead of switching on at once.

## 2026-10-24 14:44

- G-effects. The pilot's body lags the load: a quick 9 g snap is fine, and 6 g can be held for
  ever. Hold 9 g and over about 8 s the colour drains, a tunnel closes in from the edges and the
  sound goes dull, until the pilot blacks out. Blacked out, the hands come off the stick for at
  least 3 s and the flight computer levels to 1 g. Sustained negative g floods the view red from
  the edges instead.

## 2026-10-24 14:42

- The Jet goes supersonic. Wave drag now builds to a hump just past Mach 1 and eases off beyond it,
  where before it climbed forever and held the Jet at Mach 0.93. Dry it stops just under the
  barrier. On the afterburner (now 45 kN) it pushes through in about 18 s from cruise and runs on to
  Mach 1.2, about 1,470 km/h. A vapour cone wraps the fuselage around Mach 1, and crossing it
  plays a double-crack sonic boom. The body's drag was being counted twice on top of the wing's,
  and is now smaller; cruise moves from about 830 to 920 km/h.

## 2026-10-24 14:32

- A fighter HUD on wings. A flight path marker shows where the plane is actually going, and a pitch
  ladder fixed to the real horizon banks with the view. A heading tape runs along the bottom, with G and angle of
  attack beside the marker. PULL UP flashes when the line you're flying meets the ground, or a
  ridge ahead, within 5 s at a speed that would crash. It reads the same in the chase, bonnet and orbit
  views, with each line on a dark halo against the bright sky.

## 2026-10-24 14:24

- Flying on the keyboard is finer now. On wings, the keys move the stick gently at first and harder
  the longer they're held, so a tap is a nudge (under 1.4 g in the Jet) and a one-second hold is
  full stick (9 g). Let go and it snaps back to centre. The jet has a throttle lever: Shift opens it
  and Ctrl closes it, and 1–4 jump to idle, cruise, 80 % and full. Holding Shift at full lights the
  afterburner. The Jet gets an airbrake on Space, which sheds about three times the speed of a
  clean idle glide. The HUD shows the throttle (or AB) and BRAKE next to the height.

## 2026-10-24 14:16

- The Jet holds still in the chase view now; the last fix only helped on perfectly even frames. The
  chase camera eased its position after the plane, which left it trailing by ~21 m. The size of that
  lag changed with each frame's length, so every frame hitch (a terrain tile loading, a busy browser)
  pulled the camera a metre or more toward the plane and let it drift back. Now the camera moves with
  the car exactly and eases only its offset. The speed lag comes from the velocity, so the framing
  stays the same. In a test with frames between 17 and 217 ms, the distance to the plane held to 2 cm.

## 2026-10-24 14:08

- The Jet no longer shakes in front of the chase camera. A frame runs one, two or three 120 Hz
  physics steps, and the car was drawn at the last one, so at jet speed it jumped 2 to 6 m from frame
  to frame. The chase camera eases after the plane, so every jump showed. The car is now drawn between
  its last two steps, which cuts the on-screen shake about sixfold. The orbit camera moves with the
  plane, so it never showed this.

## 2026-10-24 13:42

- A welcome screen over the live island. The camera circles your car slowly while you pick a place
  (← → or the Places list), the Roadster, the 4×4 or the Jet, and Dawn, Morning, Midday, Afternoon or
  Sunset. Then **Drive** (or **Fly** in the Jet) sweeps the camera into the chase view. **M** or **Esc**
  brings it back, with **Resume**. It replaces the place picker. A shared link skips it and starts
  straight in the shared moment.
- The loading screen moves now. The name rises in over a slow lava glow, a road's centre line runs
  beneath it, and the status line says what is loading.

## 2026-10-23 11:31

- A Jet to fly the island fast: Settings → Vehicle or `?car=jet`. It's an original delta fighter that
  starts 600 m up at cruise and only flies. Fly-by-wire turns the stick into g and a roll rate, capped at 9 g and
  an angle of attack under the stall, so it handles the same at 300 m/s as at 100. It cruises near 820 km/h
  and reaches about 1,140 km/h on the afterburner, where the transonic drag holds it off Mach 1.
  If it crashes it goes back up into the sky over the same spot. The HUD shows its Mach number. Above 150 m/s the ground
  stops at the 10 m mesh, so it doesn't build 5 m tiles it is past in seconds.

## 2026-10-23 11:00

- The Settings panel sits at the top right, level with the controls panel. It only drops lower
  while the balloon score is showing (or on a phone, under the touch buttons).

## 2026-10-23 10:58

- A shared link opens already playing instead of on the pause panel, so whoever follows it lands
  in the drive and sees what's going on, rather than a paused screen with a Share button.

## 2026-10-23 12:40

- Google Analytics 4 on the live site, to see how people play: `start` (spawn, car, touch, or a
  shared link), `place`, `fly`, `balloons` (with the score when turned off), `car`, `share` and
  `reset`. Consent Mode starts with all storage denied; a one-line "Anonymous play stats? OK / No"
  chip in the corner asks once. The ID comes from the `GA_MEASUREMENT_ID` repo variable at build
  time, so local and dev builds load nothing.

## 2026-10-23 11:50

- Fixed flying over towns: a building's walls stopped the car at any height, so hovering over a
  roof shoved the car sideways out of the footprint, flipped it on its side and pinned it there.
  Walls now end at the roofline the game draws.

## 2026-10-23 11:40

- Removed the Playa Blanca start (`?spawn=playa-blanca`). Old links with it fall back to the
  first start, Timanfaya.

## 2026-10-23 11:30

- Share a moment: pausing now shows a panel with a **Share this moment** button. It copies a link
  (`?at=x,y,z,heading,speed`, plus `fly=1`, the time of day and the car) that opens the game
  paused in exactly that place, heading and speed.

## 2026-10-23 11:10

- Houses are one or two storeys, as on the real island: tagged heights are capped at two storeys
  (churches keep their towers), untagged ones no longer roll a third, and a house on a slope no
  longer shows an extra row of windows down its low side.
- More variety, all still white: four window styles (shuttered, small square, arched, a narrow
  pair), low parapets, upper floors over only part of some houses with a terrace beside them, the
  island's capped chimneys and small rooftop stair rooms.

## 2026-10-23 10:45

- Pausing (P, or Start on a gamepad) now pauses the sound too, and so does the spawn picker; it
  picks up where it left off when the game goes on.

## 2026-10-23 10:40

- The Roadster's motor is quieter again: a soft sine hum topping out near 260 Hz, at about
  two-thirds of the previous volume.

## 2026-10-23 10:10

- The Roadster's motor hums instead of shrieking: its note tops out around 440 Hz rather than
  1 kHz, the filter no longer opens to 3.4 kHz under full throttle, and it is a little quieter.

## 2026-10-23 10:00

- Removed the El Golfo coast road start (`?spawn=el-golfo`). Old links with it fall back to the
  first start, Timanfaya.

## 2026-10-23 08:51

- The Roadster, the new default car: an original white wedge hypercar with a glass canopy, front
  and tail light bars and a four-nozzle diffuser. It's electric, with 1,400 N·m from a standstill
  and one gear, 0–100 km/h in about 2 s and close to 390 km/h, and it whines rather than roars.
- F lights its gas thrusters: four nozzles drop out of the floor and it hovers on plumes of smoke,
  with assists that hold its height and tilt it to the stick (Space up, Ctrl down, W/S tilt, A/D
  turn, Shift tail boost). On a phone the left thumb climbs and sinks.
- The armoured 4×4 (with wings) stays under Settings → Car, or `?car=4x4`. The gear box shows D
  for the electric car.

## 2026-10-22 18:35

- The balloon game is off by default. B turns it on (a fresh sky around the car) and off again,
  listed in Controls. Phones get a BALLOONS button, and the settings toggle follows the key.

## 2026-10-22 18:22

- Balloon game: about 40 party balloons float over the island around the car. Fly through them to
  pop them into confetti, for 100 points plus a speed bonus, times a combo of up to ×5 for quick
  chains. A score panel, a best score kept in the browser, balloon dots on the map, and a pop sound.
  The settings panel toggles it and starts a new round.

## 2026-10-22 09:10

- Turbo on Shift (a stick click on a gamepad, BOOST on a phone). On the road a nitro rocket takes
  the truck past 450 km/h with twin blue jets under the bumper. In the air, an afterburner on top
  of the full jet, with a long blue-white flame. The view widens and shakes, the speed glows, and
  it roars.

## 2026-10-22 09:01

- The car is now an armoured 4×4 pickup. In matte black and gunmetal it has a ram bar, slatted
  guards over the glass, a roof light bar, flared arches and a spare in the bed. It sits on a lift
  kit over 1 m lug tyres with solid axles that tilt with the suspension. The physics changes with
  it: 1850 kg, a 520 N·m V8, 50/50 four-wheel drive, long-travel struts, and all-terrain tyres that
  keep more grip on picón and gravel. The wings and jet are sized up to lift it.

## 2026-10-22 08:53

- It flies: F unfolds wings from the roof edges, a fin and tailplane from the hatch, and a jet
  under the bumper. It's then a light plane, with lift and drag from the angle of attack, a stall,
  pitch and yaw stability, and elevator, ailerons and rudder that go soft as it slows. W/S work
  the stick, A/D roll, Q/E the rudder, Shift and Ctrl set the jet. Fold the wings in the air and
  it falls.
- Lanzarote Airport's runway is a road (carved, marked, tarmac), with a new `airport` spawn on
  runway 03.
- The HUD shows height above the ground and "In the air", and the map zooms out with altitude.

## 2026-10-22 08:31

- Towns: about 27,500 OSM buildings drawn as Lanzarote houses (lime-white walls, flat roofs,
  green, blue or brown woodwork). They are solid, and the car crashes into them.
- Street furniture placed from the roads: lamps through town, white-and-black edge posts along
  main roads in the open.
- Detail tiles load nearest first, two at a time, so the ground under the car arrives before the
  horizon. The coarse distant terrain uses half the triangles.

## 2026-10-21 16:17

- First version: a browser driving simulator over Lanzarote, built on paragliding-sim's IGN 5 m
  terrain pipeline. Detail tiles now cover all 105 land tiles and load lazily. About 13,000 OSM
  roads are carved into the DEM as graded strips and drawn with Spanish markings. The car is a
  rigid body on raycast struts, with slip-angle tyres, a friction circle, a torque curve and an
  automatic gearbox. The HUD has a road sign plate, a speed and rev cluster, and a heading-up map.
  Ten places to start, time of day, keyboard, gamepad and touch.
