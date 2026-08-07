import { Request, Response } from "express";
import httpStatus from "http-status";
import { UniqueConstraintError } from "sequelize";
import logger from "../../config/logger";
import { CdpWalletVerificationError } from "../services/wallets/cdpWallet.service";
import {
  listProfileWallets,
  registerCdpWallet,
  setWalletMode,
  type WalletMode,
  WalletModeConflictError,
  WalletRegistrationConflictError
} from "../services/wallets/profileWallet.service";

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message, status } });
}

function requireUserId(req: Request, res: Response): string | null {
  if (!req.userId) {
    sendError(res, httpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required");
    return null;
  }
  return req.userId;
}

function sendWalletModeConflict(res: Response, error: WalletModeConflictError): void {
  sendError(res, httpStatus.CONFLICT, error.kind === "active_ramp" ? "ACTIVE_RAMP" : "WALLET_NOT_REGISTERED", error.message);
}

function serializeWallet(wallet: Awaited<ReturnType<typeof registerCdpWallet>>) {
  return {
    address: wallet.address,
    chainType: wallet.chainType,
    createdAt: wallet.createdAt,
    id: wallet.id,
    lastUsedAt: wallet.lastUsedAt,
    provider: wallet.provider,
    providerWalletId: wallet.providerWalletId,
    status: wallet.status
  };
}

export async function getWallets(req: Request, res: Response): Promise<void> {
  const profileId = requireUserId(req, res);
  if (!profileId) return;

  try {
    const result = await listProfileWallets(profileId);
    res.status(httpStatus.OK).json({
      mode: result.mode,
      wallets: result.wallets.map(serializeWallet)
    });
  } catch (error) {
    logger.error("Failed to list profile wallets", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to list wallets");
  }
}

export async function updateWalletMode(req: Request, res: Response): Promise<void> {
  const profileId = requireUserId(req, res);
  if (!profileId) return;

  const { mode } = (req.body ?? {}) as { mode?: unknown };
  if (mode !== null && mode !== "external" && mode !== "cdp_embedded") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_WALLET_MODE", "mode must be external, cdp_embedded, or null");
    return;
  }

  try {
    const updatedMode = await setWalletMode(profileId, mode as WalletMode);
    res.status(httpStatus.OK).json({ mode: updatedMode });
  } catch (error) {
    if (error instanceof WalletModeConflictError) {
      sendWalletModeConflict(res, error);
      return;
    }
    logger.error("Failed to update wallet mode", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to update wallet mode");
  }
}

export async function createCdpWallet(req: Request, res: Response): Promise<void> {
  const profileId = requireUserId(req, res);
  if (!profileId) return;

  const accessToken = req.headers.authorization?.slice("Bearer ".length);
  const { address, cdpUserId } = (req.body ?? {}) as { address?: unknown; cdpUserId?: unknown };
  if (!accessToken || typeof address !== "string" || typeof cdpUserId !== "string") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_WALLET", "address and cdpUserId are required");
    return;
  }

  try {
    const wallet = await registerCdpWallet(profileId, { accessToken, address, cdpUserId });
    res.status(httpStatus.OK).json({ mode: "cdp_embedded", wallet: serializeWallet(wallet) });
  } catch (error) {
    if (error instanceof WalletModeConflictError) {
      sendWalletModeConflict(res, error);
      return;
    }
    if (error instanceof WalletRegistrationConflictError || error instanceof UniqueConstraintError) {
      sendError(res, httpStatus.CONFLICT, "WALLET_CONFLICT", error.message);
      return;
    }
    if (error instanceof CdpWalletVerificationError) {
      const status =
        error.kind === "disabled" || error.kind === "unavailable" ? httpStatus.SERVICE_UNAVAILABLE : httpStatus.FORBIDDEN;
      sendError(res, status, "CDP_WALLET_NOT_VERIFIED", error.message);
      return;
    }
    logger.error("Failed to register CDP wallet", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to register embedded wallet");
  }
}
