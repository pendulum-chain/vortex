import { WEBHOOKS_CACHE_URL } from '../../../constants/constants';

type SubscriptionType = 'BURN' | 'BALANCE-UPDATE' | 'MONEY-TRANSFER' | 'MINT';

export interface Event {
  userId: string;
  data: EventData;
  subscription: SubscriptionType;
  createdAt: string;
  id: string;
  acknowledged: boolean;
}

interface EventData {
  status: string;
  [key: string]: unknown;
}
export class EventPoller {
  private cache: Map<string, Event[]> = new Map();
  private pollingInterval: number;
  private apiUrl: string;
  private started: boolean = false;

  constructor(pollingInterval: number = 1000) {
    if (!WEBHOOKS_CACHE_URL) {
      throw new Error('WEBHOOKS_CACHE_URL is not defined!');
    }

    this.apiUrl = WEBHOOKS_CACHE_URL;
    this.pollingInterval = pollingInterval;
  }

  public start() {
    if (this.started) {
      console.warn('EventPoller already started');
      return;
    }
    this.poll();
    this.started = true;

    setInterval(() => {
      this.poll();
    }, this.pollingInterval);
  }

  private groupEventsByUser(events: Event[]): Map<string, Event[]> {
    return events.reduce((acc: Map<string, Event[]>, event: Event) => {
      if (!acc.has(event.userId)) {
        acc.set(event.userId, []);
      }
      acc.get(event.userId)!.push(event);
      return acc;
    }, new Map<string, Event[]>());
  }

  private async poll() {
    try {
      const response = await fetch(this.apiUrl);
      const events: Event[] = await response.json();

      const groupedEvents = this.groupEventsByUser(events);

      // For each user, appends all new events that are not registered in the cache,
      // by checking the last timestamp of each user map.
      groupedEvents.forEach((fetchedUserEvents, userId) => {
        // Get the events from the cache or create an empty array
        const userEvents = this.cache.get(userId) || [];

        // If there are new events, append those. Otherwise, initialize the cache with the fetched events.
        if (userEvents.length > 0) {
          const lastTimestamp = userEvents[userEvents.length - 1].createdAt;
          const eventsNotRegistered = fetchedUserEvents.filter(
            (event) => new Date(event.createdAt) > new Date(lastTimestamp),
          );
          userEvents.push(...eventsNotRegistered);
        } else {
          userEvents.push(...fetchedUserEvents);
        }
        this.cache.set(userId, userEvents);
      });
    } catch (error: any) {
      console.error('Error polling events:', error.message);
    }
  }

  public getLatestEventForUser(userId: string): Event | null {
    const events = this.cache.get(userId);
    if (!events || events.length === 0) {
      return null;
    }
    return events[events.length - 1];
  }
}
