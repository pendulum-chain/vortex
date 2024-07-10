import { FC, useMemo } from 'preact/compat';
import { UseFormRegisterReturn } from 'react-hook-form';
import { TokenDetails } from '../../constants/tokenConfig';
import { AssetButton } from '../buttons/AssetButton';
import { SwapFormValues } from '../Nabla/schema';
import { NumericInput } from '../NumericInput';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export const ChainName = () => (
  <ConnectButton.Custom>
    {({ chain }) => (
      <p className="absolute text-sm text-blue-700 translate-y-1/2 bottom-1/2 left-28">
        {chain?.name || 'Select chain'}
      </p>
    )}
  </ConnectButton.Custom>
);

interface AssetNumericInputProps {
  fromToken?: TokenDetails;
  onClick: () => void;
  additionalText?: string;
  registerInput: UseFormRegisterReturn<keyof SwapFormValues>;
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  additionalText,
  fromToken,
  onClick,
  registerInput,
  ...rest
}) => {
  // eslint-disable-next-line react/display-name
  const Asset = useMemo(() => () => <AssetButton token={fromToken} onClick={onClick} />, [fromToken, onClick]);

  return (
    <div className="relative hover:cursor-pointer">
      <Asset />
      {additionalText ? (
        <p className="absolute text-sm text-blue-700 translate-y-1/2 bottom-1/2 left-28">{additionalText}</p>
      ) : (
        <ChainName />
      )}

      <NumericInput register={registerInput} additionalStyle="text-right text-lg" {...rest} />
    </div>
  );
};
