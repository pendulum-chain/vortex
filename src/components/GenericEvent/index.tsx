import React from 'react';

export interface GenericEvent{
  value: string;
  error: boolean;
}
interface EventBoxProps {
  event: GenericEvent;
  className: string;
}

const EventBox = React.forwardRef<HTMLDivElement, EventBoxProps>(({ event, className }, ref) => {
  const classes = `eventBox ${className} ${event.error ? 'error' : ''}`;

  return (
    <div ref={ref} className={classes}>
      <p>Event: {event.value}</p>
    </div>
  );
});

export default EventBox;