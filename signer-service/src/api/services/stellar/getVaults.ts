import { ApiPromise } from '@polkadot/api';
import Big from 'big.js';

function vaultHasEnoughRedeemable(vault: any, redeemableAmount: string): boolean {
  // issuedTokens - toBeRedeemedTokens = redeemableTokens
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
  const vaults = vaultEntries.map(([_, value]) => value.unwrap());

  const vaultsForCurrency = vaults.filter((vault) => 
    // toString returns the hex string
    // toHuman returns the hex string if the string has length < 4, otherwise the readable string
     (
      vault.id.currencies.wrapped.isStellar &&
      vault.id.currencies.wrapped.asStellar.isAlphaNum4 &&
      vault.id.currencies.wrapped.asStellar.asAlphaNum4.code.toString() === assetCodeHex &&
      vault.id.currencies.wrapped.asStellar.asAlphaNum4.issuer.toString() === assetIssuerHex &&
      // vault.bannedUntil === null &&
      vaultHasEnoughRedeemable(vault, redeemableAmountRaw)
    )
  );

  if (vaultsForCurrency.length === 0) {
    const errorMessage = `No vaults found for currency ${assetCodeHex} and amount ${redeemableAmountRaw}`;
    console.log(errorMessage);
    throw new Error(errorMessage);
  }

  return vaultsForCurrency;
}
