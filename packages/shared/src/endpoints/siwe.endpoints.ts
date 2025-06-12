export namespace SiweEndpoints {
  // POST /siwe/create
  export interface CreateSiweRequest {
    walletAddress: string;
  }

  export interface CreateSiweResponse {
    nonce: string;
  }

  // POST /siwe/validate
  export interface ValidateSiweRequest {
    nonce: string;
    signature: string;
    siweMessage: string;
  }

  export interface ValidateSiweResponse {
    message: string;
  }

  export interface SiweErrorResponse {
    error: string;
  }
}
