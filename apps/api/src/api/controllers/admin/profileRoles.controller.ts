import { Request, Response } from "express";
import httpStatus from "http-status";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import AdminImpersonationSession from "../../../models/adminImpersonationSession.model";
import ProfileRole, {
  HTTP_GRANTABLE_PROFILE_ROLES,
  PROFILE_ROLE_NAMES,
  type ProfileRoleName
} from "../../../models/profileRole.model";
import User from "../../../models/user.model";
import { sendError } from "../../helpers/sendError";
import { UUID_PATTERN } from "../../helpers/uuid";

function isProfileRoleName(role: unknown): role is ProfileRoleName {
  return typeof role === "string" && (PROFILE_ROLE_NAMES as string[]).includes(role);
}

/** Admins address profiles by id or by email (unique on profiles) interchangeably. */
async function findProfile(identifier: string): Promise<User | null> {
  return UUID_PATTERN.test(identifier) ? User.findByPk(identifier) : User.findOne({ where: { email: identifier } });
}

export async function addProfileRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId, email, role } = req.body ?? {};

    const identifier = userId ?? email;
    if (!identifier || typeof identifier !== "string" || !isProfileRoleName(role)) {
      sendError(
        res,
        httpStatus.BAD_REQUEST,
        "INVALID_ROLE_INPUT",
        `userId or email is required and role must be one of: ${PROFILE_ROLE_NAMES.join(", ")}`
      );
      return;
    }

    if (!HTTP_GRANTABLE_PROFILE_ROLES.includes(role)) {
      sendError(
        res,
        httpStatus.FORBIDDEN,
        "ROLE_NOT_HTTP_GRANTABLE",
        `${role} must be granted out-of-band (see scripts/grant-vortex-admin.ts), not via this endpoint`
      );
      return;
    }

    const user = await findProfile(identifier);
    if (!user) {
      sendError(res, httpStatus.NOT_FOUND, "USER_NOT_FOUND", "Profile was not found");
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
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to add profile role");
  }
}

export async function removeProfileRole(req: Request<{ userIdOrEmail: string; role: string }>, res: Response): Promise<void> {
  try {
    const { userIdOrEmail, role } = req.params;

    if (!isProfileRoleName(role)) {
      sendError(res, httpStatus.BAD_REQUEST, "INVALID_ROLE_INPUT", `role must be one of: ${PROFILE_ROLE_NAMES.join(", ")}`);
      return;
    }

    const user = await findProfile(userIdOrEmail);
    const deleted = user
      ? await sequelize.transaction(async transaction => {
          // Share the actor-row lock used by session creation, so role removal cannot race
          // with a new token being minted after the revocation sweep.
          await User.findByPk(user.id, { attributes: ["id"], lock: transaction.LOCK.UPDATE, transaction });
          const deleted = await ProfileRole.destroy({ transaction, where: { role, userId: user.id } });
          if (deleted && role === "vortex_admin") {
            await AdminImpersonationSession.update(
              { revokedAt: new Date(), revokedReason: "vortex_admin_role_revoked" },
              { transaction, where: { actorProfileId: user.id, revokedAt: null } }
            );
          }
          return deleted;
        })
      : 0;
    if (!deleted) {
      sendError(res, httpStatus.NOT_FOUND, "ROLE_NOT_FOUND", "The profile does not have this role");
      return;
    }

    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error removing profile role:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to remove profile role");
  }
}
