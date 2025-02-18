import { ApiPromise } from '@polkadot/api';
import { FormEvent } from 'react';
import Big from 'big.js';

import {
  getInputTokenDetailsOrDefault,
  InputTokenType,
  OutputTokenType,
  getOutputTokenDetails,
} from '../../../../constants/tokenConfig';

import { TokenOutData } from '../../../../hooks/nabla/useTokenAmountOut';
import { Networks } from '../../../../helpers/networks';

import { calculateSwapAmountsWithMargin } from './calculateSwapAmountsWithMargin';
import { performSwapInitialChecks } from './performSwapInitialChecks';
import { validateSwapInputs } from './validateSwapInputs';
import { calculateTotalReceive } from '../../../../components/FeeCollapse';
import { BrlaOfframpExecutionInput, OfframpExecutionInput } from '../../../../types/offramp';

interface SwapConfirmParams {
  address: string | undefined;
  api: ApiPromise | null;
  from: InputTokenType;
  fromAmount: Big | undefined;
  fromAmountString: string;
  handleOnSubmit: (executionInput: OfframpExecutionInput) => void;
  handleOnSubmitBrla: (executionInput: BrlaOfframpExecutionInput) => void;
  inputAmountIsStable: boolean;
  requiresSquidRouter: boolean;
  selectedNetwork: Networks;
  setInitializeFailed: (message?: string | null) => void;
  setOfframpInitiating: (initiating: boolean) => void;
  setTermsAccepted: (accepted: boolean) => void;
  to: OutputTokenType;
  tokenOutAmount: { data: TokenOutData | undefined };
}

export function swapConfirm(e: FormEvent<HTMLFormElement>, params: SwapConfirmParams) {
  e.preventDefault();

  const {
    address,
    api,
    from,
    fromAmount,
    fromAmountString,
    handleOnSubmit,
    handleOnSubmitBrla,
    inputAmountIsStable,
    requiresSquidRouter,
    selectedNetwork,
    setInitializeFailed,
    setOfframpInitiating,
    setTermsAccepted,
    to,
    tokenOutAmount,
  } = params;

  const validInputs = validateSwapInputs(inputAmountIsStable, address, fromAmount, tokenOutAmount.data);
  if (!validInputs) {
    return;
  }

  setOfframpInitiating(true);

  const outputToken = getOutputTokenDetails(to);
  const inputToken = getInputTokenDetailsOrDefault(selectedNetwork, from);

  const { expectedRedeemAmountRaw, inputAmountRaw } = calculateSwapAmountsWithMargin(
    validInputs.fromAmount,
    validInputs.tokenOutAmountData.preciseQuotedAmountOut,
    inputToken,
    outputToken,
  );

  performSwapInitialChecks(
    api!,
    outputToken,
    inputToken,
    expectedRedeemAmountRaw,
    inputAmountRaw,
    address!,
    requiresSquidRouter,
    selectedNetwork,
  )
    .then(() => {
      console.log('Initial checks completed. Starting process..');

      // here we should set that the user has accepted the terms and conditions in the local storage
      setTermsAccepted(true);

      const effectiveExchangeRate = validInputs.tokenOutAmountData.effectiveExchangeRate;
      const inputAmountUnits = fromAmountString;

      const outputAmountBeforeFees = validInputs.tokenOutAmountData.roundedDownQuotedAmountOut;
      const outputAmountAfterFees = calculateTotalReceive(outputAmountBeforeFees, outputToken);
      const outputAmountUnits = {
        beforeFees: outputAmountBeforeFees.toFixed(2, 0),
        afterFees: outputAmountAfterFees,
      };

      if (to === 'brl') {
        handleOnSubmitBrla({
          inputTokenType: from,
          outputTokenType: to,
          effectiveExchangeRate,
          inputAmountUnits,
          outputAmountUnits,
          setInitializeFailed,
          pixId: '1234',
          taxId: '25246094561',
        });
        return;
      } else {
        handleOnSubmit({
          inputTokenType: from,
          outputTokenType: to,
          effectiveExchangeRate,
          inputAmountUnits,
          outputAmountUnits,
          setInitializeFailed,
        });
        return;
      }
    })
    .catch((_error) => {
      console.error('Error during swap confirmation:', _error);
      setOfframpInitiating(false);
      setInitializeFailed();
    });
}
