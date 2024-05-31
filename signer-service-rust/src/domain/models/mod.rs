mod token;

pub use token::Token;

#[derive(Debug)]
pub enum Error {
    FileDoesNotExist(String),
    SerdeError(String),
    TokenDoesNotExist,
    EncodingFailed(String),

    WalletError(String)
}
