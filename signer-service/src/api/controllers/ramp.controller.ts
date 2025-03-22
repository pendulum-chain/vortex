import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import rampService from '../services/ramp/ramp.service';
import { APIError } from '../errors/api-error';
import logger from '../../config/logger';
import RampState from '../../models/rampState.model';

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
 * Advance a ramping process to the next phase
 * @public
 */
export const advanceRamp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { phase, metadata } = req.body;

    if (!phase) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required field: phase',
      });
    }

    const ramp = await rampService.advanceRamp(id, phase, metadata);

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

/**
 * Update subsidy details for a ramping process
 * @public
 */
export const updateSubsidyDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { subsidyDetails } = req.body;

    if (!subsidyDetails || typeof subsidyDetails !== 'object') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing or invalid required field: subsidyDetails',
      });
    }

    const ramp = await rampService.updateRampSubsidyDetails(id, subsidyDetails);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error updating subsidy details:', error);
    next(error);
  }
};

/**
 * Update nonce sequences for a ramping process
 * @public
 */
export const updateNonceSequences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { nonceSequences } = req.body;

    if (!nonceSequences || typeof nonceSequences !== 'object') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing or invalid required field: nonceSequences',
      });
    }

    const ramp = await rampService.updateRampNonceSequences(id, nonceSequences);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error updating nonce sequences:', error);
    next(error);
  }
};

/**
 * Log an error for a ramping process
 * @public
 */
export const logRampError = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { error, details } = req.body;

    if (!error || typeof error !== 'string') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing or invalid required field: error',
      });
    }

    const ramp = await rampService.logRampError(id, error, details);

    if (!ramp) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error('Error logging ramp error:', error);
    next(error);
  }
};

/**
 * Get the phase history for a ramping process
 * @public
 */
export const getPhaseHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const phaseHistory = await rampService.getPhaseHistory(id);

    if (!phaseHistory) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Ramp not found',
      });
    }

    res.status(httpStatus.OK).json(phaseHistory);
  } catch (error) {
    logger.error('Error getting phase history:', error);
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

/**
 * Get the valid transitions for a phase
 * @public
 */
export const getValidTransitions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phase } = req.params;

    const validTransitions = await rampService.getValidTransitions(phase);

    res.status(httpStatus.OK).json(validTransitions);
  } catch (error) {
    logger.error('Error getting valid transitions:', error);
    next(error);
  }
};
