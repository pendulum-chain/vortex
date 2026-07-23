import type {
  AccountMeta,
  CleanupPhase,
  CreateQuoteRequest,
  EphemeralAccountType,
  Networks,
  QuoteFeeStructure,
  RampCurrency,
  RampPhase,
  UnsignedTx
} from "@vortexfi/shared";
import type { Big } from "big.js";
import type { Transaction } from "sequelize";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import type { PartnerInfo } from "../../core/types";
import type { AnyContextMetadata, ContextSimulation, FlowMetadata } from "./metadata";

export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;
  amountRaw: string;
  token: Token;
  chain: Chain;
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
    vortexFeePenPercentage?: number;
  };
  targetFeeFiatCurrency?: RampCurrency;
}

export type FlowInputResolver<O extends PhaseIO> = (ctx: PhaseCtx) => O | Promise<O>;

export type AccountCapabilities = Readonly<{
  [Type in EphemeralAccountType]?: AccountMeta & { type: Type };
}>;

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
  prefundNativeValueRaw?: string;
  reuseFirstMainNonce?: boolean;
  nonceSpan?: number;
}

export interface PreparedPhaseTxs {
  intents: TxIntent[];
  state?: unknown;
}

export type QuoteFields = Omit<QuoteTicketAttributes, "metadata">;

export interface PrepareGlobals {
  accounts: AccountCapabilities;
  quote: Readonly<QuoteFields>;
  destinationAddress?: string;
  taxId?: string;
  userId?: string;
}

export interface PrepareCtx<Metadata, RegistrationFacts = never> extends PrepareGlobals {
  globals: FlowMetadata["globals"];
  ownMetadata: Readonly<Metadata>;
  ownRegistrationFacts: Readonly<RegistrationFacts> | undefined;
}

export interface FlowPrepareCtx extends PrepareGlobals {
  metadata: FlowMetadata;
  registrationFacts?: Record<string, unknown>;
}

export interface PreparedFlowTxs {
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<StateMetadata>;
}

export interface PhaseResult<O extends PhaseIO, Metadata> {
  expiresAt?: Date;
  fees?: PhaseCtx["fees"];
  metadata: Metadata;
  output: O;
}

export interface RegisterCtx<Metadata, RegistrationInput extends Record<string, unknown> = Record<string, unknown>> {
  authenticatedUser: Readonly<{ id: string }>;
  input: Readonly<RegistrationInput>;
  ipAddress?: string;
  metadata: Readonly<Metadata>;
  quote: Readonly<QuoteFields>;
  signingAccounts: readonly AccountMeta[];
  transaction?: Transaction;
}

export interface RegistrationResult<Facts, Metadata> {
  facts: Facts;
  metadata?: Metadata;
  responseArtifacts?: Readonly<Record<string, unknown>>;
}

export interface Phase<
  Context extends AnyContextMetadata,
  I extends PhaseIO,
  O extends PhaseIO,
  RegistrationFacts = never,
  RegistrationInput extends Record<string, unknown> = Record<string, unknown>
> {
  readonly context: Context;
  readonly name: string;
  readonly phases: RampPhase[];
  // Property (not method) so pipe's brand check stays contravariant under strictFunctionTypes.
  readonly simulate: (input: I, ctx: PhaseCtx) => Promise<PhaseResult<O, ContextSimulation<Context>>>;
  // One executor per entry in `phases`, in the same order. Optional while corridors
  // are ported incrementally; a flow whose phases all carry executors is fully
  // execution-ready and registerable into the phase registry.
  readonly executors?: PhaseHandler[];
  // The unsigned transactions this phase's executors expect the ephemeral/user to presign,
  // as nonce-free intents; the flow assembler allocates nonces per (network, signer, lane).
  // Optional: phases whose executors sign live (funding account) or need no tx omit it.
  readonly prepareTxs?: (ctx: PrepareCtx<ContextSimulation<Context>, RegistrationFacts>) => Promise<PreparedPhaseTxs>;
  readonly register?: (
    ctx: RegisterCtx<ContextSimulation<Context>, RegistrationInput>
  ) => Promise<RegistrationResult<RegistrationFacts, ContextSimulation<Context>>>;
}

export interface FlowRegisterCtx extends Omit<RegisterCtx<never>, "metadata"> {
  metadata: FlowMetadata;
}

export interface FlowRegistrationResult {
  metadata: FlowMetadata;
  registrationFacts: Record<string, unknown>;
  responseArtifacts: Record<string, unknown>;
}

export interface Flow<O extends PhaseIO = PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];
  readonly executors: PhaseHandler[];
  register(ctx: FlowRegisterCtx): Promise<FlowRegistrationResult>;
  simulate(ctx: PhaseCtx): Promise<{ expiresAt?: Date; metadata: FlowMetadata; output: O }>;
  prepareTxs(ctx: FlowPrepareCtx): Promise<PreparedFlowTxs>;
}
