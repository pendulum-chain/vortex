import { QuoteError } from "@vortexfi/shared";

export interface APIErrorResponse {
  message: string;
  errors?: unknown[];
  status: number;
  isPublic?: boolean;
}

export class VortexSdkError extends Error {
  public readonly status: number;
  public readonly isPublic: boolean;
  public readonly errors?: unknown[];
  public readonly originalError?: Error;

  constructor(message: string, status = 500, isPublic = false, errors?: unknown[], originalError?: Error) {
    super(message);
    this.name = "VortexSdkError";
    this.status = status;
    this.isPublic = isPublic;
    this.errors = errors;
    this.originalError = originalError;
  }
}

export class RegisterRampError extends VortexSdkError {
  constructor(message: string, status = 400, originalError?: Error) {
    super(message, status, true, undefined, originalError);
    this.name = "RegisterRampError";
  }
}

export class MissingRequiredFieldsError extends RegisterRampError {
  constructor(missingFields: string[]) {
    super(`Missing required fields: ${missingFields.join(", ")}`, 400);
    this.name = "MissingRequiredFieldsError";
  }
}

export class QuoteNotFoundError extends RegisterRampError {
  constructor() {
    super(QuoteError.QuoteNotFound, 404);
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteExpiredError extends RegisterRampError {
  constructor() {
    super("Quote has expired", 400);
    this.name = "QuoteExpiredError";
  }
}

export class InvalidNetworkError extends RegisterRampError {
  constructor(network: string) {
    super(`Invalid network: "${network}" provided`, 400);
    this.name = "InvalidNetworkError";
  }
}

export class InvalidAdditionalDataError extends RegisterRampError {
  constructor(field: string) {
    super(`Invalid ${field} format`, 400);
    this.name = "InvalidAdditionalDataError";
  }
}

export type EphemeralChain = "Substrate" | "EVM" | "Stellar";

export class EphemeralNotFreshError extends RegisterRampError {
  public readonly chain: EphemeralChain;
  public readonly ephemeralAddress: string;

  constructor(message: string, chain: EphemeralChain, ephemeralAddress: string, status = 400) {
    super(message, status);
    this.name = "EphemeralNotFreshError";
    this.chain = chain;
    this.ephemeralAddress = ephemeralAddress;
  }
}

export class EphemeralFreshnessCheckError extends RegisterRampError {
  public readonly chain: EphemeralChain;
  public readonly ephemeralAddress: string;

  constructor(message: string, chain: EphemeralChain, ephemeralAddress: string) {
    super(message, 503);
    this.name = "EphemeralFreshnessCheckError";
    this.chain = chain;
    this.ephemeralAddress = ephemeralAddress;
  }
}

// BRL Onramp specific errors
export class BrlOnrampError extends RegisterRampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "BrlOnrampError";
  }
}

export class MissingBrlParametersError extends BrlOnrampError {
  constructor() {
    super("Parameters destinationAddress and taxId are required for onramp", 400);
    this.name = "MissingBrlParametersError";
  }
}

export class MoonbeamEphemeralNotFoundError extends BrlOnrampError {
  constructor() {
    super("Moonbeam ephemeral not found", 400);
    this.name = "MoonbeamEphemeralNotFoundError";
  }
}

export class SubaccountNotFoundError extends BrlOnrampError {
  constructor() {
    super("Subaccount not found. Provided taxId has not been KYC'ed", 404);
    this.name = "SubaccountNotFoundError";
  }
}

export class KycInvalidError extends BrlOnrampError {
  constructor() {
    super("KYC invalid", 400);
    this.name = "KycInvalidError";
  }
}

export class BrlKycStatusError extends BrlOnrampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "BrlKycStatusError";
  }
}

export class AmountExceedsLimitError extends BrlOnrampError {
  constructor() {
    super("Amount exceeds KYC limits", 400);
    this.name = "AmountExceedsLimitError";
  }
}

// BRL Offramp specific errors
export class BrlOfframpError extends RegisterRampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "BrlOfframpError";
  }
}

export class MissingBrlOfframpParametersError extends BrlOfframpError {
  constructor() {
    super("receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL", 400);
    this.name = "MissingBrlOfframpParametersError";
  }
}

export class InvalidPixKeyError extends BrlOfframpError {
  constructor() {
    super("Invalid pixKey", 400);
    this.name = "InvalidPixKeyError";
  }
}

// Alfredpay Onramp specific errors
export class AlfredpayOnrampError extends RegisterRampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "AlfredpayOnrampError";
  }
}

export class MissingAlfredpayOnrampParametersError extends AlfredpayOnrampError {
  constructor() {
    super("Parameter destinationAddress is required for Alfredpay onramp", 400);
    this.name = "MissingAlfredpayOnrampParametersError";
  }
}

export class AlfredpayOnrampKycRequiredError extends AlfredpayOnrampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "AlfredpayOnrampKycRequiredError";
  }
}

function extractErrorStatus(response: Record<string, unknown>): number {
  for (const key of ["status", "statusCode", "code"]) {
    const value = response[key];
    if (typeof value === "number") {
      return value;
    }
  }

  const nestedError = response.error;
  if (nestedError && typeof nestedError === "object") {
    return extractErrorStatus(nestedError as Record<string, unknown>);
  }

  return 500;
}

// Alfredpay Offramp specific errors
export class AlfredpayOfframpError extends RegisterRampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "AlfredpayOfframpError";
  }
}

export class MissingAlfredpayOfframpParametersError extends AlfredpayOfframpError {
  constructor(message = "Parameters fiatAccountId and walletAddress are required for Alfredpay offramp") {
    super(message, 400);
    this.name = "MissingAlfredpayOfframpParametersError";
  }
}

// Monerium specific errors
export class MoneriumError extends RegisterRampError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = "MoneriumError";
  }
}

export class MissingMoneriumOnrampParametersError extends MoneriumError {
  constructor() {
    super("Parameters moneriumAuthToken and destinationAddress are required for Monerium onramp", 400);
    this.name = "MissingMoneriumOnrampParametersError";
  }
}

export class MissingMoneriumOfframpParametersError extends MoneriumError {
  constructor() {
    super("Parameters walletAddress and moneriumAuthToken is required for Monerium onramp", 400);
    this.name = "MissingMoneriumOfframpParametersError";
  }
}

/**
 * Update Ramp Error Types
 */
export class UpdateRampError extends VortexSdkError {
  constructor(message: string, status = 400, originalError?: Error) {
    super(message, status, true, undefined, originalError);
    this.name = "UpdateRampError";
  }
}

export class RampNotFoundError extends UpdateRampError {
  constructor() {
    super("Ramp not found", 404);
    this.name = "RampNotFoundError";
  }
}

export class RampNotUpdatableError extends UpdateRampError {
  constructor() {
    super("Ramp is not in a state that allows updates", 409);
    this.name = "RampNotUpdatableError";
  }
}

export class InvalidPresignedTxsError extends UpdateRampError {
  constructor(details?: string) {
    super(`Invalid presigned transactions${details ? `: ${details}` : ""}`, 400);
    this.name = "InvalidPresignedTxsError";
  }
}

/**
 * Start Ramp Error Types
 */
export class StartRampError extends VortexSdkError {
  constructor(message: string, status = 400, originalError?: Error) {
    super(message, status, true, undefined, originalError);
    this.name = "StartRampError";
  }
}

export class NoPresignedTransactionsError extends StartRampError {
  constructor() {
    super("No presigned transactions found. Please call updateRamp first.", 400);
    this.name = "NoPresignedTransactionsError";
  }
}

export class TimeWindowExceededError extends StartRampError {
  constructor() {
    super("Maximum time window to start process exceeded. Ramp invalidated.", 400);
    this.name = "TimeWindowExceededError";
  }
}

export class NetworkError extends VortexSdkError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, false, undefined, originalError);
    this.name = "NetworkError";
  }
}

export class APIConnectionError extends NetworkError {
  constructor(endpoint: string, originalError?: Error) {
    super(`Failed to connect to API endpoint: ${endpoint}`, originalError);
    this.name = "APIConnectionError";
  }
}

export class APIResponseError extends VortexSdkError {
  constructor(endpoint: string, status: number, statusText: string) {
    super(`API request failed for ${endpoint}: ${status} ${statusText}`, status, false);
    this.name = "APIResponseError";
  }
}

/**
 * Internal VortexSdk Error Types
 */
export class VortexSdkInternalError extends VortexSdkError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, false, undefined, originalError);
    this.name = "VortexSdkInternalError";
  }
}

export class RampStateNotFoundError extends VortexSdkInternalError {
  constructor(rampId: string) {
    super(`No ramp state found for rampId: ${rampId}`);
    this.name = "RampStateNotFoundError";
  }
}

export class APINotInitializedError extends VortexSdkInternalError {
  constructor(apiName: string) {
    super(`${apiName} API is required but not initialized`);
    this.name = "APINotInitializedError";
  }
}

export class EphemeralGenerationError extends VortexSdkInternalError {
  constructor(network: string, originalError?: Error) {
    super(`Failed to generate ephemeral account for network: ${network}`, originalError);
    this.name = "EphemeralGenerationError";
  }
}

export class TransactionSigningError extends VortexSdkInternalError {
  constructor(details?: string, originalError?: Error) {
    super(`Failed to sign transactions${details ? `: ${details}` : ""}`, originalError);
    this.name = "TransactionSigningError";
  }
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedMessage = extractErrorMessage(item);
      if (nestedMessage) {
        return nestedMessage;
      }
    }

    return undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nestedMessage = extractErrorMessage(record.message ?? record.error ?? record.detail ?? record.title);
    if (nestedMessage) {
      return nestedMessage;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Error parsing utilities
 */
export function parseAPIError(response: unknown): VortexSdkError {
  if (response && typeof response === "object") {
    const { message, error, errors } = response as Record<string, unknown>;
    const normalizedStatus = extractErrorStatus(response as Record<string, unknown>);
    const errorMessage = extractErrorMessage(message) ?? extractErrorMessage(error);

    if (errorMessage) {
      if (errorMessage?.includes("Missing required fields")) {
        return new MissingRequiredFieldsError([]);
      }
      if (errorMessage === QuoteError.QuoteNotFound) {
        return new QuoteNotFoundError();
      }
      if (errorMessage === "Quote has expired") {
        return new QuoteExpiredError();
      }

      if (errorMessage.includes("Invalid network:")) {
        const network = errorMessage.match(/"([^"]+)"/)?.[1] || "unknown";
        return new InvalidNetworkError(network);
      }

      const freshnessMatch = errorMessage.match(/^(Substrate|EVM|Stellar) ephemeral (\S+) (?:is not fresh|already exists)/);
      if (freshnessMatch) {
        return new EphemeralNotFreshError(errorMessage, freshnessMatch[1] as EphemeralChain, freshnessMatch[2]);
      }
      const freshnessCheckMatch = errorMessage.match(/^Could not verify freshness of (Substrate|EVM|Stellar) ephemeral (\S+)/);
      if (freshnessCheckMatch) {
        return new EphemeralFreshnessCheckError(errorMessage, freshnessCheckMatch[1] as EphemeralChain, freshnessCheckMatch[2]);
      }
      const missingEphemeralMatch = errorMessage.match(/^(Substrate|EVM|Stellar) ephemeral address is required/);
      if (missingEphemeralMatch) {
        return new EphemeralNotFreshError(errorMessage, missingEphemeralMatch[1] as EphemeralChain, "");
      }
      if (errorMessage === "Parameters destinationAddress and taxId are required for onramp") {
        return new MissingBrlParametersError();
      }
      if (errorMessage === "Moonbeam ephemeral not found") {
        return new MoonbeamEphemeralNotFoundError();
      }
      if (errorMessage.includes("Subaccount not found")) {
        return new SubaccountNotFoundError();
      }
      if (errorMessage === "KYC invalid") {
        return new KycInvalidError();
      }
      if (errorMessage === "Missing taxId query parameters") {
        return new BrlKycStatusError("Tax ID is required", 400);
      }
      if (errorMessage === "Amount exceeds KYC limits" || errorMessage === "Amount exceeds limit") {
        return new AmountExceedsLimitError();
      }
      if (errorMessage === "receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL") {
        return new MissingBrlOfframpParametersError();
      }
      if (errorMessage === "Invalid pixKey or receiverTaxId") {
        return new InvalidPixKeyError();
      }
      if (errorMessage === "Parameter destinationAddress is required for Alfredpay onramp") {
        return new MissingAlfredpayOnrampParametersError();
      }
      if (
        errorMessage ===
          "Alfredpay onramp requires a completed Alfredpay KYC profile. Partner API-key-only registration is not supported for this flow yet because no partner user-to-Alfredpay-customer mapping exists." ||
        errorMessage.startsWith("No completed Alfredpay KYC profile found") ||
        errorMessage.startsWith("Alfredpay KYC status is")
      ) {
        return new AlfredpayOnrampKycRequiredError(errorMessage, normalizedStatus);
      }
      if (errorMessage === "fiatAccountId is required for Alfredpay offramp") {
        return new MissingAlfredpayOfframpParametersError(errorMessage);
      }
      if (errorMessage === "User address must be provided for offramping.") {
        return new MissingAlfredpayOfframpParametersError(errorMessage);
      }
      if (errorMessage === "Parameters moneriumAuthToken and destinationAddress are required for Monerium onramp") {
        return new MissingMoneriumOnrampParametersError();
      }
      if (errorMessage === "Parameters walletAddress and moneriumAuthToken is required for Monerium onramp") {
        return new MissingMoneriumOfframpParametersError();
      }

      if (errorMessage === "Ramp not found") {
        return new RampNotFoundError();
      }
      if (errorMessage === "Ramp is not in a state that allows updates") {
        return new RampNotUpdatableError();
      }
      if (errorMessage === "No presigned transactions found. Please call updateRamp first.") {
        return new NoPresignedTransactionsError();
      }
      if (errorMessage === "Maximum time window to start process exceeded. Ramp invalidated.") {
        return new TimeWindowExceededError();
      }
    }

    return new VortexSdkError(
      errorMessage ?? "Unknown API error",
      normalizedStatus,
      true,
      Array.isArray(errors) ? errors : undefined
    );
  }

  return new VortexSdkError("Unknown error occurred", 500);
}

export async function handleAPIResponse<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      throw new APIResponseError(endpoint, response.status, response.statusText);
    }

    throw parseAPIError(errorData);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new NetworkError(`Failed to parse response from ${endpoint}`, error as Error);
  }
}
