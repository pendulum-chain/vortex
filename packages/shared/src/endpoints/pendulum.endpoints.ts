// POST /pendulum/fundEphemeral
export interface PendulumFundEphemeralRequest {
  ephemeralAddress: string;
  requiresGlmr?: boolean;
}

export interface PendulumFundEphemeralResponse {
  status: "success";
  data: undefined;
}

export interface PendulumFundEphemeralErrorResponse {
  error: string;
  details?: string;
}
