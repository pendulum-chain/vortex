// Browser Web Locks serialize payment work across tabs on the same origin. The non-browser
// queue supports unit tests; a browser lacking Web Locks must fail closed.
import { VortexError } from "./vortex/api.js";
const queues = new Map();
export async function withConsumerLock(name, run) {
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(name, run);
  if (typeof window !== "undefined") throw new VortexError("Este navegador não oferece a proteção necessária para enviar esta operação. Use um navegador atualizado.", { code: "WALLET_LOCK_UNAVAILABLE" });
  const previous = queues.get(name) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(run);
  queues.set(name, pending);
  try { return await pending; } finally { if (queues.get(name) === pending) queues.delete(name); }
}
