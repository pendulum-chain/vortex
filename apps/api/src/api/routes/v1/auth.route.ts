import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller";

const router = Router();

router.get("/check-email", AuthController.checkEmail);
router.post("/request-otp", AuthController.requestOTP);
router.post("/verify-otp", AuthController.verifyOTP);
router.post("/refresh", AuthController.refreshToken);
router.post("/verify", AuthController.verifyToken);

export default router;
