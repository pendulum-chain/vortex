import type { CorridorCountry } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { getAuthenticatedProfileId } from "./effectiveUser";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManagedProfileContext {
  actorProfileId: string;
  customerEntityId: string;
  managedProfileId: string;
  subjectProfileId: string;
}

declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      managedProfileContext?: ManagedProfileContext;
    }
  }
}

type CorridorResolver =
  | CorridorCountry
  | ((req: Request) => CorridorCountry | undefined | Promise<CorridorCountry | undefined>);

interface ManagedProfileAuthOptions {
  corridor?: CorridorResolver;
}

export function authorizeManagedProfile(options: ManagedProfileAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subjectProfileId = req.get("X-Managed-Profile-Id");
    if (subjectProfileId === undefined) {
      next();
      return;
    }

    if (!UUID_PATTERN.test(subjectProfileId)) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_MANAGED_PROFILE_ID",
          message: "X-Managed-Profile-Id must contain a valid profile UUID",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const actorProfileId = getAuthenticatedProfileId(req);
    if (!actorProfileId) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required to act for a managed profile",
          status: httpStatus.UNAUTHORIZED
        }
      });
      return;
    }

    try {
      const [manager, relationship, subject] = await Promise.all([
        ManagedProfileManager.findByPk(actorProfileId),
        ManagedProfile.findOne({
          where: { managerProfileId: actorProfileId, profileId: subjectProfileId, status: "active" }
        }),
        User.findByPk(subjectProfileId, { attributes: ["activeCustomerEntityId", "kind"] })
      ]);

      const corridor = typeof options.corridor === "function" ? await options.corridor(req) : options.corridor;
      if (
        !manager?.isActive ||
        !relationship ||
        subject?.kind !== "managed" ||
        !subject.activeCustomerEntityId ||
        (options.corridor !== undefined && (!corridor || !manager.allowedCorridors.includes(corridor)))
      ) {
        sendAccessDenied(res);
        return;
      }

      const customerEntities = await CustomerEntity.findAll({
        attributes: ["id", "status"],
        where: { profileId: subjectProfileId }
      });
      const customerEntity = customerEntities[0];
      if (
        customerEntities.length !== 1 ||
        customerEntity.id !== subject.activeCustomerEntityId ||
        customerEntity.status !== "active"
      ) {
        sendAccessDenied(res);
        return;
      }

      req.managedProfileContext = Object.freeze({
        actorProfileId,
        customerEntityId: customerEntity.id,
        managedProfileId: relationship.id,
        subjectProfileId
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

function sendAccessDenied(res: Response): void {
  res.status(httpStatus.FORBIDDEN).json({
    error: {
      code: "MANAGED_PROFILE_ACCESS_DENIED",
      message: "The authenticated profile cannot perform this operation for the requested managed profile",
      status: httpStatus.FORBIDDEN
    }
  });
}
