import { WEBHOOKS_CACHE_URL, WEBHOOKS_CACHE_PASSWORD } from '../../../constants/constants';
import { BrlaApiService } from './brlaApiService';

type SubscriptionType = 'BURN' | 'BALANCE-UPDATE' | 'MONEY-TRANSFER' | 'MINT' | 'KYC';

export interface Event {
  userId: string;
  data: EventData;
  subscription: SubscriptionType;
  createdAt: number;
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

  private async fetchEvents(): Promise<Event[]> {
    if (!WEBHOOKS_CACHE_PASSWORD) {
      throw new Error('WEBHOOKS_CACHE_PASSWORD is not defined!');
    }

    const headers = new Headers([
      ['Content-Type', 'application/json'],
      ['Auth-password', WEBHOOKS_CACHE_PASSWORD],
    ]);
    const response = await fetch(this.apiUrl, { headers });
    const events: Event[] = await response.json();
    return events;
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

  private appendEventsToCache(userId: string, userEvents: Event[], fetchedUserEvents: Event[]) {
    // Order by createdAt, increasing
    fetchedUserEvents.sort((a, b) => a.createdAt - b.createdAt);
    // Get the timestamp of the last event registered in the cache, for that user.
    const lastTimestamp = userEvents[userEvents.length - 1].createdAt;

    // Append all events that are not registered in the cache.
    const eventsNotRegistered = fetchedUserEvents.filter(
      (event) => new Date(event.createdAt) > new Date(lastTimestamp),
    );
    userEvents.push(...eventsNotRegistered);
    this.cache.set(userId, userEvents);
    this.acknowledgeEvents(eventsNotRegistered);
  }

  private createNewEventCache(userId: string, userEvents: Event[], fetchedUserEvents: Event[]) {
    // Order by createdAt, increasing
    fetchedUserEvents.sort((a, b) => a.createdAt - b.createdAt);
    userEvents.push(...fetchedUserEvents);
    this.cache.set(userId, userEvents);
    this.acknowledgeEvents(fetchedUserEvents);
  }

  private async acknowledgeEvents(eventsToAcknowledge: Event[]) {
    // async acknowledge events
    if (eventsToAcknowledge.length > 0) {
      this.brlaApiService.acknowledgeEvents(eventsToAcknowledge.flatMap((event) => event.id)).catch((error) => {
        console.log('Poll: Error while acknowledging events: ', error);
      });
    }
  }

  private async poll() {
    try {
      // Fetch all events currently cached and group them by user
      const events = await this.fetchEvents();
      const groupedEvents = this.groupEventsByUser(events);

      // For each user, appends all new events that are not registered in the cache,
      // by checking the last timestamp of each user map.
      groupedEvents.forEach((fetchedUserEvents, userId) => {
        // Get the events from the cache or create an empty array
        const userEvents = this.cache.get(userId) || [];

        // If there are some events in the cache, append only new events
        if (userEvents.length > 0) {
          this.appendEventsToCache(userId, userEvents, fetchedUserEvents);
        } else {
          this.createNewEventCache(userId, userEvents, fetchedUserEvents);
        }
      });
    } catch (error: any) {
      console.error('Error polling events:', error.message);
    }
  }

  public async getLatestEventForUser(userId: string): Promise<Event | null> {
    const events = await this.brlaApiService.getAllEventsByUser(userId);

    if (!events || events.length === 0) {
      return null;
    }
    events.sort((a, b) => a.createdAt - b.createdAt);
    return events[events.length - 1];
  }

  public async getSubscriptionEventsForUser(userId: string, subscription: SubscriptionType): Promise<Event[] | null> {
    const events = await this.brlaApiService.getAllEventsByUser(userId);

    if (!events || events.length === 0) {
      return null;
    }
    return events.filter((event) => event.subscription === subscription);
  }
}
