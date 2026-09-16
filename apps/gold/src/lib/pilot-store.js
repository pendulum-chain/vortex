const ACTIVE_KEY = "satoshi:gold:active-ramp:v1";
const HISTORY_KEY = "satoshi:gold:history:v1";

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

export function saveActiveRamp({ rampId, walletAddress, inputAmount, outputAmount, rampType = "BUY", stage = "registered", createdAt = Date.now() }) {
  const existing = read(ACTIVE_KEY, null);
  const safe = { rampId, walletAddress: walletAddress?.toLowerCase(), inputAmount: String(inputAmount || ""), outputAmount: String(outputAmount || ""), rampType, stage, transactions: existing?.rampId === rampId ? existing.transactions || {} : {}, createdAt };
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(safe));
  return safe;
}

export function saveTransactionCheckpoint(rampId, phase, hash) {
  const active = read(ACTIVE_KEY, null);
  if (active?.rampId !== rampId) throw new Error("Não foi possível salvar a operação. Pare e contate o suporte.");
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...active, transactions: { ...active.transactions, [phase]: hash } }));
}

export function getActiveRamp(walletAddress) {
  const active = read(ACTIVE_KEY, null);
  if (!active || !walletAddress || active.walletAddress !== walletAddress.toLowerCase()) return null;
  return active;
}

export function clearActiveRamp(rampId) {
  const active = read(ACTIVE_KEY, null);
  if (!rampId || active?.rampId === rampId) localStorage.removeItem(ACTIVE_KEY);
}

export function addRampHistory(item) {
  const history = read(HISTORY_KEY, []);
  const next = [{ ...item, completedAt: Date.now() }, ...history.filter((entry) => entry.rampId !== item.rampId)].slice(0, 12);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function getRampHistory(walletAddress) {
  return read(HISTORY_KEY, []).filter((item) => item.walletAddress === walletAddress?.toLowerCase());
}
