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

export class UnrecoverablePhaseError extends PhaseError {
  constructor(message: string) {
    super(message, false);
  }
}
