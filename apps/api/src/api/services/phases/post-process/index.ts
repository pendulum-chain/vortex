import assetHubPostProcessHandler from "./assethub-post-process-handler";
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
  baseChainPostProcessHandler,
  assetHubPostProcessHandler
];

export { AssetHubPostProcessHandler } from "./assethub-post-process-handler";
export { BaseChainPostProcessHandler } from "./base-chain-post-process-handler";
export { BasePostProcessHandler } from "./base-post-process-handler";
export { HydrationPostProcessHandler } from "./hydration-post-process-handler";
export { MoonbeamPostProcessHandler } from "./moonbeam-post-process-handler";
export { PendulumPostProcessHandler } from "./pendulum-post-process-handler";
export { PolygonPostProcessHandler } from "./polygon-post-process-handler";
export { postProcessHandlers };
