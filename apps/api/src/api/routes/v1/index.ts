import { Request, Response, Router } from "express";
import { sendStatusWithPk as sendMoonbeamStatusWithPk } from "../../controllers/moonbeam.controller";
import { sendStatusWithPk as sendPendulumStatusWithPk } from "../../controllers/pendulum.controller";
import apiClientEventsRoutes from "./admin/api-client-events.route";
import partnerApiKeysRoutes from "./admin/partner-api-keys.route";
import partnerPricingConfigsRoutes from "./admin/partner-pricing-configs.route";
import profilePartnerAssignmentsRoutes from "./admin/profile-partner-assignments.route";
import profileRolesRoutes from "./admin/profile-roles.route";
import alfredpayRoutes from "./alfredpay.route";
import apiKeysRoutes from "./api-keys.route";
import authRoutes from "./auth.route";
import brlaRoutes from "./brla.route";
import contactRoutes from "./contact.route";
import countriesRoutes from "./countries.route";
import cryptocurrenciesRoutes from "./cryptocurrencies.route";
import emailRoutes from "./email.route";
import fiatRoutes from "./fiat.route";
import maintenanceRoutes from "./maintenance.route";
import metricsRoutes from "./metrics.route";
import moneriumRoutes from "./monerium.route";
import mykoboRoutes from "./mykobo.route";
import notificationsRoutes from "./notifications.route";
import onboardingRoutes from "./onboarding.route";
import paymentMethodsRoutes from "./payment-methods.route";
import priceRoutes from "./price.route";
import publicKeyRoutes from "./public-key.route";
import quoteRoutes from "./quote.route";
import rampRoutes from "./ramp.route";
import ratingRoutes from "./rating.route";
import recipientsRoutes from "./recipients.route";
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
 * Server-side Monerium OAuth and KYC/KYB status synchronization.
 */
router.use("/monerium", moneriumRoutes);

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
 * Recipient invites, relationships and transfer eligibility for authenticated senders.
 * POST /v1/recipients/invite
 * POST /v1/recipients/invite/:token/accept
 * GET /v1/recipients
 * PATCH /v1/recipients/:id
 * GET /v1/recipients/:id/eligibility
 */
router.use("/recipients", recipientsRoutes);

/**
 * In-app notification feed and preferences for authenticated users.
 * GET /v1/notifications
 * POST /v1/notifications/:id/read
 * POST /v1/notifications/read-all
 * GET/PUT /v1/notifications/preferences
 */
router.use("/notifications", notificationsRoutes);

/**
 * Aggregated onboarding status over provider accounts + KYC cases.
 * GET /v1/onboarding/status
 */
router.use("/onboarding", onboardingRoutes);

/**
 * Self-serve API key management for authenticated Supabase users.
 * Keys created here are user-scoped (no partner binding) and authenticate
 * via the X-API-Key header on quote/ramp endpoints as the linked user.
 * POST /v1/api-keys
 * GET /v1/api-keys
 * DELETE /v1/api-keys/:keyId
 */
router.use("/api-keys", apiKeysRoutes);

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

/**
 * Admin routes for partner pricing configs (optionally scoped to one fiat corridor)
 * POST /v1/admin/partner-pricing-configs
 * DELETE /v1/admin/partner-pricing-configs/:configId
 */
router.use("/admin/partner-pricing-configs", partnerPricingConfigsRoutes);

/**
 * Admin routes for profile capability roles (e.g. discount_manager); profiles are
 * addressed by id or email (unique key)
 * POST /v1/admin/profile-roles
 * DELETE /v1/admin/profile-roles/:userIdOrEmail/:role
 */
router.use("/admin/profile-roles", profileRolesRoutes);

/**
 * Admin routes for API client observability dashboards
 * GET /v1/admin/api-client-events
 */
router.use("/admin/api-client-events", apiClientEventsRoutes);

router.get("/ip", (request: Request, response: Response) => {
  response.send(request.ip);
});

export default router;
