export namespace MoonbeamEndpoints {
  // POST /moonbeam/execute-xcm
  export interface ExecuteXcmRequest {
    id: string;
    payload: string;
  }

  export interface ExecuteXcmResponse {
    hash: `0x${string}`;
  }
}
