import { AlfredPayStatus, MykoboCustomerStatus } from "@vortexfi/shared";
import ProviderCustomer, { AveniaKycStatus, type ProviderName } from "../../../models/providerCustomer.model";
import RecipientInvitation from "../../../models/recipientInvitation.model";
import RecipientPayoutReference from "../../../models/recipientPayoutReference.model";
import type SenderRecipient from "../../../models/senderRecipient.model";

export type BlockingReasonCode =
  | "invite_not_accepted"
  | "relationship_not_active"
  | "recipient_onboarding_pending"
  | "provider_payout_reference_unverified"
  | "provider_restricted";

export interface TransferEligibility {
  canCreateTransfer: boolean;
  blockingReasonCode?: BlockingReasonCode;
}

/** Which provider onboards a recipient for a given payout rail. */
export function providerForRail(rail: string): ProviderName {
  if (rail === "eur") {
    return "mykobo";
  }
  if (rail === "brl") {
    return "avenia";
  }
  return "alfredpay";
}

// Statuses are stored verbatim per provider; these are the terminal outcomes.
const APPROVED_STATUSES = new Set<string>([MykoboCustomerStatus.APPROVED, AlfredPayStatus.Success, AveniaKycStatus.Accepted]);
const RESTRICTED_STATUSES = new Set<string>([MykoboCustomerStatus.REJECTED, AlfredPayStatus.Failed, AveniaKycStatus.Rejected]);

export function isProviderApproved(status: string): boolean {
  return APPROVED_STATUSES.has(status);
}

export function isProviderRestricted(status: string): boolean {
  return RESTRICTED_STATUSES.has(status);
}

/**
 * Gate for creating a transfer to a recipient (plan §7): invite accepted, relationship
 * active, recipient onboarded with the corridor's provider, and a verified payout
 * reference for the corridor. Returns the first failing check as the blocking reason.
 */
export async function getTransferEligibility(relationship: SenderRecipient): Promise<TransferEligibility> {
  if (relationship.relationshipStatus === "invited") {
    return { blockingReasonCode: "invite_not_accepted", canCreateTransfer: false };
  }
  if (relationship.relationshipStatus !== "active") {
    return { blockingReasonCode: "relationship_not_active", canCreateTransfer: false };
  }

  // The corridor comes from the originating invite; without one there is nothing the
  // recipient could have onboarded for yet.
  const invitation = relationship.invitationId ? await RecipientInvitation.findByPk(relationship.invitationId) : null;
  if (!invitation) {
    return { blockingReasonCode: "recipient_onboarding_pending", canCreateTransfer: false };
  }

  const provider = providerForRail(invitation.rail);
  const providerCustomer = await ProviderCustomer.findOne({
    order: [["updatedAt", "DESC"]],
    where: {
      customerEntityId: relationship.recipientCustomerEntityId,
      provider,
      // Alfredpay accounts are per-country; mykobo/avenia accounts are not.
      ...(provider === "alfredpay" ? { country: invitation.country } : {})
    }
  });

  if (!providerCustomer) {
    return { blockingReasonCode: "recipient_onboarding_pending", canCreateTransfer: false };
  }
  if (isProviderRestricted(providerCustomer.status)) {
    return { blockingReasonCode: "provider_restricted", canCreateTransfer: false };
  }
  if (!isProviderApproved(providerCustomer.status)) {
    return { blockingReasonCode: "recipient_onboarding_pending", canCreateTransfer: false };
  }

  const verifiedPayoutReference = await RecipientPayoutReference.findOne({
    where: {
      rail: invitation.rail,
      senderRecipientId: relationship.id,
      status: "verified"
    }
  });
  if (!verifiedPayoutReference) {
    return { blockingReasonCode: "provider_payout_reference_unverified", canCreateTransfer: false };
  }

  return { canCreateTransfer: true };
}
