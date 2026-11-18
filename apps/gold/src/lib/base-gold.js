import { createApi, createVortexClient, submitWalletTransactions, withConsumerLock, RAMP_START_WINDOW_MS } from "@vortexfi/consumer-kit";
import { createPublicClient, decodeFunctionData, formatUnits, http, parseAbi, parseUnits } from "viem";
import { base } from "viem/chains";
import { BASE_USDC, GOLD_ASSETS } from "./gold-config.js";
import { goldRampStore } from "./pilot-store.js";
import { storeEphemeralRampKeys } from "./ephemeral-store.js";
import { getFreshAccessToken, VORTEX_API_BASE, classifyRamp } from "./vortex.js";

export const BASE_PAXG = GOLD_ASSETS.base;
export const GOLD_SOURCE_PHASE = "goldPermitTransfer";
const ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)", "function nonces(address owner) view returns (uint256)", "function transfer(address to, uint256 amount)"]);
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export function amountRaw(value, decimals) {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(String(value))) fail("INVALID_AMOUNT", "Informe um valor válido.");
  const raw = parseUnits(String(value), decimals);
  if (raw <= 0n) fail("INVALID_AMOUNT", "Informe um valor maior que zero.");
  return raw;
}

export function baseGoldRequest({ direction, paymentMethod = "pix", amount, owner }) {
  if (!["BUY", "SELL"].includes(direction) || !["pix", "usdc"].includes(paymentMethod)) fail("WRONG_ROUTE", "Operação indisponível.");
  const buy = direction === "BUY", usdc = paymentMethod === "usdc";
  amountRaw(amount, buy ? (usdc ? 6 : 2) : 18);
  return { rampType: direction, from: buy ? (usdc ? "base" : "pix") : "base", to: buy ? "base" : (usdc ? "base" : "pix"), network: "base", inputCurrency: buy ? (usdc ? "USDC" : "BRL") : "PAXG", outputCurrency: buy ? "PAXG" : (usdc ? "USDC" : "BRL"), inputAmount: String(amount), paymentMethod, ...(usdc ? {} : { countryCode: "BR" }), ...(owner ? { destinationAddress: owner } : {}) };
}

export function validateBaseGoldQuote(raw, request, now = Date.now()) {
  for (const field of ["rampType", "from", "to", "network", "inputCurrency", "outputCurrency", "paymentMethod"]) if (raw?.[field] !== request[field]) fail("WRONG_ROUTE", "A cotação não corresponde à operação solicitada.");
  const crypto = request.paymentMethod === "usdc", buy = request.rampType === "BUY";
  const sourceDecimals = buy ? (crypto ? 6 : 2) : 18;
  if (amountRaw(raw.inputAmount, sourceDecimals) !== amountRaw(request.inputAmount, sourceDecimals)) fail("AMOUNT_MISMATCH", "O valor da cotação mudou. Confira uma nova cotação.");
  amountRaw(raw.outputAmount, buy ? 18 : (crypto ? 6 : 2));
  if (!raw.id || !Number.isFinite(Date.parse(raw.expiresAt)) || Date.parse(raw.expiresAt) <= now) fail("INVALID_QUOTE", "A cotação expirou. Atualize antes de confirmar.");
  const currency = crypto ? "USDC" : "BRL", decimals = crypto ? 6 : 2;
  if (raw.feeCurrency !== currency) fail("INVALID_FEES", "Não foi possível confirmar a moeda das taxas.");
  let sum = 0n;
  const feeRaw = value => {
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(String(value ?? ""))) fail("INVALID_FEES", "Não foi possível confirmar as taxas.");
    return parseUnits(String(value), decimals);
  };
  for (const f of ["networkFeeFiat", "processingFeeFiat", "partnerFeeFiat"]) sum += feeRaw(raw[f]);
  const total = feeRaw(raw.totalFeeFiat);
  if (sum !== total || (buy && total >= amountRaw(raw.inputAmount, decimals))) fail("INVALID_FEES", "As taxas não conferem. Atualize a cotação.");
  if (feeRaw(raw.partnerFeeFiat) !== 0n || Number(raw.gasReserveAmount || 0) !== 0) fail("INVALID_FEES", "A cotação inclui um adicional não previsto. Atualize antes de confirmar.");
  // Crypto orders must not invoke a fiat ramp or acquire permission through a hidden fee path.
  if (crypto && (raw.anchorFeeFiat == null || feeRaw(raw.anchorFeeFiat) !== 0n)) fail("WRONG_ROUTE", "Esta operação não pode incluir uma conversão bancária.");
  if ((!buy || crypto) && raw.gasless !== true) fail("ROUTE_NOT_READY", "Esta rota ainda não está pronta para a confirmação pela carteira.");
  return { ...raw, rawQuote: raw, grams: Number(buy ? raw.outputAmount : raw.inputAmount) * 31.1034768, expiresAt: Date.parse(raw.expiresAt), direction: request.rampType, paymentMethod: request.paymentMethod, currency };
}

export function assertBaseDelivery(ramp, record, owner) {
  const destination = record.rampType === "BUY" ? BASE_PAXG : BASE_USDC;
  const deliveries = (ramp?.unsignedTxs || []).filter(t => t.phase === "destinationTransfer");
  try {
    const tx = deliveries[0];
    const decoded = decodeFunctionData({ abi: ABI, data: tx.txData.data });
    if (deliveries.length !== 1 || tx.network !== "base" || !same(tx.txData.to, destination.address) || BigInt(tx.txData.value || 0) !== 0n || tx.txData.data.length !== 138 || decoded.functionName !== "transfer" || !same(decoded.args[0], owner) || decoded.args[1] !== amountRaw(record.outputAmount, destination.decimals) || ramp.quoteId !== record.quoteId || String(ramp.type) !== record.rampType || amountRaw(ramp.inputAmount, record.inputDecimals) !== amountRaw(record.inputAmount, record.inputDecimals)) throw new Error();
  } catch { fail("WRONG_DELIVERY", "A entrega não corresponde a esta operação. Não confirme nada e guarde o código para o suporte."); }
}

// Gold reuses Stocks' SDK presigning, consumer lock and bounded source-permit policy. The Base
// corridor is independently disabled until the API exposes the pinned token and matching quotes.
export function createBaseGoldAdapter({ enabled = false, usdcEnabled = false, apiBase = VORTEX_API_BASE, reader, api, createClient = createVortexClient, store = goldRampStore, ephemeralStore = { put: storeEphemeralRampKeys }, now = Date.now } = {}) {
  const chain = reader || createPublicClient({ chain: base, transport: http() });
  const publicApi = api || createApi({ apiBase });
  let sdkPromise, pending;
  const requireEnabled = method => { if (!enabled || (method === "usdc" && !usdcEnabled)) fail("ROUTE_NOT_ENABLED", "Esta forma de pagamento estará disponível em breve."); };
  const client = () => sdkPromise ?? (sdkPromise = Promise.resolve(createClient({ apiBase, session: { getFreshAccessToken }, ephemeralStore, onBeforeEphemeralsStored: (rampId, ephemeralEvmAddress) => {
    if (!pending || !ephemeralEvmAddress) fail("RECOVERY_UNAVAILABLE", "Não foi possível preparar a recuperação desta operação.");
    pending = { ...pending, rampId, ephemeralEvmAddress, stage: "registering" };
    store.save(pending);
  } })).catch(e => { sdkPromise = null; throw e; }));
  async function maintenance() {
    const result = await publicApi("/v1/maintenance/status", { method: "GET" });
    if (result?.is_maintenance_active !== false) fail("MAINTENANCE_UNAVAILABLE", "Não foi possível confirmar a disponibilidade do serviço. Tente novamente em instantes.");
  }
  async function availability(method = "pix") {
    if (!enabled || (method === "usdc" && !usdcEnabled)) return { buy: false, sell: false };
    const response = await publicApi(`/v1/supported-cryptocurrencies?network=base${method === "usdc" ? "&paymentMethod=usdc" : ""}`, { method: "GET" });
    const token = (response.cryptocurrencies || response.tokens || (Array.isArray(response) ? response : [])).find(t => t.assetSymbol === "PAXG" && t.assetNetwork === "base" && t.assetDecimals === 18 && same(t.assetContractAddress, BASE_PAXG.address));
    return { buy: token?.rampTypes?.includes("BUY") === true, sell: token?.rampTypes?.includes("SELL") === true };
  }
  async function balance(owner, token = BASE_USDC) {
    const head = await chain.getBlockNumber();
    if (head < 2n) return 0n;
    return BigInt(await chain.readContract({ address: token.address, abi: ABI, functionName: "balanceOf", args: [owner], blockNumber: head - 2n }));
  }
  async function quote(options) {
    requireEnabled(options.paymentMethod);
    const available = await availability(options.paymentMethod);
    if (!available[options.direction === "BUY" ? "buy" : "sell"]) fail("ROUTE_NOT_READY", "Esta operação está temporariamente indisponível.");
    const request = baseGoldRequest(options);
    return validateBaseGoldQuote(await (await client()).createQuote(request), request, now());
  }
  const owned = (id, owner) => {
    const record = store.get(owner);
    if (record?.rampId !== id || record.network !== "base") fail("RECOVERY_UNAVAILABLE", "Retome a operação no aparelho em que ela foi iniciada.");
    return record;
  };
  function deadline(ramp, record) {
    const end = Math.min(Date.parse(ramp.createdAt || "") + RAMP_START_WINDOW_MS || Infinity, record.createdAt + RAMP_START_WINDOW_MS);
    if (now() >= end - 60_000) fail("START_WINDOW_CLOSED", "O prazo desta autorização terminou. Guarde o código da operação e consulte o suporte.");
  }
  async function sign(ramp, transactions, owner, provider) {
    let record = owned(ramp.id, owner);
    deadline(ramp, record);
    const source = record.rampType === "BUY" ? BASE_USDC : BASE_PAXG;
    const requests = (transactions || []).filter(t => same(t.signer, owner));
    if (requests.length !== 1 || !record.ephemeralEvmAddress) fail("WRONG_SOURCE", "A confirmação recebida não corresponde a esta operação.");
    const nonce = String(await chain.readContract({ address: source.address, abi: ABI, functionName: "nonces", args: [owner] }));
    if (record.permitNonce != null && nonce !== record.permitNonce) fail("RECOVERY_UNAVAILABLE", "Esta autorização já mudou. Guarde o código e consulte o suporte.");
    record = store.save({ ...record, permitNonce: nonce });
    await submitWalletTransactions({ client: await client(), rampId: ramp.id, transactions: requests, from: owner, provider, chain: base, publicClient: chain,
      expect: { network: "base", token: source.address, maxAmountWei: amountRaw(record.inputAmount, source.decimals), spenders: [record.ephemeralEvmAddress], permitNonce: nonce, phases: { [GOLD_SOURCE_PHASE]: ["permit"] } },
      getCheckpoint: (id, phase) => owned(id, owner).transactions?.[phase] ?? null,
      saveCheckpoint: (id, phase, hash) => store.checkpoint(id, phase, hash),
      beforeSign: async () => { await maintenance(); deadline(ramp, owned(ramp.id, owner)); store.save({ ...owned(ramp.id, owner), stage: "signing" }); },
    });
    store.save({ ...owned(ramp.id, owner), stage: "ready" });
  }
  async function register({ quote: q, owner, provider, pixDestination, onRegistered }) {
    requireEnabled(q.paymentMethod);
    const request = baseGoldRequest({ direction: q.direction, paymentMethod: q.paymentMethod, amount: q.inputAmount, owner });
    validateBaseGoldQuote(q.rawQuote, request, now());
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner || "")) fail("WALLET_NOT_READY", "Aguarde a preparação da sua carteira.");
    return withConsumerLock("vortex:gold:register", async () => {
      if (store.get(owner)) fail("RAMP_IN_PROGRESS", "Você tem uma operação em andamento. Retome-a antes de iniciar outra.");
      await maintenance();
      const listing = await availability(q.paymentMethod);
      if (!listing[q.direction === "BUY" ? "buy" : "sell"]) fail("ROUTE_NOT_READY", "Esta operação está temporariamente indisponível.");
      const crypto = q.paymentMethod === "usdc", buy = q.direction === "BUY";
      const source = buy ? BASE_USDC : BASE_PAXG;
      if ((!buy || crypto) && await balance(owner, source) < amountRaw(q.inputAmount, source.decimals)) fail("INSUFFICIENT_BALANCE", "O saldo confirmado não é suficiente. Aguarde o depósito ou escolha um valor menor.");
      if (!buy && !crypto && !String(pixDestination || "").trim()) fail("INVALID_PIX", "Informe sua chave Pix.");
      pending = { walletAddress: owner, inputAmount: q.inputAmount, outputAmount: q.outputAmount, inputDecimals: buy ? (crypto ? 6 : 2) : 18, rampType: q.direction, paymentMethod: q.paymentMethod, network: "base", tokenAddress: BASE_PAXG.address, quoteId: q.id, createdAt: now() };
      try {
        const sdk = await client();
        const extra = buy && !crypto ? { destinationAddress: owner } : { walletAddress: owner, destinationAddress: owner, ...(!crypto ? { pixDestination: String(pixDestination).trim() } : {}) };
        const result = await sdk.registerRamp(q.rawQuote, extra);
        const record = owned(result.rampProcess.id, owner);
        onRegistered?.(result.rampProcess);
        if (buy || crypto) assertBaseDelivery(result.rampProcess, record, owner);
        if (buy && !crypto) {
          if (!result.rampProcess.depositQrCode) fail("PIX_UNAVAILABLE", "O Pix não foi disponibilizado. Guarde o código da operação.");
          store.save({ ...record, stage: "registered" });
        } else await sign(result.rampProcess, result.unsignedTransactions, owner, provider);
        return result.rampProcess;
      } finally { pending = null; }
    });
  }
  async function resume(id, owner, provider) {
    const record = owned(id, owner);
    const ramp = await publicApi(`/v1/ramp/${encodeURIComponent(id)}?showUnsignedTxs=true`, { method: "GET" }, { token: await getFreshAccessToken() });
    if (classifyRamp(ramp) === "failure") fail("RAMP_NEEDS_ATTENTION", "Esta operação precisa de atenção. Guarde o código e consulte o suporte.");
    if (classifyRamp(ramp) === "success" || ramp.currentPhase !== "initial") return ramp;
    if (record.rampType === "BUY" || record.paymentMethod === "usdc") assertBaseDelivery(ramp, record, owner);
    if (record.stage === "registering") fail("RECOVERY_UNAVAILABLE", "O registro precisa ser conferido. Guarde o código da operação.");
    if (!(record.rampType === "BUY" && record.paymentMethod === "pix") && record.stage !== "ready") await sign(ramp, ramp.unsignedTxs, owner, provider);
    return ramp;
  }
  async function start(id, owner) {
    const record = owned(id, owner);
    await maintenance();
    if (record.stage !== "ready" && !(record.rampType === "BUY" && record.paymentMethod === "pix" && record.stage === "registered")) fail("NOT_AUTHORIZED", "Conclua a confirmação desta mesma operação antes de continuar.");
    return (await client()).startRamp(id);
  }
  return { isEnabled: method => enabled && (method !== "usdc" || usdcEnabled), availability, balance, quote, register, resume, start, canPay: async () => { try { await maintenance(); return (await availability("pix")).buy; } catch { return false; } }, getRamp: async id => (await client()).getRampStatus(id) };
}
