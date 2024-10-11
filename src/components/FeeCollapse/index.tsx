import { FC } from 'preact/compat';
import Big from 'big.js';
import { roundDownToTwoDecimals } from '../../helpers/parseNumbers';
import { OutputTokenDetails } from '../../constants/tokenConfig';
import { useEventsContext } from '../../contexts/events';

export function calculateTotalReceive(toAmount: string, outputToken: OutputTokenDetails): string {
  const feeBasisPoints = outputToken.offrampFeesBasisPoints;
  const fees = Big(toAmount).mul(feeBasisPoints).div(10000).round(2, 1);
  const totalReceive = Big(toAmount).minus(fees).toFixed(2, 0);
  return totalReceive;
}

interface CollapseProps {
  fromAmount?: string;
  toAmount?: string;
  toToken: OutputTokenDetails;
  exchangeRate?: JSX.Element;
}

export const FeeCollapse: FC<CollapseProps> = ({ toAmount, toToken, exchangeRate }) => {
  const { trackEvent } = useEventsContext();
  const toTokenSymbol = toToken.fiat.symbol;

  const trackFeeCollapseOpen = () => {
    trackEvent({ event: 'click_details' });
  };

  const toAmountFixed = roundDownToTwoDecimals(Big(toAmount || 0));
  const totalReceive = calculateTotalReceive(toAmount || '0', toToken);
  const totalReceiveFormatted = roundDownToTwoDecimals(Big(totalReceive));
  const feesCost = roundDownToTwoDecimals(Big(toAmountFixed || 0).sub(totalReceive));

  return (
    <div className="border border-blue-700 collapse-arrow collapse" onClick={trackFeeCollapseOpen}>
      <input type="checkbox" />
      <div className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>Details</p>
        </div>
      </div>
      <div className="collapse-content">
        <div className="flex justify-between mt-2 ">
          <p>Your quote ({exchangeRate})</p>
          <div className="flex">
            <span>
              {toAmountFixed} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <p>Offramp fees</p>
          <div className="flex">
            <span>
              - {feesCost} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <strong className="font-bold">Final Amount</strong>
          <div className="flex">
            <span>
              {totalReceiveFormatted} {toTokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
