// @generated automatically by Diesel CLI.

diesel::table! {
    tokens (id) {
        id -> Int4,
        #[max_length = 12]
        asset_code -> Varchar,
        #[max_length = 60]
        asset_issuer -> Varchar,
        #[max_length = 60]
        vault_account_id -> Varchar,
        toml_url -> Text,
        #[max_length = 20]
        min_withdrawal_amount -> Nullable<Varchar>,
    }
}
