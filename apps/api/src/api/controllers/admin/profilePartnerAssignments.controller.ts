import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op, Transaction, UniqueConstraintError, WhereOptions } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import ProfilePartnerAssignment, { ProfilePartnerAssignmentAttributes } from "../../../models/profilePartnerAssignment.model";
import User from "../../../models/user.model";
import { sendError } from "../../helpers/sendError";

const PROFILE_NOT_FOUND_AFTER_LOCK = "PROFILE_NOT_FOUND_AFTER_LOCK";

function parseExpiration(expiresAt: unknown): Date | null {
  if (!expiresAt) {
    return null;
  }

  if (typeof expiresAt !== "string") {
    throw new Error("expiresAt must be an ISO date string");
  }

  const expirationDate = new Date(expiresAt);
  if (Number.isNaN(expirationDate.getTime())) {
    throw new Error("expiresAt must be a valid ISO date string");
  }

  return expirationDate;
}

function serializeAssignment(assignment: ProfilePartnerAssignment) {
  return {
    createdAt: assignment.createdAt,
    expiresAt: assignment.expiresAt,
    id: assignment.id,
    isActive: assignment.isActive,
    partnerId: assignment.partnerId,
    partnerName: assignment.partnerName,
    updatedAt: assignment.updatedAt,
    userId: assignment.userId
  };
}

export async function createProfilePartnerAssignment(req: Request, res: Response): Promise<void> {
  try {
    const { userId, partnerName, expiresAt } = req.body;

    if (!userId || typeof userId !== "string" || !partnerName || typeof partnerName !== "string") {
      sendError(res, httpStatus.BAD_REQUEST, "INVALID_ASSIGNMENT_INPUT", "userId and partnerName are required string fields");
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      sendError(res, httpStatus.NOT_FOUND, "USER_NOT_FOUND", "Profile was not found");
      return;
    }

    const partner = await Partner.findOne({
      where: {
        isActive: true,
        name: partnerName
      }
    });

    if (!partner) {
      sendError(res, httpStatus.NOT_FOUND, "PARTNER_NOT_FOUND", `No active partners found with name: ${partnerName}`);
      return;
    }

    const expirationDate = parseExpiration(expiresAt);

    const assignment = await sequelize.transaction(async transaction => {
      const lockedUser = await User.findByPk(userId, {
        lock: Transaction.LOCK.UPDATE,
        transaction
      });

      if (!lockedUser) {
        throw new Error(PROFILE_NOT_FOUND_AFTER_LOCK);
      }

      await ProfilePartnerAssignment.update(
        { isActive: false },
        {
          transaction,
          where: {
            isActive: true,
            userId
          }
        }
      );

      return ProfilePartnerAssignment.create(
        {
          expiresAt: expirationDate,
          isActive: true,
          partnerId: partner.id,
          partnerName,
          userId
        },
        { transaction }
      );
    });

    res.status(httpStatus.CREATED).json({
      assignment: serializeAssignment(assignment)
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("expiresAt")) {
      sendError(res, httpStatus.BAD_REQUEST, "INVALID_EXPIRES_AT", error.message);
      return;
    }

    if (error instanceof Error && error.message === PROFILE_NOT_FOUND_AFTER_LOCK) {
      sendError(res, httpStatus.NOT_FOUND, "USER_NOT_FOUND", "Profile was not found");
      return;
    }

    if (error instanceof UniqueConstraintError) {
      sendError(
        res,
        httpStatus.CONFLICT,
        "ASSIGNMENT_CONFLICT",
        "An active assignment already exists for this profile. Please retry the request."
      );
      return;
    }

    logger.error("Error creating profile partner assignment:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to create profile partner assignment");
  }
}

export async function listProfilePartnerAssignments(
  req: Request<unknown, unknown, unknown, { includeInactive?: string; partnerName?: string; userId?: string }>,
  res: Response
): Promise<void> {
  try {
    const { includeInactive, partnerName, userId } = req.query;
    const where: WhereOptions<ProfilePartnerAssignmentAttributes> = {
      ...(includeInactive === "true"
        ? {}
        : {
            [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
            isActive: true
          }),
      ...(partnerName ? { partnerName } : {}),
      ...(userId ? { userId } : {})
    };

    const assignments = await ProfilePartnerAssignment.findAll({
      order: [["createdAt", "DESC"]],
      where
    });

    res.status(httpStatus.OK).json({
      assignments: assignments.map(serializeAssignment)
    });
  } catch (error) {
    logger.error("Error listing profile partner assignments:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list profile partner assignments");
  }
}

export async function revokeProfilePartnerAssignment(req: Request<{ assignmentId: string }>, res: Response): Promise<void> {
  try {
    const { assignmentId } = req.params;
    const assignment = await ProfilePartnerAssignment.findByPk(assignmentId);

    if (!assignment) {
      sendError(res, httpStatus.NOT_FOUND, "ASSIGNMENT_NOT_FOUND", "Profile partner assignment was not found");
      return;
    }

    await assignment.update({ isActive: false });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error revoking profile partner assignment:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to revoke profile partner assignment");
  }
}
