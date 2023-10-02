import { CSSProperties } from 'preact/compat';
import { Asset } from 'stellar-sdk';
import { stringifyStellarAsset } from '../../helpers/stellar';
import LabelledSelector from './LabelledSelector';

interface AssetSelectorProps {
  selectedAsset?: Asset;
  onChange: (asset: Asset) => void;
  assets: Asset[];
  style?: CSSProperties;
  assetPrefix?: string;
  assetSuffix?: string;
}

function getDisplayName(asset: Asset, assetPrefix?: string, assetSuffix?: string): string {
  return `${assetPrefix || ''}${asset.getCode()}${assetSuffix || ''}`;
}

function AssetSelector(props: AssetSelectorProps): JSX.Element {
  const { assets, selectedAsset, assetPrefix, assetSuffix } = props;

  const items = assets.map((asset) => {
    return {
      displayName: getDisplayName(asset, assetPrefix, assetSuffix),
      id: stringifyStellarAsset(asset),
    };
  });

  const selectedAssetItem = selectedAsset
    ? {
        displayName: getDisplayName(selectedAsset, assetPrefix, assetSuffix),
        id: stringifyStellarAsset(selectedAsset),
      }
    : undefined;

  return (
    <LabelledSelector
      items={items}
      label="Asset"
      onChange={(newItem) => {
        const newAsset = assets.find((asset) => {
          return stringifyStellarAsset(asset) === newItem.id;
        });
        newAsset && props.onChange(newAsset);
      }}
      value={selectedAssetItem}
      style={props.style}
    />
  );
}

export default AssetSelector;
