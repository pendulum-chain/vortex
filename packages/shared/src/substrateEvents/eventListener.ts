import { ApiPromise } from "@polkadot/api";
import { EventRecord } from "@polkadot/types/interfaces";
import logger from "../logger";
import { parseEventRedeemExecution, parseEventXcmSent } from "./eventParsers";

interface IPendingEvent<T = unknown> {
  id: string;
  filter: (event: EventRecord) => T | null;
  resolve: (event: T) => void;
}

export class EventListener {
  static eventListeners = new Map<ApiPromise, EventListener>();

  private unsubscribeHandle: (() => void) | null = null;
  pendingRedeemEvents: IPendingEvent[] = [];
  pendingXcmSentEvents: IPendingEvent[] = [];

  api: ApiPromise | undefined = undefined;

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
          this.processEvents(event, this.pendingRedeemEvents);
          this.processEvents(event, this.pendingXcmSentEvents);
        });
      })) as unknown as () => void) || null;
  }

  waitForRedeemExecuteEvent(redeemId: string, maxWaitingTimeMs: number) {
    const filter = (event: EventRecord) => {
      if (event.event.section === "redeem" && event.event.method === "ExecuteRedeem") {
        const eventParsed = parseEventRedeemExecution({ event: event.event });
        if (eventParsed.redeemId === redeemId) {
          return eventParsed;
        }
      }
      return null;
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Max waiting time exceeded for Redeem Execution with id: ${redeemId}`));
      }, maxWaitingTimeMs);

      this.pendingRedeemEvents.push({
        filter,
        id: redeemId,
        resolve: event => {
          clearTimeout(timeout);
          resolve(event);
        }
      });
    });
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
    const freshApiPromise = this.api;
    if (!freshApiPromise || !freshApiPromise.isConnected) return;

    this.pendingRedeemEvents.forEach(pendingEvent => {
      const redeemId = pendingEvent.id;
      freshApiPromise.query.redeem.redeemRequests(redeemId).then(redeem => {
        if (redeem) {
          pendingEvent.resolve(redeem);
        }
      });
    });
  }

  unsubscribe() {
    if (this.unsubscribeHandle) {
      this.unsubscribeHandle();
      this.unsubscribeHandle = null;
    }

    this.pendingRedeemEvents = [];
    this.pendingXcmSentEvents = [];

    if (this.api) {
      EventListener.eventListeners.delete(this.api);
    }

    this.api = undefined;
  }
}
