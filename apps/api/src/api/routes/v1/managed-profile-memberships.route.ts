import { type RequestHandler, Router } from "express";
import rateLimit from "express-rate-limit";
import {
  acceptInvitation,
  deleteInvitation,
  deleteMember,
  patchMember,
  postInvitation,
  previewInvitation,
  readInvitations,
  readMemberEvents,
  readMembers
} from "../../controllers/managedProfileMemberships.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { rejectManagedProfileSelection } from "../../middlewares/managedProfileAuth";
import { requireAuth } from "../../middlewares/supabaseAuth";

const rejectApiCredentials: RequestHandler = (req, res, next) => {
  if (req.get("X-API-Key") !== undefined || req.get("X-Public-Key") !== undefined || req.credential) {
    res.status(403).json({
      error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Membership routes require a Supabase session", status: 403 }
    });
    return;
  }
  next();
};

const selectedChildMatchesPath: RequestHandler = (req, res, next) => {
  const selected = req.get("X-Managed-Profile-Id");
  if (selected !== undefined && selected.toLowerCase() !== String(req.params.profileId).toLowerCase()) {
    res
      .status(403)
      .json({ error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Managed-profile access is denied", status: 403 } });
    return;
  }
  next();
};

const authenticatedLimiter = rateLimit({
  keyGenerator: req => req.userId as string,
  legacyHeaders: false,
  max: 120,
  standardHeaders: true,
  windowMs: 60 * 1000
});
const session = [rejectApiCredentials, requireAuth, rejectImpersonation, authenticatedLimiter];
const member = [...session, selectedChildMatchesPath];

// Route-local checks deliberately leave unrelated lifecycle routes on this prefix untouched.
const router = Router();
router.get("/:profileId/members", ...member, readMembers);
router.patch("/:profileId/members/:memberProfileId", ...member, patchMember);
router.delete("/:profileId/members/:memberProfileId", ...member, deleteMember);
router.get("/:profileId/member-invitations", ...member, readInvitations);
router.post("/:profileId/member-invitations", ...member, postInvitation);
router.delete("/:profileId/member-invitations/:invitationId", ...member, deleteInvitation);
router.get("/:profileId/member-events", ...member, readMemberEvents);

export const managedProfileInviteeRoutes = Router();
managedProfileInviteeRoutes.get("/:invitationId", ...session, rejectManagedProfileSelection, previewInvitation);
managedProfileInviteeRoutes.post("/:invitationId/accept", ...session, rejectManagedProfileSelection, acceptInvitation);

export default router;
