import { Router } from "express";
import {
  createPartnerPricingConfig,
  deletePartnerPricingConfig
} from "../../../controllers/admin/partnerPricingConfigs.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

/**
 * POST /v1/admin/partner-pricing-configs
 * Create a pricing config for a partner and ramp direction, optionally scoped to one
 * fiat corridor via fiatCurrency (omit for the all-corridors wildcard row).
 */
router.post("/", createPartnerPricingConfig);

/**
 * DELETE /v1/admin/partner-pricing-configs/:configId
 * Remove a pricing config (hard delete, so the same scope can be re-created).
 */
router.delete("/:configId", deletePartnerPricingConfig);

export default router;
