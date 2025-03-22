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
      idempotencyKey
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
 * Advance a ramping process to the next phase
 * @public
 */
export const advanceRamp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { phase } = req.body;

    if (!phase) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required field: phase',
      });
    }

    const ramp = await rampService.advanceRamp(id, phase);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error advancing ramp:', error);
    next(error);
  }
};

/**
 * Update the state of a ramping process
 * @public
 */
export const updateRampState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { state } = req.body;

    if (!state || typeof state !== 'object') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing or invalid required field: state',
      });
    }

    const ramp = await rampService.updateRampStateData(id, state);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error updating ramp state:', error);
    next(error);
  }
};
