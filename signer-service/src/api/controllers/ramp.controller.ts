import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import rampService from '../services/ramp/ramp.service';
import { APIError } from '../errors/api-error';
import logger from '../../config/logger';

/**
 * Start a new ramping process
 * @public
 */
export const startRamp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { quoteId, presignedTxs, additionalData } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    // Validate required fields
    if (!quoteId || !presignedTxs) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required fields',
      });
    }

    // Start ramping process
    const ramp = await rampService.startRamp(
      {
        quoteId,
        presignedTxs,
        additionalData,
      },
      idempotencyKey,
    );

    res.status(httpStatus.CREATED).json(ramp);
  } catch (error) {
    logger.error('Error starting ramp:', error);
    next(error);
  }
};

/**
 * Get the status of a ramping process
 * @public
 */
export const getRampStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
export const getErrorLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
