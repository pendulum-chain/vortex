# Vortex API Service

## About

This server provides backend services for the Vortex application, including:

1. Signature services for ephemeral accounts
2. On-ramping and off-ramping flows
3. Quote generation and management
4. Transaction state management

The service now includes a unified API for on-ramping and off-ramping flows, with state persistence in PostgreSQL.

## Setup

### Database Setup

The service requires PostgreSQL. Set up a database and configure the connection in your `.env` file:

```bash
# Create a PostgreSQL database
createdb vortex

# Configure environment variables (see .env.example)
cp .env.example .env
# Edit .env with your database credentials
```

### Running

Make sure you have the required environment variables set, either in a `.env` file or in the environment.

```bash
# Install dependencies
yarn install

# Run migrations
yarn migrate

# Seed phase metadata
yarn seed:phase-metadata

# For production
yarn start

# For development
yarn dev
```

## API Endpoints

### Authentication

All ramping and quote endpoints require authentication. Two principals are accepted:

- **Partner SDK**: `X-API-Key: sk_<live|test>_<32 chars>` — issued per partner via the admin API. Scoped to the partner's own quotes/ramps.
- **First-party frontend**: `Authorization: Bearer <Supabase access token>` — issued by Supabase OTP. Scoped to the user's own ramps.

Anonymous access to ramp/quote endpoints is rejected with HTTP 401. Cross-tenant access (e.g. one partner reading another partner's ramp) is rejected with HTTP 403.

`POST /v1/quotes` and `POST /v1/quotes/best` additionally enforce that any `partnerId` in the body matches the authenticated partner key (HTTP 403 on mismatch).

### Ramping Endpoints

#### Quote Management

- `POST /v1/quotes` - Create a new quote (auth required when `partnerId` is present)
- `POST /v1/quotes/best` - Create the best-priced quote across providers
- `GET /v1/quotes/:id` - Get quote information (public)

#### Ramp Flow Management

- `POST /v1/ramp/register` - Register a new ramping process from a quote
- `POST /v1/ramp/update` - Submit presigned transactions for a registered ramp
- `POST /v1/ramp/start` - Start phase processing for a ramp
- `GET /v1/ramp/:id` - Get the status of a ramping process
- `GET /v1/ramp/:id/errors` - Get error logs for a ramp
- `GET /v1/ramp/history/:walletAddress` - Get ramp history for a wallet (filtered by authenticated principal)

### Legacy Endpoints

#### Stellar Operations

- `POST /v1/stellar/create` - Get signature for account creation
- `POST /v1/stellar/payment` - Get signatures for payment and merge operations

## State Machine Implementation

The service now implements a state machine pattern for ramping flows:

1. **Phase Transitions**: Each phase has defined valid transitions to other phases
2. **Phase History**: All phase transitions are logged with timestamps
3. **Error Logging**: Errors are logged with phase information
4. **Subsidy Management**: Subsidy details are tracked throughout the flow
5. **Nonce Sequence Management**: Transaction nonce sequences are managed

### Phase Metadata

Phase metadata is stored in the database and includes:

- Required transactions for each phase
- Success conditions
- Retry policies
- Valid transitions

To update phase metadata, modify the seeder file and run:

```bash
yarn seed:phase-metadata
```

## Environment Variables

### Mandatory

- `FUNDING_SECRET`: Secret key to sign the funding transactions on Stellar.
- `PENDULUM_FUNDING_SEED`: Seed phrase to sign the funding transactions on Pendulum.
- `MOONBEAM_EXECUTOR_PRIVATE_KEY`: Private key to sign the transactions on Moonbeam.
- `CLIENT_DOMAIN_SECRET`: Secret for client domain verification.

### Database Configuration

- `DB_HOST`: PostgreSQL host (default: localhost)
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_USERNAME`: PostgreSQL username (default: postgres)
- `DB_PASSWORD`: PostgreSQL password (default: postgres)
- `DB_NAME`: PostgreSQL database name (default: vortex)

### Optional

- `NODE_ENV`: The environment the application is running in (default: production)
- `PORT`: The port the HTTP server will listen on (default: 3000)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email.
- `GOOGLE_PRIVATE_KEY`: Google private key.
- `GOOGLE_SPREADSHEET_ID`: Google spreadsheet ID for data storage.
- `GOOGLE_EMAIL_SPREADSHEET_ID`: Google spreadsheet ID for emails.
- `GOOGLE_RATING_SPREADSHEET_ID`: Google spreadsheet ID for ratings.
- `RATE_LIMIT_MAX_REQUESTS`: Maximum number of requests per IP address (default: 100)
- `RATE_LIMIT_WINDOW_MINUTES`: Time window in minutes for the rate limit (default: 1)
- `RATE_LIMIT_NUMBER_OF_PROXIES`: Number of proxies between server and user (default: 1)

## Testing.

There are two test/scripts that can help with testing a flow of interest, by-passing some of the external services and
checks, and focusing on the phase executions alone.

These are `phase-processor.integration.test.ts` and `phase-processor.recovery.integration.test.ts`

These tests will fetch a quote, and attempt to register and start a ramp by signing and sending the funds from a testing
account, which simulates the actions of the UI and the user.

It is important to keep in mind that both BRLA subaccount and ramp interactions are mocked. Similarly, Stellar
interactions with anchors is skipped and an account is chosen as the anchor's target, to recover the funds.

To test, please run `bun test phase-processor.integration.test.ts --timeuout X` where X is a reasonable timeframe for
the phases to complete. Note: all the environment variables used to run the service MUST be provided, with the addition
of BACKEND_TEST_STARTER_ACCOUNT, the account simulates the user.

The state of the ramp is stored in `lastRampState.json`, which mocks the database. In the event of a failure, copy the
state into `failedRampStateRecovery.json` and run `bun test phase-processor.recovery.integration.test.ts --timeout X` to
simply restart the flow from the last phase. This is useful to test fixes or bugs.
