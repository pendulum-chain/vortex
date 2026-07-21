import type { UnsignedTx } from "@vortexfi/shared";
import type { TxIntent, TxLane } from "./types";

const LANE_ORDER: TxLane[] = ["main", "backup", "cleanup"];

function nativePrefundingKey(network: string, signer: string): string {
  return `${network}:${signer.toLowerCase()}`;
}

export function aggregateNativePrefunding(intents: TxIntent[]): Record<string, string> {
  const requirements = new Map<string, bigint>();
  for (const intent of intents) {
    if (!intent.prefundNativeValueRaw) {
      continue;
    }
    const key = nativePrefundingKey(intent.network, intent.signer);
    requirements.set(key, (requirements.get(key) ?? 0n) + BigInt(intent.prefundNativeValueRaw));
  }
  return Object.fromEntries([...requirements].map(([key, value]) => [key, value.toString()]));
}

export function getNativePrefunding(
  transactionPlan: { nativePrefunding?: Record<string, string> } | undefined,
  network: string,
  signer: string
): bigint {
  return BigInt(transactionPlan?.nativePrefunding?.[nativePrefundingKey(network, signer)] ?? "0");
}

export function allocateNonces(intents: TxIntent[]): UnsignedTx[] {
  const nextNonce = new Map<string, number>();
  const firstMainNonce = new Map<string, number>();
  const unsignedTxs: UnsignedTx[] = [];

  for (const lane of LANE_ORDER) {
    for (const intent of intents) {
      if (intent.lane !== lane) {
        continue;
      }
      const key = `${intent.network}:${intent.signer}`;
      let nonce: number;
      const pinnedNonce = firstMainNonce.get(key);
      if (intent.reuseFirstMainNonce && pinnedNonce !== undefined) {
        nonce = pinnedNonce;
      } else {
        nonce = nextNonce.get(key) ?? 0;
        nextNonce.set(key, nonce + 1);
      }
      if (lane === "main" && !firstMainNonce.has(key)) {
        firstMainNonce.set(key, nonce);
      }
      unsignedTxs.push({
        meta: {},
        network: intent.network,
        nonce,
        phase: intent.phase,
        signer: intent.signer,
        txData: intent.txData
      });
    }
  }

  return unsignedTxs;
}
