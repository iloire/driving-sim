# Changelog

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
