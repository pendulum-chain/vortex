import { Request, Response, Router } from "express";
import {
  acceptInvite,
  createInvite,
  getRecipientEligibility,
  listRecipients,
  updateRecipient
} from "../../controllers/recipients.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);

/**
 * POST /v1/recipients/invite
 * Create a recipient invite for the authenticated sender; returns the raw link token once.
 */
router.post("/invite", createInvite as unknown as (req: Request, res: Response) => void);

/**
 * POST /v1/recipients/invite/:token/accept
 * Recipient (authenticated) redeems the link token; creates the sender↔recipient relationship.
 */
router.post("/invite/:token/accept", acceptInvite as unknown as (req: Request<{ token: string }>, res: Response) => void);

/**
 * GET /v1/recipients
 * List the sender's recipients (relationship + onboarding status) and pending invitations.
 */
router.get("/", listRecipients as unknown as (req: Request, res: Response) => void);

/**
 * PATCH /v1/recipients/:id
 * Update nickname or relationship status (active | blocked | archived).
 */
router.patch("/:id", updateRecipient as unknown as (req: Request<{ id: string }>, res: Response) => void);

/**
 * GET /v1/recipients/:id/eligibility
 * Transfer gate: { canCreateTransfer, blockingReasonCode? }.
 */
router.get("/:id/eligibility", getRecipientEligibility as unknown as (req: Request<{ id: string }>, res: Response) => void);

export default router;
