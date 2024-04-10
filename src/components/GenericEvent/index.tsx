import React from 'react';
import {InputBoxEvent} from '../InputKeys/index'; 

interface EventBoxProps {
  event: InputBoxEvent;
}

const EventBox: React.FC<EventBoxProps> = ({ event }) => {
  return (
    <div className="eventBox">
      <p>Event: {event.inputOne} and {event.inputTwo}</p>
    </div>
  );
}

export default EventBox;