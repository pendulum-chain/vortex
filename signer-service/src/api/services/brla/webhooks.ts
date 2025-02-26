import { WEBHOOKS_CACHE_URL, WEBHOOKS_CACHE_PASSWORD } from '../../../constants/constants';
import { BrlaApiService } from './brlaApiService';

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
  private brlaApiService: BrlaApiService;

  constructor(pollingInterval: number = 1000) {
    if (!WEBHOOKS_CACHE_URL) {
      throw new Error('WEBHOOKS_CACHE_URL is not defined!');
    }

    this.apiUrl = WEBHOOKS_CACHE_URL;
    this.pollingInterval = pollingInterval;
    this.brlaApiService = BrlaApiService.getInstance();
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
      if (!WEBHOOKS_CACHE_PASSWORD) {
        throw new Error('WEBHOOKS_CACHE_PASSWORD is not defined!');
      }

      const headers = new Headers([
        ['Content-Type', 'application/json'],
        ['Auth-password', WEBHOOKS_CACHE_PASSWORD],
      ]);
      const response = await fetch(this.apiUrl, { headers });
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

          // async acknowledge events
          eventsNotRegistered.length > 0
            ? this.brlaApiService.acknowledgeEvents(eventsNotRegistered.flatMap((event) => event.id)).catch((error) => {
                console.log('Poll: Error while acknowledging events: ', error);
              })
            : null;
        } else {
          userEvents.push(...fetchedUserEvents);
          fetchedUserEvents.length > 0
            ? this.brlaApiService.acknowledgeEvents(fetchedUserEvents.flatMap((event) => event.id)).catch((error) => {
                console.log('Poll: Error while acknowledging events: ', error);
              })
            : null;
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
