import { Request, Response } from 'express';
import { BrlaApiService } from '../services/brla/brlaApiService';
import { RegisterSubaccountPayload, TriggerOfframpRequest } from '../services/brla/types';
import { eventPoller } from '../..';

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
    if (subaccount.kyc.level !== 1) {
      res.status(400).json({ error: 'KYC invalid' });
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
    console.log('Triggering offramp. Amount ', amount, 'taxId ', taxId, 'pixKey ', pixKey);
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      res.status(404).json({ error: 'Subaccount not found' });
      return;
    }

    const subaccountId = subaccount.id;
    const { id: offrampId } = await brlaApiService.triggerOfframp({ subaccountId, pixKey, amount });
    res.status(200).json({ offrampId });
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

export const getOfframpStatus = async (req: Request<{}, {}, {}, { taxId: string }>, res: Response): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(400).json({ error: 'Missing taxId' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(400).json({ error: 'Subaccount not found' });
      return;
    }

    const lastEventCached = eventPoller.getLatestEventForUser(subaccount.id);

    if (!lastEventCached) {
      res.status(404).json({ error: `No status events found for ${taxId}` });
      return;
    }

    res.status(200).json({ type: lastEventCached.subscription, status: lastEventCached.data.status });
  } catch (error) {
    console.error('Error while requesting offramp status: ', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};

export const createSubaccount = async (
  req: Request<{}, {}, RegisterSubaccountPayload>,
  res: Response,
): Promise<void> => {
  try {
    const { cpf: taxId } = req.body;

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (subaccount) {
      res.status(400).json({ error: 'Subaccount already created' });
      return;
    }

    const { id } = await brlaApiService.createSubaccount(req.body);

    res.status(200).json({ subaccountId: id });
  } catch (error) {
    console.error('Error while creating subaccount: ', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};

export const fetchSubaccountKycStatus = async (
  req: Request<{}, {}, {}, { taxId: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(400).json({ error: 'Missing taxId' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(400).json({ error: 'Subaccount not found' });
      return;
    }

    const lastEventCached = eventPoller.getLatestEventForUser(subaccount.id);

    if (!lastEventCached) {
      res.status(404).json({ error: `No status events found for ${taxId}` });
      return;
    }
    //res.status(200).json({ type: "KYC", status: "SUCCESS" });
    res.status(200).json({ type: lastEventCached.subscription, status: lastEventCached.data.status });
  } catch (error) {
    console.error('Error while requesting KYC status: ', error);
    res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};
