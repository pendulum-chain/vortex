// A purchase can deliver an ETH reserve. Selling on Robinhood Chain pays its
// network fee in ETH, so when the buyer's wallet holds too little ETH the BUY also delivers a small
// amount (proposed: top up to 0.00005 ETH below 0.00002 ETH), paid by the user as its own fee line.
// A BUY quote may carry four PROPOSED flat fields; the reserve's BRL value is already inside
// networkFeeFiat and totalFeeFiat. Absent (or "0") means no reserve: today's API, a wallet that
// already holds enough ETH, or a reserve target of 0 once a permit (gasless) sell exists.
import { formatUnits, parseUnits } from "viem";

const GAS_RESERVE_FIELDS = ["gasReserveAmount", "gasReserveCurrency", "gasReserveFiat", "gasReserveUsd"];
export const GAS_RESERVE_CURRENCY = "ETH";
// The maximum ETH reserve allowed in a purchase quote.
export const GAS_RESERVE_MAX_WEI = parseUnits("0.0003", 18);
// Fee fields are rounded one by one (BRL to cents), so a sum may be off by a cent.
const FEE_ROUNDING = 0.01;

const DECIMAL = /^\d+(?:\.\d{1,18})?$/;
const EPSILON = 1e-9; // float noise in the cent sums (0.7 + 0.01)
const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const toWei = (value) => { try { return value == null || value === "" ? null : BigInt(value); } catch { return null; } };

/**
 * @typedef {{ amount:string, amountWei:string, currency:"ETH", brl:number, usd:number|null }} GasReserve
 *   amount: decimal ETH ("0.00005"); brl: what the user pays for it, already inside the quote's fees
 */

/**
 * The reserve in a quote (flat PROPOSED fields) -> GasReserve, or null when none is charged.
 * Throws an Error naming the problem when the fields are present but unusable: an amount that is
 * not a plain decimal (no sign, no exponent, at most 18 decimals) or above GAS_RESERVE_MAX_WEI, a
 * currency other than ETH, a missing, negative or non-numeric BRL value, or a charge without ETH.
 * @returns {GasReserve|null}
 */
export function parseGasReserve(raw) {
  if (!GAS_RESERVE_FIELDS.some((field) => present(raw?.[field]))) return null;
  const amountText = present(raw.gasReserveAmount) ? String(raw.gasReserveAmount).trim() : "0";
  if (!DECIMAL.test(amountText)) throw new Error("gasReserveAmount is not a plain decimal ETH amount.");
  const wei = parseUnits(amountText, 18);
  const brl = present(raw.gasReserveFiat) ? Number(raw.gasReserveFiat) : wei === 0n ? 0 : Number.NaN;
  if (!Number.isFinite(brl) || brl < 0) throw new Error("gasReserveFiat is missing or not a non-negative number.");
  const usd = present(raw.gasReserveUsd) ? Number(raw.gasReserveUsd) : null;
  if (usd !== null && (!Number.isFinite(usd) || usd < 0)) throw new Error("gasReserveUsd is not a non-negative number.");
  if (wei === 0n) {
    if (brl > 0 || usd > 0) throw new Error("A gas reserve is charged but no ETH is delivered.");
    return null;
  }
  if (wei > GAS_RESERVE_MAX_WEI) throw new Error("gasReserveAmount is above the most one purchase may deliver.");
  if (raw.gasReserveCurrency !== GAS_RESERVE_CURRENCY) throw new Error("gasReserveCurrency is not ETH.");
  return Object.freeze({ amount: formatUnits(wei, 18), amountWei: wei.toString(), currency: GAS_RESERVE_CURRENCY, brl, usd });
}

/**
 * The quote's fee fields must hold the reserve (added to networkFeeFiat/Usd and
 * totalFeeFiat/Usd, as Vortex already does for destination gas). Returns the problem or null.
 * Checked only when a reserve is present, so quotes without one are validated exactly as before.
 * The fee lines must add up to totalFeeFiat (1 cent of rounding): the API builds the total from
 * exactly these fields (blocks/core/fees.ts calculateFees, quote-response.ts), and a reserve counted
 * in the total but not in networkFeeFiat would otherwise pass whenever the network fee alone is
 * at least the reserve, and the review would show a network line R$ 0.71 too low.
 * @param {object} quote the raw Vortex quote (fee fields already known to be finite and >= 0)
 * @param {GasReserve} reserve
 */
export function gasReserveFeeProblem(quote, reserve) {
  const network = Number(quote.networkFeeFiat);
  const service = Number(quote.processingFeeFiat) + Number(quote.partnerFeeFiat);
  const total = Number(quote.totalFeeFiat);
  if (reserve.brl > network + FEE_ROUNDING + EPSILON) return "the reserve is not inside networkFeeFiat";
  if (service + network > total + FEE_ROUNDING + EPSILON) return "networkFeeFiat (with the reserve) is not inside totalFeeFiat";
  if (total > service + network + FEE_ROUNDING + EPSILON) return "totalFeeFiat holds more than processing + partner + network (a reserve outside networkFeeFiat?)";
  if (!(total < Number(quote.inputAmount))) return "the fees, reserve included, are not below the amount paid";
  const networkUsd = present(quote.networkFeeUsd) ? Number(quote.networkFeeUsd) : null;
  if (reserve.usd !== null && networkUsd !== null && Number.isFinite(networkUsd) && reserve.usd > networkUsd + FEE_ROUNDING + EPSILON) return "the reserve is not inside networkFeeUsd";
  return null;
}

const cents = (value) => Math.round(value * 100) / 100;

/** The network fee line without the reserve (the reserve gets its own line). */
export const networkFeeWithoutReserve = (networkFeeBrl, reserve) => (reserve ? Math.max(0, cents(Number(networkFeeBrl) - reserve.brl)) : Number(networkFeeBrl));

/** The buy review's line about selling later: never promises a reserve the quote does not include. */
export function sellLaterNotePt(quote) {
  return quote?.gasReserve
    ? "Vender depois tem novas taxas. A reserva fica na sua carteira e paga a taxa de rede das próximas vendas; quando ela fica baixa, uma nova compra a repõe. Você não precisa comprar ETH à parte."
    : "Vender depois tem novas taxas. A taxa de rede da venda aparece antes de você confirmar.";
}

// The wallet (and the kit's preflight) sends a sell's transaction only when its ETH covers gas limit
// x max fee. One sell transfer, the fallback of a permit sell,
// is estimated at 77,118 gas, and Vortex is asked to send it with the estimate plus at most 10 % as its
// gas limit and a max fee of 1.2 x the base fee: 102,000 gas x base fee.
// The check before registering covers that limit, or a wallet in between is registered and then
// refused at the signature, holding this device's one operation.
export const SELL_GAS_LIMIT = 85_000n;

/**
 * The ETH a wallet must hold to confirm a one-transfer sell at this base fee (SELL_GAS_LIMIT x 1.2 x
 * the base fee), or null when unknown.
 * The base fee comes from eth_gasPrice: Multicall3's getBasefee() reads 0 inside an eth_call on
 * Robinhood Chain (checked 2026-09-29; the node zeroes BASEFEE for calls without a gas price).
 */
export function sellGasRequiredWei(gasPriceWei) {
  const price = toWei(gasPriceWei);
  return price === null ? null : (SELL_GAS_LIMIT * price * 12n) / 10n;
}

/**
 * The sell review's network-fee card, decided before the sell is registered. gasless (permit sell):
 * none. No ETH, or less than confirming this sell needs (requiredWei, sellGasRequiredWei): the honest
 * fallback with the wallet address to top up; confirming stays blocked. Nothing is registered yet,
 * so a new purchase, which tops a low reserve up, is a real way out here (unlike gasShortfallPt).
 * Otherwise, or while the balance is unknown: the fee is paid from the reserve.
 * @param {{gasless?:boolean, ethWei?:bigint|string|number|null, requiredWei?:bigint|string|number|null}} args
 * @returns {null|{tone:"warning"|"neutral", title:string, text:string, needsEth:boolean}}
 */
export function sellGasNoticePt({ gasless = false, ethWei = null, requiredWei = null } = {}) {
  if (gasless) return null;
  const balance = toWei(ethWei);
  const required = toWei(requiredWei);
  if (balance === 0n) {
    return {
      tone: "warning", needsEth: true, title: "Falta ETH para a taxa de rede",
      text: "A taxa de rede da venda é paga em ETH na Robinhood Chain, e a reserva que vem com a compra já não está nesta carteira (por exemplo, foi usada em vendas anteriores). Envie um pouco de ETH para o endereço abaixo, somente pela rede Robinhood Chain, ou faça uma nova compra: ela repõe a reserva.",
    };
  }
  // Dust left (a used-up reserve) or a higher fee: the balance alone cannot tell which.
  if (balance !== null && required !== null && balance < required) {
    const { has, needs } = shortfallPt(balance, required);
    return {
      tone: "warning", needsEth: true, title: "Falta ETH para a taxa de rede",
      text: `Para confirmar esta venda, a carteira precisa de ≈ ${needs} ETH na Robinhood Chain para a taxa de rede e tem ≈ ${has} ETH: a reserva que vem com a compra está no fim ou a taxa de rede subiu. Comprar de novo repõe a reserva quando ela está baixa; se a taxa subiu, tentar de novo em alguns minutos também pode resolver. Você também pode enviar um pouco de ETH para o endereço abaixo, somente pela rede Robinhood Chain.`,
    };
  }
  return {
    tone: "neutral", needsEth: false, title: "Taxa de rede paga com a sua reserva",
    text: "A confirmação na Robinhood Chain usa um pouco do ETH da sua carteira, a reserva que vem com a compra. A taxa costuma ser de alguns centavos e aparece na carteira antes de você aprovar.",
  };
}

const ethFormat = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 2 });

/** 50000000000000n -> "0,00005" (two significant digits, pt-BR; always shown with "≈"). */
export const formatEthPt = (amountWei) => ethFormat.format(Number(formatUnits(BigInt(amountWei), 18)));

// A shortfall's two amounts at two significant digits, the need rounded up and the balance down, so
// they never read alike ("needs ≈ 0,000002 and has ≈ 0,000002" for 0.00000204 and 0.000002 ETH).
const twoDigitsWei = (wei, up) => {
  const unit = 10n ** BigInt(Math.max(0, wei.toString().length - 2));
  return ((up ? wei + unit - 1n : wei) / unit) * unit;
};
const shortfallPt = (balance, required) => ({ has: formatEthPt(twoDigitsWei(balance, false)), needs: formatEthPt(twoDigitsWei(required, true)) });

export const GAS_RESERVE_LABEL_PT = "Reserva de rede para vender depois";

/**
 * "≈ 0,00005 ETH na Robinhood Chain, para a taxa de rede quando você vender". It names no number of
 * sells: 0.00005 ETH pays about 32 at today's base fee, 8 at the 30-day median and 1 at the p95
 *.
 */
export const gasReserveNotePt = (reserve) => `≈ ${formatEthPt(reserve.amountWei)} ETH na Robinhood Chain, para a taxa de rede quando você vender`;

/** The buy review's reserve line, or null when the quote has none. */
export function gasReserveLinePt(quote) {
  const reserve = quote?.gasReserve;
  return reserve ? { label: GAS_RESERVE_LABEL_PT, note: gasReserveNotePt(reserve), brl: reserve.brl } : null;
}

// The sell is already registered and holds this device's one operation (assertNoOtherActiveRamp;
// detail-actions.js turns "Comprar" into "Ver operação em andamento"), so a new purchase, which
// would top the reserve up, cannot start now: only ETH sent to the wallet lets this sell continue.
const NO_BUY_WHILE_OPEN_PT = "Enquanto esta venda estiver aberta, não é possível fazer uma nova compra.";

/**
 * The wallet check right before a sell's transaction failed (kit INSUFFICIENT_NATIVE_GAS). Empty
 * wallet: the reserve is gone. Some ETH left: either the reserve is nearly used up (it runs down to
 * dust) or the fee rose; the balance alone cannot tell which,
 * so neither is claimed as the cause. The operation is registered; the flow offers "Continuar esta venda".
 * @param {{balanceWei?:string|bigint, requiredWei?:string|bigint}|null} details
 */
export function gasShortfallPt(details) {
  const balance = toWei(details?.balanceWei);
  const required = toWei(details?.requiredWei);
  if (balance === 0n) {
    return `Falta ETH para a taxa de rede desta venda: a reserva que vem com a compra já não está nesta carteira. Envie um pouco de ETH para a sua carteira, somente pela rede Robinhood Chain, e depois continue esta venda. ${NO_BUY_WHILE_OPEN_PT}`;
  }
  const shortfall = balance !== null && required !== null ? shortfallPt(balance, required) : null;
  const amounts = shortfall ? ` (≈ ${shortfall.has} ETH) não cobre a taxa de rede desta confirmação (≈ ${shortfall.needs} ETH)` : " não cobre a taxa de rede desta confirmação";
  return `O ETH da sua carteira${amounts}: a reserva está no fim ou a taxa de rede subiu. Envie um pouco de ETH para a sua carteira, somente pela rede Robinhood Chain, e depois continue esta venda; se a taxa subiu, tentar de novo em alguns minutos também pode resolver. ${NO_BUY_WHILE_OPEN_PT}`;
}
