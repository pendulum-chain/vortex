import { Request, Response } from "express";
import httpStatus from "http-status";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer from "../../models/providerCustomer.model";
import RecipientInvitation, { type RecipientInviteeType } from "../../models/recipientInvitation.model";
import RecipientPayoutReference from "../../models/recipientPayoutReference.model";
import SenderRecipient, { type SenderRecipientStatus } from "../../models/senderRecipient.model";
import { getOrCreateCustomerEntityForProfile } from "../services/customer-entity.service";
import { emitNotification } from "../services/notifications/notification.service";
import {
  canonicalizeEmail,
  generateInviteToken,
  hashInviteToken,
  inviteExpiryDate
} from "../services/recipients/recipient-invite.service";
import {
  getTransferEligibility,
  isProviderApproved,
  providerForRail
} from "../services/recipients/transfer-eligibility.service";

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message, status } });
}

function requireUserId(req: Request, res: Response): string | null {
  if (!req.userId) {
    sendError(res, httpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required");
    return null;
  }
  return req.userId;
}

interface CreateInviteBody {
  country?: string;
  rail?: string;
  payoutCurrency?: string;
  amount?: string;
  inviteeEmail?: string;
  inviteeType?: string;
}

export async function createInvite(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { country, rail, payoutCurrency, amount, inviteeEmail, inviteeType } = (req.body ?? {}) as CreateInviteBody;

  if (!country || country.length > 4 || !rail || rail.length > 8 || !payoutCurrency || payoutCurrency.length > 8) {
    sendError(
      res,
      httpStatus.BAD_REQUEST,
      "INVALID_INVITE_CORRIDOR",
      "country (ISO code), rail and payoutCurrency are required"
    );
    return;
  }
  if (inviteeType !== undefined && inviteeType !== "individual" && inviteeType !== "business") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_INVITEE_TYPE", "inviteeType must be 'individual' or 'business'");
    return;
  }
  if (amount !== undefined && (Number.isNaN(Number(amount)) || Number(amount) <= 0)) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_AMOUNT", "amount must be a positive number");
    return;
  }

  try {
    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);
    const token = generateInviteToken();

    const invitation = await RecipientInvitation.create({
      country: country.toUpperCase(),
      createdByProfileId: userId,
      expiresAt: inviteExpiryDate(),
      inviteeEmail: inviteeEmail ?? null,
      inviteeEmailCanonical: inviteeEmail ? canonicalizeEmail(inviteeEmail) : null,
      inviteeType: (inviteeType ?? "individual") as RecipientInviteeType,
      payoutCurrency: payoutCurrency.toLowerCase(),
      rail: rail.toLowerCase(),
      senderCustomerEntityId: senderEntity.id,
      tokenHash: hashInviteToken(token),
      ...(amount !== undefined ? { amount } : {})
    });

    // The raw token is returned exactly once; only its hash is stored.
    res.status(httpStatus.CREATED).json({
      amount: invitation.amount,
      country: invitation.country,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
      inviteeEmail: invitation.inviteeEmail,
      inviteeType: invitation.inviteeType,
      payoutCurrency: invitation.payoutCurrency,
      rail: invitation.rail,
      status: invitation.status,
      token
    });
  } catch (error) {
    logger.error("Error creating recipient invite:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to create invite");
  }
}

export async function acceptInvite(req: Request<{ token: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const invitation = await RecipientInvitation.findOne({ where: { tokenHash: hashInviteToken(req.params.token) } });
    if (!invitation) {
      sendError(res, httpStatus.NOT_FOUND, "INVITE_NOT_FOUND", "Invite not found");
      return;
    }
    if (invitation.status === "accepted") {
      sendError(res, httpStatus.CONFLICT, "INVITE_ALREADY_ACCEPTED", "Invite has already been accepted");
      return;
    }
    if (invitation.status === "revoked") {
      sendError(res, httpStatus.GONE, "INVITE_REVOKED", "Invite has been revoked");
      return;
    }
    if (invitation.status === "expired" || (invitation.expiresAt && invitation.expiresAt < new Date())) {
      if (invitation.status !== "expired") {
        await invitation.update({ status: "expired" });
      }
      sendError(res, httpStatus.GONE, "INVITE_EXPIRED", "Invite has expired");
      return;
    }

    // Token-bound redemption (plan D1): when the invite recorded an email, the redeeming
    // account must additionally match it.
    if (invitation.inviteeEmailCanonical && canonicalizeEmail(req.userEmail ?? "") !== invitation.inviteeEmailCanonical) {
      sendError(res, httpStatus.FORBIDDEN, "INVITE_EMAIL_MISMATCH", "This invite is bound to a different email address");
      return;
    }

    const senderEntity = await CustomerEntity.findByPk(invitation.senderCustomerEntityId);
    if (!senderEntity) {
      sendError(res, httpStatus.GONE, "INVITE_SENDER_GONE", "The sender of this invite no longer exists");
      return;
    }
    if (senderEntity.profileId === userId) {
      sendError(res, httpStatus.CONFLICT, "CANNOT_ACCEPT_OWN_INVITE", "You cannot accept your own invite");
      return;
    }

    const relationship = await sequelize.transaction(async transaction => {
      // Business invitees onboard as a business entity (KYB); individuals reuse the
      // profile's default entity.
      const [recipientEntity] = await CustomerEntity.findOrCreate({
        defaults: { profileId: userId, status: "active", type: invitation.inviteeType },
        transaction,
        where: { profileId: userId, type: invitation.inviteeType }
      });

      const [row, created] = await SenderRecipient.findOrCreate({
        defaults: {
          invitationId: invitation.id,
          recipientCustomerEntityId: recipientEntity.id,
          relationshipStatus: "active",
          senderCustomerEntityId: invitation.senderCustomerEntityId
        },
        transaction,
        where: {
          recipientCustomerEntityId: recipientEntity.id,
          senderCustomerEntityId: invitation.senderCustomerEntityId
        }
      });

      if (!created) {
        if (row.relationshipStatus === "blocked") {
          // The sender blocked this recipient; a new invite acceptance must not undo that.
          return null;
        }
        await row.update({ disabledAt: null, invitationId: invitation.id, relationshipStatus: "active" }, { transaction });
      }

      await invitation.update({ acceptedAt: new Date(), acceptedByProfileId: userId, status: "accepted" }, { transaction });
      return row;
    });

    if (!relationship) {
      sendError(res, httpStatus.CONFLICT, "RELATIONSHIP_BLOCKED", "The sender has blocked this relationship");
      return;
    }

    if (senderEntity.profileId) {
      await emitNotification(senderEntity.profileId, {
        customerEntityId: senderEntity.id,
        metadata: { invitationId: invitation.id, senderRecipientId: relationship.id },
        title: "Your recipient invite was accepted",
        type: "recipient_invite_accepted"
      });
    }

    res.status(httpStatus.CREATED).json({
      id: relationship.id,
      invitation: {
        country: invitation.country,
        id: invitation.id,
        payoutCurrency: invitation.payoutCurrency,
        rail: invitation.rail
      },
      relationshipStatus: relationship.relationshipStatus
    });
  } catch (error) {
    logger.error("Error accepting recipient invite:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to accept invite");
  }
}

export async function listRecipients(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);

    const relationships = await SenderRecipient.findAll({
      include: [
        { as: "recipient", model: CustomerEntity },
        { as: "invitation", model: RecipientInvitation },
        { as: "payoutReferences", model: RecipientPayoutReference }
      ],
      order: [["createdAt", "DESC"]],
      where: { senderCustomerEntityId: senderEntity.id }
    });

    const recipients = await Promise.all(
      relationships.map(async row => {
        const invitation = row.get("invitation") as RecipientInvitation | null;
        const recipient = row.get("recipient") as CustomerEntity | null;
        const payoutReferences = (row.get("payoutReferences") as RecipientPayoutReference[] | undefined) ?? [];

        // Corridor-scoped onboarding summary for the list view; the eligibility
        // endpoint remains the authoritative gate.
        let onboardingStatus: "approved" | "pending" | "unknown" = "unknown";
        if (invitation && recipient) {
          const provider = providerForRail(invitation.rail);
          const providerCustomer = await ProviderCustomer.findOne({
            order: [["updatedAt", "DESC"]],
            where: {
              customerEntityId: recipient.id,
              provider,
              ...(provider === "alfredpay" ? { country: invitation.country } : {})
            }
          });
          onboardingStatus = providerCustomer
            ? isProviderApproved(providerCustomer.status)
              ? "approved"
              : "pending"
            : "pending";
        }

        return {
          createdAt: row.createdAt,
          id: row.id,
          invitation: invitation
            ? {
                country: invitation.country,
                id: invitation.id,
                inviteeEmail: invitation.inviteeEmail,
                inviteeType: invitation.inviteeType,
                payoutCurrency: invitation.payoutCurrency,
                rail: invitation.rail
              }
            : null,
          nickname: row.nickname,
          onboardingStatus,
          payoutReferences: payoutReferences.map(ref => ({
            currency: ref.currency,
            id: ref.id,
            instrumentType: ref.instrumentType,
            maskedDisplayLabel: ref.maskedDisplayLabel,
            rail: ref.rail,
            status: ref.status
          })),
          recipientType: recipient?.type ?? "individual",
          relationshipStatus: row.relationshipStatus
        };
      })
    );

    const pendingInvitations = await RecipientInvitation.findAll({
      order: [["createdAt", "DESC"]],
      where: { senderCustomerEntityId: senderEntity.id, status: "pending" }
    });

    res.status(httpStatus.OK).json({
      pendingInvitations: pendingInvitations.map(invitation => ({
        country: invitation.country,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        id: invitation.id,
        inviteeEmail: invitation.inviteeEmail,
        inviteeType: invitation.inviteeType,
        isExpired: Boolean(invitation.expiresAt && invitation.expiresAt < new Date()),
        payoutCurrency: invitation.payoutCurrency,
        rail: invitation.rail
      })),
      recipients
    });
  } catch (error) {
    logger.error("Error listing recipients:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list recipients");
  }
}

interface UpdateRecipientBody {
  nickname?: string;
  status?: string;
}

const PATCHABLE_STATUSES: SenderRecipientStatus[] = ["active", "blocked", "archived"];

export async function updateRecipient(req: Request<{ id: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { nickname, status } = (req.body ?? {}) as UpdateRecipientBody;

  if (nickname !== undefined && (typeof nickname !== "string" || nickname.length > 100)) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_NICKNAME", "nickname must be a string of at most 100 characters");
    return;
  }
  if (status !== undefined && !PATCHABLE_STATUSES.includes(status as SenderRecipientStatus)) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_STATUS", "status must be one of: active, blocked, archived");
    return;
  }

  try {
    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);
    const relationship = await SenderRecipient.findOne({
      where: { id: req.params.id, senderCustomerEntityId: senderEntity.id }
    });
    if (!relationship) {
      sendError(res, httpStatus.NOT_FOUND, "RECIPIENT_NOT_FOUND", "Recipient not found");
      return;
    }

    await relationship.update({
      ...(nickname !== undefined ? { nickname: nickname || null } : {}),
      ...(status !== undefined
        ? {
            disabledAt: status === "active" ? null : new Date(),
            relationshipStatus: status as SenderRecipientStatus
          }
        : {})
    });

    res.status(httpStatus.OK).json({
      id: relationship.id,
      nickname: relationship.nickname,
      relationshipStatus: relationship.relationshipStatus
    });
  } catch (error) {
    logger.error("Error updating recipient:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to update recipient");
  }
}

export async function getRecipientEligibility(req: Request<{ id: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);
    const relationship = await SenderRecipient.findOne({
      where: { id: req.params.id, senderCustomerEntityId: senderEntity.id }
    });
    if (!relationship) {
      sendError(res, httpStatus.NOT_FOUND, "RECIPIENT_NOT_FOUND", "Recipient not found");
      return;
    }

    const eligibility = await getTransferEligibility(relationship);
    res.status(httpStatus.OK).json(eligibility);
  } catch (error) {
    logger.error("Error computing recipient eligibility:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to compute eligibility");
  }
}
