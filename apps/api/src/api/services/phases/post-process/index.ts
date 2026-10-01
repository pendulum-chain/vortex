import baseChainPostProcessHandler from "./base-chain-post-process-handler";
import { BasePostProcessHandler } from "./base-post-process-handler";
import moonbeamPostProcessHandler from "./moonbeam-post-process-handler";
import pendulumPostProcessHandler from "./pendulum-post-process-handler";
import polygonPostProcessHandler from "./polygon-post-process-handler";

/**
 * All available post-process handlers
 */
const postProcessHandlers: BasePostProcessHandler[] = [
  pendulumPostProcessHandler,
  moonbeamPostProcessHandler,
  polygonPostProcessHandler,
  baseChainPostProcessHandler
];

export { postProcessHandlers };
