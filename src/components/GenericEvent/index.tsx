import React from 'react';

export enum EventStatus {
  Success = "success",
  Error = "error",
  Waiting = "waiting"
}

export interface GenericEvent {
  value: string;
  status: EventStatus;
}

interface EventBoxProps {
  event: GenericEvent;
  className: string;
}


const EventBox = React.forwardRef<HTMLDivElement, EventBoxProps>(({ event, className }, ref) => {
  const classes = `eventBox ${className} ${event.status}`;

  return (
    <div ref={ref} className={classes}>
      <p>{event.value}</p>
    </div>
  );
});

export default EventBox;
