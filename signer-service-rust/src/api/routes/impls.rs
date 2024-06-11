use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use tokio::time::Instant;
use tracing::info;
use crate::AppState;
use crate::infra::{get_all_tokens, Token, TokensFilter};

pub(super) async fn tokens(State(state): State<AppState>,) -> Json<Value> {
    let start = Instant::now();
    let res = match get_all_tokens(
        &state.pool,
        TokensFilter::empty()
    ).await {
        Ok(tokens) => tokens_as_json(tokens),
        Err(e) => {
            Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))
        }
    };

    let duration = start.elapsed();
    info!("➡️ {:<6} {duration:?}", "GET tokens");
    res
}

fn tokens_as_json(tokens:Vec<Token>) -> Json<Value> {
   match serde_json::to_value(tokens) {
       Ok(res) => { Json(res) }
       Err(e ) => {
           let e = e.to_string();
           Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))
       }
   }
}