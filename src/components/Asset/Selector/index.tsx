import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'preact/compat';
import { Button, ButtonProps } from 'react-daisyui';
import { Token } from '../../../../gql/graphql';
import pendulumIcon from '../../../assets/pendulum-icon.svg';
import { useTokens } from '../../../hooks/nabla/useTokens';
import useBoolean from '../../../hooks/useBoolean';
import { AssetSelectorModal } from './Modal';

export type AssetSelectorProps = {
  onSelect: (asset: Token) => void;
  selected?: string;
} & ButtonProps;

const iconSizes = {
  xs: 4,
  sm: 4,
  md: 5,
  lg: 5,
};

const AssetSelector = ({ onSelect, selected, size = 'xs', ...rest }: AssetSelectorProps): JSX.Element | null => {
  const { isLoading, data } = useTokens();
  const { tokens, tokensMap } = data || {};
  const [open, { setFalse, setTrue }] = useBoolean();
  const [selectedAsset, setSelectedAsset] = useState<Token | undefined>();
  const initialSelected = selected ? tokensMap?.[selected] : undefined;
  const selectedAssetVal = selectedAsset || initialSelected;

  const internalOnSelect = useCallback(
    (asset: Token) => {
      setSelectedAsset(asset);
      onSelect(asset);
      setFalse();
    },
    [onSelect, setFalse],
  );

  const iconSz = iconSizes[size] || iconSizes.sm;
  return (
    <div>
      <Button
        size={size}
        {...rest}
        className={`rounded-full bg-neutral-200 pl-0 pr-1 flex items-center justify-between min-w-[70px] ${
          rest.className || ''
        }`}
        onClick={setTrue}
        type="button"
      >
        <span className="rounded-full bg-neutral-300 h-full p-px mr-1">
          <img src={pendulumIcon} alt="Pendulum" className="h-full w-auto" />
        </span>
        <strong>{selectedAssetVal?.symbol}</strong>
        <ChevronDownIcon className={`w-${iconSz} h-${iconSz} inline ml-1`} />
      </Button>
      <AssetSelectorModal
        open={open}
        assets={tokens || []}
        className="modal-top"
        onSelect={internalOnSelect}
        selected={selectedAssetVal?.id}
        isLoading={isLoading}
        onClose={setFalse}
      />
    </div>
  );
};

export default AssetSelector;
