import { createActiveRampStore } from "@vortexfi/consumer-kit";

// Same keys; the shared store reads legacy single records and isolates unfinished orders by wallet.
export const goldRampStore = createActiveRampStore({ activeKey: "satoshi:gold:active-ramp:v1", historyKey: "satoshi:gold:history:v1" });
// Only createdAt carries over. A save without a stage means "registered", as before the shared
// store: inheriting the SDK callback's "registering" would hide a registered buy's Pix QR on resume.
export function saveActiveRamp(record) {
  const existing = goldRampStore.get(record.walletAddress);
  return goldRampStore.save({ ...record, createdAt: record.createdAt ?? existing?.createdAt ?? Date.now() });
}
export const saveTransactionCheckpoint = (id, phase, hash) => goldRampStore.checkpoint(id, phase, hash);
export const getActiveRamp = (owner) => goldRampStore.get(owner);
export const clearActiveRamp = (id) => goldRampStore.clear(id);
export const addRampHistory = (item) => goldRampStore.addHistory(item);
export const getRampHistory = (owner) => goldRampStore.history(owner);
export function failActiveRamp(id) {
  let all;
  try { all = JSON.parse(localStorage.getItem("satoshi:gold:active-ramp:v1") || "null"); } catch { return; }
  const record = all?.rampId === id ? all : Object.values(all || {}).find((r) => r?.rampId === id);
  if (!record) return;
  const { walletAddress, inputAmount, outputAmount, rampType, network, paymentMethod } = record;
  addRampHistory({ rampId: id, walletAddress, inputAmount, outputAmount, rampType, status: "failed", ...(network ? { network } : {}), ...(paymentMethod ? { paymentMethod } : {}) });
  clearActiveRamp(id);
}
