import { mock } from "bun:test";
import * as rampCompletion from "../../api/services/email/ramp-completion";
import { trackBackgroundWork } from "../background-work";

// Snapshot before any mock.module call: bun mutates the imported namespace in place,
// so restore() spreading `rampCompletion` afterwards would reinstall the wrapper.
const rampCompletionReal = { ...rampCompletion };

/**
 * Routes the app's fire-and-forget entry points through the background-work registry so
 * truncateAllTables can wait for them. enqueueRampCompletedEmail is a plain function export
 * the phase processor calls without awaiting, so it is wrapped via mock.module with the rest
 * of the module passed through untouched; behaviour is unchanged.
 */
export function installBackgroundWorkTracking(): { restore: () => void } {
  mock.module("../../api/services/email/ramp-completion", () => ({
    ...rampCompletionReal,
    enqueueRampCompletedEmail: (...args: Parameters<typeof rampCompletionReal.enqueueRampCompletedEmail>) =>
      trackBackgroundWork(rampCompletionReal.enqueueRampCompletedEmail(...args))
  }));

  return {
    restore: () => {
      mock.module("../../api/services/email/ramp-completion", () => rampCompletionReal);
    }
  };
}
