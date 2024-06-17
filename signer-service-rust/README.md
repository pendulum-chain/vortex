## Signer Service in `Rust`
This is a rust version of [signer-service](../signer-service), using [axum](https://github.com/tokio-rs/axum) and [diesel](https://github.com/diesel-rs/diesel).
Tokens are stored/retrieved in postgres.

## How to Run

### Prepare the environment
See [example](.env.example) 

### Prepare Postgres DB
Install [Postgres](https://www.postgresql.org/download/) in your platform and make sure it is running.  
It can run in [linux](https://www.postgresqltutorial.com/postgresql-getting-started/install-postgresql-linux/), [macOS](https://www.postgresqltutorial.com/postgresql-getting-started/install-postgresql-macos/), [windows](https://www.postgresqltutorial.com/postgresql-getting-started/install-postgresql/).  

[Postgres docker](https://hub.docker.com/_/postgres) can also be used:
```script
    docker run --name <image_name> -e POSTGRES_USER=<POSTGRES_USER> -e POSTGRES_PASSWORD=<POSTGRES_PASSWORD> -d -p <DATABASE_PORT>:<DATABASE_PORT> postgres
```
### Run the repo
`$> RUST_LOG=info cargo run`  
And the log should print:
```log
INFO signer_service_rust: 🚀LISTENING - Ok(127.0.0.1:3001)
```
On the succeeding runs while your db is still up, you might encounter these logs which can be ignored:
```log
WARN signer_service_rust::infra: ⚠️WARNING - inserting BRL to db: Internal server error: duplicate key value violates unique constraint "tokens_asset_code_asset_issuer_key"
WARN signer_service_rust::infra: ⚠️WARNING - inserting EURC to db: Internal server error: duplicate key value violates unique constraint "tokens_asset_code_asset_issuer_key"
```
It only warns that the following [tokens](./resources/tokens) are already in the table.

## The routes

### **`GET`** http://127.0.0.1:3001/v1/status
if successful, will show the public key of environment variable `STELLAR_SECRET_KEY`:
```json
{
    "public": "GAENC...",
    "status": true
}
```

### **`GET`** http://127.0.0.1:3001/v1/tokens
returns all the supported tokens
```json
[
    {
        "asset_code": "BRL",
        "asset_issuer": "GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP",
        "min_withdrawal_amount": "10000000000000",
        "toml_url": "https://ntokens.com/.well-known/stellar.toml",
        "vault_account_id": "6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS"
    },
    {
        "asset_code": "EURC",
        "asset_issuer": "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM",
        "min_withdrawal_amount": "10000000000000",
        "toml_url": "https://mykobo.co/.well-known/stellar.toml",
        "vault_account_id": "6bsD97dS8ZyomMmp1DLCnCtx25oABtf19dypQKdZe6FBQXSm"
    }
]
```

### **`POST`** http://127.0.0.1:3001/v1/stellar/payment
requires a request body of:
```json
{
    "accountId": "GAENC...",
    "sequence": "466019...",
    "paymentData": {"amount": "1000000", "memo":"something", "memoType": "text", "offrampingAccount": "GDNVZLQ4TW..."},
    "maxTime": 10,
    "assetCode": "EURC"
}
```
If successful, will show the public key of environment variable `STELLAR_SECRET_KEY` and the signatures for signing the _payment_ transactions:
```json
{
    "public": "GAENC...",
    "signature": [
        "oenVKc3h....wDg==",
        "a3asiYAm....3Cg=="
    ]
}
```
If an asset code does not exist:
```json
{
    "details": {
        "InfraError": {
            "DoesNotExist": "USDC"
        }
    },
    "error": "Server Error",
    "status": 500
}
```
If an account is invalid:
```json
{
    "details": {
        "EncodingFailed": "offramping account"
    },
    "error": "Server Error",
    "status": 500
}
```

### **`POST`** http://127.0.0.1:3001/v1/stellar/create
requires a request body of:
```json
{
    "accountId": "GBC...",
    "maxTime": 10,
    "assetCode": "eurc"
}
```
If successful, will show:
* the public key of environment variable STELLAR_SECRET_KEY;
* the signatures for signing the _create_ transaction;
* the next sequence number
```json
{
    "public": "GAENCD...",
    "sequence": 46601984...,
    "signature": [
        "sDVVSuSkwPGoChdTIa...vDA=="
    ]
}
```