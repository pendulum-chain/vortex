import { QuoteError } from "@vortexfi/shared";
import Big from "big.js";
import { APIError } from "../../../../errors/api-error";

export interface NablaFeeSubsidy {
  chargedFeeRaw: string;
  grossOutputRaw: string;
  rebateRaw: string;
  targetFeeRaw: string;
  targetFeeBps: number;
  outputCurrency: string;
  outputDecimals: number;
}

/** Only the DEX fee is rebated. Prices, curve effects, Vortex fees and gas are never part of this basis. */
export function calculateNablaFeeSubsidy(netRaw: string, feeRaw: string, targetBps: number, capBps: number) {
  const net = BigInt(netRaw),
    fee = BigInt(feeRaw);
  if (net <= 0n || fee < 0n || ![targetBps, capBps].every(n => Number.isInteger(n) && n >= 0 && n <= 10000))
    throw new Error("Invalid Nabla fee subsidy basis");
  const gross = net + fee;
  const target = (gross * BigInt(targetBps) + 9999n) / 10000n;
  const rebate = fee > target ? fee - target : 0n;
  if (rebate > (gross * BigInt(capBps)) / 10000n)
    throw new APIError({ isPublic: true, message: QuoteError.StockDexSubsidyUnavailable, status: 503 });
  return {
    chargedFeeRaw: fee.toString(),
    grossOutputRaw: gross.toString(),
    rebateRaw: rebate.toString(),
    targetFeeBps: targetBps,
    targetFeeRaw: (fee < target ? fee : target).toString()
  };
}

export function feeSubsidyDecimal(subsidy: NablaFeeSubsidy): Big {
  return new Big(subsidy.rebateRaw).div(new Big(10).pow(subsidy.outputDecimals));
}
