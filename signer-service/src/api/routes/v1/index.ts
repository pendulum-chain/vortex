import { Router, Request, Response } from 'express';

import stellarRoutes from './stellar.route';
import moonbeamRoutes from './moonbeam.route';
import pendulumRoutes from './pendulum.route';
import storageRoutes from './storage.route';
import emailRoutes from './email.route';
import ratingRoutes from './rating.route';
import subsidizeRoutes from './subsidize.route';
import siweRoutes from './siwe.route';
import quoteRoutes from './quote.route';
import brlaRoutes from './brla.route';

import { sendStatusWithPk as sendStellarStatusWithPk } from '../../controllers/stellar.controller';
import { sendStatusWithPk as sendPendulumStatusWithPk } from '../../controllers/pendulum.controller';
import { sendStatusWithPk as sendMoonbeamStatusWithPk } from '../../controllers/moonbeam.controller';

type ChainStatus = {
  stellar: unknown;
  pendulum: unknown;
  moonbeam: unknown;
};

const router: Router = Router({ mergeParams: true });

async function sendStatusWithPk(_: Request, res: Response): Promise<void> {
  const chainStatus: ChainStatus = {
    stellar: await sendStellarStatusWithPk(),
    pendulum: await sendPendulumStatusWithPk(),
    moonbeam: await sendMoonbeamStatusWithPk(),
  };

  res.json(chainStatus);
}

/**
 * GET v1/status
 */
router.get('/status', sendStatusWithPk);

/**
 * GET v1/docs
 */
// Don't show docs for now.
// router.use("/docs", express.static("docs"));

/**
 * GET v1/quotes
 */
router.use('/quotes', quoteRoutes);

/**
 * POST v1/stellar
 */
router.use('/stellar', stellarRoutes);

/**
 * POST v1/moonbeam
 */
router.use('/moonbeam', moonbeamRoutes);

/**
 * POST v1/pendulum
 */
router.use('/pendulum', pendulumRoutes);

/**
 * POST v1/storage
 */
router.use('/storage', storageRoutes);

/**
 * POST v1/email
 */
router.use('/email', emailRoutes);

/**
 * POST v1/subsidize
 */
router.use('/subsidize', subsidizeRoutes);

/**
 * POST v1/rating
 */
router.use('/rating', ratingRoutes);

/**
 * POST v1/siwe
 */
router.use('/siwe', siweRoutes);

/**
 * GET v1/brla
 * POST v1/brla
 */
router.use('/brla', brlaRoutes);

router.get('/ip', (request: Request, response: Response) => {
  response.send(request.ip);
});

export default router;
