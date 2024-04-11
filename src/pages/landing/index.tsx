import '../../../App.css'
import React, { useState, useEffect, useRef } from 'react';
import InputBox from '../../components/InputKeys';
import EventBox from '../../components/GenericEvent';
import { GenericEvent } from '../../components/GenericEvent';
import {IInputBoxData} from '../../components/InputKeys';
import { fetchTomlValues, sep10, IAnchorSessionParams, ISep24Result, getEphemeralKeys} from '../../services/anchor';
import {setUpAccountAndOperations, IStellarOperations} from '../../services/stellar';
import Sep24 from '../../components/Sep24Component'

function Landing() {
  const [events, setEvents] = useState<GenericEvent[]>([]);
  const eventsEndRef = useRef<HTMLDivElement | null>(null);

  const [secrets, setSecrets] = useState<IInputBoxData | null>(null);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [sep24Result, setSep24Result] = useState<ISep24Result | null>(null);
  const [stellarOperations, setStellarOperations] = useState<IStellarOperations | null>(null);

  const [showSep24, setShowSep24] = useState<boolean>(false);
  

  const handleOnSubmit = (secrets: IInputBoxData) => {
    setSecrets(secrets);
    setShowSep24(true);
  }

  const handleOnSep24Completed = async (result: ISep24Result) => {
    setShowSep24(false);
    addEvent("SEP24 completed, settings stellar accounts", false);
    setSep24Result(result);

    //add a delay 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    // set up the ephemeral account and operations we will later neeed
    
    //let operations = await setUpAccountAndOperations(result, getEphemeralKeys(), secrets!.stellarFundingSecret)
    //setStellarOperations(operations)

    addEvent("Stellar things done!", false);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    //trigger redeem
    executeRedeem()


  }

  const executeRedeem = async () => {
    addEvent("Redeeming...", false);

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    addEvent('Redeem process completed.', false);
  
  }

  const addEvent = (message: string, isError: boolean) => {
    setEvents((prevEvents) => [...prevEvents, { value: message, error: isError }]);

  };

  const scrollToLatestEvent = () => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    scrollToLatestEvent();
  }, [events]); 


  useEffect(() => {
    const initiate = async () => {
      try {
        const values = await fetchTomlValues('https://mykobo.co/.well-known/stellar.toml');
        const token = await sep10(values);
        setAnchorSessionParams({ token, tomlValues: values });
        console.log("Token", token)
      } catch (error) {
        console.error("Error fetching token", error);
      }
    };

    initiate();
  }, []);

  return (
    <div className="App">
      {<InputBox  onSubmit={handleOnSubmit} />}
      {showSep24 && (
        <div>
          <Sep24 sessionParams={anchorSessionParams!} onSep24Complete={handleOnSep24Completed} />
        </div>
      )}
      <div className="eventsContainer">
        {events.map((event, index) => (
         <EventBox key={index} event={event} ref={index === events.length - 1 ? eventsEndRef : null} />
        ))}
      </div>
    </div>
  );
}

export default Landing;

