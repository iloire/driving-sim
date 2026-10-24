# Performance: how the island stays fast

The whole of Lanzarote is on screen at once: 5 m terrain near the car, about 27,500 buildings,
about 40,000 lamps and edge posts, and 13,000 roads. It holds roughly 90–120 fps on an M3 Pro.

Some of that is recycling geometry: instancing, and wheels that share one mesh. Most of it is
doing less work: fewer draw calls, detail only near the camera, and the expensive work done once,
offline. The techniques are listed below, roughly in order of how much they matter.

Measured in Arrecife, the densest town (headless Chromium on Metal, 1440×860):

| What | Cost |
|---|---|
| Draw calls per frame | ~213 |
| Triangles per frame | 5.6 M (was 8 M before the coarse terrain was halved) |
| Render, CPU side | 1.3–1.5 ms a frame |
| Physics (car, tyres, walls) | ~0.1 ms a frame |
| Nearest-road lookup | ~1 µs |
| Inside-a-building check | ~0.4 µs |
| Building one tile's town | ≤ 20 ms, once, then cached |
| Worst frame (a chunk switching to the 5 m mesh) | ~100 ms |

## 1. Few draw calls: merge everything that shares a material

In WebGL the cost is usually the number of separate objects handed to the GPU each frame (draw
calls), not the polygon count.

- Each 3 km tile's buildings (up to about 3,000 in central Arrecife) are fused into one mesh per
  material with `mergeGeometries` (`src/game/dress.ts`). There are only four materials: walls with
  green, blue or brown woodwork, and roofs. A whole town is about 4 draw calls instead of 3,000.
- The road ribbons work the same way: one mesh per tile for marked roads and one for plain streets
  (`src/game/road-view.ts`).

## 2. Instancing: the actual polygon recycling

- **Lamps and posts.** One street lamp and one edge post (*hito*) are built once. Each tile draws
  them with a `THREE.InstancedMesh`: the same triangles, plus a list of positions and rotations.
  The GPU stamps out every copy in a single call per tile.
- **Wheels.** The tread geometry (40 lugs merged into the tyre) and the rim are built once and
  shared by all four wheels and the spare in the bed (`src/game/car-model.ts`).

## 3. Detail is painted, not modelled

- The windows are a 128×128 canvas texture drawn in code (lime wall, glass, frame, shutters), tiled
  every 3.2 m along each wall and storey. A house is 2 triangles per wall plus a flat roof, and
  there is no window geometry at all.
- The road markings (edge lines, dashed centre line) are another small generated texture,
  repeating every 12 m.
- The fine grain and bump on the ground near the camera are computed per pixel in the terrain
  shader, not stored.

## 4. Level of detail: fine terrain only near the camera

The island is a grid of 3 km chunks (`src/game/terrain-view.ts`), and each is drawn at one of
three levels:

| Distance from camera | Mesh | Photo | Dressing |
|---|---|---|---|
| Beyond 4.5 km | coarse, 64² (~47 m between points) | the island-wide photo | none |
| 1.5–4.5 km | 10 m (300²) | the tile's own sharper photo | buildings, lamps, posts |
| Within 1.5 km | full 5 m (600²) | the tile's own sharper photo | plus road ribbons |

- **Hysteresis.** A chunk only drops a level once the camera is 20 % past the threshold, so it
  doesn't flicker back and forth at the boundary.
- **One rebuild per frame, nearest first.** That spreads the cost of switching levels over frames.
- **Skirts.** Chunk edges hang 80 m skirts down, so the seams between different levels never
  show sky.
- **Frustum culling.** Three.js skips any mesh outside the camera's view.

Most of the 5.6 M triangles are terrain, not buildings.

## 5. Streaming: load near, free far

The whole island at full detail is about 140 MB, so it is never all in memory (`src/game/site.ts`).

- A tile's photo, 5 m heights and objects (buildings, lamps, posts) load only when the camera comes
  within 4.5 km. It's **two downloads at a time, nearest first**, so the ground under the car never
  waits behind tiles on the horizon.
- When a tile drops back to the coarse mesh, its textures, meshes, heights and collision data are
  all freed. The browser cache makes reloading it cheap.
- The physics separately keeps the 5 m ground loaded within 400 m of the car (`ensureDetail`),
  whatever the camera is doing. A tile's dressing is cached until the tile is freed.

## 6. Heavy work done offline

`scripts/fetch-terrain.ts` does the expensive geometry once, at build time, not in the browser:

- carving 13,000 roads into the 5 m terrain as graded strips;
- deciding every building's height from its OSM tags (or a stable pick by OSM id);
- placing all 27,000 lamps and 13,600 edge posts, each checked against every building and every
  other road's carriageway.

The browser downloads the results: carved height tiles and one small `objects/<col>_<row>.json` per
tile (3.9 MB for the whole island).

## 7. Cheap questions for the physics: spatial grids

Each physics step asks "what surface is this tyre on?" 16 times (4 wheels × 4 sub-steps), and "is
this corner inside a building?" 32 times (8 points × 4 sub-steps), at 120 steps a second.

- `RoadIndex` buckets road segments in a 100 m grid, and `BuildingIndex` buckets footprints in a
  25 m grid (`src/sim/roads.ts`, `src/sim/buildings.ts`). A question only checks the few items in
  nearby cells.
- That's about 1 µs per road lookup and 0.4 µs per building check, so the whole physics step is
  about 0.1 ms a frame.

## 8. Smaller savings

- **Shadows** come from an 80 m box that follows the car, not from the whole island.
- **Physics runs at a fixed 120 Hz**, independently of the frame rate (with 4 sub-steps inside),
  so a slow frame doesn't change how the car handles. A frame runs one, two or three steps, so the car
  is drawn between the last two of them (`lerpV3` and `blendQuat` in `sim/vec.ts`). Drawn at the
  latest step only, the Jet jumped 2 to 6 m a frame and shook in front of the chase camera.
- **The chase camera moves with the car and eases only its offset** (`camera.ts`). Easing its
  position instead left it trailing a fast car by a lag that changed with each frame's length:
  one 51 ms hitch put it 1.4 m closer to the Jet, so the plane pulsed with every uneven frame.
  The lag is now the car's velocity over the chase rate, the same framing without the frame time in it.
- **The minimap** is redrawn 15 times a second, not every frame.
- **Lamps and posts aren't solid**, which saves about 40,000 extra collision checks.

## Where it still isn't efficient

- **Terrain mesh rebuilds.** Switching a chunk to the 5 m mesh builds about 720,000 triangles on
  the main thread at once, which can cause a single stutter of up to 100 ms. The fix would be to
  build the mesh in a Web Worker and hand it over.
- **Triangle count.** 5.6 M triangles a frame is a lot, and it's mostly terrain. Smoother
  distance-based detail (for example, stitching neighbouring levels, or detail that adapts to how
  rough the ground is) would cut it a lot.
- **Plain houses.** Buildings are simple extruded boxes. Pitched roofs, balconies or parapets
  would multiply their triangles and would need the same merging and instancing tricks to stay
  fast.

## How these numbers were measured

Dev builds expose `window.drive.perf` (physics, terrain and render milliseconds, frame count,
worst frame) and `window.drive.renderer` (draw calls and triangles from `renderer.info`). The
numbers above came from a headless Chromium on the real GPU (`--use-angle=metal`), driving
scripted routes through Arrecife.
