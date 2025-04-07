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

### Ramping Endpoints

#### Quote Management

- `POST /v1/ramp/quotes` - Create a new quote
- `GET /v1/ramp/quotes/:id` - Get quote information

#### Ramp Flow Management

- `POST /v1/ramp/start` - Start a new ramping process
- `GET /v1/ramp/:id` - Get the status of a ramping process
- `PATCH /v1/ramp/:id/phase` - Advance a ramping process to the next phase
- `PATCH /v1/ramp/:id/state` - Update the state of a ramping process
- `PATCH /v1/ramp/:id/subsidy` - Update subsidy details
- `PATCH /v1/ramp/:id/nonce` - Update nonce sequences
- `POST /v1/ramp/:id/error` - Log an error
- `GET /v1/ramp/:id/history` - Get phase history
- `GET /v1/ramp/:id/errors` - Get error logs
- `GET /v1/ramp/phases/:phase/transitions` - Get valid transitions for a phase

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

There are two test/scripts that can help with testing a flow of interest, by-passing some of the external services and checks, and focusing on the phase executions alone.

These are `phase-processor.integration.test.ts` and `phase-processor.recovery.integration.test.ts`

These tests will fetch a quote, and attempt to register and start a ramp by signing and sending the funds from a testing account, which simulates the actions of the UI and the user. 

It is important to keep in mind that both BRLA subaccount and ramp interactions are mocked. Similarly, Stellar interactions with anchors is skipped and an account is chosen as the anchor's target, to recover the funds.


To test, please run `bun test phase-processor.integration.test.ts --timeuout X` where X is a reasonable timeframe for the phases to complete. Note: all the environment variables used to run the service MUST be provided, with the addition of BACKEND_TEST_STARTER_ACCOUNT, the account simulates the user.

The state of the ramp is stored in `lastRampState.json`, which mocks the database. In the event of a failure, copy the state into `failedRampStateRecovery.json` and run `bun test phase-processor.recovery.integration.test.ts --timeout X` to simply restart the flow from the last phase. This is useful to test fixes or bugs.