function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPhaseProcessorMaxExecutionTimeMs(): number {
  return positiveIntFromEnv(process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS, 600000);
}

export function getSquidRouterPayTimeoutMs(): number {
  return Math.floor(getPhaseProcessorMaxExecutionTimeMs() * 0.8);
}

export function getPhaseProcessorRetryDelayMs(): number {
  return positiveIntFromEnv(process.env.PHASE_PROCESSOR_RETRY_DELAY_MS, 30000);
}

// How long a ramp may sit in squidRouterPay (across retried executions) before the
// handler classifies the GMP on axelarscan, attempts active recovery, and alerts.
export function getSquidRouterPayStuckAlertMs(): number {
  return positiveIntFromEnv(process.env.SQUID_ROUTER_PAY_STUCK_ALERT_MS, 20 * 60 * 1000);
}
