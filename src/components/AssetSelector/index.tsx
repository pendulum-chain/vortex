import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { CSSProperties, FC, useMemo, useState } from 'preact/compat';
import { Button } from 'react-daisyui';

import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { DropdownSelector } from '../DropdownSelector';
import { getIcon } from '../../shared/getIcon';

interface AssetSelectorProps {
  assets?: TokenDetails[];
  selectedAsset?: TokenDetails;
  disabled?: boolean;
  className: string;
  onChange?: () => void;
}

export const AssetSelector: FC<AssetSelectorProps> = ({ assets, selectedAsset, className, disabled = false }) => {
  return (
    <div className={className}>
      <DropdownSelector items={assets} value={selectedAsset}>
        <Button
          disabled={disabled}
          size="xs"
          className="btn rounded-full h-4 min-h-none border-0 bg-neutral-200 dark:bg-neutral-700 pl-0 pr-1 flex items-center mt-0.5 text-neutral-content"
          type="button"
        >
          {/* <span className="rounded-full bg-[rgba(0,0,0,0.15)] h-full mr-1 ">
            <img src={getIcon(selectedAsset)} alt={getAssetName(selectedAsset)} className="h-full w-auto " />
          </span> */}
          {/* <strong className="font-bold">{selectedAsset?.currencyId}</strong>
          {assets && assets.length > 1 ? (
            <ChevronDownIcon className="w-4 h-4 inline ml-px" />
          ) : (
            <div className="px-1" />
          )} */}
        </Button>
      </DropdownSelector>
    </div>
  );
};
