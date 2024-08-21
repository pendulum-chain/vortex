import { FC, useMemo } from 'preact/compat';
import { UseFormRegisterReturn } from 'react-hook-form';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { AssetButton } from '../buttons/AssetButton';
import { SwapFormValues } from '../Nabla/schema';
import { NumericInput } from '../NumericInput';

export const ChainName = () => (
  <ConnectButton.Custom>
    {({ account, chain, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
      const ready = mounted && authenticationStatus !== 'loading';
      const connected =
        ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

      return (
        <button type="button" className="text-sm text-blue-700" onClick={connected ? openChainModal : openConnectModal}>
          {chain?.name || ''}
        </button>
      );
    }}
  </ConnectButton.Custom>
);

interface AssetNumericInputProps {
  tokenType?: InputTokenType | OutputTokenType;
  tokenSymbol?: string;
  onClick: () => void;
  additionalText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  registerInput: UseFormRegisterReturn<keyof SwapFormValues>;
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  additionalText,
  tokenType,
  tokenSymbol,
  onClick,
  registerInput,
  ...rest
}) => {
  const memoizedAssetButton = useMemo(
    () => <AssetButton tokenType={tokenType} tokenSymbol={tokenSymbol} onClick={onClick} />,
    [tokenType, tokenSymbol, onClick],
  );

  return (
    <div
      className={
        'flex pl-2 focus:outline-none input-ghost text-accent-content input-bordered input ' +
        (rest.disabled ? 'opacity-50 input-disabled' : '')
      }
    >
      <div className="flex items-center justify-between">
        {memoizedAssetButton}
        <div className="w-2"></div>
        {additionalText ? <p className="text-sm text-blue-700">{additionalText}</p> : <ChainName />}
      </div>

      <NumericInput
        register={registerInput}
        additionalStyle="text-right text-lg w-full"
        disableStyles={true}
        {...rest}
      />
    </div>
  );
};
