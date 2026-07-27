import { Request, Response, Router } from "express";
import { createPrivyWallet, getWallets, updateWalletMode } from "../../controllers/wallets.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);
router.get("/", getWallets as unknown as (req: Request, res: Response) => void);
router.patch("/mode", updateWalletMode as unknown as (req: Request, res: Response) => void);
router.post("/privy", createPrivyWallet as unknown as (req: Request, res: Response) => void);

export default router;
