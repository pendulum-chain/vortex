import { useState, useEffect, useCallback } from 'react';
import { Big } from 'big.js';

import { storageService } from '../services/localStorage';
import { useRecovery } from './useRecovery';

// Configs, Types, constants
import { IAnchorSessionParams } from '../services/anchor';
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
import { fetchTomlValues, getEphemeralKeys, sep10, sep6First } from '../services/anchor';
import { submitOfframpTransaction, cleanupStellarEphemeral } from '../services/stellar';
import { fetchSigningServicePK } from '../services/signingService';

// Utils
import { stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { decimalToCustom } from '../helpers/parseNumbers';
import { multiplyByPowerOfTen } from '../helpers/contracts';

import { EventStatus, GenericEvent } from '../components/GenericEvent';

export const useMainProcess = () => {

  // MOCKING approval performed
        // let recoveryStatus = {
        //   approvalHash: '0xe2798e5c30915033e3d5aaecf2cb2704c31f0a68624013849729ac5c69f83048',
        //   swapHash: undefined,
        // }

  // MOCKING swap performed
  let recoveryStatus = {
    approvalHash: '0xe2798e5c30915033e3d5aaecf2cb2704c31f0a68624013849729ac5c69f83048',
    swapHash: undefined,
    transactionRequest: {"routeType":"CALL_BRIDGE_CALL","target":"0xce16F69375520ab01377ce7B88f5BA8C48F8D666","data":"0x846a1bc60000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000000000000000000000000000000000000000b71b0000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000520000000000000000000000000000000000000000000000000000000000000056000000000000000000000000000000000000000000000000000000000000005a00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000f49c9cf258b3dcb2842ed9e89569d717d30465b600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044095ea7b300000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000e404e45aaf0000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000750e4c4984a9e0f12978ea6742bc1c5d248f40ed0000000000000000000000000000000000000000000000000000000000000064000000000000000000000000ce16f69375520ab01377ce7b88f5ba8c48f8d6660000000000000000000000000000000000000000000000000000000000b71b000000000000000000000000000000000000000000000000000000000000b6c2b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000761786c555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084d6f6f6e6265616d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a3078636531364636393337353532306162303133373763653742383866354241384334384638443636360000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007a00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000f49c9cf258b3dcb2842ed9e89569d717d30465b600000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000002e000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000ca01a1d0993565291051daff390892518acfad3a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ca01a1d0993565291051daff390892518acfad3a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000066d12e8f155c87a87d9db96eac0594e872c16b2000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ca01a1d0993565291051daff390892518acfad3a00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000066d12e8f155c87a87d9db96eac0594e872c16b2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000032440df9e110000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000038d7ea4c68000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000002042400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000148d0bbba567ae73a06a8678e53dc7add0af6b7039000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000005000000082e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002201348f57f424169b98a9579f6d7b204f54ff9626b537c1f522de9f98e8f69a421a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000ca01a1d0993565291051daff390892518acfad3a0000000000000000000000000000000000000000000000000000000000000001de321b5ab3f9989d67dab414b3556ece","value":"511469868416439548","gasLimit":"556000","lastBaseFeePerGas":"3560652","maxFeePerGas":"1507121304","maxPriorityFeePerGas":"1500000000","gasPrice":"30003560652","requestId":"de321b5ab3f9989d67dab414b3556ece"}
  }
  storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, recoveryStatus );
  storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.Sep6Completed);

  const [status, setStatus] = useState(OperationStatus.Idle);
  const [executionInput, setExecutionInput] = useState<ExecutionInput | undefined>(undefined);

  // seession and operations states
  const [fundingPK, setFundingPK] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sepResult, setSepResult] = useState<SepResult | null>(null);
  const [tokenBridgedAmount, setTokenBridgedAmount] = useState<Big | null>(null);

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

  // Should we fund this after approval or after the swap is completed?
  // TODO Right now, the SwapCompleted variant is never set. We need to fix this and
  // only then asign BridgeExected status and account funding
  useEffect(() => {
    console.log('Transaction status: ', transactionStatus);
    if (transactionStatus == TransactionStatus.SwapCompleted) {
      console.log('Funding account after squid swap is completed');
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
      fundEphemeralAccount();
      setStatus(OperationStatus.BridgeExecuted);
      storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.BridgeExecuted);
    }
  }, [transactionStatus, error]);

  // Main submit handler. Offramp button.
  const handleOnSubmit = async ({ assetToOfframp, amountIn, swapOptions }: ExecutionInput) => {
    // we always want swap now, but for now we hardcode the starting token
    setAmountIn(decimalToCustom(amountIn, TOKEN_CONFIG.usdc.decimals).toFixed());

    // Store user selected values in state an local storage
    setExecutionInput({ assetToOfframp, amountIn, swapOptions });
    storageService.set(storageKeys.OFFRAMP_EXECUTION_INPUTS, executionInput);

    const tokenConfig: TokenDetails = TOKEN_CONFIG[assetToOfframp];
    const values = await fetchTomlValues(tokenConfig.tomlFileUrl!);

    const amountToOfframp = swapOptions !== undefined ? swapOptions.minAmountOut : amountIn;
    console.log(amountToOfframp);

    const truncatedAmountToOfframp = stringifyBigWithSignificantDecimals(amountToOfframp.round(2, 0), 2);

    const token = await sep10(values, addEvent);

    setAnchorSessionParams({
      token,
      tomlValues: values,
      tokenConfig,
      offrampAmount: truncatedAmountToOfframp,
    });

    setStatus(OperationStatus.Sep10Completed);
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
          addEvent,
        );
      } catch (error) {
        console.log(error);
        return;
      }

      addEvent('Redeem process completed, executing offramp transaction', EventStatus.Waiting);

      //this will trigger finalizeOfframp
      setStatus(OperationStatus.Redeemed);
    },
    [anchorSessionParams],
  );

  const finalizeOfframp = useCallback(async () => {
    try {
      await submitOfframpTransaction(stellarOperations!.offrampingTransaction, addEvent);
    } catch (error) {
      console.error('Offramp failed', error);
      addEvent('Offramp transaction failed', EventStatus.Error);
      return;
    }

    setStatus(OperationStatus.Offramped);
    // we may not necessarily need to show the user an error, since the offramp transaction is already submitted
    // and successful
    // This will not affect the user

    addEvent('Offramp Submitted! Funds should be available shortly', EventStatus.Success);
  }, [stellarOperations]);

  useEffect(() => {
    if (executionInput === undefined) return;
    const { assetToOfframp, amountIn, swapOptions } = executionInput;
    switch (status) {
      // TODO Split this in as many parts depending if we care or not on retaking the process at
      // the sep part. (since no tokens are transferred, we may consider the whole flow as one)
      case OperationStatus.Sep10Completed:
        // TODO complete when we know how to handle the sep6 flow
        sep6First(anchorSessionParams!).then((sepResult) => {
          setSepResult(sepResult);
          setStatus(OperationStatus.Sep6Completed);
          storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.Sep6Completed);
        });
        return;
      case OperationStatus.Sep6Completed:
        console.log("executing squirrouter swap....")
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
          setStatus(OperationStatus.PendulumEphemeralReady);
        });
        return;

      case OperationStatus.PendulumEphemeralReady:
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
            setStatus(OperationStatus.NablaSwapApproved);
          });

          return;
        }

        // if no swap options, we skip directly to stellar and redeem.
        setStatus(OperationStatus.NablaSwapPerformed);
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
          setStatus(OperationStatus.NablaSwapPerformed);
        });
        return;

      case OperationStatus.NablaSwapPerformed:
        // set up the ephemeral account and operations we will later neeed
        addEvent('Settings stellar accounts.', EventStatus.Waiting);
        setUpAccountAndOperations(
          fundingPK!,
          sepResult!,
          getEphemeralKeys(),
          anchorSessionParams!.tokenConfig,
          addEvent,
        )
          .then((operations) => {
            setStellarOperations(operations);
            addEvent('Stellar ephemeral account ready.', EventStatus.Waiting);
            setStatus(OperationStatus.StellarEphemeralReady);
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

      // Offramp succesfull but first cleanup (Stellar) did not happened
      case OperationStatus.Offramped:
        cleanupStellarEphemeral(stellarOperations!.mergeAccountTransaction, addEvent).then(() => {
          setStatus(OperationStatus.StellarCleaned);
        });
        return;

      // last case, after completion we need to delete the offramp status from local storage
      case OperationStatus.StellarCleaned:
        cleanEphemeralAccount(executionInput?.assetToOfframp!).then(() => {
          storageService.remove(storageKeys.OFFRAMP_STATUS);
        });
        return;
    }
  }, [status, executeRedeem, finalizeOfframp, sepResult, executionInput]);

  return {
    canInitiate,
    anchorSessionParams,
    addEvent,
    handleOnSubmit,
    isRecovery,
    isRecoveryError,
  };
};
