# Changelog

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
