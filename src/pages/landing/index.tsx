import '../../../App.css';
import React, { useState, useEffect, useRef } from 'react';
import InputBox from '../../components/InputKeys';
import EventBox from '../../components/GenericEvent';
import { GenericEvent, EventStatus } from '../../components/GenericEvent';
import { fetchTomlValues, sep10, IAnchorSessionParams, Sep24Result, getEphemeralKeys } from '../../services/anchor';
import {
  setUpAccountAndOperations,
  StellarOperations,
  submitOfframpTransaction,
  cleanupStellarEphemeral,
} from '../../services/stellar';
import { executeSpacewalkRedeem } from '../../services/polkadot';
import Sep24 from '../../components/Sep24Component';
import { TOML_FILE_URL } from '../../constants/constants';
import { useCallback } from 'preact/compat';
import { useGlobalState } from '../../GlobalStateProvider';

enum OperationStatus {
  Idle,
  Submitting,
  SettingUpStellar,
  Redeeming,
  FinalizingOfframp,
  Completed,
  Error,
}

function Landing() {
  // system status
  const [status, setStatus] = useState(OperationStatus.Idle);

  // events state and refs
  const [events, setEvents] = useState<GenericEvent[]>([]);
  const eventsEndRef = useRef<HTMLDivElement | null>(null);
  const [activeEventIndex, setActiveEventIndex] = useState<number>(-1);

  // seession and operations states
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [stellarOperations, setStellarOperations] = useState<StellarOperations | null>(null);
  const [sep24Result, setSep24Result] = useState<Sep24Result | null>(null);

  // UI states
  const [showSep24, setShowSep24] = useState<boolean>(false);
  const [canInitiate, setCanInitiate] = useState<boolean>(false);

  // Wallet states
  const { walletAccount, dAppName } = useGlobalState();

  const handleOnSubmit = (userSubstrateAddress: string) => {
    setUserAddress(userSubstrateAddress);

    // showing (rendering) the Sep24 component will trigger the Sep24 process
    setShowSep24(true);
    setStatus(OperationStatus.Submitting);
  };

  const handleOnSep24Completed = async (result: Sep24Result) => {
    setShowSep24(false);

    console.log('SEP24 Result', result);
    // log the result
    addEvent(
      `SEP24 completed, amount: ${result.amount}, memo: ${result.memo}, offramping account: ${result.offrampingAccount}`,
      EventStatus.Waiting,
    );
    setSep24Result(result);

    // set up the ephemeral account and operations we will later neeed
    try {
      addEvent('Settings stellar accounts', EventStatus.Waiting);
      const operations = await setUpAccountAndOperations(
        result,
        getEphemeralKeys(),
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
        await executeSpacewalkRedeem(getEphemeralKeys().publicKey(), sepResult.amount, walletAccount!, addEvent);
      } catch (error) {
        return;
      }
      addEvent('Redeem process completed, executing offramp transaction', EventStatus.Waiting);

      //this will trigger finalizeOfframp
      setStatus(OperationStatus.FinalizingOfframp);
    },
    [walletAccount],
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
        const values = await fetchTomlValues(TOML_FILE_URL);
        const token = await sep10(values, addEvent);
        setAnchorSessionParams({ token, tomlValues: values });
        setCanInitiate(true);
        console.log('Token', token);
      } catch (error) {
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
      {canInitiate && <InputBox onSubmit={handleOnSubmit} dAppName="prototype" />}
      {showSep24 && (
        <div>
          <Sep24 sessionParams={anchorSessionParams!} onSep24Complete={handleOnSep24Completed} addEvent={addEvent} />
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
