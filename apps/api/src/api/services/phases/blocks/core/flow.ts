import { EphemeralAccountType, type RampPhase } from "@vortexfi/shared";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { computeFees } from "./fees";
import { assertFlowIdentity, BLOCK_FLOW_CATALOG_VERSION, buildFlowIdentity } from "./identity";
import { type AnyContextMetadata, isRecord } from "./metadata";
import { aggregateNativePrefunding, allocateNonces } from "./prepare";
import type {
  Flow,
  FlowInputResolver,
  FlowPrepareCtx,
  FlowRegisterCtx,
  FlowStartCtx,
  FlowStartResult,
  PhaseCtx,
  PhaseIO,
  PhaseResult,
  PrepareCtx,
  PreparedFlowTxs,
  PreparedPhaseTxs,
  RegistrationResult,
  StartResult,
  TxIntent
} from "./types";

// Internal type-erased phase storage. `never` input makes any Phase<I, O> assignable under
// contravariance; the builder's pipe() adjacency check is what guarantees the runtime inputs line up.
type AnyPhase = {
  readonly executors?: PhaseHandler[];
  readonly context: AnyContextMetadata;
  readonly name: string;
  readonly phases: RampPhase[];
  readonly prepareTxs?: (ctx: never) => Promise<{ intents: TxIntent[]; state?: unknown }>;
  readonly register?: (ctx: never) => Promise<RegistrationResult<unknown, unknown>>;
  readonly simulate: (input: never, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>>;
  readonly start?: (ctx: never) => Promise<StartResult<unknown>>;
};

export class FlowBuilder<O extends PhaseIO> {
  private constructor(
    private readonly inputResolver: FlowInputResolver<PhaseIO>,
    private readonly phaseList: AnyPhase[]
  ) {}

  static start<First extends PhaseIO, Next extends PhaseIO>(
    inputResolver: FlowInputResolver<First>,
    first: AnyPhase & { simulate: (input: First, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next> {
    return new FlowBuilder<Next>(inputResolver, [first]);
  }

  pipe<Next extends PhaseIO>(
    next: AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next> {
    return new FlowBuilder<Next>(this.inputResolver, [...this.phaseList, next]);
  }

  build(
    name: string,
    staticStateMeta: Partial<StateMetadata> = {},
    version = 1,
    catalogVersion = BLOCK_FLOW_CATALOG_VERSION
  ): Flow<O> {
    const inputResolver = this.inputResolver;
    const phaseList = this.phaseList;
    const seenKeys = new Set<string>();
    const seenPhases = new Set<RampPhase>();
    for (const phase of phaseList) {
      if (seenKeys.has(phase.context.key)) {
        throw new Error(`Flow ${name} defines duplicate metadata key ${phase.context.key}`);
      }
      seenKeys.add(phase.context.key);
      const phaseExecutors = phase.executors ?? [];
      if (phase.phases.length !== phaseExecutors.length) {
        throw new Error(
          `Flow ${name} block ${phase.name} defines ${phase.phases.length} phases but ${phaseExecutors.length} executors`
        );
      }
      for (const [index, phaseName] of phase.phases.entries()) {
        if (seenPhases.has(phaseName)) {
          throw new Error(`Flow ${name} defines duplicate phase ${phaseName}`);
        }
        seenPhases.add(phaseName);
        if (phaseExecutors[index]?.getPhaseName() !== phaseName) {
          throw new Error(`Flow ${name} block ${phase.name} executor ${index} does not match persisted phase ${phaseName}`);
        }
      }
    }
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    const phaseFlow: RampPhase[] = ["initial", ...phases, "complete"];
    if (new Set(phaseFlow).size !== phaseFlow.length) {
      throw new Error(`Flow ${name} phase sequence contains duplicate names`);
    }
    const transitions: Record<string, readonly RampPhase[]> = {};
    for (let index = 0; index < phaseFlow.length - 1; index++) {
      const from = phaseFlow[index];
      const next = phaseFlow[index + 1];
      transitions[from] = next === "failed" ? [next] : [next, "failed"];
    }
    const identity = buildFlowIdentity({
      catalogVersion,
      contextSchemaVersions: phaseList.map(phase => [phase.context.key, phase.context.schemaVersion] as const),
      id: name,
      phases,
      transitions,
      version
    });

    const assertMetadata = (metadata: unknown, options: { allowLegacy?: boolean } = {}): void => {
      if (!isRecord(metadata) || !isRecord(metadata.blocks) || !isRecord(metadata.globals)) {
        throw new Error(`Invalid persisted metadata envelope for ${name}@${identity.version}`);
      }
      if (metadata.flow === undefined) {
        if (!options.allowLegacy) {
          throw new Error(`Persisted metadata is missing the flow identity for ${name}@${identity.version}`);
        }
      } else {
        assertFlowIdentity(metadata.flow, identity);
      }
      const actualKeys = Object.keys(metadata.blocks).sort();
      const expectedKeys = [...seenKeys].sort();
      if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(
          `Persisted block set does not match ${name}@${identity.version}: got ${actualKeys.join(",")}, expected ${expectedKeys.join(",")}`
        );
      }
      for (const key of expectedKeys) {
        if (!isRecord(metadata.blocks[key])) {
          throw new Error(`Persisted metadata for ${name}@${identity.version} block ${key} is not an object`);
        }
      }
    };

    const assertState = (state: unknown): void => {
      if (!isRecord(state)) {
        throw new Error(`Invalid persisted state envelope for ${name}@${identity.version}`);
      }
      assertFlowIdentity(state.flow, identity);
      const storedPhaseFlow = state.phaseFlow;
      if (
        !Array.isArray(storedPhaseFlow) ||
        storedPhaseFlow.some(value => typeof value !== "string") ||
        JSON.stringify(storedPhaseFlow) !== JSON.stringify(phaseFlow)
      ) {
        throw new Error(`Persisted phase sequence does not match ${name}@${identity.version}`);
      }
      if (state.blockState !== undefined) {
        if (!isRecord(state.blockState)) {
          throw new Error(`Invalid persisted block state for ${name}@${identity.version}`);
        }
        for (const [key, value] of Object.entries(state.blockState)) {
          if (!seenKeys.has(key) || !isRecord(value)) {
            throw new Error(`Invalid persisted state for ${name}@${identity.version} block ${key}`);
          }
        }
      }
      if (state.transactionPlan !== undefined) {
        if (!isRecord(state.transactionPlan)) {
          throw new Error(`Invalid transaction plan for ${name}@${identity.version}`);
        }
        for (const field of ["nativePrefunding", "settlementBaselines"] as const) {
          const values = state.transactionPlan[field];
          if (values !== undefined && (!isRecord(values) || Object.values(values).some(value => typeof value !== "string"))) {
            throw new Error(`Invalid ${field} transaction-plan values for ${name}@${identity.version}`);
          }
        }
      }
    };

    return {
      assertMetadata,
      assertState,
      contextKeys: [...seenKeys],
      executors,
      identity,
      name,
      phases,
      async prepareTxs(ctx: FlowPrepareCtx): Promise<PreparedFlowTxs> {
        assertMetadata(ctx.metadata, { allowLegacy: true });
        if (ctx.registrationFacts !== undefined) {
          if (!isRecord(ctx.registrationFacts)) {
            throw new Error(`Invalid registration facts for ${name}@${identity.version}`);
          }
          for (const [key, value] of Object.entries(ctx.registrationFacts)) {
            if (!seenKeys.has(key) || !isRecord(value)) {
              throw new Error(`Invalid registration facts for ${name}@${identity.version} block ${key}`);
            }
          }
        }
        const intents: TxIntent[] = [];
        const blockState: Record<string, unknown> = {};
        const accountAddresses = Object.fromEntries(
          Object.entries(ctx.accounts).flatMap(([type, account]) => (account ? [[type, account.address]] : []))
        );
        const stateMeta: Omit<Partial<StateMetadata>, "blockState"> = {
          accountAddresses,
          ...(ctx.destinationAddress ? { destinationAddress: ctx.destinationAddress } : {}),
          ...(ctx.accounts[EphemeralAccountType.EVM]
            ? { evmEphemeralAddress: ctx.accounts[EphemeralAccountType.EVM].address }
            : {}),
          ...(ctx.accounts[EphemeralAccountType.Substrate]
            ? { substrateEphemeralAddress: ctx.accounts[EphemeralAccountType.Substrate].address }
            : {}),
          ...staticStateMeta
        };
        for (const phase of phaseList) {
          if (!phase.prepareTxs) {
            continue;
          }
          const prepareTxs = phase.prepareTxs as (ctx: PrepareCtx<never, never>) => Promise<PreparedPhaseTxs>;
          const prepared = await prepareTxs({
            accounts: ctx.accounts,
            destinationAddress: ctx.destinationAddress,
            globals: ctx.metadata.globals,
            ownMetadata: ctx.metadata.blocks[phase.context.key] as never,
            ownRegistrationFacts: ctx.registrationFacts?.[phase.context.key] as never,
            quote: ctx.quote,
            taxId: ctx.taxId,
            userId: ctx.userId
          });
          intents.push(...prepared.intents);
          if (prepared.state !== undefined) {
            blockState[phase.context.key] = prepared.state;
          }
        }
        // Same bookends added by assemblePhaseFlow.
        return {
          stateMeta: {
            ...stateMeta,
            blockState,
            flow: identity,
            phaseFlow,
            transactionPlan: { nativePrefunding: aggregateNativePrefunding(intents) }
          },
          unsignedTxs: allocateNonces(intents)
        };
      },
      async register(ctx: FlowRegisterCtx) {
        assertMetadata(ctx.metadata, { allowLegacy: true });
        const blocks = { ...ctx.metadata.blocks };
        const registrationFacts: Record<string, unknown> = {};
        const responseArtifacts: Record<string, unknown> = {};
        for (const phase of phaseList) {
          if (!phase.register) {
            continue;
          }
          const result = await phase.register({
            authenticatedUser: ctx.authenticatedUser,
            input: ctx.input,
            ipAddress: ctx.ipAddress,
            metadata: blocks[phase.context.key],
            quote: ctx.quote,
            signingAccounts: ctx.signingAccounts,
            transaction: ctx.transaction
          } as never);
          registrationFacts[phase.context.key] = result.facts;
          if (result.metadata !== undefined) {
            blocks[phase.context.key] = result.metadata;
          }
          if (result.responseArtifacts !== undefined) {
            responseArtifacts[phase.context.key] = result.responseArtifacts;
          }
        }
        return {
          metadata: { ...ctx.metadata, blocks, flow: identity },
          registrationFacts,
          responseArtifacts
        };
      },
      async simulate(ctx: PhaseCtx) {
        await computeFees(ctx);
        if (!ctx.fees?.usd) {
          throw new Error("Flow simulation requires computed USD fees");
        }
        let current: PhaseIO = await inputResolver(ctx);
        let expiresAt: Date | undefined;
        const blocks: Record<string, unknown> = {};
        for (const phase of phaseList) {
          const result = await phase.simulate(current as never, ctx);
          if (result.fees) {
            ctx.fees = result.fees;
          }
          blocks[phase.context.key] = result.metadata;
          if (result.expiresAt && (!expiresAt || result.expiresAt < expiresAt)) {
            expiresAt = result.expiresAt;
          }
          current = result.output;
        }
        return {
          expiresAt,
          metadata: {
            blocks,
            flow: identity,
            globals: { fees: ctx.fees as never, partner: ctx.partner, request: ctx.request }
          },
          output: current as O
        };
      },
      async start(ctx: FlowStartCtx): Promise<FlowStartResult> {
        assertMetadata(ctx.metadata);
        assertState(ctx.state);
        let metadata = ctx.metadata;
        let state = ctx.state as StateMetadata;
        const responseArtifacts: Record<string, unknown> = {};
        for (const phase of phaseList) {
          if (!phase.start) {
            continue;
          }
          const result = await phase.start({
            metadata: metadata.blocks[phase.context.key],
            ownState: state.blockState?.[phase.context.key],
            quote: ctx.quote,
            state,
            userId: ctx.userId
          } as never);
          if (result.metadata !== undefined) {
            metadata = { ...metadata, blocks: { ...metadata.blocks, [phase.context.key]: result.metadata } };
          }
          if (result.state !== undefined) {
            state = { ...state, ...result.state };
          }
          if (result.responseArtifacts !== undefined) {
            responseArtifacts[phase.context.key] = result.responseArtifacts;
          }
        }
        return { metadata, responseArtifacts, state };
      },
      transitions
    };
  }
}
