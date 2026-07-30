import { createHash } from "node:crypto";
import httpStatus from "http-status";
import FinancialOperation from "../../../../../models/financialOperation.model";
import { APIError } from "../../../../errors/api-error";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { abortableCall, throwIfAborted } from "./cancellation";
import type { FlowIdentity } from "./identity";

interface RunFinancialOperationArgs<Result> {
  scopeType: "quote" | "ramp";
  scopeId: string;
  flow: FlowIdentity;
  phase: string;
  attemptClass: string;
  provider: string;
  request: unknown;
  retryFailed?: boolean;
  signal?: AbortSignal;
  perform(idempotencyKey: string): Promise<Result>;
  reconcile?: (operation: FinancialOperation) => Promise<Result | null>;
  externalId?: (result: Result) => string | undefined;
}

export class FinancialOperationReconciliationRequiredError extends APIError {
  readonly requiresManualReconciliation = true;

  constructor(operation: FinancialOperation, reason: string) {
    super({
      message: `Financial operation ${operation.id} ${reason} and requires reconciliation`,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
}

export class FinancialOperationRejectedError extends APIError {
  constructor(message: string) {
    super({ message, status: httpStatus.UNPROCESSABLE_ENTITY });
  }
}

function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    if ("toJSON" in value && typeof value.toJSON === "function") {
      return canonicalize(value.toJSON());
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function serializable<Result>(result: Result): Result {
  return JSON.parse(JSON.stringify(result)) as Result;
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
}

export function requireFinancialFlowIdentity(state: Readonly<StateMetadata>): FlowIdentity {
  if (!state.flow) {
    throw new Error("Ramp state is missing the persisted flow identity required for a financial operation");
  }
  return state.flow;
}

export async function runFinancialOperation<Result>({
  scopeType,
  scopeId,
  flow,
  phase,
  attemptClass,
  provider,
  request,
  perform,
  reconcile,
  externalId,
  retryFailed = false,
  signal
}: RunFinancialOperationArgs<Result>): Promise<Result> {
  throwIfAborted(signal);
  const requestHash = digest(request);
  const operationKey = digest({
    attemptClass,
    flowId: flow.id,
    flowVersion: flow.version,
    phase,
    scopeId,
    scopeType
  });
  const [operation, created] = await FinancialOperation.findOrCreate({
    defaults: {
      attemptClass,
      flowId: flow.id,
      flowVersion: flow.version,
      operationKey,
      phase,
      provider,
      requestHash,
      scopeId,
      scopeType,
      status: "not_started"
    },
    where: { operationKey }
  });

  if (operation.requestHash !== requestHash && !(operation.status === "failed" && retryFailed)) {
    throw new APIError({
      message: `Financial operation ${operation.id} was already claimed with different inputs`,
      status: httpStatus.CONFLICT
    });
  }
  if (!created) {
    if (operation.status === "confirmed" && operation.response !== null) {
      return operation.response as Result;
    }
    if (reconcile) {
      const reconciled = await reconcile(operation);
      if (reconciled !== null) {
        const stored = serializable(reconciled);
        await operation.update({
          externalId: externalId?.(reconciled) ?? operation.externalId,
          response: stored,
          status: "confirmed"
        });
        return reconciled;
      }
    }
    if (operation.status === "failed") {
      if (!retryFailed) {
        throw new APIError({
          message: `Financial operation ${operation.id} definitively failed; a new authorized attempt is required`,
          status: httpStatus.CONFLICT
        });
      }
      // A definitive 4xx/provider rejection did not create the financial side effect.
      // Resetting this logical operation is safe and permits corrected registration
      // input to reuse the same stable operation identity.
      await operation.update({ errorMessage: null, requestHash, response: null, status: "not_started" });
    } else if (operation.status === "not_started") {
      // The creator could have crashed before claiming the operation. Claiming is an
      // atomic state change made before the provider call, so only this state is safe
      // to resume automatically.
    } else {
      if (operation.status === "submitted") {
        await operation.update({ status: "unknown" });
      }
      throw new FinancialOperationReconciliationRequiredError(operation, `has ${operation.status} outcome`);
    }
  }

  const [claimed] = await FinancialOperation.update(
    { errorMessage: null, status: "submitted" },
    { where: { id: operation.id, status: "not_started" } }
  );
  if (claimed !== 1) {
    throw new FinancialOperationReconciliationRequiredError(operation, "is already in progress");
  }

  if (signal?.aborted) {
    // The durable claim exists, but no external call has started. Return it to
    // the only state that recovery may safely claim automatically.
    await operation.update({ status: "not_started" });
    throwIfAborted(signal);
  }

  try {
    const result = await abortableCall(signal, () => perform(operationKey));
    const stored = serializable(result);
    await operation.update({
      externalId: externalId?.(result) ?? null,
      response: stored,
      status: "confirmed"
    });
    return result;
  } catch (error) {
    const status = providerStatus(error);
    await operation.update({
      errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      status: status !== undefined && status >= 400 && status < 500 ? "failed" : "unknown"
    });
    throw error;
  }
}
