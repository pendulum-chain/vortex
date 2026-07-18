import type {
  AccountMeta,
  CleanupPhase,
  CreateQuoteRequest,
  Networks,
  QuoteFeeStructure,
  RampCurrency,
  RampPhase,
  UnsignedTx
} from "@vortexfi/shared";
import type { Big } from "big.js";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import type { PartnerInfo } from "../../core/types";

export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;
  amountRaw: string;
  token: Token;
  chain: Chain;
  meta: Record<string, unknown>;
}

export interface PhaseCtx {
  request: CreateQuoteRequest & { userId?: string };
  partner: PartnerInfo | null;
  now: Date;
  notes: string[];
  addNote(note: string): void;
  fees?: {
    usd?: { vortex: string; anchor: string; partnerMarkup: string; network: string; total: string };
    displayFiat?: QuoteFeeStructure;
  };
}

// Nonce lanes. Per (network, signer): "main" intents get sequential nonces in flow order,
// "backup" intents follow after all main nonces, "cleanup" intents come last. An intent with
// reuseFirstMainNonce takes the first main-lane nonce on its (network, signer) instead of the
// next sequential one — a contingency tx that must never be stranded behind an unreachable nonce.
export type TxLane = "main" | "backup" | "cleanup";

export interface TxIntent {
  phase: RampPhase | CleanupPhase;
  network: Networks;
  signer: string;
  txData: UnsignedTx["txData"];
  lane: TxLane;
  reuseFirstMainNonce?: boolean;
}

export interface PreparedPhaseTxs {
  intents: TxIntent[];
  stateMeta?: Partial<StateMetadata>;
}

export interface PrepareCtx {
  quote: QuoteTicketAttributes;
  evmEphemeral: AccountMeta;
  destinationAddress: string;
  taxId?: string;
}

export interface PreparedFlowTxs {
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<StateMetadata>;
}

export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];
  // Property (not method) so pipe's brand check stays contravariant under strictFunctionTypes.
  readonly simulate: (input: I, ctx: PhaseCtx) => Promise<O>;
  // One executor per entry in `phases`, in the same order. Optional while corridors
  // are ported incrementally; a flow whose phases all carry executors is fully
  // execution-ready (registerable into the phase registry, unwired for now).
  readonly executors?: PhaseHandler[];
  // The unsigned transactions this phase's executors expect the ephemeral/user to presign,
  // as nonce-free intents; the flow assembler allocates nonces per (network, signer, lane).
  // Optional: phases whose executors sign live (funding account) or need no tx omit it.
  readonly prepareTxs?: (ctx: PrepareCtx) => Promise<PreparedPhaseTxs>;
}

export interface Flow {
  readonly name: string;
  readonly phases: RampPhase[];
  readonly executors: PhaseHandler[];
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
  prepareTxs(ctx: PrepareCtx): Promise<PreparedFlowTxs>;
}
