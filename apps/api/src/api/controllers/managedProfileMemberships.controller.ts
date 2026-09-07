import type { Request, RequestHandler, Response } from "express";
import logger from "../../config/logger";
import {
  cancelManagedProfileInvitation,
  changeManagedProfileMember,
  createManagedProfileInvitation,
  listManagedProfileInvitations,
  listManagedProfileMemberEvents,
  listManagedProfileMembers,
  ManagedProfileMembershipError,
  readOrAcceptManagedProfileInvitation,
  removeManagedProfileMember
} from "../services/managed-profile-membership.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handle(action: (req: Request, res: Response, actorProfileId: string) => Promise<void>): RequestHandler {
  return async (req, res) => {
    try {
      if (!req.userId || req.impersonation || req.credential) {
        throw new ManagedProfileMembershipError("MANAGED_PROFILE_ACCESS_DENIED", 403, "A Supabase session is required");
      }
      for (const [key, value] of Object.entries(req.params)) {
        if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
          throw new ManagedProfileMembershipError("MANAGED_PROFILE_INVALID_INPUT", 400, "Path identifiers must be UUIDs");
        }
        req.params[key] = value.toLowerCase();
      }
      await action(req, res, req.userId);
    } catch (error) {
      if (error instanceof ManagedProfileMembershipError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message, status: error.status } });
        return;
      }
      // Database errors can contain invitation email values; do not log the raw exception.
      logger.error("Managed-profile membership request failed");
      res
        .status(500)
        .json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Unable to process membership request", status: 500 } });
    }
  };
}

function page(req: Request) {
  const limit = req.query.limit === undefined ? 50 : req.query.limit;
  const offset = req.query.offset === undefined ? 0 : req.query.offset;
  if (
    (typeof limit !== "number" && (typeof limit !== "string" || !/^\d+$/.test(limit))) ||
    (typeof offset !== "number" && (typeof offset !== "string" || !/^\d+$/.test(offset))) ||
    !Number.isSafeInteger(Number(limit)) ||
    Number(limit) < 1 ||
    Number(limit) > 100 ||
    !Number.isSafeInteger(Number(offset)) ||
    Number(offset) < 0
  )
    throw new ManagedProfileMembershipError("INVALID_PAGINATION", 400, "limit must be 1-100 and offset a non-negative integer");
  return { limit: Number(limit), offset: Number(offset) };
}

export const readMembers = handle(async (req, res, actor) => {
  const { limit, offset } = page(req);
  res.json(await listManagedProfileMembers(actor, req.params.profileId as string, limit, offset));
});

export const patchMember = handle(async (req, res, actor) => {
  res.json(
    await changeManagedProfileMember(
      actor,
      req.params.profileId as string,
      req.params.memberProfileId as string,
      req.body?.role
    )
  );
});

export const deleteMember = handle(async (req, res, actor) => {
  await removeManagedProfileMember(actor, req.params.profileId as string, req.params.memberProfileId as string);
  res.status(204).send();
});

export const readInvitations = handle(async (req, res, actor) => {
  const { limit, offset } = page(req);
  res.json(await listManagedProfileInvitations(actor, req.params.profileId as string, limit, offset));
});

export const postInvitation = handle(async (req, res, actor) => {
  const result = await createManagedProfileInvitation(actor, req.params.profileId as string, {
    email: req.body?.email,
    role: req.body?.role
  });
  res.status(result.created ? 201 : 200).json({ invitation: result.invitation });
});

export const deleteInvitation = handle(async (req, res, actor) => {
  await cancelManagedProfileInvitation(actor, req.params.profileId as string, req.params.invitationId as string);
  res.status(204).send();
});

export const readMemberEvents = handle(async (req, res, actor) => {
  const { limit } = page(req);
  const cursor = req.query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !UUID_PATTERN.test(cursor))) {
    throw new ManagedProfileMembershipError("INVALID_PAGINATION", 400, "Cursor must be an event UUID");
  }
  res.json(await listManagedProfileMemberEvents(actor, req.params.profileId as string, limit, cursor as string | undefined));
});

export const previewInvitation = handle(async (req, res, actor) => {
  res.json(
    await readOrAcceptManagedProfileInvitation(
      { email: req.userEmail, emailConfirmedAt: req.emailConfirmedAt, profileId: actor },
      req.params.invitationId as string,
      false
    )
  );
});

export const acceptInvitation = handle(async (req, res, actor) => {
  res.json(
    await readOrAcceptManagedProfileInvitation(
      { email: req.userEmail, emailConfirmedAt: req.emailConfirmedAt, profileId: actor },
      req.params.invitationId as string,
      true
    )
  );
});
