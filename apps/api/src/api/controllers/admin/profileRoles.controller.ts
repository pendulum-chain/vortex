import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import ProfileRole, { PROFILE_ROLE_NAMES, type ProfileRoleName } from "../../../models/profileRole.model";
import User from "../../../models/user.model";

function isProfileRoleName(role: unknown): role is ProfileRoleName {
  return typeof role === "string" && (PROFILE_ROLE_NAMES as string[]).includes(role);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admins address profiles by id or by email (unique on profiles) interchangeably. */
async function findProfile(identifier: string): Promise<User | null> {
  return UUID_PATTERN.test(identifier) ? User.findByPk(identifier) : User.findOne({ where: { email: identifier } });
}

export async function addProfileRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId, email, role } = req.body ?? {};

    const identifier = userId ?? email;
    if (!identifier || typeof identifier !== "string" || !isProfileRoleName(role)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_ROLE_INPUT",
          message: `userId or email is required and role must be one of: ${PROFILE_ROLE_NAMES.join(", ")}`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const user = await findProfile(identifier);
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

    // Idempotent: re-granting an existing role succeeds without a duplicate row.
    const [profileRole, created] = await ProfileRole.findOrCreate({
      defaults: { role, userId: user.id },
      where: { role, userId: user.id }
    });

    res.status(created ? httpStatus.CREATED : httpStatus.OK).json({
      role: {
        createdAt: profileRole.createdAt,
        id: profileRole.id,
        role: profileRole.role,
        userId: profileRole.userId
      }
    });
  } catch (error) {
    logger.error("Error adding profile role:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add profile role",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function removeProfileRole(req: Request<{ userIdOrEmail: string; role: string }>, res: Response): Promise<void> {
  try {
    const { userIdOrEmail, role } = req.params;

    if (!isProfileRoleName(role)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_ROLE_INPUT",
          message: `role must be one of: ${PROFILE_ROLE_NAMES.join(", ")}`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const user = await findProfile(userIdOrEmail);
    const deleted = user ? await ProfileRole.destroy({ where: { role, userId: user.id } }) : 0;
    if (!deleted) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "ROLE_NOT_FOUND",
          message: "The profile does not have this role",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error removing profile role:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to remove profile role",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
