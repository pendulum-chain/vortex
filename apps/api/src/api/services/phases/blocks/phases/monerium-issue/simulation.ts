import {
  type EvmNetworks,
  EvmToken,
  FiatToken,
  type MoneriumChain,
  multiplyByPowerOfTen,
  Networks,
  type RampCurrency
} from "@vortexfi/shared";
import Big from "big.js";
import { calculateFees } from "../../core/fees";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";

export const MONERIUM_EURE_DECIMALS = 18;
export const MONERIUM_EURE = "EURE" as const;
export const MONERIUM_ISSUE_NETWORKS = {
  [Networks.Arbitrum]: { chain: "arbitrum", eureAddress: "0x0c06cCF38114ddfc35e07427B9424adcca9F44F8" },
  [Networks.Base]: { chain: "base", eureAddress: "0xbf6e2966A9C3D99C9E4D069E04f7Bdb9C8aa762C" },
  [Networks.BaseSepolia]: { chain: "basesepolia", eureAddress: "0x29F37F6adCa168B79B8d9567eab9BE3fBF21db85" },
  [Networks.Ethereum]: { chain: "ethereum", eureAddress: "0x39b8B6385416f4cA36a20319F70D28621895279D" },
  [Networks.Polygon]: { chain: "polygon", eureAddress: "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6" },
  [Networks.PolygonAmoy]: { chain: "amoy", eureAddress: "0xeD5D0B6C5BEFfDd607639094397C223536B0Bae7" }
} as const satisfies Partial<Record<EvmNetworks, { chain: MoneriumChain; eureAddress: `0x${string}` }>>;
export type MoneriumIssueNetwork = keyof typeof MONERIUM_ISSUE_NETWORKS;

export function isMoneriumIssueNetwork(network: unknown): network is MoneriumIssueNetwork {
  return typeof network === "string" && Object.hasOwn(MONERIUM_ISSUE_NETWORKS, network);
}

export interface MoneriumIssueMetadata {
  issue: {
    currency: RampCurrency;
    fee: SerializableBig;
    inputAmountDecimal: SerializableBig;
    inputAmountRaw: string;
    outputAmountDecimal: SerializableBig;
    outputAmountRaw: string;
  };
  network: MoneriumIssueNetwork;
}

export const MoneriumIssueContext = defineContext<MoneriumIssueMetadata>()("moneriumIssue", 2);

export async function simulateMoneriumIssue<Network extends MoneriumIssueNetwork>(
  input: PhaseIO<typeof FiatToken.EURC, "fiat">,
  ctx: PhaseCtx,
  network: Network,
  issueFee: string,
  calculateIssueFees: typeof calculateFees = calculateFees
): Promise<PhaseResult<PhaseIO<typeof MONERIUM_EURE, Network>, MoneriumIssueMetadata>> {
  const inputAmountDecimal = new Big(input.amount);
  const issueFeeDecimal = new Big(issueFee);
  if (issueFeeDecimal.lt(0)) {
    throw new Error("MoneriumIssue: issue fee must not be negative");
  }

  const outputAmountDecimal = inputAmountDecimal.minus(issueFeeDecimal);
  if (outputAmountDecimal.lte(0)) {
    throw new Error(
      `MoneriumIssue: issue fee ${issueFeeDecimal.toFixed()} EUR is greater than or equal to input amount ${inputAmountDecimal.toFixed()} EUR`
    );
  }

  const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, MONERIUM_EURE_DECIMALS).toFixed(0, 0);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, MONERIUM_EURE_DECIMALS).toFixed(0, 0);
  const fees = await calculateIssueFees(ctx, {
    anchor: { amount: issueFeeDecimal.toString(), currency: FiatToken.EURC as RampCurrency },
    network: { amount: "0", currency: EvmToken.USDC as RampCurrency }
  });

  ctx.addNote(
    `MoneriumIssue: ${outputAmountDecimal.toFixed()} EURE delivered on ${network} after ${issueFeeDecimal.toFixed()} EUR issue fee`
  );

  return {
    fees,
    metadata: {
      issue: {
        currency: FiatToken.EURC,
        fee: issueFeeDecimal,
        inputAmountDecimal,
        inputAmountRaw,
        outputAmountDecimal,
        outputAmountRaw
      },
      network
    },
    output: evmIO(MONERIUM_EURE, network, outputAmountDecimal, outputAmountRaw)
  };
}
