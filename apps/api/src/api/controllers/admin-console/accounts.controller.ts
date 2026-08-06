import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import AdminImpersonationSession from "../../../models/adminImpersonationSession.model";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase from "../../../models/kycCase.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { isSessionActive } from "../../services/impersonation.service";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clampLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseCursor(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyVerificationSummary(): Record<VerificationStatus, number> {
  return {
    [VerificationStatus.Approved]: 0,
    [VerificationStatus.InReview]: 0,
    [VerificationStatus.Pending]: 0,
    [VerificationStatus.Rejected]: 0,
    [VerificationStatus.Started]: 0
  };
}

/**
 * GET /v1/admin-console/accounts
 * Paginated, search-filtered account list. Deliberately a cheap read — unlike
 * onboarding.controller.ts's getOnboardingStatus, it never triggers provider status
 * refreshes.
 */
export async function listAccounts(req: Request, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const limit = clampLimit(req.query.limit);
    const offset = parseCursor(req.query.cursor);

    const { rows: profiles, count: total } = await User.findAndCountAll({
      attributes: ["id", "email", "createdAt"],
      limit: limit + 1,
      offset,
      order: [["createdAt", "DESC"]],
      where: search ? { email: { [Op.iLike]: `%${search}%` } } : {}
    });

    const hasMore = profiles.length > limit;
    const pageProfiles = hasMore ? profiles.slice(0, limit) : profiles;
    const profileIds = pageProfiles.map(profile => profile.id);

    const [entities, activeAssignments] = await Promise.all([
      profileIds.length ? CustomerEntity.findAll({ where: { profileId: profileIds } }) : [],
      profileIds.length
        ? ProfilePartnerAssignment.findAll({
            where: {
              [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
              isActive: true,
              userId: profileIds
            }
          })
        : []
    ]);

    const entityIds = entities.map(entity => entity.id);
    const providerCustomers = entityIds.length
      ? await ProviderCustomer.findAll({ attributes: ["customerEntityId", "status"], where: { customerEntityId: entityIds } })
      : [];
    const entityProfileById = new Map(entities.map(entity => [entity.id, entity.profileId]));

    res.status(httpStatus.OK).json({
      accounts: pageProfiles.map(profile => {
        const profileEntities = entities.filter(entity => entity.profileId === profile.id);
        const verificationSummary = emptyVerificationSummary();
        for (const customer of providerCustomers) {
          if (entityProfileById.get(customer.customerEntityId) === profile.id) {
            verificationSummary[customer.status] += 1;
          }
        }

        return {
          activePartnerName: activeAssignments.find(assignment => assignment.userId === profile.id)?.partnerName ?? null,
          createdAt: profile.createdAt,
          email: profile.email,
          entities: profileEntities.map(entity => ({ id: entity.id, status: entity.status, type: entity.type })),
          id: profile.id,
          verificationSummary
        };
      }),
      limit,
      nextCursor: hasMore ? String(offset + limit) : null,
      total
    });
  } catch (error) {
    logger.error("Error listing admin-console accounts:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list accounts", status: httpStatus.INTERNAL_SERVER_ERROR }
    });
  }
}

/**
 * GET /v1/admin-console/accounts/:profileId
 * Full account detail: entities, nested provider customers + KYC cases (mirrors the
 * nesting in onboarding.controller.ts), and recent impersonation sessions targeting
 * this profile.
 */
export async function getAccount(req: Request<{ profileId: string }>, res: Response): Promise<void> {
  try {
    const { profileId } = req.params;
    const profile = await User.findByPk(profileId);
    if (!profile) {
      res.status(httpStatus.NOT_FOUND).json({
        error: { code: "USER_NOT_FOUND", message: "Profile was not found", status: httpStatus.NOT_FOUND }
      });
      return;
    }

    const entities = await CustomerEntity.findAll({ where: { profileId } });
    const entityIds = entities.map(entity => entity.id);

    const [providerCustomers, kycCases, impersonationSessions] = await Promise.all([
      entityIds.length
        ? ProviderCustomer.findAll({ order: [["updatedAt", "DESC"]], where: { customerEntityId: entityIds } })
        : [],
      entityIds.length ? KycCase.findAll({ where: { customerEntityId: entityIds } }) : [],
      AdminImpersonationSession.findAll({
        include: [{ as: "actor", attributes: ["id", "email"], model: User }],
        limit: 20,
        order: [["createdAt", "DESC"]],
        where: { targetProfileId: profileId }
      })
    ]);

    const kycCaseByProviderCustomer = new Map<string, KycCase>();
    for (const kycCase of kycCases) {
      if (kycCase.providerCustomerId) {
        kycCaseByProviderCustomer.set(kycCase.providerCustomerId, kycCase);
      }
    }

    res.status(httpStatus.OK).json({
      activeEntityId: profile.activeCustomerEntityId,
      createdAt: profile.createdAt,
      email: profile.email,
      entities: entities.map(entity => ({
        country: entity.country,
        id: entity.id,
        providerCustomers: providerCustomers
          .filter(customer => customer.customerEntityId === entity.id)
          .map(customer => {
            const kycCase = kycCaseByProviderCustomer.get(customer.id) ?? null;
            return {
              companyName: customer.companyName,
              country: customer.country,
              createdAt: customer.createdAt,
              customerType: customer.customerType,
              id: customer.id,
              kycCase: kycCase
                ? {
                    approvedAt: kycCase.approvedAt,
                    failureReasons: kycCase.failureReasons,
                    id: kycCase.id,
                    level: kycCase.level,
                    rejectedAt: kycCase.rejectedAt,
                    status: kycCase.status,
                    statusExternal: kycCase.statusExternal,
                    submittedAt: kycCase.submittedAt,
                    type: kycCase.type
                  }
                : null,
              provider: customer.provider,
              rail: customer.rail,
              status: customer.status,
              statusExternal: customer.statusExternal,
              updatedAt: customer.updatedAt
            };
          }),
        status: entity.status,
        type: entity.type
      })),
      id: profile.id,
      impersonationSessions: impersonationSessions.map(session => {
        const actor = (session as AdminImpersonationSession & { actor?: User }).actor;
        return {
          active: isSessionActive(session),
          actor: actor ? { email: actor.email, id: actor.id } : { email: null, id: session.actorProfileId },
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          id: session.id,
          revokedAt: session.revokedAt,
          revokedReason: session.revokedReason
        };
      })
    });
  } catch (error) {
    logger.error("Error reading admin-console account detail:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to read account", status: httpStatus.INTERNAL_SERVER_ERROR }
    });
  }
}
