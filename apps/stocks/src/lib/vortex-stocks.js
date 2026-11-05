// The Vortex implementation of the ramp adapter. It ASSUMES the contract handed to
// the Vortex team (§5.7.3): network "robinhood" (chain 4663) in /v1/quotes and
// /v1/supported-cryptocurrencies, and the Stock Token identified by its contract address in
// outputCurrency (BUY) / inputCurrency (SELL). The network name is configurable (VITE_STOCKS_NETWORK);
// the token id is always the allowlisted address, so a quote is pinned to it (never to a symbol,
// which a same-symbol lookalike could share).
// Gated: while VITE_STOCKS_RAMP_ENABLED is off it makes NO ramp calls and answers "not enabled";
// getRamp/pollStatus still work so a ramp registered while it was on can finish. While the API
// does not know the network (today: 400 "Invalid network" / "Unable to determine network"), the
// UI shows the same "em breve" state. Quotes are validated fail-closed before anything is shown.
// Gas reserve: a BUY quote request names the wallet (destinationAddress) so
// Vortex can skip the reserve for a funded wallet; a quote may then carry gasReserveAmount/Currency/
// Fiat/Usd, already inside the network and total fees. Without those fields nothing changes.
import { RAMP_START_WINDOW_MS, createApi, createVortexClient, getRampWithUnsignedTxs, pollRamp, robinhoodChain, startRampSafely, submitWalletTransactions, withConsumerLock } from "@vortexfi/consumer-kit";
import { formatUnits, parseUnits } from "viem";
import { gasReserveFeeProblem, gasShortfallPt, networkFeeWithoutReserve, parseGasReserve, sellGasNoticePt, sellGasRequiredWei } from "./gas-reserve.js";
import { createRobinhoodClient, readTokenBalance } from "./portfolio.js";
import { providerCostProblem } from "./provider-costs.js";
import { assertMaintenanceAvailable, createMaintenanceReader } from "./maintenance.js";
import { StocksRampError, assertNoOtherActiveRamp, isNetworkNotSupportedError, mapRampError, settleRamp, toStockRamp, uniformAvailability } from "./ramp-contract.js";
import { STOCK_TOKENS } from "./stocks.js";
import { assertSellBalance, tokensToWei } from "./token.js";

export const AVAILABILITY_TTL_MS = 60_000;
// A resumed sell is not signed within this margin of its start deadline: the wallet confirmation,
// its receipt and startRamp must all fit before the API refuses the start.
export const RESUME_SIGN_MARGIN_MS = 60_000;

const SELL_EXPIRED_PT = "O prazo para confirmar esta venda terminou, e nada saiu da sua carteira. Comece uma nova venda.";
const SELL_EXPIRED_AFTER_BROADCAST_PT = "O prazo para iniciar esta venda terminou, e uma transação dela já tinha saído da sua carteira. Consulte o suporte com o código da operação antes de fazer outra operação.";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Mirrors Gold's buildPaxgBuyRequest. outputId = the token's contract address. destinationAddress
 * (proposed) is the user's wallet, sent only when it is a well-formed address: Vortex
 * reads its ETH balance to decide on the gas reserve (without it, the full reserve is quoted).
 * Today's API ignores unknown quote fields (validateCreateQuoteInput checks only the required ones).
 */
export function buildStockBuyRequest({ network, outputId, brlAmount, destinationAddress = null }) {
  const request = { rampType: "BUY", from: "pix", to: network, inputAmount: String(brlAmount), inputCurrency: "BRL", outputCurrency: outputId, paymentMethod: "pix", countryCode: "BR", network };
  return EVM_ADDRESS.test(String(destinationAddress ?? "")) ? { ...request, destinationAddress } : request;
}

export function buildStockSellRequest({ network, inputId, tokenAmount }) {
  return { rampType: "SELL", from: network, to: "pix", inputAmount: tokenAmount, inputCurrency: inputId, outputCurrency: "BRL", paymentMethod: "pix", countryCode: "BR", network };
}

const DECIMAL = /^\d+(?:\.\d{1,18})?$/;
/** A plain decimal with at most 18 decimals -> canonical string ("1.50" -> "1.5"), else null. */
function canonicalAmount(value) {
  const text = String(value ?? "").trim();
  return DECIMAL.test(text) ? formatUnits(parseUnits(text, 18), 18) : null;
}

const FEE_FIELDS = ["networkFeeFiat", "processingFeeFiat", "partnerFeeFiat", "totalFeeFiat"];
const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Fail-closed quote check (generalises Gold's validatePaxgQuote). Throws StocksRampError:
 * WRONG_ROUTE, INVALID_QUOTE, INVALID_FEES or AMOUNT_MISMATCH (a quote must never buy or sell a
 * different amount than the user typed). A gas reserve (PROPOSED fields) must be well-formed ETH
 * (at most GAS_RESERVE_MAX_WEI), on a BUY only, and inside networkFeeFiat and totalFeeFiat, with the
 * fees below the amount paid (INVALID_FEES); it is never added on top of the amount typed
 * (AMOUNT_MISMATCH). Quotes without it are checked exactly as before.
 * @param {{direction:"BUY"|"SELL", network:string, id:string, requested:number|string, now?:number}} expected
 *   requested: BUY the BRL amount, SELL the decimal token amount
 */
export function validateStockQuote(quote, { direction, network, id, requested, now = Date.now() }) {
  const buy = direction === "BUY";
  const route = quote?.rampType === direction && quote.network === network
    && quote.from === (buy ? "pix" : network) && quote.to === (buy ? network : "pix")
    && (buy ? quote.inputCurrency === "BRL" && sameId(quote.outputCurrency, id) : sameId(quote.inputCurrency, id) && quote.outputCurrency === "BRL");
  if (!route) throw new StocksRampError("WRONG_ROUTE");
  // Locked pilot policy. This is a proposed backend response field, not a client routing hint
  // that today's API could silently ignore. Existing registered ramps can still be recovered.
  if (quote.routingStrategy !== "direct") throw new StocksRampError("WRONG_ROUTE", "A rota direta ainda não foi confirmada pela Vortex. Tente novamente mais tarde.");
  const expiresAt = Date.parse(quote.expiresAt);
  const tokenAmount = canonicalAmount(buy ? quote.outputAmount : quote.inputAmount);
  const output = Number(quote.outputAmount);
  if (!quote.id || !Number.isFinite(output) || output <= 0 || !Number.isFinite(expiresAt) || expiresAt <= now || tokenAmount === null) throw new StocksRampError("INVALID_QUOTE");
  for (const field of FEE_FIELDS) {
    if (quote[field] == null || String(quote[field]).trim() === "" || typeof quote[field] === "boolean" || !Number.isFinite(Number(quote[field])) || Number(quote[field]) < 0) throw new StocksRampError("INVALID_FEES");
  }
  const componentTotal = Number(quote.networkFeeFiat) + Number(quote.processingFeeFiat) + Number(quote.partnerFeeFiat);
  if (Math.abs(componentTotal - Number(quote.totalFeeFiat)) > 0.010000001 || (buy && Number(quote.totalFeeFiat) >= Number(quote.inputAmount))) throw new StocksRampError("INVALID_FEES");
  if (quote.feeCurrency !== "BRL") throw new StocksRampError("INVALID_FEES", "As taxas não estão em reais.");
  if (Number(quote.partnerFeeFiat) !== 0) throw new StocksRampError("INVALID_FEES", "Esta cotação inclui uma taxa adicional do produto. Atualize a cotação: este produto não cobra esse adicional.");
  let reserve;
  try { reserve = parseGasReserve(quote); } catch { throw new StocksRampError("INVALID_FEES"); }
  if (reserve && (!buy || gasReserveFeeProblem(quote, reserve))) throw new StocksRampError("INVALID_FEES");
  if (providerCostProblem(quote, reserve)) throw new StocksRampError("INVALID_FEES");
  const matches = buy
    ? Number(quote.inputAmount) === Number(requested)
    : (() => { try { return parseUnits(tokenAmount, 18) === tokensToWei(requested); } catch { return false; } })();
  if (!matches) throw new StocksRampError("AMOUNT_MISMATCH");
}

/**
 * A validated Vortex quote -> StockQuote. fees.service = processing + partner (as Gold). With a gas
 * reserve, fees.network is the network fee without it (the reserve is its own line) and fees.total
 * stays totalFeeFiat, the all-in cost that already includes it.
 */
export function normalizeStockQuote(raw, token, direction) {
  const buy = direction === "BUY";
  const tokenAmount = canonicalAmount(buy ? raw.outputAmount : raw.inputAmount);
  const brlAmount = Number(buy ? raw.inputAmount : raw.outputAmount);
  const gasReserve = buy ? parseGasReserve(raw) : null;
  const fees = { network: networkFeeWithoutReserve(raw.networkFeeFiat, gasReserve), service: Number(raw.processingFeeFiat) + Number(raw.partnerFeeFiat), total: Number(raw.totalFeeFiat), currency: "BRL" };
  const tokens = Number(tokenAmount);
  return {
    id: String(raw.id),
    direction,
    symbol: token.symbol,
    tokenAddress: token.address,
    brlAmount,
    tokenAmount,
    tokenAmountWei: parseUnits(tokenAmount, 18).toString(),
    fees,
    impliedBrlPerToken: tokens > 0 ? (buy ? brlAmount - fees.total : brlAmount + fees.total) / tokens : Number.NaN,
    expiresAt: Date.parse(raw.expiresAt),
    gasless: raw.gasless === true, // ASSUMED future field (permit-based sell); false until Vortex says so
    gasReserve,
    simulated: false,
    rawQuote: raw,
  };
}

/**
 * /v1/supported-cryptocurrencies?network=<network> -> AvailabilityMap. A token counts only on the
 * canonical address with 18 decimals on this network; the same symbol at another address is
 * "address_mismatch" (never trusted, see the LI.FI lookalikes).
 */
export function mapAvailability(response, { network, tokens = STOCK_TOKENS, warn = () => {} }) {
  const list = Array.isArray(response) ? response : response?.tokens || response?.cryptocurrencies || [];
  const map = {};
  for (const token of tokens) {
    const listed = list.find((item) => item?.assetNetwork === network && sameId(item.assetContractAddress, token.address) && item.assetDecimals === 18);
    if (listed) {
      const buy = listed.rampTypes?.includes("BUY") === true;
      const sell = listed.rampTypes?.includes("SELL") === true;
      map[token.symbol] = Object.freeze({ buy, sell, reason: buy || sell ? null : "token_not_listed" });
    } else if (list.some((item) => item?.assetNetwork === network && String(item.assetSymbol || "").toUpperCase() === token.symbol)) {
      warn(`Vortex lists ${token.symbol} on ${network} with a different address or decimals than the allowlist; it stays unavailable.`);
      map[token.symbol] = Object.freeze({ buy: false, sell: false, reason: "address_mismatch" });
    } else {
      map[token.symbol] = Object.freeze({ buy: false, sell: false, reason: "token_not_listed" });
    }
  }
  return Object.freeze(map);
}

const devWarn = (message) => { if (import.meta.env?.DEV) console.warn(message); };

/**
 * mapRampError, plus the kit's wallet check right before a sell transaction (INSUFFICIENT_NATIVE_GAS)
 * in the gas-reserve wording (INSUFFICIENT_GAS): an empty wallet vs. a fee spike.
 */
export function mapStocksError(error) {
  if (error?.code === "INSUFFICIENT_NATIVE_GAS") return new StocksRampError("INSUFFICIENT_GAS", gasShortfallPt(error.details), { details: error.details ?? null, cause: error });
  return mapRampError(error);
}

/**
 * @param {{ enabled?:boolean, network?:string, apiBase:string, publicKey?:string,
 *   session:ReturnType<typeof import("@vortexfi/consumer-kit").createVortexSession>,
 *   kyc:ReturnType<typeof import("@vortexfi/consumer-kit").createBrazilKyc>,
 *   activeRampStore:ReturnType<typeof import("@vortexfi/consumer-kit").createActiveRampStore>,
 *   ephemeralStore:{put:Function}, rpcOverride?:string,
 *   api?:Function, createClient?:Function, readBalance?:Function, tokens?:ReadonlyArray<object>,
 *   now?:()=>number, availabilityTtlMs?:number, warn?:(message:string)=>void }} deps
 *   api/createClient/readBalance are injectable for tests (defaults: kit createApi, kit createVortexClient, a chain read).
 */
export function createVortexStocksAdapter({
  enabled = false, network = "robinhood", apiBase, publicKey = "",
  session, kyc, activeRampStore, ephemeralStore, rpcOverride = "",
  api, createClient = createVortexClient, readBalance, tokens = STOCK_TOKENS,
  now = Date.now, availabilityTtlMs = AVAILABILITY_TTL_MS, warn = devWarn,
  sellSigningPolicy = null,
  readMaintenance,
} = {}) {
  const getMaintenanceStatus = readMaintenance ?? createMaintenanceReader({ apiBase, publicKey, api });
  let listingApi = api ?? null;
  let clientPromise = null;
  let pendingRecovery = null;
  let availabilityCache = null;
  let availabilityInFlight = null;
  let chainReader = null;

  const requireEnabled = () => { if (!enabled) throw new StocksRampError("STOCKS_RAMP_NOT_ENABLED"); };
  // No production policy exists until the Robinhood SELL contract is reviewed. A backend response
  // cannot enable signing or choose its own trusted recipients/phases.
  const requireSellPolicy = () => {
    if (!sellSigningPolicy?.spenders?.length || !sellSigningPolicy.phases) throw new StocksRampError("SELL_NOT_ENABLED", "A venda ainda aguarda a confirmação da rota segura pela Vortex.");
  };
  const findAllowed = (symbol) => {
    const token = tokens.find((item) => item.symbol === String(symbol || "").toUpperCase());
    if (!token) throw new StocksRampError("TOKEN_NOT_ALLOWED");
    return token;
  };
  const guarded = (fn) => async (...args) => {
    try { return await fn(...args); } catch (error) { throw mapStocksError(error); }
  };

  // One SDK client per adapter, created at the first real use (the SDK chunk is 3.5 MB). As in
  // Gold, the active ramp is stored with stage "registering" BEFORE the ephemeral keys; if that
  // write fails (or another tab stored an operation meanwhile) the callback rejects and the SDK
  // does not store keys for the ramp.
  function client() {
    if (!clientPromise) {
      clientPromise = Promise.resolve(createClient({
        apiBase, publicKey, session, ephemeralStore,
        onBeforeEphemeralsStored: (rampId) => {
          if (!pendingRecovery) return;
          assertNoOtherActiveRamp(activeRampStore, pendingRecovery.walletAddress, rampId);
          activeRampStore.save({ ...pendingRecovery, rampId, stage: "registering" });
        },
      })).catch((error) => { clientPromise = null; throw error; });
    }
    return clientPromise;
  }

  async function withRecovery(recovery, register) {
    return withConsumerLock("vortex:stocks:register", async () => {
      assertNoOtherActiveRamp(activeRampStore, recovery.walletAddress);
      pendingRecovery = recovery;
      try { return await register(); } finally { pendingRecovery = null; }
    });
  }

  // Chain reads (sell balance, receipts) always target Robinhood Chain: the wallet's client only
  // when it is on 4663, else a plain http client (never whatever chain the wallet is on right now).
  function robinhoodReader(wallet) {
    if (wallet?.publicClient?.chain?.id === robinhoodChain.id) return wallet.publicClient;
    if (!chainReader) chainReader = createRobinhoodClient({ rpcOverride });
    return chainReader;
  }

  const defaultReadBalance = ({ owner, token, wallet }) => readTokenBalance({ client: robinhoodReader(wallet), owner, token });

  // Right before registering, from fresh reads: a registered sell holds this device's one operation
  // for up to an hour (the kit's abandoned-ramp rule), so a wallet whose ETH cannot pay its transfer
  // must be refused while a new purchase can still top the reserve up. Throws
  // INSUFFICIENT_GAS with {balanceWei, requiredWei}; nothing is registered.
  async function assertSellGas(walletAddress, wallet) {
    const client = robinhoodReader(wallet);
    const [balanceWei, gasPriceWei] = await Promise.all([client.getBalance({ address: walletAddress }), client.getGasPrice()]);
    const requiredWei = sellGasRequiredWei(gasPriceWei);
    const notice = sellGasNoticePt({ ethWei: balanceWei, requiredWei });
    if (notice.needsEth) throw new StocksRampError("INSUFFICIENT_GAS", notice.text, { details: { balanceWei: String(balanceWei), requiredWei: String(requiredWei) } });
  }

  const checkpointsFor = (walletAddress) => ({
    getCheckpoint: (rampId, phase) => {
      const active = activeRampStore.get(walletAddress);
      return active?.rampId === rampId ? active.transactions?.[phase] ?? null : null;
    },
    saveCheckpoint: (rampId, phase, hash) => activeRampStore.checkpoint(rampId, phase, hash),
  });

  const ownRequests = (unsignedTxs, walletAddress) => (unsignedTxs || []).filter((tx) => String(tx?.signer || "").toLowerCase() === walletAddress.toLowerCase());

  function assertSellDeadline(ramp, record) {
    const deadline = Math.min(ramp.startDeadline ?? Infinity, Number(record?.createdAt ?? now()) + RAMP_START_WINDOW_MS);
    if (now() < deadline - RESUME_SIGN_MARGIN_MS) return;
    const broadcast = Object.values(record?.transactions ?? {}).some(Boolean);
    if (!broadcast) settle({ ...ramp, classification: "failure" }, record.walletAddress);
    throw new StocksRampError("SELL_EXPIRED", broadcast ? SELL_EXPIRED_AFTER_BROADCAST_PT : SELL_EXPIRED_PT, { details: { rampId: ramp.id, broadcast } });
  }

  async function signOnRobinhoodChain(sdk, rampId, unsignedTxs, walletAddress, wallet, expect, ramp) {
    requireSellPolicy();
    const own = ownRequests(unsignedTxs, walletAddress);
    await submitWalletTransactions({ client: sdk, rampId, transactions: own, expect: { ...sellSigningPolicy, ...expect, network }, beforeSign: async () => { await assertMaintenanceAvailable(getMaintenanceStatus); assertSellDeadline(ramp, activeRampStore.get(walletAddress)); }, from: walletAddress, provider: wallet.provider, chain: robinhoodChain, publicClient: robinhoodReader(wallet), ...checkpointsFor(walletAddress) });
  }

  const settle = (ramp, walletAddress) => { settleRamp(activeRampStore, ramp, { walletAddress }); return ramp; };

  async function getAvailability({ force = false } = {}) {
    if (!enabled) return uniformAvailability(tokens, "not_enabled");
    if (!force && availabilityCache && now() - availabilityCache.at < availabilityTtlMs) return availabilityCache.map;
    if (availabilityInFlight) return availabilityInFlight;
    if (!listingApi) listingApi = createApi({ apiBase, publicKey });
    availabilityInFlight = Promise.resolve()
      .then(() => listingApi(`/v1/supported-cryptocurrencies?network=${encodeURIComponent(network)}`, { method: "GET" }))
      .then((response) => {
        const map = mapAvailability(response, { network, tokens, warn });
        availabilityCache = { at: now(), map };
        return map;
      }, (error) => {
        if (!isNetworkNotSupportedError(error)) return uniformAvailability(tokens, "error"); // not cached: retried on the next poll
        const map = uniformAvailability(tokens, "network_not_supported");
        availabilityCache = { at: now(), map };
        return map;
      })
      .finally(() => { availabilityInFlight = null; });
    return availabilityInFlight;
  }

  async function getReadiness() {
    requireEnabled();
    return kyc.getReadiness();
  }

  async function quoteBuy({ symbol, brlAmount, walletAddress }) {
    requireEnabled();
    const token = findAllowed(symbol);
    const amount = Number(brlAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new StocksRampError("INVALID_QUOTE", "Informe um valor válido.");
    const sdk = await client();
    const raw = await sdk.createQuote(buildStockBuyRequest({ network, outputId: token.address, brlAmount: amount, destinationAddress: walletAddress }));
    validateStockQuote(raw, { direction: "BUY", network, id: token.address, requested: amount, now: now() });
    return normalizeStockQuote(raw, token, "BUY");
  }

  async function quoteSell({ symbol, tokenAmount }) {
    requireEnabled();
    const token = findAllowed(symbol);
    let wei;
    try { wei = tokensToWei(tokenAmount); } catch (error) { throw new StocksRampError("INVALID_QUOTE", error.message); }
    if (wei <= 0n) throw new StocksRampError("INVALID_QUOTE", "Informe uma quantidade válida de tokens.");
    const amount = formatUnits(wei, 18);
    const sdk = await client();
    const raw = await sdk.createQuote(buildStockSellRequest({ network, inputId: token.address, tokenAmount: amount }));
    validateStockQuote(raw, { direction: "SELL", network, id: token.address, requested: amount, now: now() });
    return normalizeStockQuote(raw, token, "SELL");
  }

  function assertOwnQuote(quote, direction) {
    if (!quote?.rawQuote || quote.simulated || quote.direction !== direction) throw new StocksRampError("INVALID_QUOTE");
    return findAllowed(quote.symbol);
  }

  async function registerBuy({ quote, walletAddress }) {
    requireEnabled();
    const token = assertOwnQuote(quote, "BUY");
    if (!walletAddress) throw new StocksRampError("WALLET_NOT_READY");
    assertNoOtherActiveRamp(activeRampStore, walletAddress);
    await assertMaintenanceAvailable(getMaintenanceStatus);
    const sdk = await client();
    const recovery = { walletAddress, inputAmount: quote.brlAmount, outputAmount: quote.tokenAmount, rampType: "BUY", symbol: token.symbol, tokenAddress: token.address, createdAt: now() };
    // Pix onramps return no user transactions (SDK registerRamp, BRL handler).
    const { rampProcess } = await withRecovery(recovery, () => sdk.registerRamp(quote.rawQuote, { destinationAddress: walletAddress }));
    activeRampStore.save({ ...recovery, rampId: rampProcess.id, stage: "registered" });
    return toStockRamp(rampProcess, { symbolHint: token.symbol, now: now() });
  }

  async function registerSell({ quote, walletAddress, pixKey, wallet, onRegistered }) {
    requireEnabled();
    requireSellPolicy();
    const token = assertOwnQuote(quote, "SELL");
    if (!walletAddress || !wallet?.provider) throw new StocksRampError("WALLET_NOT_READY");
    assertNoOtherActiveRamp(activeRampStore, walletAddress);
    await assertMaintenanceAvailable(getMaintenanceStatus);
    assertSellBalance(await (readBalance ?? defaultReadBalance)({ owner: walletAddress, token, wallet }), quote.tokenAmountWei);
    if (!quote.gasless) await assertSellGas(walletAddress, wallet); // a permit sell needs no ETH
    const sdk = await client();
    const recovery = { walletAddress, inputAmount: quote.tokenAmount, outputAmount: quote.brlAmount, rampType: "SELL", symbol: token.symbol, tokenAddress: token.address, createdAt: now() };
    const { rampProcess, unsignedTransactions } = await withRecovery(recovery, () => sdk.registerRamp(quote.rawQuote, { walletAddress, pixDestination: String(pixKey || "").trim() }));
    activeRampStore.save({ ...recovery, rampId: rampProcess.id, stage: "signing" });
    const ramp = toStockRamp(rampProcess, { symbolHint: token.symbol, now: now() });
    onRegistered?.(ramp);
    assertSellDeadline(ramp, activeRampStore.get(walletAddress));
    await signOnRobinhoodChain(sdk, rampProcess.id, unsignedTransactions, walletAddress, wallet, { token: token.address, maxAmountWei: quote.tokenAmountWei }, ramp);
    activeRampStore.save({ ...recovery, rampId: rampProcess.id, stage: "ready" });
    return ramp;
  }

  // Resume a sell that stopped between registration and start (reload, closed tab, rejected
  // confirmation). Checkpointed hashes are never broadcast again; once the ramp has left "initial"
  // the signatures were accepted and nothing is signed again. Past (or within a minute of) the start
  // deadline nothing is signed: the API would refuse the start after the tokens moved. That sell can
  // never start (only a paid Pix ramp starts late). With no broadcast it is abandoned now; with
  // a broadcast its recovery record is retained for support. SELL_EXPIRED explains which applies.
  // When every request was already broadcast (only
  // receipts are awaited), the tokens have moved and nothing is signed: the start decides.
  // The deadline is the earlier of the server's (its createdAt) and this device's (the record's
  // createdAt, taken just before registerRamp on this clock), so a clock running behind the server's
  // never signs late; one running ahead may refuse early, which moves nothing.
  async function resumeSell({ rampId, walletAddress, wallet }) {
    requireEnabled();
    if (!walletAddress || !wallet?.provider) throw new StocksRampError("WALLET_NOT_READY");
    const raw = await getRampWithUnsignedTxs(session, rampId);
    const record = activeRampStore.get(walletAddress);
    const ownRecord = record?.rampId === rampId ? record : null;
    const base = { walletAddress, inputAmount: raw?.inputAmount ?? ownRecord?.inputAmount, outputAmount: raw?.outputAmount ?? ownRecord?.outputAmount, rampType: "SELL", symbol: ownRecord?.symbol ?? toStockRamp(raw).symbol, tokenAddress: ownRecord?.tokenAddress, createdAt: ownRecord?.createdAt ?? now() };
    const ramp = toStockRamp(raw, { symbolHint: base.symbol, now: now() });
    if (ramp.classification === "success" || ramp.classification === "failure") return settle(ramp, walletAddress);
    if (ownRecord?.stage !== "ready" && ramp.currentPhase === "initial") {
      // Left to sign: typed data, or a transaction without a checkpointed hash.
      const unsigned = ownRequests(raw?.unsignedTxs, walletAddress).some((tx) => !ownRecord?.transactions?.[tx?.phase]);
      const localDeadline = Number.isFinite(ownRecord?.createdAt) ? ownRecord.createdAt + RAMP_START_WINDOW_MS : null;
      const deadline = Math.min(...[ramp.startDeadline, localDeadline].filter(Number.isFinite));
      if (unsigned && now() >= deadline - RESUME_SIGN_MARGIN_MS) {
        const broadcast = Object.values(ownRecord?.transactions ?? {}).some(Boolean);
        if (!broadcast) settle({ ...ramp, classification: "failure" }, walletAddress);
        throw new StocksRampError("SELL_EXPIRED", broadcast ? SELL_EXPIRED_AFTER_BROADCAST_PT : SELL_EXPIRED_PT, { details: { rampId, broadcast } });
      }
      // The most this sell may move: the amount recorded at registration (the server's only without a record).
      const amount = canonicalAmount(ownRecord?.inputAmount || raw?.inputAmount);
      if (amount === null) throw new StocksRampError("INVALID_QUOTE", "Não foi possível conferir a quantidade desta venda. Consulte o suporte com o código da operação.");
      const expect = { token: ownRecord?.tokenAddress ?? findAllowed(base.symbol).address, maxAmountWei: parseUnits(amount, 18) };
      if (!ownRecord) activeRampStore.save({ ...base, rampId, stage: "signing" }); // checkpoints need a record
      await signOnRobinhoodChain(await client(), rampId, raw?.unsignedTxs, walletAddress, wallet, expect, ramp);
    }
    activeRampStore.save({ ...base, rampId, stage: "ready" });
    return ramp;
  }

  async function startRamp(rampId) {
    requireEnabled();
    await assertMaintenanceAvailable(getMaintenanceStatus);
    return toStockRamp(await startRampSafely(await client(), rampId), { now: now() });
  }

  // Not gated: a ramp registered while the flag was on must still be able to finish.
  async function getRamp(rampId, { walletAddress } = {}) {
    const sdk = await client();
    return settle(toStockRamp(await sdk.getRampStatus(rampId), { now: now() }), walletAddress);
  }

  async function pollStatus(rampId, { signal, onUpdate, intervalMs, timeoutMs, walletAddress } = {}) {
    const sdk = await client();
    const raw = await pollRamp(sdk, rampId, { signal, intervalMs, timeoutMs, onUpdate: (update) => onUpdate?.(toStockRamp(update, { now: now() })) });
    return settle(toStockRamp(raw, { now: now() }), walletAddress);
  }

  return {
    getMaintenanceStatus,
    kind: "vortex",
    enabled: Boolean(enabled),
    requiresVortexSession: true,
    getAvailability,
    getReadiness: guarded(getReadiness),
    quoteBuy: guarded(quoteBuy),
    quoteSell: guarded(quoteSell),
    registerBuy: guarded(registerBuy),
    registerSell: guarded(registerSell),
    resumeSell: guarded(resumeSell),
    startRamp: guarded(startRamp),
    getRamp: guarded(getRamp),
    pollStatus: guarded(pollStatus),
  };
}
