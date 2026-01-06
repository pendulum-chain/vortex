# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vortex is a cross-border payments gateway built on the Pendulum blockchain. It enables on-ramping and off-ramping of fiat currencies through stablecoins using cross-chain swaps via XCM (Cross-Consensus Messaging).

## Monorepo Structure

This is a **Bun monorepo** using workspaces:

- **apps/frontend** - React 19 + Vite web application
- **apps/api** - Express backend service (PostgreSQL + Sequelize)
- **apps/rebalancer** - Liquidity rebalancing service
- **packages/shared** - Shared utilities, types, token configs, and helpers
- **packages/sdk** - Public SDK for Vortex API integration

## Essential Commands

```bash
# Install all dependencies
bun install

# Development (runs frontend, backend, and shared concurrently)
bun dev

# Individual app development
bun dev:frontend    # Frontend at http://127.0.0.1:5173
bun dev:backend     # Backend at http://localhost:3000
bun dev:rebalancer

# Build
bun build           # Build all (shared -> sdk -> frontend -> backend)
bun build:shared    # Must build shared first when making changes
bun build:frontend
bun build:backend

# Linting and formatting (uses Biome)
bun lint            # Run linter
bun lint:fix        # Auto-fix lint issues
bun format          # Format all files
bun verify          # Check without fixing

# Type checking
bun typecheck

# Database (from apps/api)
cd apps/api
bun migrate                  # Run migrations
bun migrate:revert           # Revert all migrations
bun migrate:revert-last      # Revert last migration
bun seed:phase-metadata      # Seed phase configuration

# Testing
cd apps/frontend && bun test    # Frontend tests (Vitest)
cd apps/api && bun test         # Backend tests
```

## Architecture

### State Machine Pattern

The ramping process uses a state machine with defined phases:
- **Offramp**: prepareTransactions → squidRouter → pendulumFundEphemeral → subsidizePreSwap → nablaApprove → nablaSwap → subsidizePostSwap → performBrlaPayout → pendulumCleanup
- **Onramp**: brlaTeleport → createMoonbeamEphemeral → executeMoonbeamToPendulumXCM → subsidizePreSwap → nablaApprove → nablaSwap → executePendulumToAssetHubXCM → pendulumCleanup

Phase metadata and valid transitions are stored in PostgreSQL and seeded via `seed:phase-metadata`.

### Frontend Architecture

- **State**: Zustand stores (`stores/`) + React Context (`contexts/`)
- **Forms**: React Hook Form with Yup validation
- **Data Fetching**: TanStack Query
- **Routing**: TanStack Router (route tree auto-generated in `routeTree.gen.ts`)
- **State Machines**: XState machines in `machines/` for complex flows (KYC, ramp process)
- **Wallet Integration**: Wagmi/AppKit (EVM) + Talisman (Polkadot)

### Backend Architecture

- **API Layer**: Express routes in `api/routes/`, controllers in `api/controllers/`
- **Services**: Business logic in `api/services/`
- **Models**: Sequelize models in `models/` (RampState, QuoteTicket, Partner, etc.)
- **Workers**: Background jobs in `api/workers/`
- **Cross-chain**: XCM handlers, Nabla AMM integration, Stellar/BRLA APIs

### Shared Package (`@vortexfi/shared`)

Contains cross-package utilities:
- Token configurations and network definitions
- Endpoint helpers for API calls
- Contract ABIs and addresses
- Decimal/BigNumber helpers
- Logger configuration

**Important**: Always rebuild shared when making changes: `bun build:shared`

## Code Style Guidelines

From `.clinerules/`:

### General
- Prefer composition over inheritance
- Create ADRs in `/docs/adr` for major architectural changes

### Frontend-Specific
- Avoid `useState` unless absolutely needed; prefer derived data and `useRef`
- Avoid `useEffect` except for external system synchronization
- Avoid `setTimeout` (always comment why if used)
- Extract complex conditional rendering into new components
- Skip useless comments; only comment race conditions, TODOs, or genuinely confusing code

### Biome Configuration
- Line width: 128
- Indent: 2 spaces
- Semicolons: always
- Trailing commas: none
- Quote style: double
- Sorted Tailwind classes enforced via `useSortedClasses` rule

## Testing

### Backend Integration Tests
```bash
cd apps/api
bun test phase-processor.integration.test.ts --timeout X
```
State is stored in `lastRampState.json`. For recovery testing, copy failed state to `failedRampStateRecovery.json` and run the recovery test.

### Frontend Tests
```bash
cd apps/frontend
bun test
```

## Type Issues

If IDE doesn't detect `@pendulum-chain/types` properly, ensure all `@polkadot/*` packages match versions in the types package. The root `package.json` uses `catalog:` for version management.
