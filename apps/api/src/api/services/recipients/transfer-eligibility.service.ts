import ProviderCustomer, { type ProviderName, VerificationStatus } from "../../../models/providerCustomer.model";
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

const MONERIUM_APPROVAL_FRESHNESS_MS = 5 * 60 * 1000;

export function isFreshMoneriumApproval(updatedAt: Date, now = Date.now()): boolean {
  return now - updatedAt.getTime() <= MONERIUM_APPROVAL_FRESHNESS_MS;
}

/** Which provider onboards a recipient for a given payout rail. */
export function providerForRail(rail: string): ProviderName {
  if (rail === "eur") {
    return "monerium";
  }
  if (rail === "brl") {
    return "avenia";
  }
  return "alfredpay";
}

export function isProviderApproved(status: string): boolean {
  return status === VerificationStatus.Approved;
}

export function isProviderRestricted(status: string): boolean {
  return status === VerificationStatus.Rejected;
}

export function isProviderInReview(status: string): boolean {
  return status === VerificationStatus.InReview;
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
      customerType: invitation.inviteeType,
      provider,
      // Alfredpay accounts are per-country; Monerium/Avenia accounts are not.
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
  if (provider === "monerium" && !isFreshMoneriumApproval(providerCustomer.updatedAt)) {
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
