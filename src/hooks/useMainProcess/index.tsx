import { useState, useEffect, useCallback } from 'preact/compat';
import { Big } from 'big.js';

import { storageService } from '../../services/localStorage';
import { useRecovery } from '../useRecovery';

// Configs, Types, constants
import { IAnchorSessionParams } from '../../services/anchor';
import { StellarOperations } from '../../services/stellar';
import { SepResult } from '../../services/anchor';
import { useSquidRouterSwap } from '../../services/squidrouter';
import { OperationStatus } from '../../types';
import { ExecutionInput } from '../../types';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { storageKeys } from '../../constants/localStorage';
import { TransactionStatus } from '../../services/squidrouter';
import { TokenDetails } from '../../constants/tokenConfig';

// Services
import { getEphemeralAccount, fundEphemeralAccount } from '../../services/polkadot/ephemeral';
import { executeSpacewalkRedeem } from '../../services/polkadot';
import { fetchTomlValues, getEphemeralKeys, sep10 } from '../../services/anchor';
import { submitOfframpTransaction } from '../../services/stellar';
import { fetchSigningServicePK } from '../../services/signingService';

// Utils
import { stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { decimalToCustom } from '../../helpers/parseNumbers';

import { EventStatus, GenericEvent } from '../../components/GenericEvent';

//testing
import { useSEPHandlers, IUseHandlersDependencies } from './useSEPHandlers';

export const useMainProcess = () => {
  // EXAMPLE mocking states

  // Approval already performed (scenario: service shut down after sending approval but before getting it's confirmation)
  // let recoveryStatus = {
  //   approvalHash: '0xe2798e5c30915033e3d5aaecf2cb2704c31f0a68624013849729ac5c69f83048',
  //   swapHash: undefined,
  //   transactionRequest: {"routeType":"CALL_BRIDGE_CALL","target":"0xce16F69375520ab01377ce7B88f5BA8C48F8D666","data":"0x00","value":"511469868416439548","gasLimit":"556000","lastBaseFeePerGas":"3560652","maxFeePerGas":"1507121304","maxPriorityFeePerGas":"1500000000","gasPrice":"30003560652","requestId":"de321b5ab3f9989d67dab414b3556ece"}
  // }

  // storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, recoveryStatus );
  // storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.Sep6Completed);

  // ⭐️ Initial states
  const [status, setStatus] = useState(OperationStatus.Idle);
  const [executionInput, setExecutionInput] = useState<ExecutionInput | undefined>(undefined);
  // Session and operations states
  const [fundingPK, setFundingPK] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [sep24Url, setSep24Url] = useState<string | undefined>(undefined);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sepResult, setSepResult] = useState<SepResult | null>(null);
  const [tokenBridgedAmount, setTokenBridgedAmount] = useState<Big | null>(null);
  // UI states
  const [canInitiate, setCanInitiate] = useState<boolean>(false);
  const [_, setBackendError] = useState<boolean>(false);
  // Squidrouter hook
  const [amountInNative, setAmountIn] = useState<string>('0');
  const { transactionStatus, executeSquidRouterSwap, error } = useSquidRouterSwap(amountInNative);
  // TODO we probably don't want this events anymore. Maybe display the name only in the UI?
  const [activeEventIndex, setActiveEventIndex] = useState<number>(-1);
  const [events, setEvents] = useState<GenericEvent[]>([]);

  const addEvent = (message: string, status: EventStatus) => {
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
    setActiveEventIndex((prevIndex) => prevIndex + 1);
  };

  // Hook to trigger recovery logic. This will be triggered if the user has a previous session stored in the local storage
  // Results can be used to display on the UI the necessary information and hide the offramp box.
  const { isRecovery, isRecoveryError } = useRecovery(
    setStatus,
    setExecutionInput,
    setTokenBridgedAmount,
    setSepResult,
    setAnchorSessionParams,
    setStellarOperations,
  );

  // Never setStatus directly. Always use this function to update the status and store it in the local storage
  const setNextStatus = useCallback(
    (nextStatus: OperationStatus) => {
      setStatus(nextStatus);
      storageService.set(storageKeys.OFFRAMP_STATUS, nextStatus);
    },
    [setStatus],
  );

  useEffect(() => {
    const initiate = async () => {
      try {
        const fundingPK = await fetchSigningServicePK();
        setFundingPK(fundingPK);
        setCanInitiate(true);
      } catch (error) {
        setBackendError(true);
        console.error('Error fetching token', error);
      }
    };
    initiate().catch(console.error);
  }, []);

  // Update app states based on squidrouter progress
  // Fund the ephemeral account after the squid swap is completed

  // We fund this after approval or after the swap is completed
  useEffect(() => {
    if (transactionStatus == TransactionStatus.SwapCompleted) {
      console.log('Funding account after squid swap is completed');
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
      fundEphemeralAccount();
      setNextStatus(OperationStatus.BridgeExecuted);
    }
  }, [transactionStatus, error, setNextStatus]);

  // Main submit handler. Offramp button.
  const handleOnSubmit = async ({ assetToOfframp, amountIn, swapOptions }: ExecutionInput) => {
    // we always want swap now, but for now we hardcode the starting token
    setAmountIn(decimalToCustom(amountIn, TOKEN_CONFIG.usdc.decimals).toFixed());

    // Store user selected values in state an local storage
    setExecutionInput({ assetToOfframp, amountIn, swapOptions });
    storageService.set(storageKeys.OFFRAMP_EXECUTION_INPUTS, { assetToOfframp, amountIn, swapOptions });

    const tokenConfig: TokenDetails = TOKEN_CONFIG[assetToOfframp];
    const values = await fetchTomlValues(tokenConfig.tomlFileUrl!);

    const amountToOfframp = swapOptions !== undefined ? swapOptions.minAmountOut : amountIn;

    if (!amountToOfframp) return;

    const truncatedAmountToOfframp = stringifyBigWithSignificantDecimals(amountToOfframp.round(2, 0), 2);

    const token = await sep10(values, addEvent);
    const anchorSessionParams = {
      token,
      tomlValues: values,
      tokenConfig,
      offrampAmount: truncatedAmountToOfframp,
    };
    setAnchorSessionParams(anchorSessionParams);
    storageService.set(storageKeys.ANCHOR_SESSION_PARAMS, anchorSessionParams);

    setNextStatus(OperationStatus.Sep10Completed);
  };

  const executeRedeem = useCallback(
    async (sepResult: SepResult) => {
      try {
        const ephemeralAccount = getEphemeralAccount();
        await executeSpacewalkRedeem(
          getEphemeralKeys().publicKey(),
          sepResult.amount,
          ephemeralAccount,
          anchorSessionParams!.tokenConfig,
          isRecovery,
          addEvent,
        );
      } catch (error) {
        console.log(error);
        return;
      }

      addEvent('Redeem process completed, executing offramp transaction', EventStatus.Waiting);

      //this will trigger finalizeOfframp
      setNextStatus(OperationStatus.Redeemed);
    },
    [anchorSessionParams, isRecovery, setNextStatus],
  );

  const finalizeOfframp = useCallback(async () => {
    try {
      await submitOfframpTransaction(stellarOperations!.offrampingTransaction, isRecovery, addEvent);
    } catch (error) {
      console.error('Offramp failed', error);
      addEvent('Offramp transaction failed', EventStatus.Error);
      return;
    }
    setNextStatus(OperationStatus.Offramped);
    addEvent('Offramp Submitted! Funds should be available shortly', EventStatus.Success);
  }, [isRecovery, setNextStatus, stellarOperations]);

  const dependencies: IUseHandlersDependencies = {
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
  };

  const handlerMap = useSEPHandlers(dependencies);

  useEffect(() => {
    const handler = handlerMap[status];
    if (handler) {
      console.log('Executing handler for status:', status);
      handler();
    }
  }, [handlerMap, status]);

  return {
    canInitiate,
    anchorSessionParams,
    isRecovery,
    isRecoveryError,
    sep24Url,
    events,
    handleOnSubmit,
    activeEventIndex,
  };
};
