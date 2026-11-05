/**
 * Lazily loads the SDK (a 3.5 MB chunk incl. polkadot) only when a real quote or ramp is needed.
 * As in Gold, the ephemeral-key callback lets the app persist the active ramp ("registering")
 * BEFORE the keys are stored, and the SDK fails closed when the callback rejects.
 * @param {{ apiBase:string, publicKey?:string,
 *           session:ReturnType<typeof import("./session.js").createVortexSession>,
 *           ephemeralStore:{put(keys:unknown, rampId:string):Promise<void>},
 *           onBeforeEphemeralsStored?:(rampId:string)=>void }} cfg
 */
export async function createVortexClient(cfg) {
  const { VortexSdk } = await import("@vortexfi/sdk");
  return new VortexSdk({
    apiBaseUrl: cfg.apiBase,
    publicKey: cfg.publicKey || undefined,
    accessTokenProvider: cfg.session.getFreshAccessToken,
    storeEphemeralKeysCallback: async (keys, rampId) => {
      cfg.onBeforeEphemeralsStored?.(rampId);
      await cfg.ephemeralStore.put(keys, rampId);
    },
  });
}
