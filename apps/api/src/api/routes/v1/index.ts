import { Request, Response, Router } from "express";
import { sendStatusWithPk as sendMoonbeamStatusWithPk } from "../../controllers/moonbeam.controller";
import { sendStatusWithPk as sendPendulumStatusWithPk } from "../../controllers/pendulum.controller";
import { sendStatusWithPk as sendStellarStatusWithPk } from "../../controllers/stellar.controller";
import brlaRoutes from "./brla.route";
import cryptocurrenciesRoutes from "./cryptocurrencies.route";
import emailRoutes from "./email.route";
import maintenanceRoutes from "./maintenance.route";
import moneriumRoutes from "./monerium.route";
import moonbeamRoutes from "./moonbeam.route";
import paymentMethodsRoutes from "./payment-methods.route";
import pendulumRoutes from "./pendulum.route";
import priceRoutes from "./price.route";
import quoteRoutes from "./quote.route";
import rampRoutes from "./ramp.route";
import ratingRoutes from "./rating.route";
import sessionRoutes from "./session.route";
import siweRoutes from "./siwe.route";
import stellarRoutes from "./stellar.route";
import storageRoutes from "./storage.route";
import subsidizeRoutes from "./subsidize.route";

type ChainStatus = {
  stellar: unknown;
  pendulum: unknown;
  moonbeam: unknown;
};

const router: Router = Router({ mergeParams: true });

async function sendStatusWithPk(_: Request, res: Response): Promise<void> {
  const chainStatus: ChainStatus = {
    moonbeam: await sendMoonbeamStatusWithPk(),
    pendulum: await sendPendulumStatusWithPk(),
    stellar: await sendStellarStatusWithPk()
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
 * POST v1/stellar
 */
router.use("/stellar", stellarRoutes);

/**
 * POST v1/moonbeam
 */
router.use("/moonbeam", moonbeamRoutes);

/**
 * POST v1/pendulum
 */
router.use("/pendulum", pendulumRoutes);

/**
 * POST v1/storage
 */
router.use("/storage", storageRoutes);

/**
 * POST v1/email
 */
router.use("/email", emailRoutes);

/**
 * POST v1/subsidize
 */
router.use("/subsidize", subsidizeRoutes);

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
 * GET v1/maintenance
 */
router.use("/maintenance", maintenanceRoutes);

/**
 * GET v1/monerium
 */
router.use("/monerium", moneriumRoutes);

router.get("/ip", (request: Request, response: Response) => {
  response.send(request.ip);
});

export default router;
