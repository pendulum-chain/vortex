/**
 * The SDK's ephemeral-key callback. The app learns the EVM ephemeral's address, which this device
 * generated and so can pin as a trusted counterparty before anything is signed. It never sees the
 * keys themselves, which hold the secrets.
 */
export const storeEphemeralKeys = (cfg) => async (keys, rampId) => {
  cfg.onBeforeEphemeralsStored?.(rampId, keys.find((key) => key.type === "EVM")?.address);
  await cfg.ephemeralStore.put(keys, rampId);
};

/**
 * Lazily loads the SDK (a 3.5 MB chunk incl. polkadot) only when a real quote or ramp is needed.
 * As in Gold, the ephemeral-key callback lets the app persist the active ramp ("registering")
 * BEFORE the keys are stored, and the SDK fails closed when the callback rejects.
 * @param {{ apiBase:string, publicKey?:string,
 *           session:ReturnType<typeof import("./session.js").createVortexSession>,
 *           ephemeralStore:{put(keys:unknown, rampId:string):Promise<void>},
 *           onBeforeEphemeralsStored?:(rampId:string, ephemeralEvmAddress:string|undefined)=>void }} cfg
 */
export async function createVortexClient(cfg) {
  const { VortexSdk } = await import("@vortexfi/sdk");
  return new VortexSdk({
    apiBaseUrl: cfg.apiBase,
    publicKey: cfg.publicKey || undefined,
    accessTokenProvider: cfg.session.getFreshAccessToken,
    storeEphemeralKeysCallback: storeEphemeralKeys(cfg),
  });
}
