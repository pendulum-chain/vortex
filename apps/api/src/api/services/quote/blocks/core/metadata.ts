import type { CreateQuoteRequest, QuoteFeeStructure } from "@vortexfi/shared";
import type { Big } from "big.js";
import type { StateMetadata } from "../../../phases/meta-state-types";
import type { PartnerInfo } from "../../core/types";

declare const simulationType: unique symbol;

export type SerializableBig = Big | string;

export interface ContextMetadata<Key extends string, Simulation> {
  readonly key: Key;
  readonly [simulationType]: Simulation;
}

export type AnyContextMetadata = ContextMetadata<string, unknown>;
export type ContextKey<Context extends AnyContextMetadata> = Context["key"];
export type ContextSimulation<Context extends AnyContextMetadata> = Context[typeof simulationType];

export function defineContext<Simulation>() {
  return <Key extends string>(key: Key): ContextMetadata<Key, Simulation> => ({ key }) as ContextMetadata<Key, Simulation>;
}

export interface FlowGlobals {
  fees: {
    displayFiat?: QuoteFeeStructure;
    usd: { anchor: string; network: string; partnerMarkup: string; total: string; vortex: string };
    vortexFeePenPercentage?: number;
  };
  partner: PartnerInfo | null;
  request: CreateQuoteRequest & { userId?: string };
}

export interface FlowMetadata<Blocks extends Record<string, unknown> = Record<string, unknown>> {
  blocks: Blocks;
  globals: FlowGlobals;
}

export function getBlockMetadata<Context extends AnyContextMetadata>(
  metadata: unknown,
  context: Context
): ContextSimulation<Context> {
  const blocks = (metadata as { blocks?: Record<string, unknown> } | null)?.blocks;
  const value = blocks?.[context.key];
  if (value === undefined) {
    throw new Error(`Missing ${context.key} block metadata`);
  }
  return value as ContextSimulation<Context>;
}

export function getBlockState<State>(state: StateMetadata, context: AnyContextMetadata): State {
  const value = state.blockState?.[context.key];
  if (value === undefined) {
    throw new Error(`Missing ${context.key} block state`);
  }
  return value as State;
}
