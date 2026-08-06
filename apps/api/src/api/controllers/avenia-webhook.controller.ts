import { KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { accountTypeToCustomerType, findAveniaOwnerBySubaccountId } from "../services/avenia/avenia-customer.service";
import { enqueueVerificationNotification, NotifiableAttempt } from "../services/avenia/verification-notifications";
import { verifyAveniaSignature } from "../services/avenia/webhook-signature";

interface ParsedWebhookEvent {
  subAccountId: string;
  subscription: string;
  // Null for an event that carries no attempt at all (a ticket or limit-update event),
  // which is a legitimate no-op rather than a bad request.
  attempt: NotifiableAttempt | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/**
 * Validates the envelope and, when one is present, the attempt — before any property is
 * read. A signature only proves Avenia sent the bytes, not that they describe an event we
 * can act on: `JSON.parse` alone would let `null`, an array, or an attempt missing its
 * status through to a database write and, eventually, to a user's inbox.
 *
 * Only the fields an email is built from are required. Demanding the rest of Avenia's
 * documented attempt shape would reject payloads over fields we never read.
 */
function parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }

  if (!isRecord(body) || !isNonEmptyString(body.subAccountId) || !isNonEmptyString(body.subscription)) {
    return null;
  }

  const envelope = { subAccountId: body.subAccountId, subscription: body.subscription };
  const data = isRecord(body.data) ? body.data : {};

  if (data.attempt === undefined || data.attempt === null) {
    return { ...envelope, attempt: null };
  }

  const attempt = data.attempt;

  if (
    !isRecord(attempt) ||
    !isNonEmptyString(attempt.id) ||
    !isNonEmptyString(attempt.status) ||
    !isNonEmptyString(attempt.updatedAt) ||
    !isOptionalString(attempt.result) ||
    !isOptionalString(attempt.resultMessage)
  ) {
    return null;
  }

  return {
    ...envelope,
    attempt: {
      id: attempt.id,
      // Unrecognised enum values are not rejected here: terminalNotificationType treats
      // anything it does not know as non-terminal, so a new Avenia status is a no-op
      // rather than a 400 Avenia would retry forever.
      result: attempt.result as KycAttemptResult | undefined,
      resultMessage: attempt.resultMessage,
      status: attempt.status as KycAttemptStatus,
      updatedAt: attempt.updatedAt
    }
  };
}

/**
 * Receives Avenia verification webhooks for both individual (KYC) and company (KYB)
 * subaccounts.
 *
 * Avenia documents no KYB subscription, so company events are only expected to arrive
 * because both kinds share the attempts resource and we subscribe with "*". Which kind
 * an event belongs to is read from our own ProviderCustomer.customerType rather than the
 * payload, so this keeps working whatever Avenia labels the event.
 *
 * Everything past signature verification answers 200: Avenia must not retry an event
 * we have deliberately ignored (a ticket event, an unknown subaccount, a non-terminal
 * attempt). Only an unverified or malformed body is rejected.
 */
export const handleAveniaWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.get("signature");
  const rawBody = req.body;

  if (!signature || !Buffer.isBuffer(rawBody)) {
    res.status(httpStatus.UNAUTHORIZED).json({ error: "Missing signature or body" });
    return;
  }

  if (!(await verifyAveniaSignature(rawBody, signature))) {
    logger.warn("Rejected Avenia webhook with an invalid signature");
    res.status(httpStatus.UNAUTHORIZED).json({ error: "Invalid signature" });
    return;
  }

  const event = parseWebhookEvent(rawBody);

  if (!event) {
    logger.warn("Rejected Avenia webhook whose body is not a readable verification event");
    res.status(httpStatus.BAD_REQUEST).json({ error: "Malformed webhook body" });
    return;
  }

  const { attempt } = event;

  try {
    if (!attempt) {
      logger.debug(`Ignoring Avenia ${event.subscription} webhook carrying no verification attempt`);
      res.status(httpStatus.OK).json({ received: true });
      return;
    }

    const owner = await findAveniaOwnerBySubaccountId(event.subAccountId);

    if (!owner) {
      logger.warn(`Avenia webhook for unknown or partner-owned subaccount ${event.subAccountId}; no email will be sent`);
      res.status(httpStatus.OK).json({ received: true });
      return;
    }

    // The event does not say whether it settled a KYC or a KYB, so the copy follows our
    // own customer record; without it every individual would be told "business verification".
    const enqueued = await enqueueVerificationNotification(
      attempt,
      owner.profileId,
      accountTypeToCustomerType(owner.accountType)
    );

    // accountType is logged so we can confirm empirically whether company attempts
    // reach us this way; the reconciliation poller is retired once they demonstrably do.
    logger.info(
      `Avenia ${owner.accountType} verification webhook: attempt ${attempt.id} ` +
        `status ${attempt.status}${attempt.result ? `/${attempt.result}` : ""}, ` +
        `email ${enqueued ? "enqueued" : "not applicable"}`
    );

    res.status(httpStatus.OK).json({ received: true });
  } catch (error) {
    logger.error(`Error handling Avenia webhook for subaccount ${event.subAccountId}: ${error}`);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Failed to handle webhook" });
  }
};
