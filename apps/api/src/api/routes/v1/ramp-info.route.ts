import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getRampInfo } from "../../controllers/rampInfo.controller";
import { apiKeyAuth } from "../../middlewares/apiKeyAuth";
import { validatePublicKey } from "../../middlewares/publicKeyAuth";

const router = Router({ mergeParams: true });
const windowMs = 60_000;

const ipLimiter = rateLimit({ legacyHeaders: false, max: 60, standardHeaders: true, windowMs });
const credentialLimiter = rateLimit({
  keyGenerator: req => req.credential?.credentialId ?? req.ip ?? "missing-credential",
  legacyHeaders: false,
  max: 60,
  standardHeaders: true,
  windowMs
});

router.get("/", ipLimiter, validatePublicKey(), apiKeyAuth(), credentialLimiter, getRampInfo);

export default router;
