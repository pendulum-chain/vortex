import {
  CORRIDOR_CAPABILITIES,
  type CorridorCapability,
  type CorridorCountry,
  type CorridorCustomerType,
  FiatToken,
  RampDirection
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import CustomerEntity from "../../models/customerEntity.model";
import ProfileRole from "../../models/profileRole.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import RecipientInvitation, { type RecipientInviteeType, type SeededDiscount } from "../../models/recipientInvitation.model";
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
import { materializeSeededDiscounts } from "../services/recipients/seeded-discount.service";
import {
  getTransferEligibility,
  isProviderApproved,
  providerForRail
} from "../services/recipients/transfer-eligibility.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  alias?: string;
  inviteeEmail?: string;
  inviteeType?: string;
  discounts?: { buyBps?: number; sellBps?: number };
}

// Bounded by the runtime EVM discount-subsidy cap (5% of quote output, which also absorbs
// adverse execution): a larger advertised discount could never execute without stalling.
const MAX_DISCOUNT_BPS = 300;

function isValidBps(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_DISCOUNT_BPS;
}

export async function createInvite(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { country, rail, payoutCurrency, alias, inviteeEmail, inviteeType, discounts } = (req.body ?? {}) as CreateInviteBody;

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
  if (alias !== undefined && (typeof alias !== "string" || alias.length > 100)) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_ALIAS", "alias must be a string of at most 100 characters");
    return;
  }
  // The dashboard filters by the shared capability matrix; enforce the same rules here so a raw
  // API call cannot create an invite for an unknown corridor or a combination the corridor's
  // provider cannot onboard (e.g. Alfredpay has no AR company KYB).
  const corridor: CorridorCapability | undefined = CORRIDOR_CAPABILITIES[country.toUpperCase() as CorridorCountry];
  if (!corridor || corridor.rail !== rail.toLowerCase()) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_INVITE_CORRIDOR", "Unknown corridor");
    return;
  }
  const effectiveInviteeType = (inviteeType ?? "individual") as CorridorCustomerType;
  if (!corridor.customerTypes.includes(effectiveInviteeType)) {
    sendError(
      res,
      httpStatus.BAD_REQUEST,
      "UNSUPPORTED_INVITEE_TYPE",
      `The ${country.toUpperCase()} corridor cannot onboard ${effectiveInviteeType} recipients`
    );
    return;
  }
  if (
    discounts !== undefined &&
    (typeof discounts !== "object" ||
      discounts === null ||
      (discounts.buyBps !== undefined && !isValidBps(discounts.buyBps)) ||
      (discounts.sellBps !== undefined && !isValidBps(discounts.sellBps)))
  ) {
    sendError(
      res,
      httpStatus.BAD_REQUEST,
      "INVALID_DISCOUNTS",
      `discounts.buyBps and discounts.sellBps must be integers between 0 and ${MAX_DISCOUNT_BPS}`
    );
    return;
  }
  // 0 bps means "no discount" — the corridor rail uppercased is exactly its FiatToken value.
  const seededFiat = corridor.rail.toUpperCase() as FiatToken;
  const seededDiscounts: SeededDiscount[] = [
    ...(discounts?.buyBps ? [{ bps: discounts.buyBps, fiatCurrency: seededFiat, rampType: RampDirection.BUY }] : []),
    ...(discounts?.sellBps ? [{ bps: discounts.sellBps, fiatCurrency: seededFiat, rampType: RampDirection.SELL }] : [])
  ];
  if (seededDiscounts.length > 0 && !Object.values(FiatToken).includes(seededFiat)) {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_DISCOUNTS", "This corridor does not support discounts");
    return;
  }

  try {
    // Attaching discounts is a privileged capability — enforce the role server-side so a
    // raw API call cannot seed pricing the UI would never have offered.
    if (seededDiscounts.length > 0) {
      const role = await ProfileRole.findOne({ where: { role: "discount_manager", userId } });
      if (!role) {
        sendError(res, httpStatus.FORBIDDEN, "DISCOUNT_ROLE_REQUIRED", "Only discount managers can attach invite discounts");
        return;
      }
    }

    // Invites unlock once any of the sender's corridors is approved (the dashboard rule) —
    // enforce it here too. Approvals are persisted on provider_customers by every provider.
    const senderEntityIds = (await CustomerEntity.findAll({ attributes: ["id"], where: { profileId: userId } })).map(
      entity => entity.id
    );
    const approvedOnboardings = senderEntityIds.length
      ? await ProviderCustomer.count({
          where: { customerEntityId: senderEntityIds, status: VerificationStatus.Approved }
        })
      : 0;
    if (!approvedOnboardings) {
      sendError(
        res,
        httpStatus.FORBIDDEN,
        "NO_APPROVED_CORRIDOR",
        "Recipient invites unlock once one of your corridors is approved"
      );
      return;
    }

    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);
    const token = generateInviteToken();

    const invitation = await RecipientInvitation.create({
      alias: alias?.trim() || null,
      country: country.toUpperCase(),
      createdByProfileId: userId,
      expiresAt: inviteExpiryDate(),
      inviteeEmail: inviteeEmail ?? null,
      inviteeEmailCanonical: inviteeEmail ? canonicalizeEmail(inviteeEmail) : null,
      inviteeType: (inviteeType ?? "individual") as RecipientInviteeType,
      payoutCurrency: payoutCurrency.toLowerCase(),
      rail: rail.toLowerCase(),
      seededDiscounts: seededDiscounts.length > 0 ? seededDiscounts : null,
      senderCustomerEntityId: senderEntity.id,
      // The raw token is kept while the invite is pending so the sender can re-copy the
      // link; redemption looks up by hash only, and acceptance clears the raw token.
      token,
      tokenHash: hashInviteToken(token)
    });

    res.status(httpStatus.CREATED).json({
      alias: invitation.alias,
      country: invitation.country,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
      inviteeEmail: invitation.inviteeEmail,
      inviteeType: invitation.inviteeType,
      payoutCurrency: invitation.payoutCurrency,
      rail: invitation.rail,
      seededDiscounts: invitation.seededDiscounts,
      status: invitation.status,
      token
    });
  } catch (error) {
    logger.error("Error creating recipient invite:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to create invite");
  }
}

/**
 * Read-only invite preview for the dashboard's confirm-before-accept screen: same gate
 * checks as acceptance (existence, expiry, email binding, self-accept) but consumes
 * nothing and writes nothing, so a declined confirmation leaves the invite redeemable.
 */
export async function previewInvite(req: Request<{ token: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const invitation = await RecipientInvitation.findOne({ where: { tokenHash: hashInviteToken(req.params.token) } });
    if (!invitation) {
      sendError(res, httpStatus.NOT_FOUND, "INVITE_NOT_FOUND", "Invite not found");
      return;
    }
    const isReEntry = invitation.status === "accepted" && invitation.acceptedByProfileId === userId;
    if (invitation.status === "accepted" && !isReEntry) {
      sendError(res, httpStatus.CONFLICT, "INVITE_ALREADY_ACCEPTED", "Invite has already been accepted");
      return;
    }
    if (invitation.status === "revoked") {
      sendError(res, httpStatus.GONE, "INVITE_REVOKED", "Invite has been revoked");
      return;
    }
    if (invitation.status === "expired" || (!isReEntry && invitation.expiresAt && invitation.expiresAt < new Date())) {
      sendError(res, httpStatus.GONE, "INVITE_EXPIRED", "Invite has expired");
      return;
    }
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

    res.status(httpStatus.OK).json({
      country: invitation.country,
      inviteeType: invitation.inviteeType,
      payoutCurrency: invitation.payoutCurrency,
      rail: invitation.rail
    });
  } catch (error) {
    logger.error("Error previewing recipient invite:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to preview invite");
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
    // Re-entry: the recipient who accepted may reopen their link to resume onboarding — accepting
    // is not a one-shot that burns the link. Anyone else still bounces off an accepted invite.
    const isReEntry = invitation.status === "accepted" && invitation.acceptedByProfileId === userId;

    if (invitation.status === "accepted" && !isReEntry) {
      sendError(res, httpStatus.CONFLICT, "INVITE_ALREADY_ACCEPTED", "Invite has already been accepted");
      return;
    }
    if (invitation.status === "revoked") {
      sendError(res, httpStatus.GONE, "INVITE_REVOKED", "Invite has been revoked");
      return;
    }
    // Expiry closes a *pending* invite only. Once accepted, the relationship exists and KYC may run
    // for days — an expiry passing mid-onboarding must not lock the recipient out of their own link.
    if (invitation.status === "expired" || (!isReEntry && invitation.expiresAt && invitation.expiresAt < new Date())) {
      if (invitation.status !== "expired") {
        await invitation.update({ status: "expired", token: null });
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
      // Re-read under a row lock and re-check acceptance: the status checks above ran on an
      // unlocked read, so two users redeeming the same token concurrently could otherwise
      // both pass them and each create an active relationship from one invite.
      const lockedInvitation = await RecipientInvitation.findByPk(invitation.id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      if (!lockedInvitation || lockedInvitation.status === "revoked") {
        return "invite_gone" as const;
      }
      if (lockedInvitation.status === "accepted" && lockedInvitation.acceptedByProfileId !== userId) {
        return "already_accepted" as const;
      }
      // The unlocked expiry check above can race the list sweep (which also writes `expired`);
      // re-check under the lock so an invite the system already declared expired is never accepted.
      if (lockedInvitation.status === "expired") {
        return "expired" as const;
      }

      // Business invitees onboard as a business entity (KYB); individuals reuse the
      // profile's default entity.
      const [recipientEntity] = await CustomerEntity.findOrCreate({
        defaults: { profileId: userId, status: "active", type: invitation.inviteeType },
        transaction,
        where: { profileId: userId, type: invitation.inviteeType }
      });

      // Recomputed under the lock: a double-submit by the accepting user may have turned a
      // pending invite into a re-entry between the unlocked pre-check and this transaction.
      const reEntry = lockedInvitation.status === "accepted" && lockedInvitation.acceptedByProfileId === userId;

      // The sender's block applies to the pair, not one rail: a new invite on a different
      // rail must not slip past it and create a fresh active relationship.
      const blockedSibling = await SenderRecipient.findOne({
        transaction,
        where: {
          recipientCustomerEntityId: recipientEntity.id,
          relationshipStatus: "blocked",
          senderCustomerEntityId: invitation.senderCustomerEntityId
        }
      });
      if (blockedSibling) {
        return "blocked" as const;
      }

      // One relationship per (sender, recipient, rail): an invite on a new rail adds a row
      // instead of repointing the pair's single row and dropping its previous corridor.
      const [row, created] = await SenderRecipient.findOrCreate({
        defaults: {
          invitationId: invitation.id,
          rail: invitation.rail,
          recipientCustomerEntityId: recipientEntity.id,
          relationshipStatus: "active",
          senderCustomerEntityId: invitation.senderCustomerEntityId
        },
        transaction,
        where: {
          rail: invitation.rail,
          recipientCustomerEntityId: recipientEntity.id,
          senderCustomerEntityId: invitation.senderCustomerEntityId
        }
      });

      if (!created && !reEntry) {
        // Re-entry reads the relationship, it does not revive it: the sender may have archived
        // this recipient, and reopening the link must not silently undo that.
        await row.update({ disabledAt: null, invitationId: invitation.id, relationshipStatus: "active" }, { transaction });
      }

      if (!reEntry) {
        // Clearing the raw token bounds its at-rest exposure to pending invites; re-copy
        // is only offered pre-acceptance and the recipient already holds the link.
        await lockedInvitation.update(
          { acceptedAt: new Date(), acceptedByProfileId: userId, status: "accepted", token: null },
          { transaction }
        );

        // A discount-carrying invite materializes its pricing for the accepting profile
        // atomically with the acceptance. A profile with an active partner assignment keeps
        // it — the invite then only connects the recipient.
        if (lockedInvitation.seededDiscounts?.length) {
          const outcome = await materializeSeededDiscounts(
            userId,
            lockedInvitation.id,
            lockedInvitation.seededDiscounts,
            transaction
          );
          logger.info(`Seeded discounts for invite ${lockedInvitation.id}, profile ${userId}: ${outcome}`);
        }
      }
      return { reEntry, row };
    });

    if (relationship === "invite_gone") {
      sendError(res, httpStatus.GONE, "INVITE_REVOKED", "Invite has been revoked");
      return;
    }
    if (relationship === "already_accepted") {
      sendError(res, httpStatus.CONFLICT, "INVITE_ALREADY_ACCEPTED", "Invite has already been accepted");
      return;
    }
    if (relationship === "expired") {
      sendError(res, httpStatus.GONE, "INVITE_EXPIRED", "Invite has expired");
      return;
    }
    if (relationship === "blocked") {
      sendError(res, httpStatus.CONFLICT, "RELATIONSHIP_BLOCKED", "The sender has blocked this relationship");
      return;
    }

    const effectiveReEntry = relationship.reEntry;

    // Only a first acceptance is news to the sender; re-entry is the recipient resuming onboarding.
    if (senderEntity.profileId && !effectiveReEntry) {
      await emitNotification(senderEntity.profileId, {
        customerEntityId: senderEntity.id,
        metadata: { invitationId: invitation.id, senderRecipientId: relationship.row.id },
        title: "Your recipient invite was accepted",
        type: "recipient_invite_accepted"
      });
    }

    res.status(effectiveReEntry ? httpStatus.OK : httpStatus.CREATED).json({
      id: relationship.row.id,
      invitation: {
        country: invitation.country,
        id: invitation.id,
        inviteeType: invitation.inviteeType,
        payoutCurrency: invitation.payoutCurrency,
        rail: invitation.rail
      },
      relationshipStatus: relationship.row.relationshipStatus
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
      // Archived relationships are hidden from the sender's list (archive = remove).
      where: { relationshipStatus: { [Op.ne]: "archived" }, senderCustomerEntityId: senderEntity.id }
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
              customerType: invitation.inviteeType,
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
                alias: invitation.alias,
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

    const now = new Date();
    await RecipientInvitation.update(
      { status: "expired", token: null },
      {
        where: {
          expiresAt: { [Op.lt]: now },
          senderCustomerEntityId: senderEntity.id,
          status: "pending"
        }
      }
    );

    // Expired rows stay visible (the sweep above cleared their token) so the sender sees why an
    // invite stopped working and can re-invite or remove it; accepted rows surface as relationships.
    const pendingInvitations = await RecipientInvitation.findAll({
      order: [["createdAt", "DESC"]],
      where: {
        archivedAt: null,
        senderCustomerEntityId: senderEntity.id,
        status: ["pending", "expired"]
      }
    });

    res.status(httpStatus.OK).json({
      pendingInvitations: pendingInvitations.map(invitation => ({
        alias: invitation.alias,
        country: invitation.country,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        id: invitation.id,
        inviteeEmail: invitation.inviteeEmail,
        inviteeType: invitation.inviteeType,
        isExpired: invitation.status === "expired" || Boolean(invitation.expiresAt && invitation.expiresAt < now),
        payoutCurrency: invitation.payoutCurrency,
        rail: invitation.rail,
        // Discount-carrying invites deep-link to the dashboard, so re-copy must know.
        seededDiscounts: invitation.seededDiscounts,
        // Raw token for sender re-copy; null for invites created before it was retained.
        token: invitation.token
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

interface ArchiveInvitationBody {
  archived?: boolean;
}

// Sender-side list hide only — the invitation keeps its status and the token stays
// redeemable, so an archived invite never blocks the recipient's onboarding.
export async function archiveInvitation(req: Request<{ id: string }>, res: Response): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { archived } = (req.body ?? {}) as ArchiveInvitationBody;
  if (typeof archived !== "boolean") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_ARCHIVED", "archived must be a boolean");
    return;
  }
  // Sequelize casts :id to uuid in SQL; a malformed id would otherwise surface as a 22P02 500.
  if (!UUID_PATTERN.test(req.params.id)) {
    sendError(res, httpStatus.NOT_FOUND, "INVITATION_NOT_FOUND", "Invitation not found");
    return;
  }

  try {
    const senderEntity = await getOrCreateCustomerEntityForProfile(userId);
    const invitation = await RecipientInvitation.findOne({
      where: { id: req.params.id, senderCustomerEntityId: senderEntity.id }
    });
    if (!invitation) {
      sendError(res, httpStatus.NOT_FOUND, "INVITATION_NOT_FOUND", "Invitation not found");
      return;
    }

    await invitation.update({ archivedAt: archived ? new Date() : null });

    res.status(httpStatus.OK).json({ archived: Boolean(invitation.archivedAt), id: invitation.id });
  } catch (error) {
    logger.error("Error archiving recipient invitation:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to archive invitation");
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
