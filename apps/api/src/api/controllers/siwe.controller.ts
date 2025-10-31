import {
  CreateSiweRequest,
  CreateSiweResponse,
  SiweErrorResponse,
  ValidateSiweRequest,
  ValidateSiweResponse
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { DEFAULT_LOGIN_EXPIRATION_TIME_HOURS } from "../../constants/constants";
import { createAndSendNonce, validateSignatureAndGetMemo, verifyAndStoreSiweMessage } from "../services/siwe.service";

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

export const checkAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const cookies = req.cookies;
    let authToken;
    let address;

    for (const cookieName in cookies) {
      if (cookieName.startsWith("authToken_")) {
        authToken = cookies[cookieName];
        address = cookieName.substring("authToken_".length);
        break;
      }
    }

    if (!authToken?.signature || !authToken?.nonce || !address) {
      res.status(httpStatus.UNAUTHORIZED).json({ error: "Authentication token not found or invalid." });
      return;
    }

    const memo = await validateSignatureAndGetMemo(authToken.nonce, authToken.signature);

    if (memo) {
      res.status(httpStatus.OK).send();
    } else {
      res.clearCookie(`authToken_${address}`);
      res.status(httpStatus.UNAUTHORIZED).json({ error: "Invalid authentication token." });
    }
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "An error occurred during authentication check." });
  }
};
