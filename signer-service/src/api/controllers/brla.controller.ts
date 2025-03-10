import { Request, Response } from 'express';
import { BrlaApiService } from '../services/brla/brlaApiService';
import { RegisterSubaccountPayload, TriggerOfframpRequest } from '../services/brla/types';
import { eventPoller } from '../..';

// BRLA API requires the date in the format YYYY-MMM-DD
function convertDateToBRLAFormat(dateNumber: number) {
  const date = new Date(dateNumber);
  const year = date.getFullYear(); // YYYY
  const month = date.toLocaleString('en-us', { month: 'short' }); // MMM
  const day = String(date.getDate()).padStart(2, '0'); // DD with leading zero

  return `${year}-${month}-${day}`;
}

// Helper function to use in the catch block of the controller functions.
function handleApiError(error: unknown, res: Response, apiMethod: string): void {
  console.error(`Error while performing ${apiMethod}: `, error);

  // Check in the error message if it's a 400 error from the BRLA API
  if (error instanceof Error && error.message.includes("status '400'")) {
    // Split the error message to get the actual error message from the BRLA API
    const splitError = error.message.split('Error: ');
    if (splitError.length > 1) {
      const errorMessageString = splitError[1];
      try {
        const details = JSON.parse(errorMessageString);
        res.status(400).json({ error: 'Invalid request', details });
      } catch (e) {
        // The error was not encoded as JSON
        res.status(400).json({ error: 'Invalid request', details: errorMessageString });
      }
    } else {
      res.status(400).json({ error: 'Invalid request', details: error.message });
    }
    return;
  }

  res.status(500).json({
    error: 'Server error',
    details: error instanceof Error ? error.message : 'Unknown error',
  });
}

/**
 * Retrieves a BRLA user's information based on Tax ID
 *
 * This endpoint fetches a user's subaccount information from the BRLA API service.
 * It validates that the user exists and has completed KYC level 1 verification.
 * If successful, it returns the user's EVM wallet address which is needed for offramp operations.
 *
 * @returns void - Sends JSON response with evmAddress on success, or appropriate error status
 *
 * @throws 400 - If taxId or pixId are missing or if KYC level is invalid
 * @throws 404 - If the subaccount cannot be found
 * @throws 500 - For any server-side errors during processing
 */
export const getBrlaUser = async (req: Request<{}, {}, {}, { taxId: string }>, res: Response): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(400).json({ error: 'Missing taxId query parameters' });
      return;
    }

    // TODO how to check that pixId is valid, as a later offramp will get stuck if it's not valid..
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(404).json({ error: 'Subaccount not found' });
      return;
    }
    if (subaccount.kyc.level < 1) {
      res.status(400).json({ error: 'KYC invalid' });
      return;
    }

    res.json({ evmAddress: subaccount.wallets.evm });
    return;
  } catch (error) {
    handleApiError(error, res, 'getBrlaUser');
  }
};

export const triggerBrlaOfframp = async (req: Request<{}, {}, TriggerOfframpRequest>, res: Response): Promise<void> => {
  try {
    const { taxId, pixKey, amount, receiverTaxId } = req.body;
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      res.status(404).json({ error: 'Subaccount not found' });
      return;
    }

    const subaccountId = subaccount.id;
    console.log(
      'Triggering offramp. Subaccount: ',
      subaccountId,
      ' Amount ',
      amount,
      'pixKey ',
      pixKey,
      'receiverTaxId ',
      receiverTaxId,
    );
    const { id: offrampId } = await brlaApiService.triggerOfframp(subaccountId, {
      pixKey,
      amount: Number(amount),
      taxId: receiverTaxId,
    });
    res.status(200).json({ offrampId });
    return;
  } catch (error) {
    handleApiError(error, res, 'triggerOfframp');
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

    const lastEventCached = await eventPoller.getLatestEventForUser(subaccount.id);

    if (!lastEventCached) {
      res.status(404).json({ error: `No status events found for ${taxId}` });
      return;
    }

    if (
      lastEventCached.subscription !== 'MONEY-TRANSFER' &&
      lastEventCached.subscription !== 'BURN' &&
      lastEventCached.subscription !== 'BALANCE-UPDATE'
    ) {
      res.status(404).json({ error: `No offramp status event found for ${taxId}` });
      return;
    }

    res.status(200).json({ type: lastEventCached.subscription, status: lastEventCached.data.status });
  } catch (error) {
    handleApiError(error, res, 'getOfframpStatus');
  }
};

export const createSubaccount = async (
  req: Request<{}, {}, RegisterSubaccountPayload & { birthdate: number }>, // We get the birthdate as a number
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
    // Convert birthdate from number to BRLA format
    const birthdate = convertDateToBRLAFormat(req.body.birthdate);
    const subaccountPayload = { ...req.body, birthdate };

    const { id } = await brlaApiService.createSubaccount(subaccountPayload);

    res.status(200).json({ subaccountId: id });
  } catch (error) {
    handleApiError(error, res, 'createSubaccount');
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

    const lastEventCached = await eventPoller.getLatestEventForUser(subaccount.id);

    // We should never be in a situation where the subaccount exists but there are no events regarding KYC.
    if (!lastEventCached || lastEventCached.subscription !== 'KYC') {
      res.status(200).json({ type: 'KYC', status: 'PENDING' });
      return;
    }

    res.status(200).json({ type: lastEventCached.subscription, status: lastEventCached.data.kycStatus });
  } catch (error) {
    handleApiError(error, res, 'fetchSubaccountKycStatus');
  }
};
