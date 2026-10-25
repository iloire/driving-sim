# Starship: launch from El Jable, catch the booster

A fourth vehicle: the full Starship stack (Super Heavy + Ship) on a launch tower with chopsticks,
standing in the sand plain of **El Jable**, Lanzarote. You launch it, it stages, and you fly the
booster home to be caught by the tower's arms. Fiction on a real place: the island is the map, the
pad is ours.

## Where

- `site.json` → `launch: { lat, lon, toward }` — data, not code. Lanzarote's is southern El Jable,
  **29.042 N, 13.594 W**, 193 m up: under 8 m of relief over 800 m, the nearest track ~200 m off.
- `toward` is the launch azimuth: east, over Teguise and out over the Atlantic.
- A zone without `launch` doesn't offer Starship.

## The flight (all real-ish numbers, flat earth, constant g — fine to ~100 km)

| phase | what happens | who flies it |
|---|---|---|
| Pad | countdown from Space: T−10, engines light from T−3, released at T−0 once thrust beats weight | — |
| Ascent | 33 Raptors, ~74 MN, ~5,000 t: T/W ≈ 1.5. Throttle bucket through max-q. Gravity turn east | autopilot, stick adds to it |
| MECO + hot staging | ~T+2:40, ~65 km up, ~1.5 km/s, booster keeps ~8 % propellant. Ship lights and leaves | automatic |
| Boostback | flip, 13 engines, burn until the predicted impact is back over El Jable | autopilot or you |
| Descent | engines first, grid fins: tilting steers it (body lift) | autopilot or you |
| Landing burn | 13 → 3 engines, null the speed at the arms' height between the chopsticks | autopilot or you |
| Catch | inside the arms, under ~3 m/s, upright: **caught**. Otherwise a fireball / a splash | — |

The Ship flies itself on to orbit and fades into a star.

**Controls.** The Jet's: W A S D a gentle stick, arrows hard; Shift/Ctrl the throttle, 1–4 presets;
**Space** starts the countdown, then (booster) lights the next burn; **F** autopilot on/off; **T**
time warp ×1 / ×4 / ×10 for the coasts. The autopilot always flies the whole thing, so watching works.

## Pieces

1. ~~**`src/sim/starship.ts`** — pure, tested. Stages as point masses with an attitude axis that
   turns at a commanded rate (no gimbal dynamics: KISS). Thrust between sea level and vacuum by
   pressure, mass flow by Isp, drag and body lift from the ISA (`atmosphere()`), guidance for each
   phase. Tests: autopilot reaches MECO in the envelope above; the booster flies home and is caught;
   with the guidance off the booster misses.~~ ✅
2. ~~**Models** (`starship-model.ts`): the tower with its chopsticks (swing open before launch), the
   launch mount, Super Heavy (grid fins, hot-stage ring), Ship (flaps, tiles on the windward side).
   Plumes that grow with altitude, a pad cloud from the smoke pool.~~ ✅
3. ~~**`main.ts`**: Starship is a vehicle in the menu, but its own sim, not a `CarSpec`; while it's
   picked the frame steps the launch instead of the car. Camera: the chase rig scaled up (the
   rocket is 121 m), ground-clamped.~~ ✅
4. ~~**HUD** (`rocket-hud.ts`): the webcast strip — T± clock, speed and altitude per stage,
   propellant bars, the engine ring lit as they are. Phase callouts (MAX-Q, MECO, STAGING…).~~ ✅
5. ~~**Sky up high**: the sky darkens towards black above ~20 km.~~ ✅
6. ~~**Audio**: a deep crackling rumble with the engines lit, felt more than heard far away.~~ ✅
7. ~~**Background launches**: whatever you're flying, the autopilot launches from El Jable every few
   minutes, a fresh stack after each flight, a chip keeping the mission clock.~~ ✅

Later, if it's fun: replay, shared moments of a catch, a phone layout.
