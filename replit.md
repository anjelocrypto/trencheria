# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project

**Trencheria** — A 3D multiplayer browser game with 7 factions in a shared online world. Players connect with Phantom (Solana) wallets, join clans, fight territory wars, and earn in-game coins.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite 7 + Tailwind CSS v3 (PostCSS) + shadcn/ui
- **3D Engine**: React Three Fiber v9 + @react-three/drei v10 + Three.js
- **Routing**: react-router-dom v6
- **Backend/Game logic**: Supabase (kept from original — RPC stored procs, Realtime channels, Edge Functions)
- **Auth**: Phantom wallet (Solana) with cryptographic signature verification via Supabase Edge Function
- **API framework**: Express 5 (api-server — scaffold only, not used by game)
- **Database**: PostgreSQL + Drizzle ORM (scaffold only — game data lives in Supabase)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- `artifacts/trencheria` — main game frontend (preview path: `/`)
- `artifacts/api-server` — Express API server scaffold (preview path: `/api`)
- `artifacts/mockup-sandbox` — design mockup sandbox (preview path: `/__mockup`)

## Important Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL (required for game backend)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key (required for game backend)

## Supabase Backend (do not replace)

The game uses Supabase heavily as its backend:
- **30+ RPC calls** (stored procedures for clans, territories, wars, coins, leaderboard, chat)
- **Realtime channels** for multiplayer sync (presence + broadcast)
- **Edge Functions** for Phantom wallet signature verification (`verify-wallet`)

The "real" SQL source of truth lives **outside this repo**. `supabase/.migration-backup/` is a read-only mirror — never edit it. There is currently no active `supabase/migrations/` folder; do not invent one without checking with the user first.

`supabase/pending/` holds standalone SQL files staged for the user to apply manually via their external Supabase tooling. Once applied, those files should be deleted. Currently pending:
- `supabase/pending/20260502000000_register_with_faction_session_token.sql` — adds `_session_token` parameter to `register_with_faction` and validates it via `verify_wallet_session` (Codex audit fix #2).

## API Server CORS

`artifacts/api-server` reads `ALLOWED_ORIGINS` (comma-separated list) at boot. In development, requests from `localhost`, `127.0.0.1`, or any `*.replit.dev` / `*.replit.app` host are auto-allowed. In production, allowed origins are: (1) anything in `ALLOWED_ORIGINS`, plus (2) **same-origin requests** (where `Origin` matches the request `Host`) — this is the safe default for Replit path-based routing where the trencheria web artifact and the api-server live under the same domain. Cross-origin production requests still require explicit allowlisting. `credentials: true` is enabled, so wildcard `*` is intentionally not used.

## Performance Notes (Trencheria game loop)

- **Resource interaction scan** — Player.tsx uses `ResourceSpatialGrid` (cell-bucketed lookup, cell size 8) to scan only the 1–2 grid cells around the player each frame instead of the full resource list.
- **Collision rebuild** — only fires when `resources` / `structures` / `isMounted` references change, with a 1.0 s fallback for horse position drift (was unconditional 0.5 s).
- **Night lighting** — top-N (N=3) lamp selection uses an O(N·K) linear pass over a reusable scratch buffer; recompute cadence is every 30 frames (~0.5 s). All production console.log instrumentation has been removed.
- **Multiplayer broadcaster** — single reusable `NetworkPlayerState` object with mutated `position`/`horsePosition` tuples; the `useMultiplayer` send cadence (interval timers) still controls when state is actually sent over the wire.
- **Town district collision** — `TOWN_PROPS` in `TownDistrict.tsx` registers stalls, carts, barrels, hay, troughs, lantern posts, and the shrine with `CollisionSystem` so the player no longer phases through visible props.

## World-Map Coherence (Codex audit)

A DEV-only validator (`src/game/systems/RailwayValidator.ts`) runs once at module load and warns about:
- rail/road segments crossing rivers/lakes without a matching bridge OBB
- rails passing within a settlement's required clearance
- rail × road intersections missing a `LEVEL_CROSSING` entry
- **town buildings (`TOWN_BUILDINGS`) and town props (`TOWN_PROPS`)** within rail clearance, or whose footprint overlaps a rail/road bridge OBB, station footprint, or level-crossing radius
- **kingdom houses** (`FORTIFIED_CITY_HOUSES`, `RIVER_TOWN_HOUSES`, `MOUNTAIN_HOLD_HOUSES`, `FRONTIER_CAMP_HOUSES`, `TRADE_CITY_HOUSES`) — local coords are transformed into world space using the matching `SettlementDef` position before the same checks run

`RailwayTrack` and `RailwayBridges` were also restyled in this pass: gravel ballast slimmed from 3.0u → 1.7u, sleepers from 2.0u → 1.35u; rail bridges no longer use 1.8u-tall iron girder walls + middle pier — they are now a slim deck with low parapet rails, slim balusters every 2u, and two end piers only. This removed the bulky girder cluster visible from the Ironhold approach.

**Codex follow-up #2** (final cleanup pass) closes the loop:
- The Rivermoor `road-water-no-bridge` residual is no longer "known residual": `BridgeData.ts` now exports an `INTENTIONAL_FORDS` array (with a single `ford-rivermoor-quay` entry at (432,332) r=14) and the validator suppresses warnings inside any ford radius. The point is rendered as the kingdom's lakeside quay/causeway.
- `RailwayValidator.checkBuilding` was replaced with a rotation-aware `checkObb` helper that uses 2D Separating Axis Theorem for OBB-vs-OBB overlap. `TOWN_BUILDINGS` (using `b.rot`), `TOWN_PROPS` boxes (using `rotation`), and all 5 kingdom house arrays (using `h.rot`) are now tested as true rotated rectangles against rail-bridge, road-bridge, station, and level-crossing footprints (also expressed as OBBs). This caught 3 stalls/cart at z=58 silently overlapping `bridge-old-veyra-river`'s deck — those props were pulled south to z=48.
- Result: `[RailwayValidator] ✓ No rail/road/bridge violations. 12 intersection(s) decorated; 7 station footprint(s) clean; 19 wilderness building(s) clear; 36 town building(s) + 37 town prop(s) clear; 62 kingdom house(s) clear; 909 resource(s) clear of rail clearance.`

The audit reshaped a number of map data sources to keep the railway/road network feeling planned:
- `src/game/world/RailwayData.ts` — added explicit bridge waypoints + `RAILWAY_BRIDGES` entries on Lines A/B over river-great, the Ironhold tributaries, and the eastern fork; rebuilt `LEVEL_CROSSINGS` to cover all rail × road intersections.
- `src/game/world/BridgeData.ts` — repositioned road bridges (Darkhollow marsh, Stonepeak crossing) onto actual road centerlines; added Old/Blackthorn/Ashwood/Stonepeak river bridges; deleted orphan dry-land bridges.
- `src/game/world/WaterData.ts` — trimmed `stream-ironhold-south` and `stream-darkhollow-ford` to fit fully under their rail bridges; trimmed `river-ironhold` northern endpoint south of Line B; shifted `river-rivermoor` apex east so Rivermoor settlement isn't inside the river endpoint.
- `src/game/world/RegionData.ts` — Stonepeak roads rebuilt as a perpendicular river crossing through `(-220, 230)` matching the new `bridge-stonepeak-river`.

The validator scans the FULL length of each rail/road segment (not just first water sample) so "no violations" reflects every water sample being inside a bridge OBB.

## Kingdom / Castle Visual Audit (Round 4 + 4.1 cleanup)

The 5 "new" kingdom renderers (`src/game/components/NewKingdomRenderers.tsx` — FortifiedCity / RiverTown / MountainHold / FrontierCamp / TradeCity) plus the 3 placeholder kingdoms in `src/game/components/Settlements.tsx` (CapitalCity = Ironhold, MilitaryFort = Blackthorn Fort, MountainMonastery = Frostmere) were audited and grounded.

**Per-renderer visual polish:**
- **Thornwall (Crimson Order)** — green herb banners, merlons, oak doors, wall torches.
- **Rivermoor (Azure Tide)** — teal shutter-banners, quay paving, lighthouse glow, dock lanterns.
- **Stonepeak (Ironhold)** — blue clan banners, battlements, mine cart, central brazier.
- **Darkhollow (Blackthorn)** — dirt plaza, secondary campfires, sharpened palisade, crimson banners.
- **Goldenvale** — gold banners, plaza lanterns, gold trim, oak doors, crates.

**Round 4.1 grounding / road-overlap cleanup:**
- **Visible stone podiums** added under RiverTown, TradeCity, and MilitaryFort renderers — these waterfront cities have macro `minY` below water (Blackthorn -0.54m, Goldenvale -0.58m, Rivermoor -1.00m). The podium pad fills the gap between the floor-clamped anchor (`WATER_LEVEL_Y + 0.3`) and the actual terrain so the city looks grounded on a real quay/foundation, not floating above floor-clamped air. Validator entries flagged with `intentionalPodium: true` to suppress the `kingdom-needs-water-clamp` warning.
- **Stonepeak back gate** — `MountainHold` now has a SERVICE gate cut into the -z wall (gate towers + descending stairs), matching the Goldenvale → Stonepeak road that now terminates at (-400, 472) world. The +z wall keeps its main gate.
- **Darkhollow lookout-NW** moved from local (-20, 18) to (-25, 23) so the Ashkeep approach road clears it by ≥3m (was 1.9m).
- **Frostmere (MountainMonastery)** is intentionally on uneven mountain terrain — flagged `intentionalUneven: true` to suppress the macro `kingdom-uneven` warning.
- **Road reroutes in `RegionData.ts`** — every road that previously dove through a city centre (and silently crossed the surrounding wall ring) now terminates at the city's gate position:
  - Thornwatch → Thornwall: `(-440,-400) → (-500,-407)` (south gate, was -450 city centre).
  - Thornwall → Goldenvale southern connector: rerouted east of Goldenvale's wall-W via `(-505, -200) → (-505, 138)` then west to gate.
  - Harvest Hill → Goldenvale: ends at `(-550, 138)` south gate.
  - Goldenvale → Stonepeak western connector: wraps east via `(-340, 300) → (-340, 472) → (-400, 472)` (Stonepeak back gate).
  - Stonepeak final approach: dog-legs via `(-360, 530)` and ends at +z gate `(-400, 528)`.
  - Stonepeak → north waypoint: starts at +z gate `(-400, 528)` instead of city centre.

**`KingdomVisualValidator` upgrades (`src/game/systems/KingdomVisualValidator.ts`):**
- Replaced the 8-sample segment-vs-AABB approximation with **exact analytic distance** (Liang-Barsky-style slab clipping for intersection, then closed-form point-vs-AABB on segment endpoints + AABB corners projected onto the segment). Long thin walls can no longer "miss" a road that passes between samples.
- Added **real piece arrays** for the 3 placeholder kingdoms (Ironhold = 17 pieces incl. keep, all 4 walls, gatehouse, 4 corner + 3 mid-wall towers, chapel, market & noble plazas; Blackthorn Fort = 12 pieces; Frostmere = 10 pieces incl. chapel-nave/apse, bell-tower, wings, enclosure walls). Previously these had `pieces: []`, so only RailwayValidator's per-house checks ran on them.
- New flags: `intentionalPodium` (skips `kingdom-needs-water-clamp` warning when a stone base is rendered), `intentionalUneven` (skips `kingdom-uneven` for mountain monasteries), `allowSteepSlope` (corner towers built on cliffs).
- All road reroutes above were validated against the new analytic distance — the previously-flagged 11 violations (3 water-clamps + 1 uneven + 7 road overlaps) are now either resolved by reroute/podium/move or are documented intentional exceptions in the validator data.

**Validator output** (single line at boot, in the browser console):
> `[KingdomVisualValidator] ✓ No kingdom visual violations across 8 kingdom(s); N piece(s) + M house(s) clean.`

Frostmere's macro slope is intentional (mountain monastery). Stonepeak / Thornwall corner towers `allowSteepSlope: true` — they're perched on the cliff/ridge corners by design and would look wrong nudged inward.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
