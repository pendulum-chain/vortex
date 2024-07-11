import Big from 'big.js';
import { useState, useEffect, useRef } from 'react';

import '../../../App.css';
import InputBox from '../../components/InputKeys';
import { SwapOptions } from '../../components/InputKeys';
import EventBox from '../../components/GenericEvent';
import { GenericEvent, EventStatus } from '../../components/GenericEvent';
import { fetchTomlValues, IAnchorSessionParams, Sep24Result, getEphemeralKeys, sep10 } from '../../services/anchor';
import {
  setUpAccountAndOperations,
  StellarOperations,
  submitOfframpTransaction,
  cleanupStellarEphemeral,
} from '../../services/stellar';
import { executeSpacewalkRedeem } from '../../services/polkadot';
import Sep24 from '../../components/Sep24Component';
import { useCallback } from 'preact/compat';
import { fetchSigningServicePK } from '../../services/signingService';
import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { nablaApprove, nablaSwap } from '../../services/nabla';
import { TRANSFER_WAITING_TIME_SECONDS } from '../../constants/constants';
import {
  waitForTokenReceptionEvent,
  getEphemeralAccount,
  checkEphemeralReady,
  fundEphemeralAccount,
  cleanEphemeralAccount,
} from '../../services/polkadot/ephemeral';
import { stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useSquidRouterSwap, TransactionStatus } from '../../services/squidrouter';
import { decimalToCustom } from '../../helpers/parseNumbers';
import { TokenType } from '../../constants/tokenConfig';
import { storageService } from '../../services/localStorage';
import { storageKeys } from '../../constants/localStorage';
import {  useRecovery } from '../../hooks/useRecovery';
import { OperationStatus, ExecutionInput } from '../../types';


function Landing() {

  // system status
  const [status, setStatus] = useState(OperationStatus.Idle);
  const [executionInput, setExecutionInput] = useState<ExecutionInput | undefined>(undefined);

  // events state and refs
  const [events, setEvents] = useState<GenericEvent[]>([]);
  const eventsEndRef = useRef<HTMLDivElement | null>(null);
  const [activeEventIndex, setActiveEventIndex] = useState<number>(-1);

  // seession and operations states
  const [fundingPK, setFundingPK] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sep24Result, setSep24Result] = useState<Sep24Result | null>(null);
  const [tokenBridgedAmount, setTokenBridgedAmount] = useState<Big | null>(null);

  // UI states
  const [showSep24, setShowSep24] = useState<boolean>(false);
  const [canInitiate, setCanInitiate] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<boolean>(false);

  //Squidrouter hook
  const [amountInNative, setAmountIn] = useState<string>('0');
  const { transactionStatus, executeSquidRouterSwap, error } = useSquidRouterSwap(amountInNative);

  // fetch the current state of the offramp, if any.
  const currentOfframpStatus = storageService.getParsed<OperationStatus>(storageKeys.OFFRAMP_STATUS);
  const isRecovery = currentOfframpStatus !== undefined
  // recovery parameters from local storage into state
  if (isRecovery){
    setStatus(currentOfframpStatus);
    setExecutionInput(storageService.getParsed<ExecutionInput>(storageKeys.OFFRAMP_EXECUTION_INPUTS));
    setTokenBridgedAmount(storageService.getBig(storageKeys.TOKEN_BRIDGED_AMOUNT)!);
    // TODO need to do some error handling here in case one is undefined, which should not happen but...
    setSep24Result(storageService.getParsed<Sep24Result>(storageKeys.SEP24_RESULT)!);
    setAnchorSessionParams(storageService.getParsed<IAnchorSessionParams>(storageKeys.ANCHOR_SESSION_PARAMS)!);
    setStellarOperations(storageService.getParsed<StellarOperations>(storageKeys.STELLAR_OPERATIONS)!);
  }
  console.log('Current status: ', currentOfframpStatus);


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
    // showing (rendering) the Sep24 component will trigger the Sep24 process
    setShowSep24(true);
  };

  const handleOnSep24Completed = async (result: Sep24Result) => {
    setShowSep24(false);

    // log the result
    addEvent(
      `SEP24 completed, amount: ${result.amount}, memo: ${result.memo}, offramping account: ${result.offrampingAccount}`,
      EventStatus.Waiting,
    );
    setSep24Result(result);

    // Start the squid router process
    executeSquidRouterSwap();
    setStatus(OperationStatus.BridgeExecuted);

    // log ephemeral pk
    const ephemeralAccount = getEphemeralAccount().address;
    addEvent(`Pendulum ephemeral account: ${ephemeralAccount}`, EventStatus.Waiting);

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

  const addEvent = (message: string, status: EventStatus) => {
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
    setActiveEventIndex((prevIndex) => prevIndex + 1);
  };

  const scrollToLatestEvent = () => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Fund the ephemeral account after the squid swap is completed

  // Should we fund this after approval or after the swap is completed?
  // Right now, the SwapCompleted variant is never set.
  useEffect(() => {
    console.log('Transaction status: ', transactionStatus);
    if (transactionStatus == TransactionStatus.SpendingApproved) {
      console.log('Funding account after squid swap is completed');
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
      fundEphemeralAccount();
    }
  }, [transactionStatus, error]);

  useEffect(() => {
    scrollToLatestEvent();
  }, [events]);

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

  useEffect(() => {
    if (executionInput === undefined) return;
    const { assetToOfframp, amountIn, swapOptions } = executionInput;
    switch (status) {
      case OperationStatus.BridgeExecuted:

        // TODO we obviusly need to change hardcoding the swap option here, for when we support 
        // more than one asset on polygon
        const tokenToReceive = swapOptions ? TOKEN_CONFIG.usdc.currencyId : TOKEN_CONFIG[assetToOfframp].currencyId;
        // TODO need to double-check that minAmountOut has all the decimal places
        const expectedBalanceRaw = swapOptions ? swapOptions.minAmountOut : amountIn;

        checkEphemeralReady(tokenToReceive, expectedBalanceRaw).then((tokenBridgedAmount) => {
          setTokenBridgedAmount(tokenBridgedAmount);
          setStatus(OperationStatus.PendulumEphemeralReady);  
        })
        return;

      case OperationStatus.PendulumEphemeralReady:
        if (swapOptions) {
          const enteredAmountDecimal = new Big(sep24Result!.amount);
          if (enteredAmountDecimal.gte(swapOptions.minAmountOut)) {
            addEvent(
              `The amount you entered is too high. Maximum possible amount to offramp: ${swapOptions.minAmountOut.toString()}), you entered: ${
                sep24Result!.amount
              }.`,
              EventStatus.Error,
            );
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
        ).then((operations)=>{

          setStellarOperations(operations)
          addEvent('Stellar ephemeral account ready.', EventStatus.Waiting);
          setStatus(OperationStatus.StellarEphemeralReady);

        }).catch(()=>{
          addEvent(`Stellar setup failed ${error}`, EventStatus.Error);
        });
        return;

      case OperationStatus.StellarEphemeralReady:
        executeRedeem(sep24Result!);
        return
      case OperationStatus.Redeemed:
        finalizeOfframp().catch(console.error);
        return;
      
      // Offramp succesfull but first cleanup (Stellar) did not happened
      case OperationStatus.Offramped:
        cleanupStellarEphemeral(stellarOperations!.mergeAccountTransaction, addEvent).then(()=>{
          setStatus(OperationStatus.StellarCleaned);
        });
        return;

      // last case, after completion we need to delete the offramp status from local storage
      case OperationStatus.StellarCleaned:
        cleanEphemeralAccount(executionInput?.assetToOfframp!).then(()=>{
          storageService.remove(storageKeys.OFFRAMP_STATUS);
        });
        return;
      
    }
  }, [status, executeRedeem, finalizeOfframp, sep24Result, executionInput]);

  return (
    <div className="App">
      {backendError && (
        <div>
          <h2 className="inputBox">Service is Down</h2>
          <div className="general-service-error-message">Please try again later or reload the page.</div>
        </div>
      )}
      {isRecovery && (
        // TODO some kind of recovery UI 
        // or we may want to show the regular "do not close this window" message
        <div>
          <h2 className="inputBox">Recovering Offramp... Please do not close this window....</h2>
        </div>
      )}
      {canInitiate && <InputBox onSubmit={handleOnSubmit} dAppName="prototype" />}
      {showSep24 && (
        <div>
          <Sep24 sessionParams={anchorSessionParams!} onSep24Complete={handleOnSep24Completed} addEvent={addEvent} />
        </div>
      )}
      <div className="flex flex-col items-center overflow-y-auto py-5">
        {events.map((event, index) => (
          <EventBox
            key={index}
            event={event}
            ref={index === events.length - 1 ? eventsEndRef : null}
            className={index === activeEventIndex ? 'active' : ''}
          />
        ))}
        <div ref={eventsEndRef} />
      </div>
    </div>
  );
}

export default Landing;
