import { Request, Response, Router } from "express";
import { createUserApiKey, listUserApiKeys, revokeUserApiKey } from "../../controllers/userApiKeys.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });
router.use(requireAuth);
// Impersonation cannot create a lasting credential or disable the target's integrations.
router.post("/", rejectImpersonation, createUserApiKey as unknown as (req: Request, res: Response) => void);
router.get("/", listUserApiKeys as unknown as (req: Request, res: Response) => void);
router.delete(
  "/:credentialId",
  rejectImpersonation,
  revokeUserApiKey as unknown as (req: Request<{ credentialId: string }>, res: Response) => void
);

export default router;
