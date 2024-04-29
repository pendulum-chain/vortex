### ABOUT

This simple server provides the signature of the corresponding transactions for the ephemeral account to be created,
perform the offramping payment and be closed (merging it with the funding account).

The signature for the creation transaction can be obtainid by requesting at `URL/v1/stellar/create`, while the two
transactions for payment and merge operation are returned at `URL/v1/stellar/payment`.

Run to start the service.

### Running

For production
`FUNDING_SECRET='{FUNDING_ACCOUNT_SECRET_KEY}' yarn start`

For debelopment
`FUNDING_SECRET='{FUNDING_ACCOUNT_SECRET_KEY}' yarn dev`

### Available environment variables

- `NODE_ENV` - The environment the application is running in, default is `production`
- `PORT` - The port the HTTP server will listen on, default is `3000`
- `CACHE_URI` - The URI of the cache server instance, default is `http://localhost:11211`
- `CACHE_LIFETIME_SECONDS` - The lifetime of a cache entry in seconds, default is `600` seconds
- `RATE_LIMIT_MAX_REQUESTS` - The maximum number of requests per IP address, default is `100`
- `RATE_LIMIT_WINDOW_MINUTES` - The time window in minutes for the rate limit, default is `15` minutes
- `RATE_LIMIT_NUMBER_OF_PROXIES` - The number of proxies between server and user, default is `1`
