import { RampEndpoints } from '@packages/shared';
import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import logger from '../../config/logger';
import { APIError } from '../errors/api-error';
import rampService from '../services/ramp/ramp.service';

/**
 * Register a new ramping process
 * @public
 */
export const registerRamp = async (
  req: Request<{}, {}, RampEndpoints.RegisterRampRequest>,
  res: Response<RampEndpoints.RegisterRampResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { quoteId, signingAccounts, additionalData } = req.body;
    const route = req.path; // Get the current route path

    // Validate required fields
    if (!quoteId || !signingAccounts || signingAccounts.length === 0) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required fields',
      });
    }

    // Start ramping process
    const ramp = await rampService.registerRamp(
      {
        quoteId,
        signingAccounts,
        additionalData,
      },
      route,
    );

    res.status(httpStatus.CREATED).json(ramp);
  } catch (error) {
    logger.error('Error registering ramp:', error);
    next(error);
  }
};

/**
 * Start a new ramping process
 * @public
 */
export const startRamp = async (
  req: Request<{}, {}, RampEndpoints.StartRampRequest>,
  res: Response<RampEndpoints.StartRampResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rampId, presignedTxs, additionalData } = req.body;
    const route = req.path; // Get the current route path

    // Validate required fields
    if (!rampId || !presignedTxs) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required fields',
      });
    }

    // Check for the additional data field
    if (additionalData && typeof additionalData !== 'object') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Invalid additional data format',
      });
    }

    // Start ramping process
    const ramp = await rampService.startRamp(
      {
        rampId,
        presignedTxs,
        additionalData,
      },
      route,
    );

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error starting ramp:', error);
    next(error);
  }
};

/**
 * Get the status of a ramping process
 * @public
 */
export const getRampStatus = async (
  req: Request<RampEndpoints.GetRampStatusRequest>,
  res: Response<RampEndpoints.GetRampStatusResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const ramp = await rampService.getRampStatus(id);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error getting ramp status:', error);
    next(error);
  }
};

/**
 * Get the error logs for a ramping process
 * @public
 */
export const getErrorLogs = async (
  req: Request<RampEndpoints.GetRampErrorLogsRequest>,
  res: Response<RampEndpoints.GetRampErrorLogsResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const errorLogs = await rampService.getErrorLogs(id);

    if (!errorLogs) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(errorLogs);
  } catch (error) {
    logger.error('Error getting error logs:', error);
    next(error);
  }
};

/**
 * Get ramp history for a wallet address
 * @public
 */
export const getRampHistory = async (
  req: Request<RampEndpoints.GetRampHistoryRequest>,
  res: Response<RampEndpoints.GetRampHistoryResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Wallet address is required',
      });
    }

    const history = await rampService.getRampHistory(walletAddress);
    res.status(httpStatus.OK).json(history);
  } catch (error) {
    logger.error('Error getting transaction history:', error);
    next(error);
  }
};
