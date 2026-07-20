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
