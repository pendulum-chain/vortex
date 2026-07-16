import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op, Transaction, UniqueConstraintError, WhereOptions } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import ProfilePartnerAssignment, { ProfilePartnerAssignmentAttributes } from "../../../models/profilePartnerAssignment.model";
import User from "../../../models/user.model";

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
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_ASSIGNMENT_INPUT",
          message: "userId and partnerName are required string fields",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "Profile was not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    const partner = await Partner.findOne({
      where: {
        isActive: true,
        name: partnerName
      }
    });

    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No active partners found with name: ${partnerName}`,
          status: httpStatus.NOT_FOUND
        }
      });
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
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_EXPIRES_AT",
          message: error.message,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    if (error instanceof Error && error.message === PROFILE_NOT_FOUND_AFTER_LOCK) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "Profile was not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    if (error instanceof UniqueConstraintError) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "ASSIGNMENT_CONFLICT",
          message: "An active assignment already exists for this profile. Please retry the request.",
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    logger.error("Error creating profile partner assignment:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create profile partner assignment",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
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
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list profile partner assignments",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function revokeProfilePartnerAssignment(req: Request<{ assignmentId: string }>, res: Response): Promise<void> {
  try {
    const { assignmentId } = req.params;
    const assignment = await ProfilePartnerAssignment.findByPk(assignmentId);

    if (!assignment) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Profile partner assignment was not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    await assignment.update({ isActive: false });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error revoking profile partner assignment:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to revoke profile partner assignment",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
