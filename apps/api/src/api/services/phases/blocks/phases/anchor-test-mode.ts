const DEFAULT_PHASE_RETRIES = 8;

export function isAnchorMockingEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.MOCK_ANCHOR_OPERATIONS === "true";
}

export function getAnchorPayoutMaxRetries(): number {
  return isAnchorMockingEnabled() ? 0 : DEFAULT_PHASE_RETRIES;
}
