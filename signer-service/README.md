### ABOUT

This simple server provides the signature of the corresponding transactions for the ephemeral account to be created,
perform the offramping payment and be closed (merging it with the funding account).

The signature for the creation transaction can be obtainid by requesting at `URL/v1/stellar/create`, while the two
transactions for payment and merge operation are returned at `URL/v1/stellar/payment`.

Run `FUNDING_PUBLIC_KEY='{FUNDING_ACCOUNT_PUBLICK_KEY}' FUNDING_SECRET='{FUNDING_ACCOUNT_SECRET_KEY}' yarn dev` to start
the service.
