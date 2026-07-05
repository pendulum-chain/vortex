import { RampState } from "../types/phases";

interface FakeRampContext {
  initializeFailedMessage?: string;
  isSep24Redo?: boolean;
  rampState?: RampState;
  walletLocked?: string;
}

interface FakeSnapshot {
  context: FakeRampContext;
}

type Listener = (snapshot: FakeSnapshot) => void;

export interface FakeRampActor {
  events: Array<{ type: string } & Record<string, unknown>>;
  getSnapshot: () => FakeSnapshot;
  send: (event: { type: string } & Record<string, unknown>) => void;
  setRampState: (rampState: RampState | undefined) => void;
  subscribe: (listener: Listener) => { unsubscribe: () => void };
}

// Minimal stand-in for the ramp machine actor: stable snapshot identity until a
// change occurs (required by useSyncExternalStore-based `useSelector`), records
// every sent event, and applies SET_RAMP_STATE like the real machine does.
export function createFakeRampActor(initialRampState?: RampState): FakeRampActor {
  let snapshot: FakeSnapshot = { context: { rampState: initialRampState } };
  const listeners = new Set<Listener>();
  const events: FakeRampActor["events"] = [];

  const update = (context: FakeRampContext) => {
    snapshot = { context };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  return {
    events,
    getSnapshot: () => snapshot,
    send: event => {
      events.push(event);
      if (event.type === "SET_RAMP_STATE") {
        update({ ...snapshot.context, rampState: event.rampState as RampState });
      }
    },
    setRampState: rampState => {
      update({ ...snapshot.context, rampState });
    },
    subscribe: listener => {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    }
  };
}
