// Device-local recovery state, lifted from Gold (apps/gold/src/lib/pilot-store.js and
// ephemeral-store.js). Keys and the IndexedDB name are injected so Gold can adopt this with its
// existing keys: renaming them would orphan active-ramp recovery records and encrypted keys.
import { local } from "./storage.js";

const SAVE_FAILED = "Não foi possível salvar a operação. Pare e contate o suporte.";

/**
 * One active ramp per wallet on this device (+ transaction-hash checkpoints) and the last completed ramps.
 * Stored as {[wallet (lowercase)]: record}, so one wallet's unfinished ramp never blocks another.
 * record: {rampId, walletAddress (lowercase), rampType, stage: "registering"|"registered"|"signing"|"ready",
 *          inputAmount, outputAmount, transactions:{[phase]:hash}, createdAt, ...extra}
 * (extra: app fields such as Stocks' symbol and tokenAddress; they never override the fields above)
 * @param {{activeKey:string, historyKey:string, historyLimit?:number, storage?:ReturnType<typeof import("./storage.js").createJsonStorage>}} cfg
 */
export function createActiveRampStore({ activeKey, historyKey, historyLimit = 12, storage = local }) {
  if (!activeKey || !historyKey) throw new Error("createActiveRampStore needs an activeKey and a historyKey.");
  // Recovery data must fail closed: a lost record could leave a paid ramp unrecoverable.
  const write = (key, value) => { if (!storage.set(key, value)) throw new Error(SAVE_FAILED); };

  // A rampId at the top level is the single record earlier builds stored, still on users' devices:
  // it reads as its wallet's entry, and the next write stores the map.
  function readActive() {
    const value = storage.get(activeKey, null);
    if (!value || typeof value !== "object") return {};
    return value.rampId ? { [value.walletAddress?.toLowerCase()]: value } : value;
  }
  const walletOf = (active, rampId) => Object.keys(active).find((wallet) => active[wallet]?.rampId === rampId);

  function save({ rampId, walletAddress, inputAmount, outputAmount, rampType = "BUY", stage = "registered", createdAt = Date.now(), ...extra }) {
    const active = readActive();
    const wallet = walletAddress?.toLowerCase();
    const existing = active[wallet];
    if (existing && existing.rampId !== rampId) {
      const error = new Error("Há uma operação em andamento nesta carteira. Conclua-a antes de começar outra.");
      error.code = "RAMP_IN_PROGRESS";
      throw error;
    }
    const record = { ...extra, rampId, walletAddress: wallet, inputAmount: String(inputAmount || ""), outputAmount: String(outputAmount || ""), rampType, stage, transactions: existing?.transactions || {}, createdAt };
    write(activeKey, { ...active, [wallet]: record });
    return record;
  }

  function checkpoint(rampId, phase, hash) {
    const active = readActive();
    const wallet = walletOf(active, rampId);
    if (!wallet) throw new Error(SAVE_FAILED);
    write(activeKey, { ...active, [wallet]: { ...active[wallet], transactions: { ...active[wallet].transactions, [phase]: hash } } });
  }

  function get(walletAddress) {
    return (walletAddress && readActive()[walletAddress.toLowerCase()]) || null;
  }

  // Only a named ramp leaves the store, so a status response without an id can never clear a record.
  function clear(rampId) {
    const active = readActive();
    const wallet = walletOf(active, rampId);
    if (!wallet) return;
    delete active[wallet];
    if (Object.keys(active).length) storage.set(activeKey, active);
    else storage.remove(activeKey);
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

  return { save, checkpoint, get, hasActive: () => Object.keys(readActive()).length > 0, clear, addHistory, history };
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
