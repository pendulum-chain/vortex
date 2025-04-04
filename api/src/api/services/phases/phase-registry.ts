import { PhaseHandler } from './base-phase-handler';
import logger from '../../../config/logger';

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
    this.handlers.set(phaseName, handler);
    logger.info(`Registered phase handler for ${phaseName}`);
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
