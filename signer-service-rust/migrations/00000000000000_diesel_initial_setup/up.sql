CREATE TABLE tokens (
  id SERIAL PRIMARY KEY,
  asset_code VARCHAR(12) NOT NULL,
  asset_issuer VARCHAR(60) NOT NULL,
  vault_account_id VARCHAR(60) NOT NULL,
  toml_url TEXT NOT NULL,
  min_withdrawal_amount VARCHAR(20),

  UNIQUE(asset_code,asset_issuer)
)
