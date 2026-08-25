import { type CorridorCountry, type CorridorCustomerType, isCorridorSupportedForCustomerType } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomerEntity, { type CustomerEntityType } from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { getAuthenticatedProfileId } from "./effectiveUser";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManagedProfileContext {
  actorProfileId: string;
  controllingManagerProfileId: string;
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
  | ((
      req: Request,
      res: Response
    ) => CorridorCountry | CorridorCountry[] | undefined | Promise<CorridorCountry | CorridorCountry[] | undefined>);

type CustomerTypeResolver =
  | CustomerEntityType
  | ((req: Request) => CustomerEntityType | undefined | Promise<CustomerEntityType | undefined>);

interface ManagedProfileAuthOptions {
  corridor?: CorridorResolver;
  customerType?: CustomerTypeResolver;
  enforceCustomerTypePolicy?: boolean;
}

export function authorizeManagedProfile(options: ManagedProfileAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subjectProfileId = req.get("X-Managed-Profile-Id");
    const directManagedCredential = req.credential?.managedProfile;
    const directCredentialProfileId = req.credential?.profileId;
    if (directManagedCredential && subjectProfileId !== undefined) {
      sendAccessDenied(res);
      return;
    }
    if (subjectProfileId === undefined) {
      if (!directManagedCredential || !directCredentialProfileId) {
        next();
        return;
      }

      try {
        const customerType = await attachManagedProfileContext(req, res, {
          actorProfileId: directCredentialProfileId,
          controllingManagerProfileId: directManagedCredential.controllingManagerProfileId,
          managedProfileId: directManagedCredential.relationshipId,
          subjectProfileId: directCredentialProfileId
        });
        if (!customerType) return;
        const corridors = await resolveCorridors(req, res, options.corridor);
        if (res.headersSent) return;
        if (
          options.corridor !== undefined &&
          (corridors.length === 0 || corridors.some(corridor => !directManagedCredential.allowedCorridors.includes(corridor)))
        ) {
          sendAccessDenied(res);
          return;
        }
        if (
          !(await authorizeCustomerType(
            req,
            res,
            options,
            corridors,
            customerType,
            directManagedCredential.allowedCustomerTypes
          ))
        ) {
          return;
        }
        res.locals.managedProfilePolicy = {
          allowedCorridors: directManagedCredential.allowedCorridors,
          customerType
        };
        next();
      } catch (error) {
        next(error);
      }
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

      if (!manager?.isActive || !relationship || subject?.kind !== "managed" || !subject.activeCustomerEntityId) {
        sendAccessDenied(res);
        return;
      }

      const customerType = await attachManagedProfileContext(req, res, {
        actorProfileId,
        controllingManagerProfileId: actorProfileId,
        managedProfileId: relationship.id,
        subjectProfileId
      });
      if (!customerType) return;
      const corridors = await resolveCorridors(req, res, options.corridor);
      if (res.headersSent) return;
      if (
        options.corridor !== undefined &&
        (corridors.length === 0 || corridors.some(corridor => !manager.allowedCorridors.includes(corridor)))
      ) {
        sendAccessDenied(res);
        return;
      }
      if (!(await authorizeCustomerType(req, res, options, corridors, customerType, manager.allowedCustomerTypes))) return;
      res.locals.managedProfilePolicy = { allowedCorridors: manager.allowedCorridors, customerType };
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function resolveCorridors(
  req: Request,
  res: Response,
  resolver: CorridorResolver | undefined
): Promise<CorridorCountry[]> {
  const resolved = typeof resolver === "function" ? await resolver(req, res) : resolver;
  return Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
}

async function attachManagedProfileContext(
  req: Request,
  res: Response,
  identity: Omit<ManagedProfileContext, "customerEntityId">
): Promise<CustomerEntityType | null> {
  const [subject, customerEntities] = await Promise.all([
    User.findByPk(identity.subjectProfileId, { attributes: ["activeCustomerEntityId", "kind"] }),
    CustomerEntity.findAll({ attributes: ["id", "status", "type"], where: { profileId: identity.subjectProfileId } })
  ]);
  const customerEntity = customerEntities[0];
  if (
    subject?.kind !== "managed" ||
    !subject.activeCustomerEntityId ||
    customerEntities.length !== 1 ||
    customerEntity.id !== subject.activeCustomerEntityId ||
    customerEntity.status !== "active"
  ) {
    sendAccessDenied(res);
    return null;
  }
  req.managedProfileContext = Object.freeze({ ...identity, customerEntityId: customerEntity.id });
  return customerEntity.type;
}

async function authorizeCustomerType(
  req: Request,
  res: Response,
  options: ManagedProfileAuthOptions,
  corridors: CorridorCountry[],
  customerType: CustomerEntityType,
  allowedCustomerTypes: readonly CorridorCustomerType[] | null | undefined
): Promise<boolean> {
  const expectedCustomerType =
    typeof options.customerType === "function" ? await options.customerType(req) : options.customerType;
  if (options.customerType !== undefined && expectedCustomerType !== customerType) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "MANAGED_PROFILE_CUSTOMER_TYPE_MISMATCH",
        message: "The operation customer type does not match the managed profile customer type",
        status: httpStatus.BAD_REQUEST
      }
    });
    return false;
  }
  if (
    ((options.corridor !== undefined || options.customerType !== undefined || options.enforceCustomerTypePolicy) &&
      allowedCustomerTypes !== null &&
      allowedCustomerTypes !== undefined &&
      !allowedCustomerTypes.includes(customerType)) ||
    corridors.some(corridor => !isCorridorSupportedForCustomerType(corridor, customerType))
  ) {
    sendAccessDenied(res);
    return false;
  }
  return true;
}

export function rejectManagedProfileSelection(req: Request, res: Response, next: NextFunction): void {
  if (req.get("X-Managed-Profile-Id") === undefined) {
    next();
    return;
  }

  res.status(httpStatus.BAD_REQUEST).json({
    error: {
      code: "MANAGED_PROFILE_UNSUPPORTED",
      message: "Managed profile selection is not supported for this operation",
      status: httpStatus.BAD_REQUEST
    }
  });
}

export function rejectDirectManagedCredential(req: Request, res: Response, next: NextFunction): void {
  if (!req.credential?.managedProfile) {
    next();
    return;
  }

  sendAccessDenied(res);
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
