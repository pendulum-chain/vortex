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
import { stringifyBigWithSignificantDecimals } from '../../helpers/contracts';

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
  userSubstrateAddress: string;
  assetToOfframp: string;
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

  // Wallet states
  const { walletAccount, dAppName } = useGlobalState();

  const handleOnSubmit = async ({ userSubstrateAddress, assetToOfframp, amountIn, swapOptions }: ExecutionInput) => {
    setExecutionInput({ userSubstrateAddress, assetToOfframp, amountIn, swapOptions });
    const tokenConfig: TokenDetails = TOKEN_CONFIG[assetToOfframp];
    const values = await fetchTomlValues(tokenConfig.tomlFileUrl!);

    const amountToOfframp = swapOptions !== undefined ? swapOptions.minAmountOut : amountIn;
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
    const { userSubstrateAddress, assetToOfframp, amountIn, swapOptions } = executionInput;

    if (swapOptions) {
      const enteredAmountDecimal = new Big(result.amount);
      if (enteredAmountDecimal.gt(swapOptions.minAmountOut)) {
        addEvent(
          `The amount you entered is too high. Maximum possible amount to offramp: ${swapOptions.minAmountOut.toString()}), you entered: ${
            result.amount
          }.`,
          EventStatus.Error,
        );
        return;
      }

      await performSwap(
        {
          amountIn,
          assetOut: assetToOfframp,
          assetIn: swapOptions.assetIn,
          minAmountOut: swapOptions.minAmountOut,
          userAddress: userSubstrateAddress,
          walletAccount: walletAccount!,
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
        await executeSpacewalkRedeem(
          getEphemeralKeys().publicKey(),
          sepResult.amount,
          walletAccount!,
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
    [walletAccount, anchorSessionParams],
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
          <Sep24
            sessionParams={anchorSessionParams!}
            onSep24Complete={handleOnSep24Completed}
            setAnchorSessionParams={setAnchorSessionParams}
            addEvent={addEvent}
          />
        </div>
      )}
      <div className="eventsContainer">
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
