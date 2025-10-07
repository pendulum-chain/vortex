import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import cryptoService from "../../config/crypto";
import logger from "../../config/logger";

export const getPublicKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const publicKey = cryptoService.getPublicKey();

    res.set({
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      ETag: `"${Buffer.from(publicKey).toString("base64").slice(0, 16)}"`
    });

    res.status(httpStatus.OK).json({
      publicKey
    });

    logger.debug("Public key requested");
  } catch (error) {
    logger.error("Error retrieving public key:", error);
    next(error);
  }
};
