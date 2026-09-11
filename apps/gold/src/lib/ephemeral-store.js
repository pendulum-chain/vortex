const DB_NAME = "satoshi-gold-secure";
const DB_VERSION = 1;
const KEY_ID = "device-aes-key";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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

export async function storeEphemeralRampKeys(keys, rampId) {
  if (!window.isSecureContext) throw new Error("Secure HTTPS context required for ramp key recovery.");
  const db = await openDatabase();
  const key = await getDeviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(keys));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  await transactionRequest(db, "ramps", "readwrite", (store) => store.put({ iv, ciphertext, createdAt: Date.now() }, rampId));
  db.close();
}

export async function deleteEphemeralRampKeys(rampId) {
  const db = await openDatabase();
  await transactionRequest(db, "ramps", "readwrite", (store) => store.delete(rampId));
  db.close();
}
