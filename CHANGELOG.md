# Changelog

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
