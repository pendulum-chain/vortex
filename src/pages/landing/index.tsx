import '../../../App.css'
import React, { useState, useEffect } from 'react';
import InputBox from '../../components/InputKeys';
import EventBox from '../../components/GenericEvent';
import {InputBoxEvent} from '../../components/InputKeys';
import { fetchTomlValues, TomlValues, sep10, IAnchorSessionParams } from '../../services/anchor';
import Sep24 from '../../components/Sep24Component'
import { on } from 'events';

function Landing() {
  const [events, setEvents] = useState<InputBoxEvent[]>([]);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | null>(null);
  const [showSep24, setShowSep24] = useState<boolean>(false);
  
  const handleStart = (eventData: InputBoxEvent) => {
    setEvents((prevEvents) => [...prevEvents, eventData]);
  };

  const handleOnSubmit = (eventData: InputBoxEvent) => {
    setShowSep24(true);
  }

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
      {<InputBox onStart={handleStart}  onSubmit={handleOnSubmit} />}
      <div className="eventsContainer">
        {events.map((event, index) => (
          <EventBox key={index} event={event} />
        ))}
      </div>
      <div>
        <Sep24 sessionParams={anchorSessionParams!} />
      </div>
    </div>
  );
}

export default Landing;

