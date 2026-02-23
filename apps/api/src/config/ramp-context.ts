import { AsyncLocalStorage } from "async_hooks";

/**
 * Context that is available during ramp processing.
 * This can be extended with additional fields as needed.
 */
interface RampProcessingContext {
  rampId: string;
}

/**
 * AsyncLocalStorage instance for storing ramp processing context.
 * This allows us to automatically propagate the rampId through async call chains
 * without explicitly passing it as a parameter.
 */
const rampContextStorage = new AsyncLocalStorage<RampProcessingContext>();

/**
 * Run a function within a ramp context.
 * All async operations within the callback will have access to the rampId.
 *
 * @param rampId The ID of the ramp being processed
 * @param fn The async function to run within the context
 * @returns The result of the async function
 */
export function runWithRampContext<T>(rampId: string, fn: () => Promise<T>): Promise<T> {
  return rampContextStorage.run({ rampId }, fn);
}

/**
 * Get the current ramp ID from the AsyncLocalStorage context.
 * Returns undefined if not running within a ramp context.
 *
 * @returns The current ramp ID or undefined
 */
export function getRampId(): string | undefined {
  return rampContextStorage.getStore()?.rampId;
}

/**
 * Get the full ramp context from AsyncLocalStorage.
 * Returns undefined if not running within a ramp context.
 *
 * @returns The current ramp context or undefined
 */
export function getRampContext(): RampProcessingContext | undefined {
  return rampContextStorage.getStore();
}
