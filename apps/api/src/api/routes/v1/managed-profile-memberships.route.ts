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
  readMembers,
  readOrganization
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

const authenticatedLimiter = rateLimit({
  keyGenerator: req => req.userId as string,
  legacyHeaders: false,
  max: 120,
  standardHeaders: true,
  windowMs: 60 * 1000
});
const session = [rejectApiCredentials, requireAuth, rejectImpersonation, rejectManagedProfileSelection, authenticatedLimiter];

const router = Router();
router.get("/", ...session, readOrganization);
router.get("/members", ...session, readMembers);
router.patch("/members/:memberProfileId", ...session, patchMember);
router.delete("/members/:memberProfileId", ...session, deleteMember);
router.get("/member-invitations", ...session, readInvitations);
router.post("/member-invitations", ...session, postInvitation);
router.delete("/member-invitations/:invitationId", ...session, deleteInvitation);
router.get("/member-events", ...session, readMemberEvents);

export const managedProfileInviteeRoutes = Router();
managedProfileInviteeRoutes.get("/:invitationId", ...session, previewInvitation);
managedProfileInviteeRoutes.post("/:invitationId/accept", ...session, acceptInvitation);

export default router;
