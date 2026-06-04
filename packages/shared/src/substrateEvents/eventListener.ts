import { ApiPromise } from "@polkadot/api";
import { EventRecord } from "@polkadot/types/interfaces";
import logger from "../logger";
import { parseEventXcmSent } from "./xcmParsers";

interface IPendingEvent<T = unknown> {
  id: string;
  filter: (event: EventRecord) => T | null;
  resolve: (event: T) => void;
}

export class EventListener {
  static eventListeners = new Map<ApiPromise, EventListener>();
  pendingXcmSentEvents: IPendingEvent[] = [];
  api: ApiPromise | undefined = undefined;
  private unsubscribeHandle: (() => void) | null = null;

  constructor(api: ApiPromise) {
    this.api = api;
    this.initEventSubscriber();

    this.api?.on("connected", async (): Promise<void> => {
      logger.current.info("Connected (or reconnected) to the endpoint.");
      await this.checkForMissedEvents();
    });
  }

  static getEventListener(api: ApiPromise) {
    const eventListener = this.eventListeners.get(api);
    if (eventListener) return eventListener;

    const newListener = new EventListener(api);
    this.eventListeners.set(api, newListener);
    return newListener;
  }

  async initEventSubscriber() {
    this.unsubscribeHandle =
      ((await this.api?.query.system.events((events: EventRecord[]) => {
        events.forEach((event: EventRecord) => {
          this.processEvents(event, this.pendingXcmSentEvents);
        });
      })) as unknown as () => void) || null;
  }

  waitForXcmSentEvent(originAddress: string, maxWaitingTimeMs: number) {
    const filter = (event: EventRecord) => {
      if (event.event.section === "polkadotXcm" && event.event.method === "Sent") {
        const eventParsed = parseEventXcmSent({ event: event.event });
        if (eventParsed.originAddress === originAddress) {
          return eventParsed;
        }
      }
      return null;
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Max waiting time exceeded for XCM Sent event from origin: ${originAddress}`));
      }, maxWaitingTimeMs);

      this.pendingXcmSentEvents.push({
        filter,
        id: originAddress,
        resolve: event => {
          clearTimeout(timeout);
          resolve(event);
        }
      });
    });
  }

  processEvents<T>(event: EventRecord, pendingEvents: IPendingEvent<T>[]) {
    pendingEvents.forEach((pendingEvent, index) => {
      const matchedEvent = pendingEvent.filter(event);

      if (matchedEvent) {
        pendingEvent.resolve(matchedEvent);
        pendingEvents.splice(index, 1);
      }
    });
  }

  async checkForMissedEvents() {
    // No-op: redeem/spacewalk event recovery removed with Stellar/Spacewalk deprecation.
  }

  unsubscribe() {
    if (this.unsubscribeHandle) {
      this.unsubscribeHandle();
      this.unsubscribeHandle = null;
    }

    this.pendingXcmSentEvents = [];

    if (this.api) {
      EventListener.eventListeners.delete(this.api);
    }

    this.api = undefined;
  }
}
