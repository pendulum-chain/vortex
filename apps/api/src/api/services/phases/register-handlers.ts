import { registerBlockFlowHandlers } from "../quote/blocks/register-handlers";

/**
 * Register all phase handlers
 */
export function registerPhaseHandlers(): void {
  registerBlockFlowHandlers();
}

export default registerPhaseHandlers;
