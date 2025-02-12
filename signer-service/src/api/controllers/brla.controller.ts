import { Request, Response } from 'express';
import { BrlaApiService } from '../services/brla/brlaApiService';
import { TriggerOfframpRequest } from '../middlewares/validators';

export const getBrlaUser = async (
  req: Request<{}, {}, {}, { taxId: string; pixId: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { taxId, pixId } = req.query;

    if (!taxId || !pixId) {
      res.status(400).json({ error: 'Missing taxId or pixId query parameters' });
      return;
    }

    // TODO how to check that pixId is valid, as a later offramp will get stuck if it's not valid..

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(404).json({ error: 'Subaccount not found' });
      return;
    }
    res.json({ evmAddress: subaccount.wallets.evm });
    return;
  } catch (error) {
    console.error('Error while fetching subaccount: ', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};

export const triggerBrlaOfframp = async (req: Request<{}, {}, TriggerOfframpRequest>, res: Response): Promise<void> => {
  try {
    const { taxId, pixKey, amount } = req.body;
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      res.status(404).json({ error: 'Subaccount not found' });
      return;
    }

    const subaccountId = subaccount.id;
    const { id: offrampId } = await brlaApiService.triggerOfframp({ subaccountId, pixKey, amount });
    // TODO: save to stat for hooks listening, maybe map the id to hide true one??

    res.status(201).json({ offrampId });
    return;
  } catch (error) {
    console.error('Error while requesting offramp: ', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};
