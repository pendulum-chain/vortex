// POST /moonbeam/execute-xcm
export interface MoonbeamExecuteXcmRequest {
  id: string;
  payload: string;
}

export interface MoonbeamExecuteXcmResponse {
  hash: `0x${string}`;
}
