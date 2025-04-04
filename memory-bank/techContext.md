# Technical Context: Pendulum Pay Backend

## Technologies Used

### Backend Framework
- **Node.js** (v16+) - JavaScript runtime
- **Express** - Web framework for API endpoints
- **TypeScript** - Type-safe development

### Database & State Management
- **PostgreSQL** - Primary database for state persistence
- **Sequelize ORM** - Database interactions and modeling
- **Umzug** - Database migration management
- **In-memory caching** - For quote and idempotency key tracking

### Blockchain Integration
- **viem** - EVM chain interaction (Ethereum, Polygon, BSC, etc.)
- **@polkadot/api** - Substrate chains (Pendulum, AssetHub)
- **stellar-sdk** - Stellar network integration
- **@noble/curves** - Cryptographic primitives
- **web3.js** - Legacy Ethereum interactions

### Shared Utilities
- **Network configuration** - Unified network definitions (EVM/Substrate/Stellar)
- **Token management** - Cross-chain token configurations
- **Decimal handling** - Precision management for financial operations
- **BigNumber** - Arbitrary-precision decimal arithmetic

### Security
- **Joi** - Request validation
- **Encrypted storage** - Sensitive data protection
- **Rate limiting** - API endpoint protection

## Key Architectural Components

### Core Services
- **Quote Service** - Manages FX rates and validity windows
- **Ramp Service** - Coordinates cross-chain transaction flows
- **Idempotency Service** - Ensures operation safety

### Cross-Chain Infrastructure
- **XCM Handlers** - Cross-consensus messaging
- **Bridge Contracts** - Asset transfer coordination
- **Subsidy Management** - Transaction cost optimization

### Monitoring & Reliability
- **Winston** - Structured logging
- **Slack Integration** - Real-time alerts
- **Transaction Recovery** - Failed operation handling

## Development Setup

```bash
# Install dependencies
yarn install

# Run migrations
yarn migrate

# Start development
yarn dev

# Production build
yarn build && yarn start
```

## Key Constraints
- **No key storage** - All transactions pre-signed by frontend
- **10-minute quotes** - Price validity windows
- **Multi-chain sync** - Coordinated nonce management


### Frontend Technologies (Vortex)

- **Framework/Library:** React v19
- **Build Tool:** Vite v6
- **Language:** TypeScript v5.7
- **Styling:** Tailwind CSS v4, DaisyUI v5, Motion (animations), custom CSS
- **State Management:** Zustand v5
- **Form Handling:** React Hook Form v7, Yup v1.4
- **Data Fetching:** TanStack Query v5
- **Wallet Connection:** Wagmi v2, @reown/appkit v1.6, @polkadot/extension-dapp v0.53, @talismn/connect-wallets v1.2, WalletConnect v2, @safe-global/api-kit v2.5
- **Blockchain Libraries:** Viem v2, Web3.js v4, @polkadot/api v13, @pendulum-chain/api v1.1, Stellar SDK v13
- **Utilities:** Big.js, BN.js, Buffer (via polyfill)
- **Linting/Formatting:** ESLint, Prettier, Husky, lint-staged
- **Testing:** Vitest v3, Happy DOM
- **Error Reporting:** Sentry
- **Analytics:** Google Tag Manager

[2025-04-04 16:46:40] - Added frontend technology stack based on codebase analysis.
