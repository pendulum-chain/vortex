import { Request, Response } from 'express';
import { validateMaskedNumber } from 'shared';
import { BrlaEndpoints } from 'shared/src/endpoints/brla.endpoints';
import httpStatus from 'http-status';
import { BrlaApiService } from '../services/brla/brlaApiService';
import { eventPoller } from '../..';
import { BrlaTeleportService } from '../services/brla/brlaTeleportService';
import { generateReferenceLabel } from '../services/brla/helpers';
import logger from '../../config/logger';

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
        res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid request', details });
      } catch (e) {
        // The error was not encoded as JSON
        res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid request', details: errorMessageString });
      }
    } else {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid request', details: error.message });
    }
    return;
  }

  res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
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
export const getBrlaUser = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.GetUserRequest>,
  res: Response<BrlaEndpoints.GetUserResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing taxId query parameters' });
      return;
    }

    // TODO how to check that pixId is valid, as a later offramp will get stuck if it's not valid..
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(httpStatus.NOT_FOUND).json({ error: 'Subaccount not found' });
      return;
    }
    if (subaccount.kyc.level < 1) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'KYC invalid' });
      return;
    }

    res.json({ evmAddress: subaccount.wallets.evm });
    return;
  } catch (error) {
    handleApiError(error, res, 'getBrlaUser');
  }
};

export const getBrlaUserRemainingLimit = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.GetUserRemainingLimitRequest>,
  res: Response<BrlaEndpoints.GetUserRemainingLimitResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing taxId query parameter' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      res.status(httpStatus.NOT_FOUND).json({ error: 'Subaccount not found' });
      return;
    }

    const totalLimit = subaccount.kyc.limits;
    const usedLimit = await brlaApiService.getSubaccountUsedLimit(subaccount.id);
    if (!usedLimit) {
      res.status(httpStatus.NOT_FOUND).json({ error: 'Limits not found' });
      return;
    }

    // BRLA is using cents, so we need to divide by 100
    const remainingLimitOfframp = (totalLimit.limitBRLAOutOwnAccount - usedLimit.limitBRLAOutOwnAccount) / 100;
    // TODO it's not 100% clear if this is the right limit to use for onramp
    const remainingLimitOnramp = (totalLimit.limitMint - usedLimit.limitMint) / 100;

    // Calculate the remaining limits
    const remainingLimits = {
      remainingLimitOfframp: remainingLimitOfframp < 0 ? 0 : remainingLimitOfframp,
      remainingLimitOnramp: remainingLimitOnramp < 0 ? 0 : remainingLimitOnramp,
    };

    res.json(remainingLimits);
    return;
  } catch (error) {
    handleApiError(error, res, 'getBrlaUserRemainingLimit');
  }
};

export const triggerBrlaOfframp = async (
  req: Request<unknown, unknown, BrlaEndpoints.TriggerOfframpRequest>,
  res: Response<BrlaEndpoints.TriggerOfframpResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId, pixKey, amount, receiverTaxId } = req.body;
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      res.status(httpStatus.NOT_FOUND).json({ error: 'Subaccount not found' });
      return;
    }

    // To make it harder to extract information, both the pixKey and the receiverTaxId are required to be correct.
    try {
      const pixKeyData = await brlaApiService.validatePixKey(pixKey);

      // validate the recipient's taxId with partial information
      if (!validateMaskedNumber(pixKeyData.taxId, receiverTaxId)) {
        res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid pixKey or receiverTaxId' });
        return;
      }
    } catch (error) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Invalid pixKey or receiverTaxId' });
      return;
    }

    const { limitBurn } = subaccount.kyc.limits;
    if (Number(amount) > limitBurn) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Amount exceeds limit' });
      return;
    }

    const subaccountId = subaccount.id;
    const { id: offrampId } = await brlaApiService.triggerOfframp(subaccountId, {
      pixKey,
      amount: Number(amount),
      taxId: receiverTaxId,
    });
    res.status(httpStatus.OK).json({ offrampId });
    return;
  } catch (error) {
    handleApiError(error, res, 'triggerOfframp');
  }
};

export const getOfframpStatus = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.GetOfframpStatusRequest>,
  res: Response<BrlaEndpoints.GetOfframpStatusResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing taxId' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Subaccount not found' });
      return;
    }

    const lastEventCached = await eventPoller.getLatestEventForUser(subaccount.id);

    if (!lastEventCached) {
      res.status(httpStatus.NOT_FOUND).json({ error: `No status events found for ${taxId}` });
      return;
    }

    if (
      lastEventCached.subscription !== 'MONEY-TRANSFER' &&
      lastEventCached.subscription !== 'BURN' &&
      lastEventCached.subscription !== 'BALANCE-UPDATE'
    ) {
      res.status(httpStatus.NOT_FOUND).json({ error: `No offramp status event found for ${taxId}` });
      return;
    }

    res.status(httpStatus.OK).json({
      type: lastEventCached.subscription,
      status: lastEventCached.data.status,
    });
  } catch (error) {
    handleApiError(error, res, 'getOfframpStatus');
  }
};

export const createSubaccount = async (
  req: Request<unknown, unknown, BrlaEndpoints.CreateSubaccountRequest>,
  res: Response<BrlaEndpoints.CreateSubaccountResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { cpf: taxId } = req.body;

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (subaccount) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Subaccount already created' });
      return;
    }
    // Convert birthdate from number to BRLA format
    const birthdate = convertDateToBRLAFormat(req.body.birthdate);
    const subaccountPayload = { ...req.body, birthdate };

    const { id } = await brlaApiService.createSubaccount(subaccountPayload);

    res.status(httpStatus.OK).json({ subaccountId: id });
  } catch (error) {
    handleApiError(error, res, 'createSubaccount');
  }
};

export const fetchSubaccountKycStatus = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.GetKycStatusRequest>,
  res: Response<BrlaEndpoints.GetKycStatusResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId } = req.query;

    if (!taxId) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Missing taxId' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Subaccount not found' });
      return;
    }

    const lastEventCached = await eventPoller.getLatestEventForUser(subaccount.id);

    // We should never be in a situation where the subaccount exists but there are no events regarding KYC.
    if (!lastEventCached || lastEventCached.subscription !== 'KYC') {
      res.status(httpStatus.OK).json({ type: 'KYC', status: 'PENDING' });
      return;
    }

    res.status(httpStatus.OK).json({
      type: lastEventCached.subscription,
      status: lastEventCached.data.kycStatus,
    });
  } catch (error) {
    handleApiError(error, res, 'fetchSubaccountKycStatus');
  }
};

/**
 * Retrieves a a BR Code that can be used to onramp into BRLA
 *
 * Fetches a user's subaccount information from the BRLA API service.
 * It validates that the user exists and has completed a KYC verification.
 * It returns the corresponding BR Code given the amount and reference label, if any.
 *
 * @returns  Sends JSON response with brCode on success.
 *
 * @throws 400 - If subaccount's KYC is invalid, or the amount exceeds KYC limits.
 * @throws 404 - If the subaccount cannot be found
 * @throws 500 - For any server-side errors during processing
 */
export const getPayInCode = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.GetPayInCodeRequest>,
  res: Response<BrlaEndpoints.GetPayInCodeResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { taxId, amount, receiverAddress } = req.query;

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(httpStatus.NOT_FOUND).json({ error: 'Subaccount not found' });
      return;
    }

    if (subaccount.kyc.level < 1) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'KYC invalid' });
      return;
    }

    const { limitMint } = subaccount.kyc.limits;

    if (Number(amount) > limitMint) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'Amount exceeds limit' });
      return;
    }

    const brCode = await brlaApiService.generateBrCode({
      subaccountId: subaccount.id,
      amount: String(amount),
      referenceLabel: generateReferenceLabel(receiverAddress),
    });

    res.status(httpStatus.OK).json(brCode);
  } catch (error) {
    handleApiError(error, res, 'triggerOnramp');
  }
};

/**
 * Validates a pix key
 *
 * Uses BRLA's API to validate a pix key, returning valid if it exists
 * or a 400 error if it does not or is not valid.
 * Purposely does not return the pix key itself for security reasons.
 *
 * @returns Sends a valid boolean field.
 *
 * @throws 400 - If pix key is missing, invalid or does not exist.
 * @throws 500 - For any server-side errors during processing
 */
export const validatePixKey = async (
  req: Request<unknown, unknown, unknown, BrlaEndpoints.ValidatePixKeyRequest>,
  res: Response<BrlaEndpoints.ValidatePixKeyResponse | BrlaEndpoints.BrlaErrorResponse>,
): Promise<void> => {
  try {
    const { pixKey } = req.query;

    if (!pixKey) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'pixKey must be provided' });
      return;
    }

    const brlaApiService = BrlaApiService.getInstance();
    await brlaApiService.validatePixKey(pixKey);

    res.status(httpStatus.OK).json({ valid: true });
  } catch (error) {
    handleApiError(error, res, 'triggerOnramp');
  }
};

// DEPRECATED
/**
 * Trigger an onramp operation
 *
 * Given the confirmation of payment from the user, it triggers an onramp operation.
 * This will start the process to teleport the funds to the corresponding Moonbeam address,
 * once the pix payment has arrived, and the reference and amount matches.
 *
 * @returns void?.
 *
 * @throws 400 - If taxId is invalid. No Pay In could have been generated.
 * @throws 500 - For any server-side errors during processing
 */
export const triggerPayIn = async (
  req: Request<unknown, unknown, BrlaEndpoints.TriggerPayInRequest>,
  res: Response<BrlaEndpoints.TriggerPayInResponse>,
): Promise<void> => {
  try {
    const { taxId, amount, receiverAddress } = req.body;

    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      res.status(httpStatus.BAD_REQUEST).json({ error: 'taxId invalid' });
      return;
    }
    logger.info('Requesting teleport:', subaccount.id, amount, receiverAddress);
    const teleportService = BrlaTeleportService.getInstance();
    await teleportService.requestTeleport(subaccount.id, Number(amount), receiverAddress);

    res.status(httpStatus.OK);
  } catch (error) {
    handleApiError(error, res, 'triggerOnramp');
  }
};
