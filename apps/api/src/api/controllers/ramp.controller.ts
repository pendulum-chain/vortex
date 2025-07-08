import {
  GetRampErrorLogsRequest,
  GetRampErrorLogsResponse,
  GetRampHistoryRequest,
  GetRampHistoryResponse,
  GetRampStatusRequest,
  GetRampStatusResponse,
  RampProcess,
  StartRampRequest,
  StartRampResponse,
  UpdateRampRequest,
  UpdateRampResponse
} from "@packages/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { APIError } from "../errors/api-error";
import rampService from "../services/ramp/ramp.service";

/**
 * Register a new ramping process
 * @public
 */
export const registerRamp = async (req: Request, res: Response<RampProcess>, next: NextFunction): Promise<void> => {
  try {
    const { quoteId, signingAccounts, additionalData } = req.body;

    // Validate required fields
    if (!quoteId || !signingAccounts || signingAccounts.length === 0) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Start ramping process
    const ramp = await rampService.registerRamp({
      additionalData,
      quoteId,
      signingAccounts
    });

    res.status(httpStatus.CREATED).json(ramp);
  } catch (error) {
    logger.error("Error registering ramp:", error);
    next(error);
  }
};

/**
 * Update a ramping process with presigned transactions and additional data
 * @public
 */
export const updateRamp = async (
  req: Request<unknown, unknown, UpdateRampRequest>,
  res: Response<UpdateRampResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampId, presignedTxs, additionalData } = req.body;

    // Validate required fields
    if (!rampId || !presignedTxs) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Check for the additional data field
    if (additionalData && typeof additionalData !== "object") {
      throw new APIError({
        message: "Invalid additional data format",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Update ramping process
    const ramp = await rampService.updateRamp({
      additionalData,
      presignedTxs,
      rampId
    });

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error("Error updating ramp:", error);
    next(error);
  }
};

/**
 * Start a new ramping process
 * @public
 */
export const startRamp = async (
  req: Request<unknown, unknown, StartRampRequest>,
  res: Response<StartRampResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampId } = req.body;

    // Validate required fields
    if (!rampId) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Start ramping process
    const ramp = await rampService.startRamp({
      rampId
    });

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error("Error starting ramp:", error);
    next(error);
  }
};

/**
 * Get the status of a ramping process
 * @public
 */
export const getRampStatus = async (
  req: Request<GetRampStatusRequest>,
  res: Response<GetRampStatusResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const ramp = await rampService.getRampStatus(id);

    if (!ramp) {
      throw new APIError({
        message: "Ramp not found",
        status: httpStatus.NOT_FOUND
      });
    }

    res.status(httpStatus.OK).json(ramp);
  } catch (error) {
    logger.error("Error getting ramp status:", error);
    next(error);
  }
};

/**
 * Get the error logs for a ramping process
 * @public
 */
export const getErrorLogs = async (
  req: Request<GetRampErrorLogsRequest>,
  res: Response<GetRampErrorLogsResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const errorLogs = await rampService.getErrorLogs(id);

    if (!errorLogs) {
      throw new APIError({
        message: "Ramp not found",
        status: httpStatus.NOT_FOUND
      });
    }

    res.status(httpStatus.OK).json(errorLogs);
  } catch (error) {
    logger.error("Error getting error logs:", error);
    next(error);
  }
};

/**
 * Get ramp history for a wallet address
 * @public
 */
export const getRampHistory = async (
  req: Request<GetRampHistoryRequest>,
  res: Response<GetRampHistoryResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      throw new APIError({
        message: "Wallet address is required",
        status: httpStatus.BAD_REQUEST
      });
    }

    const history = await rampService.getRampHistory(walletAddress);
    res.status(httpStatus.OK).json(history);
  } catch (error) {
    logger.error("Error getting transaction history:", error);
    next(error);
  }
};
