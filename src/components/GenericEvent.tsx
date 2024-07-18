import { forwardRef } from 'preact/compat';

export enum EventStatus {
  Success = 'success',
  Error = 'error',
  Waiting = 'waiting',
}

export interface GenericEvent {
  value: string;
  status: EventStatus;
}

interface EventBoxProps {
  event: GenericEvent;
  className: string;
}

const EventBox = forwardRef<HTMLDivElement, EventBoxProps>(({ event, className }, ref) => {
  return (
    <div ref={ref} className={`break-words ${className} ${event.status}`}>
      {event.value}
    </div>
  );
});

export default EventBox;
