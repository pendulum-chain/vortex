export class ProviderApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Ensure the prototype chain is correctly set up
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnsupportedPairError extends ProviderApiError {
  constructor(message = "Unsupported currency, token, or network combination for this provider.") {
    super(message);
  }
}

export class InvalidAmountError extends ProviderApiError {
  constructor(message = "Invalid amount provided. Check provider limits.") {
    super(message);
  }
}

export class InvalidParameterError extends ProviderApiError {
  constructor(message = "Invalid parameter provided to the provider API.") {
    super(message);
  }
}

export class ProviderInternalError extends ProviderApiError {
  constructor(message = "The price provider encountered an internal error.") {
    super(message);
  }
}
