### ABOUT

This simple server provides the signature of the corresponding transactions for the ephemeral account to be created,
perform the offramping payment and be closed (merging it with the funding account).

The signature for the creation transaction can be obtained by requesting at `URL/v1/stellar/create`, while the two
transactions for payment and merge operation are returned at `URL/v1/stellar/payment`.

Run to start the service.

### Running

Make sure you have the required environment variables set, either in a `.env` file or in the environment.

For production, run `yarn start`.

For development, run `yarn run dev`.

### Available environment variables

The following environment variables are available to configure the service.

### Mandatory

- `FUNDING_SECRET`: Secret key to sign the funding transactions on Stellar.
- `PENDULUM_FUNDING_SEED`: Seed phrase to sign the funding transactions on Pendulum.
- `MOONBEAM_EXECUTOR_PRIVATE_KEY`: Private key to sign the transactions on Moonbeam.
- `SLACK_WEB_HOOK_TOKEN` - Slack web hook token for error reporting.

### Optional

- `NODE_ENV` - The environment the application is running in, default is `production`
- `PORT` - The port the HTTP server will listen on, default is `3000`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Optional variable to set the Google service account email.
- `GOOGLE_PRIVATE_KEY`: Optional variable to set the Google private key.
- `GOOGLE_SPREADSHEET_ID`: Optional variable to set the Google spreadsheet ID for data storage.
- `GOOGLE_SPREADSHEET_EMAIL_ID`: Optional variable to set the Google spreadsheet ID for emails.
- `RATE_LIMIT_MAX_REQUESTS` - The maximum number of requests per IP address, default is `100`
- `RATE_LIMIT_WINDOW_MINUTES` - The time window in minutes for the rate limit, default is `15` minutes
- `RATE_LIMIT_NUMBER_OF_PROXIES` - The number of proxies between server and user, default is `1`
