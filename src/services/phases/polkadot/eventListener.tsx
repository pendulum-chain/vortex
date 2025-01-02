// @todo: remove no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ApiPromise } from '@polkadot/api';

import { parseEventRedeemExecution, parseEventXcmSent } from './eventParsers';

interface IPendingEvent {
  filter: any;
  resolve: (event: any) => void;
}

export class EventListener {
  static eventListeners = new Map<ApiPromise, EventListener>();

  private unsubscribeHandle: (() => void) | null = null;

  pendingIssueEvents: IPendingEvent[] = [];
  pendingRedeemEvents: IPendingEvent[] = [];
  pendingXcmSentEvents: IPendingEvent[] = [];

  api: ApiPromise | undefined = undefined;

  constructor(api: ApiPromise) {
    this.api = api;
    this.initEventSubscriber();
  }

  static getEventListener(api: ApiPromise) {
    const eventListener = this.eventListeners.get(api);
    if (eventListener) return eventListener;

    const newListener = new EventListener(api);
    this.eventListeners.set(api, newListener);
    return newListener;
  }

  async initEventSubscriber() {
    this.unsubscribeHandle = await this.api!.query.system.events((events) => {
      events.forEach((event) => {
        this.processEvents(event, this.pendingIssueEvents);
        this.processEvents(event, this.pendingRedeemEvents);
      });
    });
  }

  waitForRedeemExecuteEvent(redeemId: string, maxWaitingTimeMs: number) {
    const filter = (event: any) => {
      if (event.event.section === 'redeem' && event.event.method === 'ExecuteRedeem') {
        const eventParsed = parseEventRedeemExecution(event);
        if (eventParsed.redeemId == redeemId) {
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
        resolve: (event) => {
          clearTimeout(timeout);
          resolve(event);
        },
      });
    });
  }

  waitForXcmSentEvent(originAddress: string, maxWaitingTimeMs: number) {
    const filter = (event: any) => {
      if (event.event.section === 'polkadotXcm' && event.event.method === 'Sent') {
        const eventParsed = parseEventXcmSent(event);
        if (eventParsed.originAddress == originAddress) {
          console.log('event', event);
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
        resolve: (event) => {
          clearTimeout(timeout);
          resolve(event);
        },
      });
    });
  }

  processEvents(event: any, pendingEvents: IPendingEvent[]) {
    pendingEvents.forEach((pendingEvent, index) => {
      const matchedEvent = pendingEvent.filter(event);

      if (matchedEvent) {
        pendingEvent.resolve(matchedEvent);
        pendingEvents.splice(index, 1);
      }
    });
  }

  unsubscribe() {
    if (this.unsubscribeHandle) {
      this.unsubscribeHandle();
      this.unsubscribeHandle = null;
    }

    this.pendingIssueEvents = [];
    this.pendingRedeemEvents = [];
    this.pendingXcmSentEvents = [];

    EventListener.eventListeners.delete(this.api!);

    this.api = undefined;
  }
}
