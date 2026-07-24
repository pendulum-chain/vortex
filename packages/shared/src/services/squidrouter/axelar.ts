import logger from "../../logger";

export interface AxelarScanStatusFees {
  base_fee: number; // in units of the native token.
  source_base_fee: number;
  destination_base_fee: number;
  source_express_fee: {
    total: number;
  };
  source_confirm_fee: number;
  destination_express_fee: {
    total: number;
  };
  source_token: {
    gas_price: string;
    gas_price_in_units: {
      decimals: number;
      value: string;
    };
  };
  execute_gas_multiplier: number;
}

export interface AxelarScanStatusResponse {
  is_insufficient_fee: boolean;
  status: string; // executed or express_executed (for complete).
  fees: AxelarScanStatusFees;
  id: string; // the id of the swap.
  // Set by axelarscan when the validator poll confirming the source event failed.
  // Axelar's own relayer does not retry a failed poll, so the transfer stays in
  // status "called" until a new ConfirmGatewayTx is broadcast.
  confirm_failed?: boolean;
  call?: {
    chain: string; // source chain in Axelar naming, e.g. "base"
  };
  // e.g. "gas_paid", "gas_unpaid", "gas_paid_not_enough_gas"
  gas_status?: string;
}

/**
 * Coarse GMP states that matter for stuck-transfer handling. Derived from the
 * axelarscan status so callers can decide between alerting, adding gas, or
 * triggering confirm recovery.
 */
export type GmpClassification =
  | "executed"
  | "insufficient_gas"
  | "source_confirmation_stuck"
  | "waiting_source_confirmation"
  | "relayer_pending"
  | "execution_failed"
  | "unknown";

export function classifyGmpStatus(status: AxelarScanStatusResponse | undefined | null): GmpClassification {
  if (!status || !status.status) return "unknown";
  if (status.status === "executed" || status.status === "express_executed") return "executed";
  // Checked before the per-status mapping: a transfer can sit in "called" or
  // "approved" solely because the paid gas no longer covers execution.
  if (
    status.is_insufficient_fee ||
    status.status === "insufficient_fee" ||
    status.status.endsWith("_without_gas_paid") ||
    status.gas_status === "gas_paid_not_enough_gas"
  ) {
    return "insufficient_gas";
  }
  if (status.status === "called") return status.confirm_failed ? "source_confirmation_stuck" : "waiting_source_confirmation";
  if (status.status === "confirming" || status.status === "confirmable") return "waiting_source_confirmation";
  // "confirmed" means the source confirmation already succeeded — the transfer is
  // waiting on approval/execution, so another ConfirmGatewayTx would be irrelevant.
  if (
    ["confirmed", "approving", "approvable", "approved", "executing", "executable", "express_executable"].includes(
      status.status
    )
  ) {
    return "relayer_pending";
  }
  if (status.status === "error") return "execution_failed";
  return "unknown";
}
const AXELAR_SIGNING_RELAYER_URL = "https://axelar-signing-relayer-mainnet.axelar.dev";
const AXELAR_RPC_URL = "https://mainnet.rpc.axelar.dev/chain/axelar";

/**
 * Recovers a GMP transfer stuck at the confirmation step (status "called" with
 * confirm_failed) by asking Axelar's recovery signing service for a signed
 * ConfirmGatewayTx and broadcasting it to the Axelar network. This restarts the
 * validator poll; once it passes, approval and execution proceed automatically.
 *
 * Uses only the public tx hash — no wallet or keys are involved. The official
 * axelarjs-sdk `manualRelayToDestChain` performs the same steps but mangles the
 * relayer's byte response (numeric-keyed JSON) and broadcasts an empty tx, so we
 * do the byte handling and broadcast ourselves.
 *
 * @param txHash The source-chain transaction hash of the stuck GMP call
 * @param sourceChain The source chain in Axelar naming (e.g. "base")
 * @param signal Aborts the recovery's network calls when the caller gives up
 * @returns The Axelar transaction hash of the broadcast ConfirmGatewayTx
 */
export async function recoverAxelarStuckConfirm(txHash: string, sourceChain: string, signal?: AbortSignal): Promise<string> {
  const relayerResponse = await fetch(`${AXELAR_SIGNING_RELAYER_URL}/confirm_gateway_tx`, {
    body: JSON.stringify({ chain: sourceChain, module: "evm", txHash }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal
  });
  if (!relayerResponse.ok) {
    throw new Error(`Axelar signing relayer returned HTTP ${relayerResponse.status}`);
  }

  // The relayer returns the signed tx bytes as JSON: either a Buffer-style
  // {data: [..]} array or a numeric-keyed object {data: {"0": 10, "1": 137, ...}}.
  // Anything else is rejected rather than silently coerced into corrupt bytes.
  const relayerJson = (await relayerResponse.json()) as { data?: unknown };
  const rawBytes = relayerJson.data;
  let byteValues: unknown[];
  if (Array.isArray(rawBytes)) {
    byteValues = rawBytes;
  } else if (rawBytes !== null && typeof rawBytes === "object") {
    byteValues = Object.keys(rawBytes)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map(key => (rawBytes as Record<string, unknown>)[key]);
  } else {
    throw new Error("Axelar signing relayer returned an unexpected response shape");
  }
  if (byteValues.length === 0) {
    throw new Error("Axelar signing relayer returned an empty transaction");
  }
  if (!byteValues.every(byte => typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error("Axelar signing relayer returned invalid transaction bytes");
  }

  // Encode in chunks: one String.fromCharCode call per byte is quadratic on large
  // arrays, while spreading the whole array at once risks the argument-count limit.
  const CHUNK_SIZE = 0x2000;
  const binaryChunks: string[] = [];
  for (let i = 0; i < byteValues.length; i += CHUNK_SIZE) {
    binaryChunks.push(String.fromCharCode(...(byteValues.slice(i, i + CHUNK_SIZE) as number[])));
  }
  const txBase64 = btoa(binaryChunks.join(""));

  const rpcResponse = await fetch(AXELAR_RPC_URL, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "broadcast_tx_sync", params: { tx: txBase64 } }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal
  });
  if (!rpcResponse.ok) {
    throw new Error(`Axelar RPC returned HTTP ${rpcResponse.status}`);
  }

  const rpcJson = (await rpcResponse.json()) as { result?: { code?: number; hash?: string; log?: string } };
  if (!rpcJson.result || rpcJson.result.code !== 0) {
    throw new Error(`Axelar broadcast failed with code ${rpcJson.result?.code}: ${rpcJson.result?.log ?? "unknown error"}`);
  }
  if (!rpcJson.result.hash) {
    throw new Error("Axelar broadcast succeeded but the RPC response contained no transaction hash");
  }

  return rpcJson.result.hash;
}

export async function getStatusAxelarScan(swapHash: string, signal?: AbortSignal): Promise<AxelarScanStatusResponse> {
  try {
    // POST call, https://api.axelarscan.io/gmp/searchGMP
    const response = await fetch("https://api.axelarscan.io/gmp/searchGMP", {
      body: JSON.stringify({
        txHash: swapHash
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      signal
    });

    if (!response.ok) {
      throw new Error(`Error fetching status from axelar scan API: ${response.statusText}`);
    }
    const responseData = await response.json();
    return (responseData as { data: unknown[] }).data[0] as AxelarScanStatusResponse;
  } catch (error) {
    if ((error as { response: unknown }).response) {
      logger.current.error(`Couldn't get status for ${swapHash} from AxelarScan:`, (error as { response: unknown }).response);
    }
    throw error;
  }
}
