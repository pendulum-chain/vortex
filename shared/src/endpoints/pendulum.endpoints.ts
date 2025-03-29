export namespace PendulumEndpoints {
  // POST /pendulum/fundEphemeral
  export interface FundEphemeralRequest {
    ephemeralAddress: string;
    requiresGlmr?: boolean;
  }

  export interface FundEphemeralResponse {
    status: 'success';
    data: undefined;
  }

  export interface FundEphemeralErrorResponse {
    error: string;
    details?: string;
  }
}
