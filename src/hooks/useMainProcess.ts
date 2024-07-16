import { useState, useEffect, useCallback } from 'react';
import { Big } from 'big.js';

import { storageService } from '../services/localStorage';
import { useRecovery, clearLocalStorageKeys } from './useRecovery';

// Configs, Types, constants
import { IAnchorSessionParams, sep24First } from '../services/anchor';
import { StellarOperations } from '../services/stellar';
import { SepResult } from '../services/anchor';
import { useSquidRouterSwap } from '../services/squidrouter';
import { OperationStatus } from '../types';
import { ExecutionInput } from '../types';
import { TOKEN_CONFIG } from '../constants/tokenConfig';
import { storageKeys } from '../constants/localStorage';
import { TransactionStatus } from '../services/squidrouter';
import { TokenDetails } from '../constants/tokenConfig';

// Services
import { nablaApprove, nablaSwap } from '../services/nabla';
import {
  waitForTokenReceptionEvent,
  getEphemeralAccount,
  checkEphemeralReady,
  fundEphemeralAccount,
  cleanEphemeralAccount,
} from '../services/polkadot/ephemeral';
import { executeSpacewalkRedeem } from '../services/polkadot';
import { setUpAccountAndOperations } from '../services/stellar';
import { fetchTomlValues, getEphemeralKeys, sep10, ISep24Intermediate, sep24Second } from '../services/anchor';
import { submitOfframpTransaction, cleanupStellarEphemeral, setupStellarAccount } from '../services/stellar';
import { fetchSigningServicePK } from '../services/signingService';

// Utils
import { stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { decimalToCustom } from '../helpers/parseNumbers';
import { multiplyByPowerOfTen } from '../helpers/contracts';

import { EventStatus, GenericEvent } from '../components/GenericEvent';

//testing
import { checkStellarBalance } from '../services/stellar/utils';

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

  const [status, setStatus] = useState(OperationStatus.Idle);
  const [executionInput, setExecutionInput] = useState<ExecutionInput | undefined>(undefined);

  // seession and operations states
  const [fundingPK, setFundingPK] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [sep24IntermediateValues, setSep24IntermediateValues] = useState<ISep24Intermediate | null>(null);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sepResult, setSepResult] = useState<SepResult | null>(null);
  const [tokenBridgedAmount, setTokenBridgedAmount] = useState<Big | null>(null);
  const [externalWindowOpened, setExternalWindowOpened] = useState<boolean>(false);

  // UI states
  const [canInitiate, setCanInitiate] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<boolean>(false);

  //Squidrouter hook
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

  //On hook init, fetch the signing service PK
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
    console.log('Transaction status: ', transactionStatus);
    if (transactionStatus == TransactionStatus.SwapCompleted) {
      console.log('Funding account after squid swap is completed');
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
      fundEphemeralAccount();
      setNextStatus(OperationStatus.BridgeExecuted);
      storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.BridgeExecuted);
    }
  }, [transactionStatus, error]);

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
    console.log(amountToOfframp);

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

  const setNextStatus = useCallback(
    (nextStatus: OperationStatus) => {
      setStatus(nextStatus);
      storageService.set(storageKeys.OFFRAMP_STATUS, nextStatus);
    },
    [setStatus],
  );

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
    [anchorSessionParams, isRecovery],
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
  }, [stellarOperations]);

  // Sep 24 entry point callback
  const onExternalWindowClicked = useCallback(async () => {
    if (anchorSessionParams) {
      sep24First(anchorSessionParams).then((response) => {
        window.open(`${response.url}`, '_blank');
        setSep24IntermediateValues(response);
      });
    }

    setExternalWindowOpened(true);
  }, [anchorSessionParams]);

  const handleSepCompletion = useCallback(async () => {
    // at this point setSep24IntermediateValues should not be null, as well as
    // sessionParams
    sep24Second(sep24IntermediateValues!, anchorSessionParams!).then((response) => {
      setSepResult(response);
      setNextStatus(OperationStatus.SepCompleted);
    });
  }, [sep24IntermediateValues, anchorSessionParams]);

  useEffect(() => {
    if (executionInput === undefined) return;
    const { assetToOfframp, amountIn, swapOptions } = executionInput;
    switch (status) {
      case OperationStatus.Sep10Completed:
        sep24First(anchorSessionParams!).then((response) => {
          window.open(`${response.url}`, '_blank');
          setSep24IntermediateValues(response);
          setExternalWindowOpened(true);
        });
        return;

      case OperationStatus.SepCompleted:
        console.log('executing squirrouter swap....');
        executeSquidRouterSwap();
        return;

      case OperationStatus.BridgeExecuted:
        // TODO we obviusly need to change hardcoding the swap option here, for when we support
        // more than one asset on polygon
        const tokenToReceive = swapOptions ? TOKEN_CONFIG.usdc.currencyId : TOKEN_CONFIG[assetToOfframp].currencyId;
        const expectedBalanceRaw = swapOptions
          ? multiplyByPowerOfTen(swapOptions.minAmountOut, TOKEN_CONFIG.usdc.decimals)
          : amountIn; // swap options always defined. Left for clarity if we want to offramp directly

        checkEphemeralReady(tokenToReceive, expectedBalanceRaw).then((tokenBridgedAmountRaw) => {
          setTokenBridgedAmount(tokenBridgedAmountRaw);
          setNextStatus(OperationStatus.PendulumEphemeralReady);
        });
        return;

      case OperationStatus.PendulumEphemeralReady:
        addEvent('Attempting swap', EventStatus.Waiting);
        if (swapOptions) {
          const enteredAmountDecimal = new Big(sepResult!.amount);
          if (enteredAmountDecimal.gte(swapOptions.minAmountOut)) {
            // Show Event? Error? Back to Swap screen from scratch?
            // This should not happen with sep6 now that user does not type
            return;
          }
          nablaApprove(
            {
              amountInRaw: tokenBridgedAmount!,
              assetOut: assetToOfframp,
              assetIn: swapOptions.assetIn,
              minAmountOut: swapOptions.minAmountOut,
            },
            addEvent,
          ).then(() => {
            setNextStatus(OperationStatus.NablaSwapApproved);
          });

          return;
        }

        // if no swap options, we skip directly to stellar and redeem.
        setNextStatus(OperationStatus.NablaSwapPerformed);
        return;

      case OperationStatus.NablaSwapApproved:
        // no need to check if swapOptions since we know it was the case because we approved
        nablaSwap(
          {
            amountInRaw: tokenBridgedAmount!,
            assetOut: assetToOfframp,
            assetIn: swapOptions!.assetIn,
            minAmountOut: swapOptions!.minAmountOut,
          },
          addEvent,
        ).then((actualOfframpValue) => {
          setNextStatus(OperationStatus.NablaSwapPerformed);
        });
        return;

      case OperationStatus.NablaSwapPerformed:
        setupStellarAccount(fundingPK!, anchorSessionParams!.tokenConfig).then(() => {
          setNextStatus(OperationStatus.StellarEphemeralFunded);
        });

        return;

      case OperationStatus.StellarEphemeralFunded:
        // set up the ephemeral account and operations we will later neeed
        addEvent('Settings stellar accounts.', EventStatus.Waiting);
        setUpAccountAndOperations(fundingPK!, sepResult!, anchorSessionParams!.tokenConfig)
          .then((operations) => {
            setStellarOperations(operations);
            addEvent('Stellar ephemeral account ready.', EventStatus.Waiting);
            setNextStatus(OperationStatus.StellarEphemeralReady);
          })
          .catch(() => {
            addEvent(`Stellar setup failed ${error}`, EventStatus.Error);
          });
        return;

      case OperationStatus.StellarEphemeralReady:
        executeRedeem(sepResult!);
        return;

      case OperationStatus.Redeemed:
        finalizeOfframp().catch(console.error);
        return;

      // Offramp succesfull but first cleanup (Stellar) did not happened. We attemp to transfer again, since we do not
      // handle errors anyway.
      case OperationStatus.Offramped:
        cleanupStellarEphemeral(stellarOperations!.mergeAccountTransaction, addEvent).finally(() => {
          setNextStatus(OperationStatus.StellarCleaned);
        });
        return;

      // last case, after completion we need to delete all the relevant variables from the storage.
      // we also re-send the transaction (also in case of restore)
      case OperationStatus.StellarCleaned:
        cleanEphemeralAccount(executionInput?.assetToOfframp!).finally(() => {
          clearLocalStorageKeys(storageKeys);
        });
        return;
    }
  }, [isRecovery, status, executeRedeem, finalizeOfframp, sepResult, executionInput]);

  return {
    canInitiate,
    anchorSessionParams,
    externalWindowOpened,
    isRecovery,
    isRecoveryError,
    handleOnSubmit,
    handleSepCompletion,
    onExternalWindowClicked,
  };
};
