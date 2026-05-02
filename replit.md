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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
