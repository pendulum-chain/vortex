import { Request, Response } from "express";
import httpStatus from "http-status";
import { UniqueConstraintError } from "sequelize";
import logger from "../../config/logger";
import { sequelize } from "../../models";
import { PrivyWalletVerificationError } from "../services/wallets/privyWallet.service";
import {
  listProfileWallets,
  registerPrivyWallet,
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

function serializeWallet(wallet: Awaited<ReturnType<typeof registerPrivyWallet>>) {
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
  if (mode !== null && mode !== "external" && mode !== "privy_embedded") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_WALLET_MODE", "mode must be external, privy_embedded, or null");
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

export async function createPrivyWallet(req: Request, res: Response): Promise<void> {
  const profileId = requireUserId(req, res);
  if (!profileId) return;

  const { address, providerWalletId } = (req.body ?? {}) as { address?: unknown; providerWalletId?: unknown };
  if (typeof address !== "string" || typeof providerWalletId !== "string") {
    sendError(res, httpStatus.BAD_REQUEST, "INVALID_WALLET", "address and providerWalletId are required");
    return;
  }

  try {
    const wallet = await sequelize.transaction(async transaction => {
      const registered = await registerPrivyWallet(profileId, { address, providerWalletId }, transaction);
      await setWalletMode(profileId, "privy_embedded", transaction);
      return registered;
    });
    res.status(httpStatus.OK).json({ mode: "privy_embedded", wallet: serializeWallet(wallet) });
  } catch (error) {
    if (error instanceof WalletModeConflictError) {
      sendWalletModeConflict(res, error);
      return;
    }
    if (error instanceof WalletRegistrationConflictError || error instanceof UniqueConstraintError) {
      sendError(res, httpStatus.CONFLICT, "WALLET_CONFLICT", error.message);
      return;
    }
    if (error instanceof PrivyWalletVerificationError) {
      const status =
        error.kind === "disabled" || error.kind === "unavailable" ? httpStatus.SERVICE_UNAVAILABLE : httpStatus.FORBIDDEN;
      sendError(res, status, "PRIVY_WALLET_NOT_VERIFIED", error.message);
      return;
    }
    logger.error("Failed to register Privy wallet", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to register embedded wallet");
  }
}
