import { AveniaVerificationAttempt, AveniaWebhookEvent } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { accountTypeToCustomerType, findAveniaOwnerBySubaccountId } from "../services/avenia/avenia-customer.service";
import { enqueueVerificationNotification } from "../services/avenia/verification-notifications";
import { verifyAveniaSignature } from "../services/avenia/webhook-signature";

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

  let event: AveniaWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Malformed JSON body" });
    return;
  }

  try {
    const attempt = (event.data as { attempt?: AveniaVerificationAttempt })?.attempt;

    if (!attempt?.id) {
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
