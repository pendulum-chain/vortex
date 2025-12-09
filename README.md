# Vortex

[![Netlify Status](https://api.netlify.com/api/v1/badges/27783b79-512d-4205-89c1-d3ead6e3ed46/deploy-status)](https://app.netlify.com/sites/pendulum-pay/deploys)&nbsp;
![TypeScript](https://img.shields.io/badge/-TypeSript-05122A?style=flat&logo=typescript)&nbsp;
![React](https://img.shields.io/badge/-React-05122A?style=flat&logo=react)&nbsp;
![Vite](https://img.shields.io/badge/-Vite-05122A?style=flat&logo=vite)&nbsp;
![Polkadot](https://img.shields.io/badge/-Polkadot-05122A?style=flat&logo=polkadot)&nbsp;
![Ethereum](https://img.shields.io/badge/-Ethereum-05122A?style=flat&logo=ethereum)&nbsp;

---

Vortex is a gateway for cross-border payments. It is built on top of the Pendulum blockchain.

## Repository Structure

This is a **Bun monorepo** containing multiple sub-projects organized into apps and packages:

### Apps

- **[apps/api](apps/api)** - Backend API service providing signature services, on/off-ramping flows, quote generation, and transaction state management
- **[apps/frontend](apps/frontend)** - React-based web application built with Vite for the Vortex user interface
- **[apps/rebalancer](apps/rebalancer)** - Service for automated liquidity rebalancing across chains

### Packages

- **[packages/sdk](packages/sdk)** - Stateless SDK that abstracts Vortex's API and ephemeral key handling for cross-chain ramp operations
- **[packages/shared](packages/shared)** - Shared utilities and types used across the monorepo

## Getting Started

### Installation

In the project root directory, install all dependencies:

```bash
bun install
```

If you encounter issues with the `bun install` command, you can try upgrading your `bun` version with `bun upgrade`. The installation is confirmed to work in bun v1.3.1.

### Running the Projects

#### Run All Projects

Run the frontend, backend API, and shared package concurrently in development mode:

```bash
bun dev
```

This will start:
- **Frontend**: [http://127.0.0.1:5173/](http://127.0.0.1:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

#### Run Individual Projects

**Frontend only:**
```bash
bun dev:frontend
```

**Backend API only:**
```bash
bun dev:backend
```

**Rebalancer:**
```bash
bun dev:rebalancer
```

### Building

**Build all projects:**
```bash
bun build
```

**Build individual projects:**
```bash
# Build frontend
bun build:frontend

# Build backend API
bun build:backend

# Build SDK
bun build:sdk

# Build shared package
bun build:shared
```

## Sub-Project Specific Instructions

### Frontend (apps/frontend)

The React-based web application for Vortex.

**Development:**
```bash
cd apps/frontend
bun dev
```

**Build:**
```bash
cd apps/frontend
bun build
```

**Preview production build:**
```bash
cd apps/frontend
bun preview
```

### Backend API (apps/api)

The backend service providing signature services, on/off-ramping flows, and transaction management.

**Development:**
```bash
cd apps/api
bun dev
```

**Database setup:**
```bash
cd apps/api
# Copy environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
bun migrate

# Seed phase metadata
bun seed:phase-metadata
```

**Build and serve:**
```bash
cd apps/api
bun start
```

See [apps/api/README.md](apps/api/README.md) for detailed API documentation.

### Rebalancer (apps/rebalancer)

Service for automated liquidity rebalancing across chains.

**Setup:**
```bash
cd apps/rebalancer
cp .env.example .env
# Edit .env with your API keys
```

**Run:**
```bash
cd apps/rebalancer
bun start
```

See [apps/rebalancer/README.md](apps/rebalancer/README.md) for more details.

### SDK (packages/sdk)

A stateless SDK that abstracts Vortex's API and ephemeral key handling.

**Build:**
```bash
cd packages/sdk
bun build
```

See [packages/sdk/README.md](packages/sdk/README.md) for usage examples and API documentation.

### Shared (packages/shared)

Common utilities and types used across the monorepo.

**Build:**
```bash
cd packages/shared
bun build
```

## Env Variables

- `VITE_SIGNING_SERVICE_PATH`: Optional variable to point to a specific signing backend service URL. If undefined, it
  will default to either:
  - `http://localhost:3000` (if in development mode)
  - `/api/production` (if in production mode)
    - this will use the `_redirects` file to direct Netlify to proxy all requests to `/api/production` to
      `https://signer-service.pendulumchain.tech`
  - `/api/staging` (if in staging mode)
    - this will use the `_redirects` file to direct Netlify to proxy all requests to `/api/staging` to
      `https://signer-service-staging.pendulumchain.tech`
- `VITE_ALCHEMY_API_KEY`: Optional variable to set the Alchemy API key for the custom RPC provider. If undefined, it
  will use dhe default endpoint.

## Fixing type issues

If you encounter issues with the IDE not detecting the type overwrites of the `@pendulum-chain/types` package properly,
make sure that all the `@polkadot/xxx` packages match the same version used in the types package. It is also important
to make sure that peer dependencies have the same version as this might also cause issues.
