import logger from "../../config/logger";
import { ApiClientEventInput } from "./types";

export function logApiClientOperationSafe(event: ApiClientEventInput): void {
  try {
    const payload = {
      apiKeyPrefix: event.apiKeyPrefix,
      durationMs: event.durationMs,
      errorMessage: event.errorMessage,
      errorType: event.errorType,
      httpStatus: event.httpStatus,
      operation: event.operation,
      partnerId: event.partnerId,
      partnerName: event.partnerName,
      quoteId: event.quoteId,
      rampId: event.rampId,
      requestId: event.requestId,
      userId: event.userId
    };

    if (event.status === "failure") {
      logger.warn("Partner API operation failed", payload);
      return;
    }

    logger.info("Partner API operation completed", payload);
  } catch (error) {
    logger.warn("Failed to log API client operation", { error: error instanceof Error ? error.message : String(error) });
  }
}
