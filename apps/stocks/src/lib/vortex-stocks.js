// The Vortex implementation of the ramp adapter: network "robinhood" (chain 4663) in /v1/quotes and
// /v1/supported-cryptocurrencies, and the Stock Token identified by its symbol in outputCurrency (BUY)
// / inputCurrency (SELL), which the API's allowlist pins to one contract. The network name is
// configurable (VITE_STOCKS_NETWORK). The address stays this app's own pin: a token is available only
// when the listing shows it on the bundled address, a buy must deliver from that contract and a sell's
// permit must name it.
// Gated: while VITE_STOCKS_RAMP_ENABLED is off it makes NO ramp calls and answers "not enabled";
// getRamp/pollStatus still work so a ramp registered while it was on can finish. While the API
// answers "unknown network" (400 "Invalid network" / "Unable to determine network") or lists no
// direction, the UI shows the same "em breve" state. Quotes are validated fail-closed before anything
// is shown.
// Gas reserve: a BUY quote request names the wallet (destinationAddress) so
// Vortex can skip the reserve for a funded wallet; a quote may then carry gasReserveAmount/Currency/
// Fiat/Usd, already inside the network and total fees. Without those fields nothing changes.
import { RAMP_START_WINDOW_MS, createApi, createVortexClient, formatBRL, getRampWithUnsignedTxs, pollRamp, robinhoodChain, startRampSafely, submitWalletTransactions, withConsumerLock } from "@vortexfi/consumer-kit";
import { decodeFunctionData, formatUnits, parseAbi, parseUnits } from "viem";
import { gasReserveFeeProblem, gasShortfallPt, networkFeeWithoutReserve, parseGasReserve } from "./gas-reserve.js";
import { STOCK_TOKEN_ABI, createRobinhoodClient, readTokenBalance } from "./portfolio.js";
import { providerCostProblem } from "./provider-costs.js";
import { MAINTENANCE_ACTIVE_PT, assertMaintenanceAvailable, createMaintenanceReader } from "./maintenance.js";
import { StocksRampError, assertNoOtherActiveRamp, isNetworkNotSupportedError, settleRamp, toStockRamp, uniformAvailability } from "./ramp-contract.js";
import { STOCK_TOKENS } from "./stocks.js";
import { assertSellBalance, tokensToWei } from "./token.js";

export const AVAILABILITY_TTL_MS = 60_000;
// A resumed sell is not signed within this margin of its start deadline: the wallet confirmation,
// its receipt and startRamp must all fit before the API refuses the start.
export const RESUME_SIGN_MARGIN_MS = 60_000;

const SELL_EXPIRED_PT = "O prazo para confirmar esta venda terminou, e nada saiu da sua carteira. Comece uma nova venda.";
const SELL_EXPIRED_AFTER_BROADCAST_PT = "O prazo para iniciar esta venda terminou, e uma transação dela já tinha saído da sua carteira. Consulte o suporte com o código da operação antes de fazer outra operação.";
const SELL_UNVERIFIABLE_PT = "Não foi possível conferir esta venda neste aparelho. Consulte o suporte com o código da operação.";
const BUY_UNVERIFIABLE_PT = "Esta compra não confere com a cotação, por isso o código Pix não foi mostrado. Não faça nenhum pagamento e consulte o suporte com o código da operação.";

// The one thing this app's wallet signs on a sell: the seller's EIP-2612 permit. Its spender is the
// ephemeral this device generated for the ramp, kept on the recovery record (signOnRobinhoodChain),
// never an address the API names, and its nonce is the token's current one, read from the chain, so a
// sell signed again (a resume) yields no second permit the token would accept. That bounds what the
// wallet signs, not what the API may ask the ephemeral to presign, so the wallet-side limit is this
// token and this amount.
const SELL_PHASES = Object.freeze({ stockPermitTransfer: Object.freeze(["permit"]) });

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Mirrors Gold's buildPaxgBuyRequest. outputId = the token's symbol. destinationAddress is the user's
 * wallet, sent only when it is a well-formed address: Vortex reads its ETH balance to decide on the
 * gas reserve (without it, the full reserve is quoted).
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
 * different amount than the user typed). A gas reserve must be well-formed ETH
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
    && (buy ? quote.inputCurrency === "BRL" && quote.outputCurrency === id : quote.inputCurrency === id && quote.outputCurrency === "BRL");
  if (!route) throw new StocksRampError("WRONG_ROUTE");
  // A field of the backend's answer, not a client routing hint it could ignore. Existing registered
  // ramps can still be recovered.
  if (quote.routingStrategy !== "direct") throw new StocksRampError("WRONG_ROUTE", "A rota direta ainda não foi confirmada pela Vortex. Tente novamente mais tarde.");
  // Only a permit can be signed here (SELL_PHASES). Registering any other sell would hold this
  // wallet's one operation for up to an hour, for a request the wallet then refuses.
  if (!buy && quote.gasless !== true) throw new StocksRampError("WRONG_ROUTE", "A venda deste token não está disponível agora. Nada foi registrado e seus tokens continuam na sua carteira. Tente novamente mais tarde.");
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
    gasless: raw.gasless === true,
    gasReserve,
    simulated: false,
    rawQuote: raw,
  };
}

/**
 * /v1/supported-cryptocurrencies?network=<network> -> AvailabilityMap. A token counts only on the
 * bundled address with 18 decimals on this network; the same symbol at another address is
 * "address_mismatch" (never trusted: lookalikes exist), so a symbol is quoted only after the
 * API has shown that it means this contract.
 */
export function mapAvailability(response, { network, tokens = STOCK_TOKENS, warn = () => {} }) {
  const list = Array.isArray(response) ? response : response?.tokens || response?.cryptocurrencies || [];
  const map = {};
  for (const token of tokens) {
    const listed = list.find((item) => item?.assetNetwork === network && sameId(item.assetContractAddress, token.address) && item.assetDecimals === 18);
    if (listed) {
      const buy = listed.rampTypes?.includes("BUY") === true;
      const sell = listed.rampTypes?.includes("SELL") === true;
      map[token.symbol] = Object.freeze({ buy, sell, reason: buy || sell ? null : "not_enabled" }); // listed with no direction: the corridor is switched off
    } else if (list.some((item) => item?.assetNetwork === network && String(item.assetSymbol || "").toUpperCase() === token.symbol)) {
      warn(`Vortex lists ${token.symbol} on ${network} with a different address or decimals than the allowlist; it stays unavailable.`);
      map[token.symbol] = Object.freeze({ buy: false, sell: false, reason: "address_mismatch" });
    } else {
      map[token.symbol] = Object.freeze({ buy: false, sell: false, reason: "token_not_listed" });
    }
  }
  return Object.freeze(map);
}

const ERC20_TRANSFER = parseAbi(["function transfer(address to, uint256 amount)"]);

/**
 * What a registered buy delivers, before its Pix code is shown: the one final transfer in the API's
 * answer to the presigned update must send this token, to this wallet, in exactly the quoted amount,
 * on the quote the user confirmed and for the BRL it showed. Throws WRONG_ROUTE otherwise. This stops
 * a backend mistake, not a server that lies: the SDK presigned what the registration's answer said,
 * and the app does not get to see that.
 */
export function assertRegisteredBuy(rampProcess, { quote, token, walletAddress }) {
  const transfers = (rampProcess?.unsignedTxs || []).filter((tx) => tx?.phase === "destinationTransfer");
  let matches = false;
  try {
    const { args: [to, amount] } = decodeFunctionData({ abi: ERC20_TRANSFER, data: transfers[0].txData.data });
    matches = transfers.length === 1 && sameId(transfers[0].txData.to, token.address) && sameId(to, walletAddress) && amount === BigInt(quote.tokenAmountWei)
      && rampProcess.quoteId === quote.id && Number(rampProcess.inputAmount) === quote.brlAmount;
  } catch { /* no transfer, or not a token transfer: refused below */ }
  if (!matches) throw new StocksRampError("WRONG_ROUTE", BUY_UNVERIFIABLE_PT, { details: { rampId: rampProcess?.id ?? null } });
}

const devWarn = (message) => { if (import.meta.env?.DEV) console.warn(message); };

const NEW_QUOTE_PT = "Esta cotação não está mais disponível. Atualize a cotação.";
const AMOUNT_TOO_LOW_PT = "O valor é baixo demais para cobrir as taxas. Escolha um valor maior.";
const OVER_LIMIT_PT = "Este valor passa do seu limite disponível. Escolha um valor menor.";
const KYC_UNFINISHED_PT = "Sua verificação de identidade ainda não foi concluída. Tente novamente em alguns minutos.";
const RAMP_NOT_FOUND_PT = "Esta operação não foi encontrada. Consulte o suporte com o código da operação.";
const RAMP_ALREADY_STARTED_PT = "Esta operação já não pode ser alterada. Acompanhe o andamento no Início.";
const CHAIN_UNREADABLE_PT = "Não foi possível consultar a Robinhood Chain agora. Tente novamente em instantes.";

/**
 * Every fixed English message the API or the SDK can answer to this app's quote, register, update,
 * start and status calls, by the text the SDK ends up with (it rewrites some, e.g. "Invalid pixKey").
 * tests/server-errors.test.mjs holds each key against the backend and SDK sources.
 */
export const SERVER_ERRORS_PT = Object.freeze({
  // Quote: the token and the market.
  "This token is not available on Robinhood Chain.": { code: "TOKEN_NOT_ALLOWED" },
  "Trading in this token is paused by the issuer. Please try again later.": { code: "TOKEN_UNAVAILABLE", pt: "Negociação pausada pelo emissor. Tente novamente mais tarde." },
  "The market price for this token is temporarily unavailable. Please try again later.": { code: "TOKEN_UNAVAILABLE", pt: "O preço de mercado deste token está indisponível no momento. Tente novamente mais tarde." },
  "Destination network fees are temporarily too high. Please try again later.": { code: "INVALID_QUOTE", pt: "As taxas da rede estão altas no momento. Tente novamente mais tarde." },
  "This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.": { code: "INVALID_QUOTE", pt: "Esta rota está sem liquidez no momento. Tente um valor menor ou volte mais tarde." },
  "Input amount too low to cover calculated fees": { code: "INVALID_QUOTE", pt: AMOUNT_TOO_LOW_PT },
  "Input amount for swap must be greater than 0": { code: "INVALID_QUOTE", pt: AMOUNT_TOO_LOW_PT },
  // Registration: the quote.
  "Quote not found": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "Quote has expired": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "Quote already consumed": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "Authenticated user does not own this quote": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "Authenticated user does not own this provider-bound quote.": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "The bridge quote is no longer available. Please request a new quote.": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "This quote was created for a different destination address. Please request a new quote.": { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT },
  "Selling this token is temporarily unavailable. Please try again later.": { code: "TOKEN_UNAVAILABLE", pt: "A venda deste token está indisponível no momento. Nada foi registrado e seus tokens continuam na sua carteira. Tente novamente mais tarde." },
  // Registration: the user, their limits and their Pix key.
  "This endpoint requires authentication.": { code: "AUTH_REQUIRED" },
  "No completed provider profile found for this API key user.": { code: "SERVER_ERROR", pt: KYC_UNFINISHED_PT },
  "The BR subaccount is not yet provisioned for this user.": { code: "SERVER_ERROR", pt: KYC_UNFINISHED_PT },
  "Subaccount not found. Provided taxId has not been KYC'ed": { code: "SERVER_ERROR", pt: KYC_UNFINISHED_PT },
  "KYC invalid": { code: "SERVER_ERROR", pt: KYC_UNFINISHED_PT },
  "BRL limits not found.": { code: "SERVER_ERROR", pt: KYC_UNFINISHED_PT },
  "Amount exceeds KYC limits": { code: "INVALID_QUOTE", pt: OVER_LIMIT_PT },
  "Amount exceeds BRL limit.": { code: "INVALID_QUOTE", pt: OVER_LIMIT_PT },
  "Amount exceeds global limit.": { code: "INVALID_QUOTE", pt: OVER_LIMIT_PT },
  "Invalid pixKey": { code: "INVALID_QUOTE", pt: "Esta chave Pix não é válida ou não está no seu CPF. Confira a chave e tente novamente." },
  "The payment provider could not process this request for the associated account. Please verify the account status or contact support.": { code: "SERVER_ERROR", pt: "A Avenia não aceitou esta operação para a sua conta. Consulte o suporte da Vortex." },
  "The payment provider is temporarily unavailable. Please try again shortly.": { code: "SERVER_ERROR", pt: "A Avenia está indisponível no momento. Tente novamente em instantes." },
  // A registered ramp: update, start and status.
  "Maximum time window to start process exceeded. Ramp invalidated.": { code: "INVALID_QUOTE", pt: "O prazo para iniciar esta operação terminou. Não faça um novo pagamento; se já pagou, consulte o suporte com o código da operação." },
  "No presigned transactions found. Please call updateRamp first.": { code: "SERVER_ERROR", pt: "O registro desta operação não foi concluído. Consulte o suporte com o código da operação." },
  "Ramp not found": { code: "SERVER_ERROR", pt: RAMP_NOT_FOUND_PT },
  "Associated quote not found": { code: "SERVER_ERROR", pt: RAMP_NOT_FOUND_PT },
  "Ramp is not in a state that allows updates": { code: "SERVER_ERROR", pt: RAMP_ALREADY_STARTED_PT },
  "Ramp is not in a state that allows starting": { code: "SERVER_ERROR", pt: RAMP_ALREADY_STARTED_PT },
  "Authenticated user does not own this ramp": { code: "SERVER_ERROR", pt: "Esta operação pertence a outra conta. Entre com o e-mail usado nela." },
});

// The same messages with a value inside: limits in BRL, the quote's status, the maintenance title.
function serverErrorPt(message) {
  const known = SERVER_ERRORS_PT[message];
  if (known) return known;
  const limit = /^(?:Input|Output) amount (below minimum|exceeds maximum) (?:BUY|SELL) limit of (\d+(?:\.\d+)?)/.exec(message);
  if (limit) return { code: "INVALID_QUOTE", pt: `O valor desta operação precisa ser de ${limit[1] === "below minimum" ? "pelo menos" : "no máximo"} ${formatBRL(limit[2])}.` };
  if (message.startsWith("Quote is ")) return { code: "INVALID_QUOTE", pt: NEW_QUOTE_PT };
  if (message.startsWith("Vortex services are temporarily unavailable during scheduled maintenance")) return { code: "MAINTENANCE_ACTIVE", pt: MAINTENANCE_ACTIVE_PT };
  return null;
}

/**
 * Any adapter error -> what the UI shows, in pt-BR. A 401 sends the flow back to the e-mail code, an
 * unknown network shows "em breve", and the kit's wallet check right before a sell transaction
 * (INSUFFICIENT_NATIVE_GAS) gets the gas-reserve wording (INSUFFICIENT_GAS). SDK errors alone carry
 * a boolean isPublic: they hold the API's English text, so one this table does not know gets a generic
 * message. viem errors alone carry a shortMessage: a chain read that failed, whose text is technical
 * English with the RPC URL. A failed fetch reaches here as a bare TypeError. The kit's own errors are
 * already pt-BR.
 */
export function mapStocksError(error) {
  if (error instanceof StocksRampError || error?.name === "AbortError") return error;
  if (error?.code === "INSUFFICIENT_NATIVE_GAS") return new StocksRampError("INSUFFICIENT_GAS", gasShortfallPt(error.details), { details: error.details ?? null, cause: error });
  if (Number(error?.status) === 401) return new StocksRampError("AUTH_REQUIRED", undefined, { status: 401, cause: error });
  if (isNetworkNotSupportedError(error)) return new StocksRampError("NETWORK_NOT_SUPPORTED", undefined, { status: 400, cause: error });
  if (error?.name === "InsufficientBalanceError") return new StocksRampError("INSUFFICIENT_BALANCE", undefined, { status: error.status, cause: error });
  const known = serverErrorPt(String(error?.message));
  if (known) return new StocksRampError(known.code, known.pt, { status: error.status, cause: error });
  if (typeof error?.isPublic === "boolean") return new StocksRampError("SERVER_ERROR", "A operação não pôde ser concluída. Tente novamente em instantes.", { status: error.status, cause: error });
  if (typeof error?.shortMessage === "string") return new StocksRampError("SERVER_ERROR", CHAIN_UNREADABLE_PT, { cause: error });
  if (error instanceof TypeError) return new StocksRampError("SERVER_ERROR", "Não foi possível conectar à Vortex. Verifique sua internet e tente novamente.", { cause: error });
  return error;
}

/**
 * @param {{ enabled?:boolean, network?:string, apiBase:string,
 *   session:ReturnType<typeof import("@vortexfi/consumer-kit").createVortexSession>,
 *   kyc:ReturnType<typeof import("@vortexfi/consumer-kit").createBrazilKyc>,
 *   activeRampStore:ReturnType<typeof import("@vortexfi/consumer-kit").createActiveRampStore>,
 *   ephemeralStore:{put:Function, delete?:Function}, rpcOverride?:string,
 *   api?:Function, createClient?:Function, readBalance?:Function, tokens?:ReadonlyArray<object>,
 *   now?:()=>number, availabilityTtlMs?:number, warn?:(message:string)=>void }} deps
 *   api/createClient/readBalance are injectable for tests (defaults: kit createApi, kit createVortexClient, a chain read).
 */
export function createVortexStocksAdapter({
  enabled = false, network = "robinhood", apiBase,
  session, kyc, activeRampStore, ephemeralStore, rpcOverride = "",
  api, createClient = createVortexClient, readBalance, tokens = STOCK_TOKENS,
  now = Date.now, availabilityTtlMs = AVAILABILITY_TTL_MS, warn = devWarn,
  readMaintenance,
} = {}) {
  const getMaintenanceStatus = readMaintenance ?? createMaintenanceReader({ apiBase, api });
  let listingApi = api ?? null;
  let clientPromise = null;
  let pendingRecovery = null;
  let availabilityCache = null;
  let availabilityInFlight = null;
  let chainReader = null;

  const requireEnabled = () => { if (!enabled) throw new StocksRampError("STOCKS_RAMP_NOT_ENABLED"); };
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
        apiBase, session, ephemeralStore,
        onBeforeEphemeralsStored: (rampId, ephemeralEvmAddress) => {
          if (!pendingRecovery) return;
          assertNoOtherActiveRamp(activeRampStore, pendingRecovery.walletAddress, rampId);
          pendingRecovery.ephemeralEvmAddress = ephemeralEvmAddress; // kept by every later save of this recovery object
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
      try { return await register(); }
      catch (error) {
        // No Pix code and no wallet request can have reached the user: the API withholds both until
        // presigning passes, and they are shown only after this returns. This attempt's record proves
        // nothing, so it must not hold the wallet.
        const saved = activeRampStore.get(recovery.walletAddress);
        if (saved?.stage === "registering" && saved.createdAt === recovery.createdAt) activeRampStore.clear(saved.rampId);
        throw error;
      } finally { pendingRecovery = null; }
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
    const ephemeral = activeRampStore.get(walletAddress)?.ephemeralEvmAddress;
    if (!ephemeral) throw new StocksRampError("SELL_EXPIRED", SELL_UNVERIFIABLE_PT, { details: { rampId } });
    const own = ownRequests(unsignedTxs, walletAddress);
    // Every stock sell has exactly one user request, and the API withholds it until presigning passed.
    if (own.length !== 1) throw new StocksRampError("WRONG_ROUTE", "A carteira não recebeu o pedido desta venda. Consulte o suporte com o código da operação.");
    const permitNonce = await robinhoodReader(wallet).readContract({ address: expect.token, abi: STOCK_TOKEN_ABI, functionName: "nonces", args: [walletAddress] });
    await submitWalletTransactions({ client: sdk, rampId, transactions: own, expect: { ...expect, spenders: [ephemeral], phases: SELL_PHASES, network, permitNonce }, beforeSign: async () => { await assertMaintenanceAvailable(getMaintenanceStatus); assertSellDeadline(ramp, activeRampStore.get(walletAddress)); }, from: walletAddress, provider: wallet.provider, chain: robinhoodChain, publicClient: robinhoodReader(wallet), ...checkpointsFor(walletAddress) });
  }

  const settle = (ramp, walletAddress) => {
    settleRamp(activeRampStore, ramp, { walletAddress, now: now() });
    // Completed ramps are swept server-side; the stored keys only matter for recovering failed ones.
    if (ramp.classification === "success") ephemeralStore?.delete?.(ramp.id)?.catch(() => {});
    return ramp;
  };

  // The API's own answer for a ramp it does not have, unlike a 404 from anything in front of it: nothing
  // will ever finish this record, so it settles as failed.
  const settleIfGone = (rampId, walletAddress) => (error) => {
    if (error?.message === "Ramp not found") settle({ id: rampId, classification: "failure" }, walletAddress);
    throw error;
  };

  async function getAvailability({ force = false } = {}) {
    if (!enabled) return uniformAvailability(tokens, "not_enabled");
    if (!force && availabilityCache && now() - availabilityCache.at < availabilityTtlMs) return availabilityCache.map;
    if (availabilityInFlight) return availabilityInFlight;
    if (!listingApi) listingApi = createApi({ apiBase });
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
    const raw = await sdk.createQuote(buildStockBuyRequest({ network, outputId: token.symbol, brlAmount: amount, destinationAddress: walletAddress }));
    validateStockQuote(raw, { direction: "BUY", network, id: token.symbol, requested: amount, now: now() });
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
    const raw = await sdk.createQuote(buildStockSellRequest({ network, inputId: token.symbol, tokenAmount: amount }));
    validateStockQuote(raw, { direction: "SELL", network, id: token.symbol, requested: amount, now: now() });
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
    try { assertRegisteredBuy(rampProcess, { quote, token, walletAddress }); }
    catch (error) { settle({ id: rampProcess?.id, classification: "failure" }, walletAddress); throw error; } // no Pix code was shown, so nothing can be paid
    activeRampStore.save({ ...recovery, rampId: rampProcess.id, stage: "registered" });
    return toStockRamp(rampProcess, { symbolHint: token.symbol, now: now() });
  }

  async function registerSell({ quote, walletAddress, pixKey, wallet, onRegistered }) {
    requireEnabled();
    const token = assertOwnQuote(quote, "SELL");
    if (!walletAddress || !wallet?.provider) throw new StocksRampError("WALLET_NOT_READY");
    assertNoOtherActiveRamp(activeRampStore, walletAddress);
    await assertMaintenanceAvailable(getMaintenanceStatus);
    assertSellBalance(await (readBalance ?? defaultReadBalance)({ owner: walletAddress, token, wallet }), quote.tokenAmountWei);
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
  // SELL_PHASES holds no transaction today, so the hash and broadcast branches only guard a record
  // that already has a hash; signing is the permit alone.
  // Without this device's record nothing pins the token, amount or spender, so nothing is signed,
  // and the API can bring that state about itself: one failed status clears a sell with no checkpoints.
  async function resumeSell({ rampId, walletAddress, wallet }) {
    requireEnabled();
    if (!walletAddress || !wallet?.provider) throw new StocksRampError("WALLET_NOT_READY");
    const raw = await getRampWithUnsignedTxs(session, rampId);
    const record = activeRampStore.get(walletAddress);
    const ownRecord = record?.rampId === rampId ? record : null;
    const base = { walletAddress, inputAmount: raw?.inputAmount ?? ownRecord?.inputAmount, outputAmount: raw?.outputAmount ?? ownRecord?.outputAmount, rampType: "SELL", symbol: ownRecord?.symbol ?? toStockRamp(raw).symbol, tokenAddress: ownRecord?.tokenAddress, ephemeralEvmAddress: ownRecord?.ephemeralEvmAddress, createdAt: ownRecord?.createdAt ?? now() };
    const ramp = toStockRamp(raw, { symbolHint: base.symbol, now: now() });
    if (ramp.classification === "success" || ramp.classification === "failure") return settle(ramp, walletAddress);
    if (!ownRecord && ramp.currentPhase === "initial") throw new StocksRampError("SELL_EXPIRED", SELL_UNVERIFIABLE_PT, { details: { rampId } });
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
      // The most this sell may move: the amount recorded at registration, never the server's.
      const amount = canonicalAmount(ownRecord.inputAmount);
      if (amount === null) throw new StocksRampError("INVALID_QUOTE", "Não foi possível conferir a quantidade desta venda. Consulte o suporte com o código da operação.");
      const expect = { token: ownRecord.tokenAddress, maxAmountWei: parseUnits(amount, 18) };
      await signOnRobinhoodChain(await client(), rampId, raw?.unsignedTxs, walletAddress, wallet, expect, ramp);
    }
    activeRampStore.save({ ...base, rampId, stage: "ready" });
    return ramp;
  }

  // Gives up an operation nobody started: the user says they did not pay an expired Pix, or a
  // registration never finished on this device. A ramp that has started in the meantime is left alone
  // and returned, so the flow can show it. Not gated, as getRamp.
  async function abandonRamp(rampId, { walletAddress } = {}) {
    const ramp = await getRamp(rampId, { walletAddress });
    if (ramp.currentPhase === "initial") settle({ ...ramp, classification: "failure" }, walletAddress);
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
    const raw = await sdk.getRampStatus(rampId).catch(settleIfGone(rampId, walletAddress));
    return settle(toStockRamp(raw, { now: now() }), walletAddress);
  }

  async function pollStatus(rampId, { signal, onUpdate, intervalMs, timeoutMs, walletAddress } = {}) {
    const sdk = await client();
    const raw = await pollRamp(sdk, rampId, { signal, intervalMs, timeoutMs, onUpdate: (update) => onUpdate?.(toStockRamp(update, { now: now() })) }).catch(settleIfGone(rampId, walletAddress));
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
    abandonRamp: guarded(abandonRamp),
    startRamp: guarded(startRamp),
    getRamp: guarded(getRamp),
    pollStatus: guarded(pollStatus),
  };
}
