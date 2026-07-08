import { RampState } from "../types/phases";

interface FakeRampContext {
  initializeFailedMessage?: string;
  isSep24Redo?: boolean;
  rampState?: RampState;
  walletLocked?: string;
}

interface FakeSnapshot {
  context: FakeRampContext;
  // Components query machine states via useSelector(state => state.matches(...)).
  // The fake never enters a named state.
  matches: (state: string) => boolean;
}

type Listener = (snapshot: FakeSnapshot) => void;
// xstate actors accept either a callback or a partial observer; @xstate/react uses the
// observer form, so the fake must support both.
type ListenerOrObserver = Listener | { next?: Listener };

export interface FakeRampActor {
  events: Array<{ type: string } & Record<string, unknown>>;
  getSnapshot: () => FakeSnapshot;
  send: (event: { type: string } & Record<string, unknown>) => void;
  setRampState: (rampState: RampState | undefined) => void;
  subscribe: (listener: ListenerOrObserver) => { unsubscribe: () => void };
}

// Minimal stand-in for the ramp machine actor: stable snapshot identity until a
// change occurs (required by useSyncExternalStore-based `useSelector`), records
// every sent event, and applies SET_RAMP_STATE like the real machine does.
export function createFakeRampActor(initialRampState?: RampState): FakeRampActor {
  const matches = () => false;
  let snapshot: FakeSnapshot = { context: { rampState: initialRampState }, matches };
  const listeners = new Set<Listener>();
  const events: FakeRampActor["events"] = [];

  const update = (context: FakeRampContext) => {
    snapshot = { context, matches };
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
    subscribe: listenerOrObserver => {
      const listener: Listener =
        typeof listenerOrObserver === "function" ? listenerOrObserver : snapshot => listenerOrObserver.next?.(snapshot);
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    }
  };
}
