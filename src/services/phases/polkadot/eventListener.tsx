// @todo: remove no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ApiPromise } from '@polkadot/api';

import { parseEventRedeemExecution } from './eventParsers';

interface IPendingEvent {
  filter: any;
  resolve: (event: any) => void;
}

export class EventListener {
  static eventListeners = new Map<ApiPromise, EventListener>();

  pendingIssueEvents: IPendingEvent[] = [];
  pendingRedeemEvents: IPendingEvent[] = [];

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
    this.api!.query.system.events((events) => {
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

  processEvents(event: any, pendingEvents: IPendingEvent[]) {
    pendingEvents.forEach((pendingEvent, index) => {
      const matchedEvent = pendingEvent.filter(event);

      if (matchedEvent) {
        pendingEvent.resolve(matchedEvent);
        pendingEvents.splice(index, 1);
      }
    });
  }
}
