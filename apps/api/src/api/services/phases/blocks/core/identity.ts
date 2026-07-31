import { createHash } from "node:crypto";
import type { RampPhase } from "@vortexfi/shared";

export const BLOCK_FLOW_CATALOG_VERSION = 1;
export const BLOCK_FLOW_METADATA_SCHEMA_VERSION = 1;
export const BLOCK_FLOW_REGISTRATION_SCHEMA_VERSION = 1;
export const BLOCK_FLOW_STATE_SCHEMA_VERSION = 1;
export const BLOCK_FLOW_TRANSACTION_PLAN_SCHEMA_VERSION = 1;

export interface FlowIdentity {
  id: string;
  version: number;
  catalogVersion: number;
  metadataSchemaVersion: number;
  registrationFactsSchemaVersion: number;
  stateSchemaVersion: number;
  transactionPlanSchemaVersion: number;
  topologyHash: string;
  blockSchemaVersions: Record<string, number>;
}

interface BuildFlowIdentityArgs {
  catalogVersion: number;
  id: string;
  version: number;
  phases: readonly RampPhase[];
  contextSchemaVersions: ReadonlyArray<readonly [string, number]>;
  transitions: Readonly<Record<string, readonly RampPhase[]>>;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildFlowIdentity({
  id,
  catalogVersion,
  version,
  phases,
  contextSchemaVersions,
  transitions
}: BuildFlowIdentityArgs): FlowIdentity {
  const blockSchemaVersions = Object.fromEntries(contextSchemaVersions);
  const topologyHash = createHash("sha256")
    .update(
      canonicalize({
        blockSchemaVersions,
        catalogVersion,
        id,
        metadataSchemaVersion: BLOCK_FLOW_METADATA_SCHEMA_VERSION,
        phases,
        registrationFactsSchemaVersion: BLOCK_FLOW_REGISTRATION_SCHEMA_VERSION,
        stateSchemaVersion: BLOCK_FLOW_STATE_SCHEMA_VERSION,
        transactionPlanSchemaVersion: BLOCK_FLOW_TRANSACTION_PLAN_SCHEMA_VERSION,
        transitions,
        version
      })
    )
    .digest("hex");

  return {
    blockSchemaVersions,
    catalogVersion,
    id,
    metadataSchemaVersion: BLOCK_FLOW_METADATA_SCHEMA_VERSION,
    registrationFactsSchemaVersion: BLOCK_FLOW_REGISTRATION_SCHEMA_VERSION,
    stateSchemaVersion: BLOCK_FLOW_STATE_SCHEMA_VERSION,
    topologyHash,
    transactionPlanSchemaVersion: BLOCK_FLOW_TRANSACTION_PLAN_SCHEMA_VERSION,
    version
  };
}

export function assertFlowIdentity(actual: unknown, expected: FlowIdentity): asserts actual is FlowIdentity {
  if (!actual || typeof actual !== "object") {
    throw new Error(`Missing persisted flow identity for ${expected.id}@${expected.version}`);
  }
  const value = actual as Partial<FlowIdentity>;
  for (const field of [
    "id",
    "version",
    "catalogVersion",
    "metadataSchemaVersion",
    "registrationFactsSchemaVersion",
    "stateSchemaVersion",
    "transactionPlanSchemaVersion",
    "topologyHash"
  ] as const) {
    if (value[field] !== expected[field]) {
      throw new Error(
        `Persisted flow identity mismatch for ${expected.id}@${expected.version}: ${field}=${String(
          value[field]
        )}, expected ${String(expected[field])}`
      );
    }
  }
  if (canonicalize(value.blockSchemaVersions) !== canonicalize(expected.blockSchemaVersions)) {
    throw new Error(`Persisted block schema versions do not match ${expected.id}@${expected.version}`);
  }
}
