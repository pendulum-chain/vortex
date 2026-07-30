import logger from "../../../config/logger";
import { PhaseHandler } from "./base-phase-handler";

/**
 * Registry for phase handlers
 */
export class PhaseRegistry {
  private static instance: PhaseRegistry;

  private handlers: Map<string, PhaseHandler> = new Map();

  /**
   * Get the singleton instance
   */
  public static getInstance(): PhaseRegistry {
    if (!PhaseRegistry.instance) {
      PhaseRegistry.instance = new PhaseRegistry();
    }
    return PhaseRegistry.instance;
  }

  /**
   * Register a phase handler
   * @param handler The phase handler to register
   */
  public registerHandler(handler: PhaseHandler): void {
    const phaseName = handler.getPhaseName();
    const existing = this.handlers.get(phaseName);
    if (existing && existing !== handler) {
      if (existing.constructor !== handler.constructor) {
        throw new Error(`A different phase handler is already registered for ${phaseName}`);
      }
      logger.info(`Phase handler for ${phaseName} is already registered`);
      return;
    }
    this.handlers.set(phaseName, handler);
    logger.info(`Registered phase handler for ${phaseName}`);
  }

  /**
   * Tests occasionally need to shadow a production handler. Keeping that capability
   * explicit prevents production startup code from silently overwriting registrations.
   */
  public replaceHandlerForTest(handler: PhaseHandler): PhaseHandler | undefined {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("replaceHandlerForTest is only available in tests");
    }
    const phaseName = handler.getPhaseName();
    const previous = this.handlers.get(phaseName);
    this.handlers.set(phaseName, handler);
    return previous;
  }

  /**
   * Get a phase handler
   * @param phaseName The name of the phase
   * @returns The phase handler
   */
  public getHandler(phaseName: string): PhaseHandler | undefined {
    return this.handlers.get(phaseName);
  }

  /**
   * Get all registered phase handlers
   * @returns All registered phase handlers
   */
  public getAllHandlers(): PhaseHandler[] {
    return Array.from(this.handlers.values());
  }
}

export default PhaseRegistry.getInstance();
