import { Op, Transaction } from "sequelize";
import { getAddress, isAddress } from "viem";
import { sequelize } from "../../../models";
import ProfileWallet from "../../../models/profileWallet.model";
import RampState from "../../../models/rampState.model";
import User from "../../../models/user.model";
import { verifyPrivyWalletOwnership } from "./privyWallet.service";

export type WalletMode = "external" | "privy_embedded" | null;

const TERMINAL_RAMP_PHASES = ["complete", "failed", "timedOut"];

export class WalletModeConflictError extends Error {
  constructor(
    message: string,
    readonly kind: "active_ramp" | "missing_wallet"
  ) {
    super(message);
    this.name = "WalletModeConflictError";
  }
}
export class WalletRegistrationConflictError extends Error {}

async function getLockedProfile(profileId: string, transaction: Transaction): Promise<User> {
  const profile = await User.findByPk(profileId, {
    lock: Transaction.LOCK.UPDATE,
    transaction
  });
  if (!profile) {
    throw new Error("Profile not found");
  }
  return profile;
}

async function assertNoActiveRamp(profileId: string, transaction: Transaction): Promise<void> {
  const activeRamp = await RampState.findOne({
    attributes: ["id"],
    transaction,
    where: {
      currentPhase: { [Op.notIn]: TERMINAL_RAMP_PHASES },
      userId: profileId
    }
  });
  if (activeRamp) {
    throw new WalletModeConflictError("Wallet mode cannot change while a ramp is active", "active_ramp");
  }
}

export async function listProfileWallets(profileId: string): Promise<{
  mode: WalletMode;
  wallets: ProfileWallet[];
}> {
  const [profile, wallets] = await Promise.all([
    User.findByPk(profileId, { attributes: ["walletMode"] }),
    ProfileWallet.findAll({
      order: [["createdAt", "ASC"]],
      where: { profileId, status: "active" }
    })
  ]);
  return { mode: profile?.walletMode ?? null, wallets };
}

export async function setWalletMode(profileId: string, mode: WalletMode): Promise<WalletMode> {
  return sequelize.transaction(async transaction => {
    const profile = await getLockedProfile(profileId, transaction);
    await assertNoActiveRamp(profileId, transaction);

    if (mode === "privy_embedded") {
      const embeddedWallet = await ProfileWallet.findOne({
        attributes: ["id"],
        transaction,
        where: {
          chainType: "ethereum",
          profileId,
          provider: "privy",
          status: "active"
        }
      });
      if (!embeddedWallet) {
        throw new WalletModeConflictError("An active verified Privy wallet is required for embedded mode", "missing_wallet");
      }
    }

    await profile.update({ walletMode: mode }, { transaction });
    return profile.walletMode;
  });
}

export async function registerPrivyWallet(
  profileId: string,
  input: { providerWalletId: string; address: string }
): Promise<ProfileWallet> {
  if (!input.providerWalletId.trim() || !isAddress(input.address)) {
    throw new WalletRegistrationConflictError("A valid Privy wallet ID and EVM address are required");
  }

  const verified = await verifyPrivyWalletOwnership({
    address: input.address,
    profileId,
    providerWalletId: input.providerWalletId
  });

  return sequelize.transaction(async transaction => {
    const profile = await getLockedProfile(profileId, transaction);
    await assertNoActiveRamp(profileId, transaction);

    const conflictingWallet = await ProfileWallet.findOne({
      transaction,
      where: {
        [Op.or]: [
          { provider: "privy", providerWalletId: input.providerWalletId },
          { address: getAddress(verified.address), chainType: "ethereum" }
        ]
      }
    });
    if (conflictingWallet && conflictingWallet.profileId !== profileId) {
      throw new WalletRegistrationConflictError("This embedded wallet is already registered to another profile");
    }

    const existingForProfile = await ProfileWallet.findOne({
      transaction,
      where: { chainType: "ethereum", profileId, provider: "privy", status: "active" }
    });
    let wallet: ProfileWallet;
    if (existingForProfile) {
      if (
        existingForProfile.providerWalletId !== input.providerWalletId ||
        getAddress(existingForProfile.address) !== verified.address
      ) {
        throw new WalletRegistrationConflictError("This profile already has a different active Privy wallet");
      }
      await existingForProfile.update({ lastUsedAt: new Date() }, { transaction });
      wallet = existingForProfile;
    } else {
      wallet = await ProfileWallet.create(
        {
          address: verified.address,
          chainType: "ethereum",
          lastUsedAt: new Date(),
          profileId,
          provider: "privy",
          providerWalletId: input.providerWalletId,
          status: "active"
        },
        { transaction }
      );
    }

    await profile.update({ walletMode: "privy_embedded" }, { transaction });
    return wallet;
  });
}
