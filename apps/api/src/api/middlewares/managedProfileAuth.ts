import { type CorridorCountry, type CorridorCustomerType, isCorridorSupportedForCustomerType } from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomerEntity, { type CustomerEntityType } from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership, { type ManagedProfileMembershipRole } from "../../models/managedProfileMembership.model";
import User from "../../models/user.model";
import { getManagedProfile, ManagedProfileLifecycleError } from "../services/managed-profile-lifecycle.service";
import { getAuthenticatedProfileId } from "./effectiveUser";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export enum ManagedProfileCapability {
  CredentialManage = "credential_manage",
  Manage = "manage",
  Ramp = "ramp",
  Read = "read"
}

export type { ManagedProfileMembershipRole } from "../../models/managedProfileMembership.model";

export interface ManagedProfileContext {
  actorProfileId: string;
  capability: ManagedProfileCapability;
  controllingManagerProfileId: string;
  customerEntityId: string;
  managedProfileId: string;
  membershipId?: string;
  membershipRole?: ManagedProfileMembershipRole;
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
  allowDeleted?: boolean;
  capability: ManagedProfileCapability;
  corridor?: CorridorResolver;
  customerType?: CustomerTypeResolver;
  enforceCustomerTypePolicy?: boolean;
  membershipBootstrap?: boolean;
  subjectProfileId?: (req: Request) => string | undefined;
}

const CAPABILITIES_BY_ROLE: Record<ManagedProfileMembershipRole, readonly ManagedProfileCapability[]> = {
  manager: [
    ManagedProfileCapability.Read,
    ManagedProfileCapability.Manage,
    ManagedProfileCapability.CredentialManage,
    ManagedProfileCapability.Ramp
  ],
  read_only: [ManagedProfileCapability.Read]
};

export function authorizeManagedProfile(options: ManagedProfileAuthOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const selectedProfileId = req.get("X-Managed-Profile-Id");
    const subjectProfileId = options.subjectProfileId?.(req) ?? selectedProfileId;
    const directManagedCredential = req.credential?.managedProfile;
    const directCredentialProfileId = req.credential?.profileId;
    if (
      (subjectProfileId !== undefined || directManagedCredential) &&
      !Object.values(ManagedProfileCapability).includes(options.capability)
    ) {
      sendAccessDenied(res);
      return;
    }
    if (options.subjectProfileId && selectedProfileId !== undefined && selectedProfileId !== subjectProfileId) {
      sendAccessDenied(res);
      return;
    }
    if (directManagedCredential && selectedProfileId !== undefined) {
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
          capability: options.capability,
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
          sendPolicyDenied(res);
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
      if (options.allowDeleted) {
        if (options.capability !== ManagedProfileCapability.Read) {
          sendAccessDenied(res);
          return;
        }
        res.locals.managedProfile = await getManagedProfile(actorProfileId, subjectProfileId, {
          bootstrap: options.membershipBootstrap === true && selectedProfileId !== undefined
        });
        next();
        return;
      }
      const [relationship, subject] = await Promise.all([
        ManagedProfile.findOne({
          where: { profileId: subjectProfileId, status: "active" }
        }),
        User.findByPk(subjectProfileId, { attributes: ["activeCustomerEntityId", "kind"] })
      ]);

      if (!relationship || subject?.kind !== "managed" || !subject.activeCustomerEntityId) {
        if (options.subjectProfileId) sendManagedProfileNotFound(res);
        else sendAccessDenied(res);
        return;
      }
      const membership = await ManagedProfileMembership.findOne({
        where: { memberProfileId: actorProfileId, ownerProfileId: relationship.managerProfileId, revokedAt: null }
      });
      if (!membership || !isMembershipRole(membership.role)) {
        if (options.subjectProfileId) sendManagedProfileNotFound(res);
        else sendAccessDenied(res);
        return;
      }

      const manager = await ManagedProfileManager.findByPk(relationship.managerProfileId);
      if (!manager?.isActive) {
        sendAccessDenied(res);
        return;
      }
      if (!CAPABILITIES_BY_ROLE[membership.role].includes(options.capability)) {
        sendManagerRequired(res);
        return;
      }
      if (options.capability === ManagedProfileCapability.Ramp && !isSecretCredentialActor(req, actorProfileId)) {
        sendRampCredentialRequired(res);
        return;
      }
      if (options.capability === ManagedProfileCapability.CredentialManage && !isSecretCredentialActor(req, actorProfileId)) {
        res.status(httpStatus.FORBIDDEN).json({
          error: {
            code: "MANAGED_PROFILE_REQUIRES_API_CREDENTIAL",
            message: "Managed-profile provider mutations require a secret API credential",
            status: httpStatus.FORBIDDEN
          }
        });
        return;
      }

      const customerType = await attachManagedProfileContext(req, res, {
        actorProfileId,
        capability: options.capability,
        controllingManagerProfileId: relationship.managerProfileId,
        managedProfileId: relationship.id,
        membershipId: membership.id,
        membershipRole: membership.role,
        subjectProfileId
      });
      if (!customerType) return;
      const corridors = await resolveCorridors(req, res, options.corridor);
      if (res.headersSent) return;
      if (
        options.corridor !== undefined &&
        (corridors.length === 0 || corridors.some(corridor => !manager.allowedCorridors.includes(corridor)))
      ) {
        sendPolicyDenied(res);
        return;
      }
      if (!(await authorizeCustomerType(req, res, options, corridors, customerType, manager.allowedCustomerTypes))) return;
      res.locals.managedProfilePolicy = { allowedCorridors: manager.allowedCorridors, customerType };
      next();
    } catch (error) {
      if (error instanceof ManagedProfileLifecycleError) {
        const status = error.code === "MANAGED_PROFILE_NOT_FOUND" ? httpStatus.NOT_FOUND : httpStatus.FORBIDDEN;
        res.status(status).json({ error: { code: error.code, message: error.message, status } });
        return;
      }
      next(error);
    }
  };
}

function isMembershipRole(role: string): role is ManagedProfileMembershipRole {
  return role === "manager" || role === "read_only";
}

function isSecretCredentialActor(req: Request, actorProfileId: string): boolean {
  return (
    req.authenticatedCredentialProfileId === actorProfileId &&
    req.credential?.profileId === actorProfileId &&
    req.credential.strength === "secret"
  );
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
    sendPolicyDenied(res);
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

function sendManagedProfileNotFound(res: Response): void {
  res.status(httpStatus.NOT_FOUND).json({
    error: {
      code: "MANAGED_PROFILE_NOT_FOUND",
      message: "Managed profile was not found",
      status: httpStatus.NOT_FOUND
    }
  });
}

function sendManagerRequired(res: Response): void {
  res.status(httpStatus.FORBIDDEN).json({
    error: {
      code: "MANAGED_PROFILE_MANAGER_REQUIRED",
      message: "An active manager membership is required for this operation",
      status: httpStatus.FORBIDDEN
    }
  });
}

function sendRampCredentialRequired(res: Response): void {
  res.status(httpStatus.FORBIDDEN).json({
    error: {
      code: "MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL",
      message: "Managed-profile ramps require a secret API credential",
      status: httpStatus.FORBIDDEN
    }
  });
}

function sendPolicyDenied(res: Response): void {
  res.status(httpStatus.FORBIDDEN).json({
    error: {
      code: "MANAGED_PROFILE_POLICY_DENIED",
      message: "The managed-profile owner policy does not allow this operation",
      status: httpStatus.FORBIDDEN
    }
  });
}
