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

## Kingdom / Castle Visual Audit (Round 4)

The 5 "new" kingdom renderers in `src/game/components/NewKingdomRenderers.tsx` (FortifiedCity / RiverTown / MountainHold / FrontierCamp / TradeCity) were audited and polished:

- **FrontierCamp grounding fix** — replaced the raw `getTerrainHeight(cx, cz)` call with `sampleFootprint(cx, cz, 27, 27, 0)` and anchored the camp to `fp.minY`. Previously single-point sampling caused the camp to sink/float on uneven terrain; now it sits flat on the lowest sample of its real footprint, matching the other 4 renderers.
- **Visual polish per renderer:**
  - **Thornwall (FortifiedCity, Crimson Order)** — green herb-banner cloth on 4 corner towers, crenellation merlons along all walls, oak gate doors, 4 wall-mounted torches.
  - **Rivermoor (RiverTown, Azure Tide)** — teal shutter-banners on town hall, quay paving, lighthouse glow sphere, 3 lanterns on the dock.
  - **Stonepeak (MountainHold, Ironhold)** — blue clan banners on towers, battlement merlons, mine cart prop near platform, central brazier with flickering glow.
  - **Darkhollow (FrontierCamp, Blackthorn)** — dirt plaza ring, 3 secondary campfires, sharpened palisade tops, 2 crimson bloodstain banners, toppled wall section, extra ration barrel.
  - **Goldenvale (TradeCity, Goldenvale)** — 4 corner gold banners, 4 plaza lanterns, gold trim around trade hall, oak doors, 4 plaza crates.

A new DEV-only validator `src/game/systems/KingdomVisualValidator.ts` runs once at module load and warns about kingdom-piece grounding issues (water/slope/floating/clearance). It deliberately:
- skips ALL water checks for `waterfront: true` kingdoms (Rivermoor),
- uses `fp.minY <= WATER_LEVEL_Y` instead of the broader `hasWater` flag (which fires whenever a lake footprint overlaps the x/z plane regardless of actual height),
- uses the SHORT axis (min(halfW, halfD)) for rail/road clearance so long thin walls don't false-flag distant roads,
- skips road clearance for "crossing pieces": gatehouses, plazas, docks, and central terminus halls (town-hall, great-hall, trade-hall, platform, clock-tower) where roads intentionally meet the city,
- compares per-piece `fp.minY` against the kingdom's macro `minY` (3m tolerance) — matching what the renderer actually paints — instead of raw heightDelta.

Current validator output: **25 genuine violations remain** (down from initial 80 false-positive-heavy run). These are real placement issues to address in a future map-geometry pass (out of scope this round, which is renderer polish only):
- `thornwall_city/tower-NW` sits on a 42° slope (corner tower at -500,-450 is on a steep hillside).
- `stonepeak_hold/wall-E` is 3.1m from a road centerline.
- `darkhollow_camp/lookout-NW` is 1.4m from a road centerline.
- `goldenvale_city` is the dominant cluster — macro footprint at minY=-0.58m, south wall + gatehouse + tower-SE/SW + trade-hall + plaza + ~5 houses all sit at or below water level. Recommended fix: shift the whole kingdom ~2m north or trim its south wall.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
