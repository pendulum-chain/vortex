export interface APIErrorResponse {
  message: string;
  errors?: unknown[];
  status: number;
  isPublic?: boolean;
}

export class VortexSignerError extends Error {
  public readonly status: number;
  public readonly isPublic: boolean;
  public readonly errors?: unknown[];
  public readonly originalError?: Error;

  constructor(message: string, status: number = 500, isPublic: boolean = false, errors?: unknown[], originalError?: Error) {
    super(message);
    this.name = "VortexSignerError";
    this.status = status;
    this.isPublic = isPublic;
    this.errors = errors;
    this.originalError = originalError;
  }
}

export class RegisterRampError extends VortexSignerError {
  constructor(message: string, status: number = 400, originalError?: Error) {
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
    super("Quote not found", 404);
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

// BRLA Onramp specific errors
export class BrlaOnrampError extends RegisterRampError {
  constructor(message: string, status: number = 400) {
    super(message, status);
    this.name = "BrlaOnrampError";
  }
}

export class MissingBrlaParametersError extends BrlaOnrampError {
  constructor() {
    super("Parameters destinationAddress and taxId are required for onramp", 400);
    this.name = "MissingBrlaParametersError";
  }
}

export class MoonbeamEphemeralNotFoundError extends BrlaOnrampError {
  constructor() {
    super("Moonbeam ephemeral not found", 400);
    this.name = "MoonbeamEphemeralNotFoundError";
  }
}

export class SubaccountNotFoundError extends BrlaOnrampError {
  constructor() {
    super("Subaccount not found", 404);
    this.name = "SubaccountNotFoundError";
  }
}

export class KycInvalidError extends BrlaOnrampError {
  constructor() {
    super("KYC invalid", 400);
    this.name = "KycInvalidError";
  }
}

export class BrlaKycStatusError extends BrlaOnrampError {
  constructor(message: string, status: number = 400) {
    super(message, status);
    this.name = "BrlaKycStatusError";
  }
}

export class AmountExceedsLimitError extends BrlaOnrampError {
  constructor() {
    super("Amount exceeds KYC limits", 400);
    this.name = "AmountExceedsLimitError";
  }
}

// BRLA Offramp specific errors
export class BrlaOfframpError extends RegisterRampError {
  constructor(message: string, status: number = 400) {
    super(message, status);
    this.name = "BrlaOfframpError";
  }
}

export class MissingBrlaOfframpParametersError extends BrlaOfframpError {
  constructor() {
    super("receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL", 400);
    this.name = "MissingBrlaOfframpParametersError";
  }
}

export class InvalidPixKeyError extends BrlaOfframpError {
  constructor() {
    super("Invalid pixKey or receiverTaxId", 400);
    this.name = "InvalidPixKeyError";
  }
}

// Monerium specific errors
export class MoneriumError extends RegisterRampError {
  constructor(message: string, status: number = 400) {
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
export class UpdateRampError extends VortexSignerError {
  constructor(message: string, status: number = 400, originalError?: Error) {
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
export class StartRampError extends VortexSignerError {
  constructor(message: string, status: number = 400, originalError?: Error) {
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

export class NetworkError extends VortexSignerError {
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

export class APIResponseError extends VortexSignerError {
  constructor(endpoint: string, status: number, statusText: string) {
    super(`API request failed for ${endpoint}: ${status} ${statusText}`, status, false);
    this.name = "APIResponseError";
  }
}

/**
 * Internal VortexSigner Error Types
 */
export class VortexSignerInternalError extends VortexSignerError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, false, undefined, originalError);
    this.name = "VortexSignerInternalError";
  }
}

export class RampStateNotFoundError extends VortexSignerInternalError {
  constructor(rampId: string) {
    super(`No ramp state found for rampId: ${rampId}`);
    this.name = "RampStateNotFoundError";
  }
}

export class APINotInitializedError extends VortexSignerInternalError {
  constructor(apiName: string) {
    super(`${apiName} API is required but not initialized`);
    this.name = "APINotInitializedError";
  }
}

export class EphemeralGenerationError extends VortexSignerInternalError {
  constructor(network: string, originalError?: Error) {
    super(`Failed to generate ephemeral account for network: ${network}`, originalError);
    this.name = "EphemeralGenerationError";
  }
}

export class TransactionSigningError extends VortexSignerInternalError {
  constructor(details?: string, originalError?: Error) {
    super(`Failed to sign transactions${details ? `: ${details}` : ""}`, originalError);
    this.name = "TransactionSigningError";
  }
}

/**
 * Error parsing utilities
 */
export function parseAPIError(response: any): VortexSignerError {
  if (response && typeof response === "object") {
    const { message, error, status = 500, errors } = response;
    const errorMessage = message || error;

    if (errorMessage) {
      if (errorMessage.includes("Missing required fields")) {
        return new MissingRequiredFieldsError([]);
      }
      if (errorMessage === "Quote not found") {
        return new QuoteNotFoundError();
      }
      if (errorMessage === "Quote has expired") {
        return new QuoteExpiredError();
      }

      if (errorMessage.includes("Invalid network:")) {
        const network = errorMessage.match(/"([^"]+)"/)?.[1] || "unknown";
        return new InvalidNetworkError(network);
      }
      if (errorMessage === "Parameters destinationAddress and taxId are required for onramp") {
        return new MissingBrlaParametersError();
      }
      if (errorMessage === "Moonbeam ephemeral not found") {
        return new MoonbeamEphemeralNotFoundError();
      }
      if (errorMessage === "Subaccount not found") {
        return new SubaccountNotFoundError();
      }
      if (errorMessage === "KYC invalid") {
        return new KycInvalidError();
      }
      if (errorMessage === "Missing taxId query parameters") {
        return new BrlaKycStatusError("Tax ID is required", 400);
      }
      if (errorMessage === "Amount exceeds KYC limits" || errorMessage === "Amount exceeds limit") {
        return new AmountExceedsLimitError();
      }
      if (errorMessage === "receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL") {
        return new MissingBrlaOfframpParametersError();
      }
      if (errorMessage === "Invalid pixKey or receiverTaxId") {
        return new InvalidPixKeyError();
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

    return new VortexSignerError(errorMessage || "Unknown API error", status, true, errors);
  }

  return new VortexSignerError("Unknown error occurred", 500);
}

export async function handleAPIResponse<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) {
    let errorData: any;
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
