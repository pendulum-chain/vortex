import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Button, Dropdown } from 'react-daisyui';
import { convertCurrencyToStellarAsset } from '../../helpers/spacewalk';
import { ExtendedRegistryVault } from '../../hooks/spacewalk/vaultRegistry';
import { nativeToDecimal } from '../../shared/parseNumbers';
import { PublicKey } from '../PublicKey';

interface VaultSelectorProps {
  vaults: ExtendedRegistryVault[];
  selectedVault?: ExtendedRegistryVault;
  showMaxTokensFor?: 'issuableTokens' | 'redeemableTokens';
  onChange: (vault: ExtendedRegistryVault) => void;
}

function VaultSelector(props: VaultSelectorProps): JSX.Element {
  const { vaults, selectedVault, showMaxTokensFor, onChange } = props;
  return (
    <Dropdown vertical="end" className="w-full mt-3">
      <Button
        type="button"
        color="ghost"
        className="flex content-center place-content-between w-full border-neutral-500 bg-base-200 rounded-md no-animation"
      >
        <PublicKey publicKey={selectedVault ? selectedVault.id.accountId.toString() : ''} variant="full" />
        <ChevronDownIcon className="w-3 h-3" stroke-width="2" />
      </Button>
      <Dropdown.Menu className="w-full mt-1.5 p-1 border border-neutral-500 bg-base-200 rounded-md shadow-none">
        {vaults.map((vault) => (
          <Dropdown.Item
            key={vault.id.accountId.toString()}
            onClick={() => onChange(vault)}
            className="w-full rounded-md"
          >
            <span className="w-full flex place-content-between">
              <span className="flex">
                <PublicKey publicKey={vault.id.accountId.toString()} variant="short" />
              </span>
              {showMaxTokensFor && (
                <span className="content-end">
                  {nativeToDecimal(vault[showMaxTokensFor]?.toString() || '0').toFixed(2)}{' '}
                  {convertCurrencyToStellarAsset(vault.id.currencies.wrapped)?.getCode()}
                </span>
              )}
            </span>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default VaultSelector;
