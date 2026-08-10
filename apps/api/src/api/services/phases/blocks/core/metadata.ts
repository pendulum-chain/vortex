import {
  type CreateQuoteRequest,
  type EvmNetworks,
  isNetworkEVM,
  Networks,
  type QuoteFeeStructure,
  type RampCurrency
} from "@vortexfi/shared";
import Big from "big.js";
import type { StateMetadata } from "../../../phases/meta-state-types";
import type { PartnerInfo } from "../../../quote/core/types";
import type { FlowIdentity } from "./identity";

declare const simulationType: unique symbol;

export type SerializableBig = Big | string;

export interface ContextMetadata<Key extends string, Simulation> {
  readonly key: Key;
  readonly schemaVersion: number;
  readonly [simulationType]: Simulation;
}

export type AnyContextMetadata = ContextMetadata<string, unknown>;
export type ContextKey<Context extends AnyContextMetadata> = Context["key"];
export type ContextSimulation<Context extends AnyContextMetadata> = Context[typeof simulationType];

export function defineContext<Simulation>() {
  return <Key extends string>(key: Key, schemaVersion = 1): ContextMetadata<Key, Simulation> =>
    ({ key, schemaVersion }) as ContextMetadata<Key, Simulation>;
}

export interface EvmDestinationGasQuote {
  executionFeeUsd: string;
  fundingGasLimit: string;
  isNativeTransfer: boolean;
  maximumFeePerGas: string;
  maximumFundingL1FeeRaw?: string;
  maximumPayoutL1FeeRaw?: string;
  network: EvmNetworks;
  programVersion: 2;
  transferGasLimit: string;
}

export interface FlowGlobals {
  evmDestinationGas?: EvmDestinationGasQuote;
  fees: {
    displayFiat?: QuoteFeeStructure;
    usd: { anchor: string; network: string; partnerMarkup: string; total: string; vortex: string };
    vortexFeePenPercentage?: number;
  };
  partner: PartnerInfo | null;
  request: CreateQuoteRequest & { userId?: string };
  subsidyDisplay?: { currency: RampCurrency; fiat: string; usd: string };
}

export interface FlowMetadata<Blocks extends Record<string, unknown> = Record<string, unknown>> {
  blocks: Blocks;
  flow?: FlowIdentity;
  globals: FlowGlobals;
}

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_UINT64 = 2n ** 64n - 1n;
const MAX_UINT256 = 2n ** 256n - 1n;

function assertPositiveIntegerField(
  value: Record<string, unknown>,
  field: keyof EvmDestinationGasQuote,
  maximum: bigint
): void {
  const fieldValue = value[field];
  if (
    typeof fieldValue !== "string" ||
    !POSITIVE_INTEGER_PATTERN.test(fieldValue) ||
    fieldValue.length > maximum.toString().length ||
    BigInt(fieldValue) > maximum
  ) {
    throw new Error(`Invalid EVM destination gas quote ${field}`);
  }
}

function assertEvmDestinationGasQuote(value: unknown): asserts value is EvmDestinationGasQuote {
  if (!isRecord(value)) {
    throw new Error("Invalid EVM destination gas quote envelope");
  }
  if (value.programVersion !== 2) {
    throw new Error(`Unsupported EVM destination funding program ${String(value.programVersion)}`);
  }
  if (typeof value.network !== "string" || !isNetworkEVM(value.network as Networks)) {
    throw new Error("Invalid EVM destination gas quote network");
  }
  if (typeof value.isNativeTransfer !== "boolean") {
    throw new Error("Invalid EVM destination gas quote transfer type");
  }
  if (
    typeof value.executionFeeUsd !== "string" ||
    value.executionFeeUsd.length > 128 ||
    !POSITIVE_DECIMAL_PATTERN.test(value.executionFeeUsd) ||
    !new Big(value.executionFeeUsd).gt(0)
  ) {
    throw new Error("Invalid EVM destination gas quote executionFeeUsd");
  }

  assertPositiveIntegerField(value, "fundingGasLimit", MAX_UINT64);
  assertPositiveIntegerField(value, "transferGasLimit", MAX_UINT64);
  assertPositiveIntegerField(value, "maximumFeePerGas", MAX_UINT256);

  const hasFundingL1Maximum = value.maximumFundingL1FeeRaw !== undefined;
  const hasPayoutL1Maximum = value.maximumPayoutL1FeeRaw !== undefined;
  if (hasFundingL1Maximum !== hasPayoutL1Maximum) {
    throw new Error("Incomplete EVM destination gas quote L1 fee envelope");
  }
  const isBase = value.network === Networks.Base || value.network === Networks.BaseSepolia;
  if (isBase && !hasFundingL1Maximum) {
    throw new Error("Base destination gas quote is missing its L1 fee envelope");
  }
  if (hasFundingL1Maximum) {
    assertPositiveIntegerField(value, "maximumFundingL1FeeRaw", MAX_UINT256);
    assertPositiveIntegerField(value, "maximumPayoutL1FeeRaw", MAX_UINT256);
  }
}

export function getFlowMetadata(metadata: unknown): FlowMetadata {
  const value = metadata as Partial<FlowMetadata> | null;
  if (
    !isRecord(value) ||
    !isRecord(value.blocks) ||
    !isRecord(value.globals) ||
    !isRecord(value.globals.request) ||
    !isRecord(value.globals.fees) ||
    !isRecord(value.globals.fees.usd)
  ) {
    throw new Error("Quote does not contain block flow metadata");
  }
  if (value.globals.evmDestinationGas !== undefined) {
    assertEvmDestinationGasQuote(value.globals.evmDestinationGas);
  }
  return value as FlowMetadata;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getBlockMetadata<Context extends AnyContextMetadata>(
  metadata: unknown,
  context: Context
): ContextSimulation<Context> {
  const blocks = (metadata as { blocks?: Record<string, unknown> } | null)?.blocks;
  const value = blocks?.[context.key];
  if (!isRecord(value)) {
    throw new Error(`Missing ${context.key} block metadata`);
  }
  return value as ContextSimulation<Context>;
}

export function getBlockState<State>(state: StateMetadata, context: AnyContextMetadata): State {
  const value = state.blockState?.[context.key];
  if (!isRecord(value)) {
    throw new Error(`Missing ${context.key} block state`);
  }
  return value as State;
}
