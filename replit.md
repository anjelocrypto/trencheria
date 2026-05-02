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

The audit reshaped a number of map data sources to keep the railway/road network feeling planned:
- `src/game/world/RailwayData.ts` — added explicit bridge waypoints + `RAILWAY_BRIDGES` entries on Lines A/B over river-great, the Ironhold tributaries, and the eastern fork; rebuilt `LEVEL_CROSSINGS` to cover all rail × road intersections.
- `src/game/world/BridgeData.ts` — repositioned road bridges (Darkhollow marsh, Stonepeak crossing) onto actual road centerlines; added Old/Blackthorn/Ashwood/Stonepeak river bridges; deleted orphan dry-land bridges.
- `src/game/world/WaterData.ts` — trimmed `stream-ironhold-south` and `stream-darkhollow-ford` to fit fully under their rail bridges; trimmed `river-ironhold` northern endpoint south of Line B; shifted `river-rivermoor` apex east so Rivermoor settlement isn't inside the river endpoint.
- `src/game/world/RegionData.ts` — Stonepeak roads rebuilt as a perpendicular river crossing through `(-220, 230)` matching the new `bridge-stonepeak-river`.

The validator scans the FULL length of each rail/road segment (not just first water sample) so "no violations" reflects every water sample being inside a bridge OBB.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
