import { StateUpdater } from 'preact/hooks';
import { ApiPromise } from '@polkadot/api';
import Big from 'big.js';

import {
  getInputTokenDetailsOrDefault,
  InputTokenType,
  OutputTokenType,
  OUTPUT_TOKEN_CONFIG,
} from '../../../../constants/tokenConfig';

import { ExecutionInput } from '../../../../hooks/offramp/useMainProcess';
import { TokenOutData } from '../../../../hooks/nabla/useTokenAmountOut';
import { Networks } from '../../../../contexts/network';

import { calculateSwapAmountsWithMargin } from './calculateSwapAmountsWithMargin';
import { performSwapInitialChecks } from './performSwapInitialChecks';
import { validateSwapInputs } from './validateSwapInputs';

interface SwapConfirmParams {
  inputAmountIsStable: boolean;
  address: `0x${string}` | undefined;
  fromAmount: Big | undefined;
  tokenOutAmount: { data: TokenOutData | undefined };
  api: ApiPromise | null;
  to: OutputTokenType;
  from: InputTokenType;
  selectedNetwork: Networks;
  fromAmountString: string;
  setIsInitiating: StateUpdater<boolean>;
  setInitializeFailed: StateUpdater<boolean>;
  handleOnSubmit: (executionInput: ExecutionInput) => void;
  setTermsAccepted: (accepted: boolean) => void;
}

export function swapConfirm(
  e: Event,
  {
    inputAmountIsStable,
    address,
    fromAmount,
    tokenOutAmount,
    api,
    to,
    from,
    selectedNetwork,
    fromAmountString,
    setIsInitiating,
    setInitializeFailed,
    handleOnSubmit,
    setTermsAccepted,
  }: SwapConfirmParams,
) {
  e.preventDefault();

  const validInputs = validateSwapInputs(inputAmountIsStable, address, fromAmount, tokenOutAmount.data);
  if (!validInputs) {
    return;
  }

  setIsInitiating(true);

  const outputToken = OUTPUT_TOKEN_CONFIG[to];
  const inputToken = getInputTokenDetailsOrDefault(selectedNetwork, from);

  const { expectedRedeemAmountRaw, inputAmountRaw } = calculateSwapAmountsWithMargin(
    validInputs.fromAmount,
    validInputs.tokenOutAmountData.preciseQuotedAmountOut,
    inputToken,
    outputToken,
  );

  performSwapInitialChecks(api!, outputToken, inputToken, expectedRedeemAmountRaw, inputAmountRaw, address!)
    .then(() => {
      console.log('Initial checks completed. Starting process..');

      // here we should set that the user has accepted the terms and conditions in the local storage
      setTermsAccepted(true);

      handleOnSubmit({
        inputTokenType: from,
        outputTokenType: to,
        amountInUnits: fromAmountString,
        offrampAmount: validInputs.tokenOutAmountData.roundedDownQuotedAmountOut,
        setInitializeFailed,
      });
    })
    .catch((_error) => {
      setIsInitiating(false);
      setInitializeFailed(true);
    });
}
