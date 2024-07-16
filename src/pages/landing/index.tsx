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
import { useGlobalState } from '../../GlobalStateProvider';
import { fetchSigningServicePK } from '../../services/signingService';
import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { performSwap } from '../../services/nabla';
import { TRANSFER_WAITING_TIME_SECONDS } from '../../constants/constants';
import {
  waitForTokenReceptionEvent,
  getEphemeralAccount,
  checkBalance,
  fundEphemeralAccount,
  cleanEphemeralAccount,
} from '../../services/polkadot/ephemeral';
import { stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useSquidRouterSwap, TransactionStatus } from '../../services/squidrouter';
import { decimalToCustom } from '../../helpers/parseNumbers';
import { TokenType } from '../../constants/tokenConfig';

enum OperationStatus {
  Idle,
  Submitting,
  SettingUpStellar,
  Redeeming,
  FinalizingOfframp,
  Completed,
  Error,
}

export interface ExecutionInput {
  assetToOfframp: TokenType;
  amountIn: Big;
  swapOptions: SwapOptions | undefined; // undefined means direct offramp
}

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

  // UI states
  const [showSep24, setShowSep24] = useState<boolean>(false);
  const [canInitiate, setCanInitiate] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<boolean>(false);

  //Squidrouter hook
  const [amountInNative, setAmountIn] = useState<string>('0');
  const { transactionStatus, executeSquidRouterSwap, approveError, swapError, confirmationApprovalError, confirmationSwapError } = useSquidRouterSwap(amountInNative);
  const handleOnSubmit = async ({ assetToOfframp, amountIn, swapOptions }: ExecutionInput) => {
    // we always want swap now, but for now we hardcode the starting token
    setAmountIn(decimalToCustom(amountIn, TOKEN_CONFIG.usdc.decimals).toFixed());
    setExecutionInput({ assetToOfframp, amountIn, swapOptions });


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
    setStatus(OperationStatus.Submitting);
  };

  const handleOnSep24Completed = async (result: Sep24Result) => {
    setShowSep24(false);

    // log the result
    addEvent(
      `SEP24 completed, amount: ${result.amount}, memo: ${result.memo}, offramping account: ${result.offrampingAccount}`,
      EventStatus.Waiting,
    );
    setSep24Result(result);

    if (executionInput === undefined) return;
    const { assetToOfframp, amountIn, swapOptions } = executionInput;
    // Start the squid router process
    executeSquidRouterSwap();

     // log ephemeral pk
     const ephemeralAccount = getEphemeralAccount().address;
     addEvent(`Pendulum ephemeral account: ${ephemeralAccount}`, EventStatus.Waiting);

    // Wait for ephemeral to receive native balance
    // And wait for ephemeral to receive the funds of the token to be offramped

    const tokenToReceive = swapOptions ? TOKEN_CONFIG.usdc.currencyId : TOKEN_CONFIG[assetToOfframp].currencyId;

    console.log('Waiting to receive token: ', tokenToReceive);
    const tokenTransferEvent = await waitForTokenReceptionEvent(tokenToReceive, TRANSFER_WAITING_TIME_SECONDS * 1000);
    console.log('token received', tokenTransferEvent);

    // call checkBalance until it returns true
    let ready;
    do {
      ready = await checkBalance();
    } while (!ready);

    if (swapOptions) {
      const enteredAmountDecimal = new Big(result.amount);
      //TESTING commented since we are mocking the response of the KYC
      // if (enteredAmountDecimal.gt(swapOptions.minAmountOut)) {
      //   addEvent(
      //     `The amount you entered is too high. Maximum possible amount to offramp: ${swapOptions.minAmountOut.toString()}), you entered: ${
      //       result.amount
      //     }.`,
      //     EventStatus.Error,
      //   );
      //   return;
      // }

      await performSwap(
        {
          amountInRaw: tokenTransferEvent.amountRaw,
          assetOut: assetToOfframp,
          assetIn: swapOptions.assetIn,
          minAmountOut: swapOptions.minAmountOut,
        },
        addEvent,
      );
    }

    // set up the ephemeral account and operations we will later neeed
    try {
      addEvent('Settings stellar accounts', EventStatus.Waiting);
      const operations = await setUpAccountAndOperations(
        fundingPK!,
        result,
        getEphemeralKeys(),
        anchorSessionParams!.tokenConfig,
        addEvent,
      );
      setStellarOperations(operations);
    } catch (error) {
      addEvent(`Stellar setup failed ${error}`, EventStatus.Error);
      return;
    }

    addEvent('Stellar things done!', EventStatus.Waiting);

    //this will trigger redeem
    setStatus(OperationStatus.Redeeming);
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
      setStatus(OperationStatus.FinalizingOfframp);
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

    addEvent('Offramp Submitted! Funds should be available shortly', EventStatus.Success);

    // we may not necessarily need to show the user an error, since the offramp transaction is already submitted
    // and successful
    // This will not affect the user
    await cleanupStellarEphemeral(stellarOperations!.mergeAccountTransaction, addEvent);
    await cleanEphemeralAccount(executionInput?.assetToOfframp!);
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
    const anyError = approveError || swapError || confirmationApprovalError || confirmationSwapError;

    if (approveError || confirmationApprovalError) {
      addEvent('Approval to squidrouter failed, please refresh the page', EventStatus.Error);
      return;
    }
    if (swapError || confirmationSwapError) {
      addEvent('Squidrouter contract call signature failed, please refresh the page', EventStatus.Error);
      return;
    }
    if (transactionStatus == TransactionStatus.SwapCompleted && !anyError) {
      console.log('Funding account after squid swap is completed');
      addEvent('Squidrouter swap initiated', EventStatus.Success);
      fundEphemeralAccount();
    }

    if (transactionStatus == TransactionStatus.SpendingApproved && !anyError) {
      addEvent('Approval to Squidrouter completed', EventStatus.Success);
    }


    
  }, [transactionStatus, approveError, swapError, confirmationApprovalError, confirmationSwapError]);

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
    switch (status) {
      case OperationStatus.Redeeming:
        executeRedeem(sep24Result!).catch(console.error);
        return;
      case OperationStatus.FinalizingOfframp:
        finalizeOfframp().catch(console.error);
        return;
    }
  }, [status, executeRedeem, finalizeOfframp, sep24Result]);

  return (
    <div className="App">
      {backendError && (
        <div>
          <h2 className="inputBox">Service is Down</h2>
          <div className="general-service-error-message">Please try again later or reload the page.</div>
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
