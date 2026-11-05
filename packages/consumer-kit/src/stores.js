// Device-local recovery state, lifted from Gold (apps/gold/src/lib/pilot-store.js and
// ephemeral-store.js). Keys and the IndexedDB name are injected so Gold can adopt this with its
// existing keys: renaming them would orphan active-ramp recovery records and encrypted keys.
import { local } from "./storage.js";

const SAVE_FAILED = "Não foi possível salvar a operação. Pare e contate o suporte.";

/**
 * One active ramp per device (+ transaction-hash checkpoints) and the last completed ramps.
 * record: {rampId, walletAddress (lowercase), rampType, stage: "registering"|"registered"|"signing"|"ready",
 *          inputAmount, outputAmount, transactions:{[phase]:hash}, createdAt, ...extra}
 * (extra: app fields such as Stocks' symbol and tokenAddress; they never override the fields above)
 * @param {{activeKey:string, historyKey:string, historyLimit?:number, storage?:ReturnType<typeof import("./storage.js").createJsonStorage>}} cfg
 */
export function createActiveRampStore({ activeKey, historyKey, historyLimit = 12, storage = local }) {
  if (!activeKey || !historyKey) throw new Error("createActiveRampStore needs an activeKey and a historyKey.");
  // Recovery data must fail closed: a lost record could leave a paid ramp unrecoverable.
  const write = (key, value) => { if (!storage.set(key, value)) throw new Error(SAVE_FAILED); };

  function save({ rampId, walletAddress, inputAmount, outputAmount, rampType = "BUY", stage = "registered", createdAt = Date.now(), ...extra }) {
    const existing = storage.get(activeKey, null);
    if (existing && (existing.rampId !== rampId || existing.walletAddress !== walletAddress?.toLowerCase())) {
      const error = new Error("Há uma operação em andamento neste aparelho. Conclua-a antes de começar outra.");
      error.code = "RAMP_IN_PROGRESS";
      throw error;
    }
    const record = { ...extra, rampId, walletAddress: walletAddress?.toLowerCase(), inputAmount: String(inputAmount || ""), outputAmount: String(outputAmount || ""), rampType, stage, transactions: existing?.rampId === rampId ? existing.transactions || {} : {}, createdAt };
    write(activeKey, record);
    return record;
  }

  function checkpoint(rampId, phase, hash) {
    const active = storage.get(activeKey, null);
    if (active?.rampId !== rampId) throw new Error(SAVE_FAILED);
    write(activeKey, { ...active, transactions: { ...active.transactions, [phase]: hash } });
  }

  function get(walletAddress) {
    const active = storage.get(activeKey, null);
    if (!active || !walletAddress || active.walletAddress !== walletAddress.toLowerCase()) return null;
    return active;
  }

  function clear(rampId) {
    const active = storage.get(activeKey, null);
    if (!rampId || active?.rampId === rampId) storage.remove(activeKey);
  }

  function addHistory(item) {
    const previous = storage.get(historyKey, []);
    const next = [{ ...item, completedAt: Date.now() }, ...previous.filter((entry) => entry.rampId !== item.rampId)].slice(0, historyLimit);
    write(historyKey, next);
    return next;
  }

  function history(walletAddress) {
    return storage.get(historyKey, []).filter((item) => item.walletAddress === walletAddress?.toLowerCase());
  }

  return { save, checkpoint, get, hasActive: () => Boolean(storage.get(activeKey, null)), clear, addHistory, history };
}

const DB_VERSION = 1;
const KEY_ID = "device-aes-key";

/**
 * Encrypted ephemeral ramp keys: a non-extractable AES-GCM device key in IndexedDB. Needs a
 * secure context (HTTPS or localhost). Each app uses its own database (e.g. "satoshi-stocks-secure").
 */
export function createEphemeralStore(dbName) {
  if (!dbName) throw new Error("createEphemeralStore needs a database name.");

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("ramps")) db.createObjectStore("ramps");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionRequest(db, storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error("Secure storage transaction aborted"));
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  }

  async function getDeviceKey(db) {
    let key = await transactionRequest(db, "meta", "readonly", (store) => store.get(KEY_ID));
    if (!key) {
      key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await transactionRequest(db, "meta", "readwrite", (store) => store.put(key, KEY_ID));
    }
    return key;
  }

  async function put(keys, rampId) {
    if (globalThis.isSecureContext !== true) throw new Error("Secure HTTPS context required for ramp key recovery.");
    const db = await openDatabase();
    try {
      const key = await getDeviceKey(db);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(JSON.stringify(keys));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
      await transactionRequest(db, "ramps", "readwrite", (store) => store.put({ iv, ciphertext, createdAt: Date.now() }, rampId));
    } finally { db.close(); }
  }

  async function remove(rampId) {
    const db = await openDatabase();
    try { await transactionRequest(db, "ramps", "readwrite", (store) => store.delete(rampId)); }
    finally { db.close(); }
  }

  return { put, delete: remove };
}
