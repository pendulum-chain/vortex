import { FC, JSX } from 'react';
import Big from 'big.js';
import { BaseOutputTokenDetails, getBaseOutputTokenDetails, OutputTokenType } from '../../constants/tokenConfig';
import { useEventsContext } from '../../contexts/events';
import { useOfframpFees } from '../../hooks/useOfframpFees';
import { FlowType, isOnrampFlow } from '../../services/flowCommons';
import { OnrampInputTokenType, OnrampOutputTokenType } from '../../services/onrampingFlow';

export function calculateTotalReceive(
  flowType: FlowType,
  toAmount: Big,
  outputTokenType: OutputTokenType | OnrampOutputTokenType,
): string {
  if (!isOnrampFlow(flowType)) {
    return calculateOfframpTotalReceive(toAmount, getBaseOutputTokenDetails(outputTokenType as OutputTokenType));
  } else {
    return calculateOnrampTotalReceive(toAmount, outputTokenType as OnrampInputTokenType);
  }
}

export function calculateOfframpTotalReceive(toAmount: Big, outputToken: BaseOutputTokenDetails): string {
  const feeBasisPoints = outputToken.offrampFeesBasisPoints;
  const fixedFees = new Big(outputToken.offrampFeesFixedComponent ? outputToken.offrampFeesFixedComponent : 0);
  const fees = toAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(2, 1);
  const totalReceiveRaw = toAmount.minus(fees);

  if (totalReceiveRaw.gt(0)) {
    return totalReceiveRaw.toFixed(2, 0);
  } else {
    return '0';
  }
}

// TODO:  implement
export function calculateOnrampTotalReceive(toAmount: Big, outputToken: OnrampInputTokenType): string {
  return '0';
}

interface CollapseProps {
  fromAmount?: string;
  toAmount?: Big;
  toToken: BaseOutputTokenDetails;
  exchangeRate?: JSX.Element;
}

export const FeeCollapse: FC<CollapseProps> = ({ toAmount = Big(0), toToken, exchangeRate }) => {
  const { trackEvent } = useEventsContext();
  const toTokenSymbol = toToken.fiat.symbol;

  const trackFeeCollapseOpen = () => {
    trackEvent({ event: 'click_details' });
  };

  const { toAmountFixed, totalReceiveFormatted, feesCost } = useOfframpFees(toAmount, toToken);

  return (
    <div className="border border-blue-700 collapse-arrow collapse" onClick={trackFeeCollapseOpen}>
      <input type="checkbox" />
      <div className="min-h-0 px-4 py-2 collapse-title">
        <div className="flex items-center justify-between">
          <p>Details</p>
        </div>
      </div>
      <div className="text-[15px] collapse-content">
        <div className="flex justify-between mt-2 ">
          <p>Your quote ({exchangeRate})</p>
          <div className="flex">
            <span>
              {toAmountFixed} {toTokenSymbol}
            </span>
          </div>
        </div>
        <div className="flex justify-between">
          <p>Vortex fee</p>
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
