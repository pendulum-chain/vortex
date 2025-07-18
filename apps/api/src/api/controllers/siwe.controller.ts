import {
  CreateSiweRequest,
  CreateSiweResponse,
  SiweErrorResponse,
  ValidateSiweRequest,
  ValidateSiweResponse
} from "@packages/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } from "../../constants/constants";
import { createAndSendNonce, verifyAndStoreSiweMessage } from "../services/siwe.service";

export const sendSiweMessage = async (
  req: Request<unknown, unknown, CreateSiweRequest>,
  res: Response<CreateSiweResponse | SiweErrorResponse>
): Promise<void> => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Wallet address is required" });
    return;
  }

  try {
    const { nonce } = await createAndSendNonce(walletAddress);
    res.json({ nonce });
    return;
  } catch (error) {
    console.error("Nonce generation error:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Error while generating nonce" });
  }
};

export const validateSiweSignature = async (
  req: Request<unknown, unknown, ValidateSiweRequest>,
  res: Response<ValidateSiweResponse | SiweErrorResponse>
): Promise<void> => {
  const { nonce, signature, siweMessage } = req.body;

  if (!nonce || !signature || !siweMessage) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Missing required fields" });
    return;
  }

  try {
    const address = await verifyAndStoreSiweMessage(nonce, signature, siweMessage);

    const token = { nonce, signature };

    res.cookie(`authToken_${address}`, token, {
      httpOnly: true,
      maxAge: DEFAULT_LOGIN_EXPIRATION_TIME_HOURS * 60 * 60 * 1000,
      sameSite: "strict",
      secure: true
    });

    res.json({ message: "Signature is valid" });
    return;
  } catch (error) {
    console.error("Signature validation error:", error);

    if (error instanceof Error && error.name === "SiweValidationError") {
      res.status(httpStatus.UNAUTHORIZED).json({ error: `Siwe validation error: ${error.message}` });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: `Could not validate signature: ${message}` });
  }
};
