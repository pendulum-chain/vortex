export class PhaseError extends Error {
  readonly isRecoverable: boolean;

  constructor(message: string, isRecoverable = false) {
    super(message);
    this.name = this.constructor.name;
    this.isRecoverable = isRecoverable;
  }
}

export class RecoverablePhaseError extends PhaseError {
  readonly minimumWaitSeconds?: number;
  constructor(message: string, minimumWaitSeconds?: number) {
    super(message, true);
    this.minimumWaitSeconds = minimumWaitSeconds;
  }
}

/**
 * A recoverable phase error that requires an operator to reconcile an
 * ambiguous external side effect before the ramp may be resumed.
 *
 * Unlike an ordinary transient error, retrying this automatically could repeat
 * a payment or transfer whose first result is unknown.
 */
export class ReconciliationRequiredPhaseError extends RecoverablePhaseError {}

export function requiresManualReconciliation(error: unknown): error is Error & { requiresManualReconciliation: true } {
  return (
    error instanceof Error &&
    "requiresManualReconciliation" in error &&
    (error as { requiresManualReconciliation?: unknown }).requiresManualReconciliation === true
  );
}

export class UnrecoverablePhaseError extends PhaseError {
  constructor(message: string) {
    super(message, false);
  }
}
