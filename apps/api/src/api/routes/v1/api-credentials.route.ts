import { Request, Response, Router } from "express";
import { createUserApiKey, listUserApiKeys, revokeUserApiKey } from "../../controllers/userApiKeys.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });
router.use(requireAuth);
router.post("/", createUserApiKey as unknown as (req: Request, res: Response) => void);
router.get("/", listUserApiKeys as unknown as (req: Request, res: Response) => void);
router.delete("/:credentialId", revokeUserApiKey as unknown as (req: Request<{ credentialId: string }>, res: Response) => void);

export default router;
