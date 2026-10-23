# Multiplayer plan: a shared island

Status: proposal, 2026-10-23. Nothing is built yet.

## Goal

People open the page and see each other: cars driving the roads, 4×4s and Roadsters in the air, Jets
passing overhead, each with a name tag. That's all. There are no collisions between players, no
shared scores and no races. Those are a later step (see *Not now*).

## How it works

Each player keeps running their own physics exactly as today (`stepCar` at 120 Hz in `main.ts`).
About 10 times a second each client sends a small **snapshot** of its own vehicle to a relay. The
relay forwards the other players' snapshots to everyone. Each client draws the other players as
**remote vehicles**, interpolated about 150 ms behind real time so they move smoothly between
snapshots.

Nobody's physics depends on anyone else's, so lag can't make a car jump or wreck. A cheating client
can only lie about where its own car is.

### Snapshot

| Field | Why |
|---|---|
| `id`, `name`, `vehicle` (`roadster` / `4x4` / `jet`) | who, and which model to draw |
| `t` | sender time, for interpolation |
| `pos`, `q`, `vel` | where, which way it faces, and enough to extrapolate briefly |
| `steer`, `wings`, `thrust`, `boost`, `braking` | what `CarModel.update` needs to animate wheels, wings, thrusters, afterburner and brake lights |

That's roughly 60 bytes as binary (Float32), or about 200 as JSON. JSON is fine to start with.

## The one real decision: what relays the messages

Vercel serves the static page but can't hold WebSockets open, so the relay lives somewhere else.

| Option | Good | Bad |
|---|---|---|
| **Supabase Realtime** (broadcast + presence) | in your stack already, no server code, presence (who's online) built in | billed **per delivered message**: N players at 10 Hz is N×(N−1)×10 messages a second. Twenty players for an hour is about 13.7 M messages, against the 5 M a month Pro includes (check current pricing). Gets expensive as soon as it's popular. |
| **A small relay on Cloudflare Durable Objects** (PartyServer) ✅ | one Durable Object per room collects every snapshot and sends **one batched message per tick** to each player, so cost grows with N rather than N². It's also where a referee would go later. | about 100 lines of server code to write, deploy and test; another account |

**Recommendation: the Cloudflare relay.** The batching is what keeps a busy island cheap, and the same
object can later check scores. Supabase is fine for a weekend prototype if you'd rather not run a
server at all.

## Steps

1. **`src/net/` (pure, unit-tested):** encode and decode snapshots, plus an interpolation buffer that
   takes snapshots and returns the pose at `now − 150 ms`: lerp the position, slerp `q`, drop
   out-of-order snapshots, extrapolate up to 250 ms on `vel`, and forget a player after 5 s of
   silence. Vitest covers the edge cases: out-of-order, a gap, a dropped player, `q` sign flips.
2. **Relay (`relay/`):** one room per Durable Object, at most 32 players a room, overflow goes to a
   new room. It validates and clamps snapshots (finite numbers, inside the site bounds, at most
   20 Hz per client) and batches the broadcast at 10 Hz. Tests run on Miniflare.
3. **Remote vehicles (`src/game/remotes.ts`):** reuse `VEHICLES[...].model` for each remote player.
   `CarModel.update` takes a `CarState`, so build one from the interpolated pose, with the wheels
   from `createCar` at rest (remote suspension doesn't need to be exact). Name tags are sprites that
   fade with distance. Remote vehicles don't make sound at first.
4. **Joining:** connect by default and show the count of players online in the HUD. A name picker
   lives in Settings and is kept in `localStorage` (a random "Driver 123" until the player sets one),
   with a basic length and character filter. `?room=` sends a private room link, next to `?at=`.
   Going offline costs nothing: with no relay reachable, the game runs exactly as today.
5. **Config:** `VITE_RELAY_URL` read through a validated env module, never straight from
   `import.meta.env`. CI builds without it, and the client then stays single-player.
6. **CI:** add the relay's tests to the workflow. After the deploy, smoke-test that the relay accepts a
   connection and echoes one batch.
7. **Docs:** a *Multiplayer* section in `architecture.md`, the README and the changelog.

Prerequisite (separate change): move hosting to Vercel and make the repo private, so the deploy
pipeline is settled before a second deployable part is added.

## Cost and load, roughly

At 32 players a room and 10 Hz, the relay takes in 320 messages a second and sends out 320 batched
ones of about 2 KB each, so about 650 KB/s per full room. A quiet island costs close to nothing.
Worth measuring once step 2 runs, not assuming.

## Not now

- Collisions between players: needs prediction and correction, a big job.
- Shared balloons, races, leaderboards: needs the relay to act as referee. The Durable Object is
  where that would go.
- Voice and chat: moderation burden.
- Remote engine sounds: easy later, by feeding a remote's speed into a quieter `CarAudio`.
