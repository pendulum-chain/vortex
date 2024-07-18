import { StateUpdater, useCallback, useMemo, useState } from 'preact/compat';
import Big from 'big.js';
import _ from 'lodash';

import { IAnchorSessionParams, sep24First, sep24Second, SepResult } from '../../services/anchor';
import { nablaApprove, nablaSwap } from '../../services/nabla';
import { checkEphemeralReady, cleanEphemeralAccount } from '../../services/polkadot/ephemeral';
import {
  cleanupStellarEphemeral,
  setUpAccountAndOperations,
  setupStellarAccount,
  StellarOperations,
} from '../../services/stellar';
import { TOKEN_CONFIG, TokenType } from '../../constants/tokenConfig';
import { storageKeys } from '../../constants/localStorage';
import { multiplyByPowerOfTen } from '../../helpers/contracts';
import { EventStatus } from '../../components/GenericEvent';
import { ExecutionInput, OperationStatus, SwapOptions } from '../../types';
import { clearLocalStorageKeys } from '../useRecovery';

const determineTokenToReceive = (assetToOfframp: string, swapOptions?: SwapOptions) => {
  return swapOptions ? TOKEN_CONFIG.usdc.currencyId : TOKEN_CONFIG[assetToOfframp as TokenType].currencyId;
};

const calculateExpectedBalance = (amountIn: Big, swapOptions?: SwapOptions): Big => {
  if (swapOptions) {
    return multiplyByPowerOfTen(swapOptions.minAmountOut || Big(0), TOKEN_CONFIG.usdc.decimals);
  }
  return amountIn;
};

export interface IUseHandlersDependencies {
  anchorSessionParams: IAnchorSessionParams | null;
  setSep24Url: StateUpdater<string | undefined>;
  setSepResult: StateUpdater<SepResult | null>;
  setNextStatus: (nextStatus: OperationStatus) => void;
  executeSquidRouterSwap: () => Promise<void>;
  executionInput?: ExecutionInput;
  setTokenBridgedAmount: StateUpdater<Big | null>;
  sepResult: SepResult | null;
  tokenBridgedAmount: Big | null;
  fundingPK: string | null;
  addEvent: (message: string, status: EventStatus) => void;
  setStellarOperations: StateUpdater<StellarOperations | null>;
  executeRedeem: (sepResult: SepResult) => Promise<void>;
  finalizeOfframp: () => Promise<void>;
  stellarOperations: StellarOperations | null;
}

export const useSEPHandlers = (dependencies: IUseHandlersDependencies) => {
  const {
    anchorSessionParams,
    setSep24Url,
    setSepResult,
    setNextStatus,
    executeSquidRouterSwap,
    executionInput,
    setTokenBridgedAmount,
    sepResult,
    tokenBridgedAmount,
    fundingPK,
    addEvent,
    setStellarOperations,
    executeRedeem,
    finalizeOfframp,
    stellarOperations,
  } = dependencies;

  const [activeOperation, setActiveOperation] = useState<OperationStatus | null>(null);

  // We don't want to run multiple operations at the same time
  const runOperation = useCallback(
    async (operation: OperationStatus, handler: () => void | Promise<void>) => {
      if (activeOperation === operation) {
        console.warn(`Operation ${operation} is already active.`);
        return;
      }

      setActiveOperation(operation);
      return await handler();
    },
    [activeOperation],
  );

  const handleSep10Completed = useCallback(async () => {
    console.log('initiating sep process');

    const response = await sep24First(anchorSessionParams!);
    setSep24Url(response.url);
    console.log('sep24 url:', response.url);

    const secondResponse = await sep24Second(response, anchorSessionParams!);
    setSepResult(secondResponse);
    setNextStatus(OperationStatus.SepCompleted);
  }, [anchorSessionParams, setNextStatus, setSep24Url, setSepResult]);

  const handleSepCompleted = useCallback(() => {
    console.log('executing squirrouter swap....');
    executeSquidRouterSwap();
  }, [executeSquidRouterSwap]);

  const handleBridgeExecuted = useCallback(async () => {
    if (executionInput === undefined) return;
    const { assetToOfframp, amountIn, swapOptions } = executionInput;

    const tokenToReceive = determineTokenToReceive(assetToOfframp, swapOptions);
    const expectedBalanceRaw = calculateExpectedBalance(amountIn, swapOptions);

    const tokenBridgedAmountRaw = await checkEphemeralReady(tokenToReceive, expectedBalanceRaw);
    setTokenBridgedAmount(tokenBridgedAmountRaw);
    setNextStatus(OperationStatus.PendulumEphemeralReady);
  }, [executionInput, setNextStatus, setTokenBridgedAmount]);

  const handlePendulumEphemeralReady = useCallback(async () => {
    if (executionInput === undefined) return;
    const { assetToOfframp, swapOptions } = executionInput;

    addEvent('Attempting swap', EventStatus.Waiting);
    if (swapOptions) {
      const enteredAmountDecimal = new Big(sepResult!.amount);
      if (enteredAmountDecimal.gte(swapOptions.minAmountOut as Big)) {
        return;
      }
      await nablaApprove(
        {
          amountInRaw: tokenBridgedAmount!,
          assetOut: assetToOfframp,
          assetIn: swapOptions.assetIn,
          minAmountOut: swapOptions.minAmountOut as Big,
        },
        addEvent,
      );
      setNextStatus(OperationStatus.NablaSwapApproved);
    } else {
      setNextStatus(OperationStatus.NablaSwapPerformed);
    }
  }, [executionInput, addEvent, sepResult, tokenBridgedAmount, setNextStatus]);

  const handleNablaSwapApproved = useCallback(async () => {
    if (executionInput === undefined) return;
    const { assetToOfframp, swapOptions } = executionInput;

    await nablaSwap(
      {
        amountInRaw: tokenBridgedAmount!,
        assetOut: assetToOfframp,
        assetIn: swapOptions!.assetIn,
        minAmountOut: swapOptions!.minAmountOut as Big,
      },
      addEvent,
    );
    setNextStatus(OperationStatus.NablaSwapPerformed);
  }, [executionInput, tokenBridgedAmount, addEvent, setNextStatus]);

  const handleNablaSwapPerformed = useCallback(async () => {
    await setupStellarAccount(fundingPK!, anchorSessionParams!.tokenConfig);
    setNextStatus(OperationStatus.StellarEphemeralFunded);
  }, [fundingPK, anchorSessionParams, setNextStatus]);

  const handleStellarEphemeralFunded = useCallback(async () => {
    addEvent('Settings stellar accounts.', EventStatus.Waiting);
    try {
      const operations = await setUpAccountAndOperations(fundingPK!, sepResult!, anchorSessionParams!.tokenConfig);
      setStellarOperations(operations);
      addEvent('Stellar ephemeral account ready.', EventStatus.Waiting);
      setNextStatus(OperationStatus.StellarEphemeralReady);
    } catch (error) {
      addEvent(`Stellar setup failed ${error}`, EventStatus.Error);
    }
  }, [addEvent, fundingPK, sepResult, anchorSessionParams, setStellarOperations, setNextStatus]);

  const handleStellarEphemeralReady = useCallback(() => {
    executeRedeem(sepResult!);
  }, [sepResult, executeRedeem]);

  const handleRedeemed = useCallback(async () => {
    await finalizeOfframp().catch(console.error);
  }, [finalizeOfframp]);

  const handleOfframped = useCallback(async () => {
    await cleanupStellarEphemeral(stellarOperations!.mergeAccountTransaction, addEvent);
    setNextStatus(OperationStatus.StellarCleaned);
  }, [stellarOperations, addEvent, setNextStatus]);

  const handleStellarCleaned = useCallback(async () => {
    if (executionInput === undefined) return;

    await cleanEphemeralAccount(executionInput.assetToOfframp);
    clearLocalStorageKeys(storageKeys);
  }, [executionInput]);

  const createHandlerMap = useCallback(
    (handlers: Record<OperationStatus, () => void | Promise<void>>) => {
      const wrappedHandlers = _.mapValues(handlers, (handler, status) => {
        return () => runOperation(status as OperationStatus, handler);
      }) as Record<OperationStatus, () => void | Promise<void>>;

      return wrappedHandlers;
    },
    [runOperation],
  );

  const handlerMap: Record<OperationStatus, () => void | Promise<void>> = useMemo(
    () =>
      createHandlerMap({
        [OperationStatus.Sep10Completed]: handleSep10Completed,
        [OperationStatus.SepCompleted]: handleSepCompleted,
        [OperationStatus.BridgeExecuted]: handleBridgeExecuted,
        [OperationStatus.PendulumEphemeralReady]: handlePendulumEphemeralReady,
        [OperationStatus.NablaSwapApproved]: handleNablaSwapApproved,
        [OperationStatus.NablaSwapPerformed]: handleNablaSwapPerformed,
        [OperationStatus.StellarEphemeralFunded]: handleStellarEphemeralFunded,
        [OperationStatus.StellarEphemeralReady]: handleStellarEphemeralReady,
        [OperationStatus.Redeemed]: handleRedeemed,
        [OperationStatus.Offramped]: handleOfframped,
        [OperationStatus.StellarCleaned]: handleStellarCleaned,
        [OperationStatus.Error]: async () => Promise.reject('Error'),
        [OperationStatus.Idle]: async () => {
          return;
        },
      }),
    [
      createHandlerMap,
      handleBridgeExecuted,
      handleNablaSwapApproved,
      handleNablaSwapPerformed,
      handleOfframped,
      handlePendulumEphemeralReady,
      handleRedeemed,
      handleSep10Completed,
      handleSepCompleted,
      handleStellarCleaned,
      handleStellarEphemeralFunded,
      handleStellarEphemeralReady,
    ],
  );

  return handlerMap;
};
