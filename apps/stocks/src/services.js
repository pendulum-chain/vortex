// The one Vortex OTP session of this tab (kit, shared key with Gold). Created on first use; only
// the lazy Privy shell and the lazy runtime import this file.
import { createApi, createVortexSession } from "@vortexfi/consumer-kit";
import { config } from "./lib/config.js";

let vortexSession = null;

export function getVortexSession() {
  if (!vortexSession) vortexSession = createVortexSession({ api: createApi({ apiBase: config.apiBase }) });
  return vortexSession;
}
