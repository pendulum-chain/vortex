import React from 'react';

export interface GenericEvent{
  value: string;
  error: boolean;
}
interface EventBoxProps {
  event: GenericEvent;
}

const EventBox = React.forwardRef<HTMLDivElement, EventBoxProps>(({ event }, ref) => {
  return (
    <div ref={ref} className="eventBox">
      <p>Event: {event.value}</p>
    </div>
  );
});

export default EventBox;