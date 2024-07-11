import { useState, useEffect, useCallback } from 'react';
import { Big } from 'big.js';

import { storageService } from '../services/localStorage';
import { useRecovery } from './useRecovery';

// Configs, Types, constants
import { IAnchorSessionParams } from '../services/anchor';
import { StellarOperations } from '../services/stellar';
import { Sep24Result } from '../services/anchor';
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
  const [status, setStatus] = useState(OperationStatus.Idle);
  const [executionInput, setExecutionInput] = useState<ExecutionInput | undefined>(undefined);

  // seession and operations states
  const [fundingPK, setFundingPK] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sep24Result, setSepResult] = useState<Sep24Result | null>(null);
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

  const isRecovery = useRecovery(
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
    if (transactionStatus == TransactionStatus.SpendingApproved) {
      console.log('Funding account after squid swap is completed');
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
      fundEphemeralAccount();
      setStatus(OperationStatus.BridgeExecuted);
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
    async (sepResult: Sep24Result) => {
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
        sep6First(anchorSessionParams!).then(() => {
          setStatus(OperationStatus.Sep6Completed);
        });
        return;
      case OperationStatus.Sep6Completed:
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
          const enteredAmountDecimal = new Big(sep24Result!.amount);
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
          sep24Result!,
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
        executeRedeem(sep24Result!);
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
  }, [status, executeRedeem, finalizeOfframp, sep24Result, executionInput]);

  return {
    canInitiate,
    anchorSessionParams,
    addEvent,
    handleOnSubmit,
    isRecovery,
  };
};
