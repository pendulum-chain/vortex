import { Request, Response, Router } from "express";
import { sendStatusWithPk as sendMoonbeamStatusWithPk } from "../../controllers/moonbeam.controller";
import { sendStatusWithPk as sendPendulumStatusWithPk } from "../../controllers/pendulum.controller";
import partnerApiKeysRoutes from "./admin/partner-api-keys.route";
import profilePartnerAssignmentsRoutes from "./admin/profile-partner-assignments.route";
import alfredpayRoutes from "./alfredpay.route";
import authRoutes from "./auth.route";
import brlaRoutes from "./brla.route";
import contactRoutes from "./contact.route";
import countriesRoutes from "./countries.route";
import cryptocurrenciesRoutes from "./cryptocurrencies.route";
import emailRoutes from "./email.route";
import fiatRoutes from "./fiat.route";
import maintenanceRoutes from "./maintenance.route";
import metricsRoutes from "./metrics.route";
import mykoboRoutes from "./mykobo.route";
import paymentMethodsRoutes from "./payment-methods.route";
import priceRoutes from "./price.route";
import publicKeyRoutes from "./public-key.route";
import quoteRoutes from "./quote.route";
import rampRoutes from "./ramp.route";
import ratingRoutes from "./rating.route";
import sessionRoutes from "./session.route";
import siweRoutes from "./siwe.route";
import storageRoutes from "./storage.route";
import webhookRoutes from "./webhook.route";

type ChainStatus = {
  pendulum: unknown;
  moonbeam: unknown;
};

const router: Router = Router({ mergeParams: true });

async function sendStatusWithPk(_: Request, res: Response): Promise<void> {
  const chainStatus: ChainStatus = {
    moonbeam: await sendMoonbeamStatusWithPk(),
    pendulum: await sendPendulumStatusWithPk()
  };

  res.json(chainStatus);
}

/**
 * GET v1/status
 */
router.get("/status", sendStatusWithPk);

/**
 * GET v1/docs
 */
// Don't show docs for now.
// router.use("/docs", express.static("docs"));

/**
 * GET v1/prices
 */
router.use("/prices", priceRoutes);

/**
 * POST v1/quotes
 */
router.use("/quotes", quoteRoutes);

/**
 * POST v1/storage
 */
router.use("/storage", storageRoutes);

/**
 * POST v1/contact
 */
router.use("/contact", contactRoutes);

/**
 * POST v1/email
 */
router.use("/email", emailRoutes);

/**
 * POST v1/rating
 */
router.use("/rating", ratingRoutes);

/**
 * POST v1/siwe
 */
router.use("/siwe", siweRoutes);

/**
 * POST v1/session
 */
router.use("/session", sessionRoutes);

/**
 * GET v1/brla
 * POST v1/brla
 */
router.use("/brla", brlaRoutes);

/**
 * GET/POST v1/ramp
 */
router.use("/ramp", rampRoutes);

/**
 * GET v1/supported-payment-methods
 */
router.use("/supported-payment-methods", paymentMethodsRoutes);

/**
 * GET v1/supported-cryptocurrencies
 */
router.use("/supported-cryptocurrencies", cryptocurrenciesRoutes);

/**
 * GET v1/supported-countries
 */
router.use("/supported-countries", countriesRoutes);

/**
 * GET v1/supported-fiat-currencies
 */
router.use("/supported-fiat-currencies", fiatRoutes);

/**
 * GET v1/maintenance
 */
router.use("/maintenance", maintenanceRoutes);

/**
 * Auth routes for Supabase authentication
 * GET /v1/auth/check-email
 * POST /v1/auth/request-otp
 * POST /v1/auth/verify-otp
 * POST /v1/auth/refresh
 * POST /v1/auth/verify
 */
router.use("/auth", authRoutes);

/**
 * GET v1/alfredpay
 * POST v1/alfredpay
 */
router.use("/alfredpay", alfredpayRoutes);

/**
 * GET v1/mykobo/profiles
 * POST v1/mykobo/profiles
 */
router.use("/mykobo", mykoboRoutes);

/**
 * POST v1/webhook
 * DELETE v1/webhook
 */
router.use("/webhook", webhookRoutes);

/**
 * GET v1/public-key
 */
router.use("/public-key", publicKeyRoutes);

/**
 * GET v1/metrics
 */
router.use("/metrics", metricsRoutes);

/**
 * Admin routes for partner API key management
 * Uses partner name (not ID) to manage keys for all partner configurations
 * POST /v1/admin/partners/:partnerName/api-keys
 * GET /v1/admin/partners/:partnerName/api-keys
 * DELETE /v1/admin/partners/:partnerName/api-keys/:keyId
 */
router.use("/admin/partners/:partnerName/api-keys", partnerApiKeysRoutes);

/**
 * Admin routes for profile partner pricing assignments
 * POST /v1/admin/profile-partner-assignments
 * GET /v1/admin/profile-partner-assignments
 * DELETE /v1/admin/profile-partner-assignments/:assignmentId
 */
router.use("/admin/profile-partner-assignments", profilePartnerAssignmentsRoutes);

router.get("/ip", (request: Request, response: Response) => {
  response.send(request.ip);
});

export default router;
