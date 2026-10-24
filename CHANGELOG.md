# Changelog

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
