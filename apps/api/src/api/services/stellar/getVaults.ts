import { SpacewalkPrimitivesVaultId } from '@pendulum-chain/types/interfaces';
import { ApiPromise } from '@polkadot/api';
import { Option, Struct } from '@polkadot/types-codec';
import Big from 'big.js';

import logger from '../../../config/logger';

interface VaultRegistryVault extends Struct {
  readonly id: SpacewalkPrimitivesVaultId;
  readonly issuedTokens: number; // u128
  readonly toBeRedeemedTokens: number; // u128
}

function vaultHasEnoughRedeemable(vault: VaultRegistryVault, redeemableAmount: string): boolean {
  const redeemableTokens = new Big(vault.issuedTokens).sub(new Big(vault.toBeRedeemedTokens));
  if (redeemableTokens.gt(new Big(redeemableAmount))) {
    return true;
  }
  return false;
}

export async function getVaultsForCurrency(
  api: ApiPromise,
  assetCodeHex: string,
  assetIssuerHex: string,
  redeemableAmountRaw: string,
) {
  const vaultEntries = await api.query.vaultRegistry.vaults.entries();
  const vaults = vaultEntries.map(([_, value]) => (value as Option<VaultRegistryVault>).unwrap());

  const vaultsForCurrency = vaults.filter(
    (vault) =>
      // toString returns the hex string
      // toHuman returns the hex string if the string has length < 4, otherwise the readable string
      vault.id.currencies.wrapped.isStellar &&
      vault.id.currencies.wrapped.asStellar.isAlphaNum4 &&
      vault.id.currencies.wrapped.asStellar.asAlphaNum4.code.toString() === assetCodeHex &&
      vault.id.currencies.wrapped.asStellar.asAlphaNum4.issuer.toString() === assetIssuerHex &&
      vaultHasEnoughRedeemable(vault, redeemableAmountRaw),
  );

  if (vaultsForCurrency.length === 0) {
    const errorMessage = `No vaults found for currency ${assetCodeHex} and amount ${redeemableAmountRaw}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return vaultsForCurrency;
}
