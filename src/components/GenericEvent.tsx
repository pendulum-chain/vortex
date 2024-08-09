import React from 'preact/compat';

export enum EventStatus {
  Success = 'success',
  Error = 'error',
  Waiting = 'waiting',
}

export type RenderEventHandler = (event: string, status: EventStatus) => void;

export interface GenericEvent {
  value: string;
  status: EventStatus;
}

interface EventBoxProps {
  event: GenericEvent;
  className: string;
}

const EventBox = React.forwardRef<HTMLDivElement, EventBoxProps>(({ event, className }, ref) => {
  return (
    <div
      ref={ref}
      className={`mx-10 md:mx-20 my-auto md:p-5 p-1 md:w-2/5 w-4/5 box-border eventBox ${className} ${event.status}`}
    >
      {event.value}
    </div>
  );
});

export default EventBox;
