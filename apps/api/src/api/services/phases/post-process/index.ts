import { BasePostProcessHandler } from './base-post-process-handler';
import moonbeamPostProcessHandler from './moonbeam-post-process-handler';
import pendulumPostProcessHandler from './pendulum-post-process-handler';
import stellarPostProcessHandler from './stellar-post-process-handler';

/**
 * All available post-process handlers
 */
const postProcessHandlers: BasePostProcessHandler[] = [
  stellarPostProcessHandler,
  pendulumPostProcessHandler,
  moonbeamPostProcessHandler,
];

export { postProcessHandlers };
export { BasePostProcessHandler } from './base-post-process-handler';
export { StellarPostProcessHandler } from './stellar-post-process-handler';
export { PendulumPostProcessHandler } from './pendulum-post-process-handler';
export { MoonbeamPostProcessHandler } from './moonbeam-post-process-handler';
