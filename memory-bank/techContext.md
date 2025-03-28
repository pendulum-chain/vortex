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
